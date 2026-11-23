/** Private single-user finance API. All database access uses parameterized D1 statements. */
import { CATEGORIES, addDays, monthsBetween, today, validDate, type FixedExpense } from './finance';

/** Bindings mirror cloudflare.config.ts; ASSETS is handled by the Vite plugin. */
interface Env { DB: D1Database; BOOTSTRAP_PASSWORD: string }

/** User-visible validation failures carry an intentional HTTP status. */
class HttpError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Encodes digests and random tokens without a Node.js runtime dependency. */
function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, '0')).join('');
}

/** Stores only a digest of bearer session tokens and login rate-limit identifiers. */
async function digest(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/** Password hashes use PBKDF2 with a random salt, 100,000 iterations and SHA-256. */
async function passwordHash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256));
}

/** Hashes both operands to a fixed length before a constant-time comparison. */
async function equal(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([a, b].map(v => crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
  return crypto.subtle.timingSafeEqual(left, right);
}

/** Limits small JSON bodies even when Content-Length is absent or incorrect. */
async function body(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError('Preencha os dados.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 10000) { await reader.cancel(); throw new HttpError('Dados muito grandes.', 413); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new HttpError('Dados inválidos.'); }
}

/** Rejects invalid money, account and category fields before any mutation. */
function fields(data: Record<string, unknown>) {
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!description || description.length > 100) throw new HttpError('A descrição deve ter de 1 a 100 caracteres.');
  if (typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount) || data.amount <= 0 || data.amount > 99999999999) throw new HttpError('Informe um valor maior que zero.');
  if (data.account !== 'PF' && data.account !== 'PJ') throw new HttpError('Escolha a conta PF ou PJ.');
  if (!CATEGORIES.includes(data.category as typeof CATEGORIES[number])) throw new HttpError('Escolha uma categoria válida.');
  return { description, amount: data.amount, account: data.account, category: data.category as string };
}

/** Reads a cookie token without persisting or logging the raw token. */
function token(request: Request): string {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)finance_session=([a-f0-9-]+)/)?.[1] ?? '';
}

/** Secure cookies are persistent for 30 days; local HTTP is supported for development. */
function cookie(request: Request, value: string, maxAge = 2592000): string {
  return `finance_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

/** Uses a stored personal password after the bootstrap password has been replaced. */
async function checkPassword(env: Env, password: string): Promise<boolean> {
  const stored = await env.DB.prepare("SELECT value FROM settings WHERE key='password'").first<{ value: string }>();
  if (stored) {
    const { salt, hash } = JSON.parse(stored.value) as { salt: string; hash: string };
    return equal(await passwordHash(password, salt), hash);
  }
  if (!env.BOOTSTRAP_PASSWORD) throw new HttpError('O acesso ainda não foi configurado.', 503);
  return equal(password, env.BOOTSTRAP_PASSWORD);
}

/** Reconciles automatic expenses in atomic batches; a unique occurrence prevents duplicates. */
export async function reconcile(db: D1Database, date = today()): Promise<void> {
  const rules = await db.prepare("SELECT * FROM fixed_expenses WHERE enabled=1 AND automatic=1 AND next_date<=? ORDER BY next_date").bind(date).all<FixedExpense>();
  for (const rule of rules.results) {
    let due = rule.next_date;
    let count = 0;
    while (due && due <= date && count++ < 1200) {
      const next: string | null = rule.cadence === '30days' ? addDays(due, 30) : null;
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO transactions (id,description,amount,kind,account,category,date,fixed_id,occurrence)
          SELECT ?,description,amount,'expense',account,category,?,?,? FROM fixed_expenses
          WHERE id=? AND enabled=1 AND automatic=1 AND next_date=?`)
          .bind(crypto.randomUUID(), due, rule.id, due, rule.id, due),
        db.prepare('UPDATE fixed_expenses SET next_date=?,last_paid=?,enabled=? WHERE id=? AND next_date=? AND enabled=1 AND automatic=1')
          .bind(next, due, next ? 1 : 0, rule.id, due),
      ]);
      due = next;
    }
  }
}

/** Serves authenticated API routes. Future-dated entries remain planned until their date. */
async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new HttpError('Método não permitido.', 405);
  if (method !== 'GET' && request.headers.get('Origin') !== url.origin) throw new HttpError('Origem não permitida.', 403);
  if (path === '/api/login' && method === 'POST') {
    const data = await body(request);
    const password = typeof data.password === 'string' ? data.password : '';
    const bucket = `${Math.floor(Date.now() / 900000)}:${await digest(request.headers.get('CF-Connecting-IP') ?? 'local')}`;
    const attempt = await env.DB.prepare('INSERT INTO login_attempts VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket).first<{ attempts: number }>();
    if ((attempt?.attempts ?? 99) > 10) throw new HttpError('Muitas tentativas. Aguarde 15 minutos.', 429);
    if (password.length > 256 || !await checkPassword(env, password)) throw new HttpError('Senha incorreta.', 401);
    const value = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare('INSERT INTO sessions VALUES (?,?)').bind(await digest(value), Date.now() + 2592000000).run();
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie(request, value) } });
  }
  const sessionHash = await digest(token(request));
  const session = await env.DB.prepare('SELECT expires FROM sessions WHERE token_hash=? AND expires>?').bind(sessionHash, Date.now()).first();
  if (!session) throw new HttpError('Entre para acessar suas finanças.', 401);
  if (path === '/api/logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(sessionHash).run();
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie(request, '', 0) } });
  }
  if (path === '/api/password' && method === 'PUT') {
    const data = await body(request);
    if (typeof data.current !== 'string' || !await checkPassword(env, data.current)) throw new HttpError('A senha atual está incorreta.');
    if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 128) throw new HttpError('Use uma senha com 12 a 128 caracteres.');
    const salt = crypto.randomUUID();
    const value = JSON.stringify({ salt, hash: await passwordHash(data.password, salt) });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO settings VALUES ('password',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(value),
      env.DB.prepare('DELETE FROM sessions WHERE token_hash<>?').bind(sessionHash),
    ]);
    return Response.json({ ok: true });
  }
  if (path === '/api/data' && method === 'GET') {
    await reconcile(env.DB);
    const [accounts, transactions, fixed] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM accounts ORDER BY id'),
      env.DB.prepare('SELECT * FROM transactions WHERE deleted=0 ORDER BY date DESC,created_at DESC'),
      env.DB.prepare('SELECT * FROM fixed_expenses ORDER BY description'),
    ]);
    return Response.json({ accounts: accounts.results, transactions: transactions.results, fixed: fixed.results, today: today() });
  }
  if (/^\/api\/accounts\/(PF|PJ)$/.test(path) && method === 'PUT') {
    const data = await body(request);
    if (!Number.isSafeInteger(data.opening_balance) || Math.abs(Number(data.opening_balance)) > 99999999999 || !validDate(data.opening_date)) throw new HttpError('Informe saldo e data válidos.');
    await env.DB.prepare('UPDATE accounts SET opening_balance=?,opening_date=? WHERE id=?').bind(data.opening_balance, data.opening_date, path.split('/').pop()).run();
    return Response.json({ ok: true });
  }
  const transactionMatch = path.match(/^\/api\/transactions(?:\/([\w-]+))?$/);
  if (transactionMatch && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const id = transactionMatch[1];
    if ((method === 'POST') === Boolean(id)) throw new HttpError('Operação inválida.');
    if (method === 'DELETE') {
      const exists = await env.DB.prepare('SELECT id FROM transactions WHERE id=? AND deleted=0').bind(id).first();
      if (!exists) throw new HttpError('Lançamento não encontrado.', 404);
      await env.DB.batch([
        env.DB.prepare('UPDATE transactions SET deleted=1 WHERE id=?').bind(id),
        // Removing a one-off payment restores its pending obligation, preserving its deadline.
        env.DB.prepare(`UPDATE fixed_expenses SET enabled=1,next_date=(SELECT occurrence FROM transactions WHERE id=?),last_paid=NULL
          WHERE id=(SELECT fixed_id FROM transactions WHERE id=?) AND cadence='once' AND automatic=0
          AND NOT EXISTS (SELECT 1 FROM transactions WHERE fixed_id=fixed_expenses.id AND deleted=0)`).bind(id, id),
        env.DB.prepare(`UPDATE fixed_expenses SET last_paid=(SELECT MAX(date) FROM transactions WHERE fixed_id=fixed_expenses.id AND deleted=0)
          WHERE id=(SELECT fixed_id FROM transactions WHERE id=?) AND cadence='monthly'`).bind(id),
      ]);
    } else {
      const data = await body(request);
      const f = fields(data);
      if (!validDate(data.date)) throw new HttpError('Informe uma data válida.');
      if (data.kind !== 'income' && data.kind !== 'expense') throw new HttpError('Escolha entrada ou saída.');
      if (method === 'POST') {
        const newId = typeof data.id === 'string' && /^[a-f0-9-]{36}$/.test(data.id) ? data.id : crypto.randomUUID();
        await env.DB.prepare('INSERT OR IGNORE INTO transactions (id,description,amount,kind,account,category,date) VALUES (?,?,?,?,?,?,?)')
          .bind(newId, f.description, f.amount, data.kind, f.account, f.category, data.date).run();
      } else {
        const old = await env.DB.prepare('SELECT fixed_id FROM transactions WHERE id=? AND deleted=0').bind(id).first<{ fixed_id: string | null }>();
        if (!old) throw new HttpError('Lançamento não encontrado.', 404);
        if (old.fixed_id && data.kind !== 'expense') throw new HttpError('Uma despesa fixa deve continuar sendo uma saída.');
        await env.DB.prepare('UPDATE transactions SET description=?,amount=?,kind=?,account=?,category=?,date=? WHERE id=?')
          .bind(f.description, f.amount, data.kind, f.account, f.category, data.date, id).run();
      }
    }
    return Response.json({ ok: true });
  }
  const fixedMatch = path.match(/^\/api\/fixed(?:\/([\w-]+))?(\/pay)?$/);
  if (fixedMatch && ['POST', 'PUT'].includes(method)) {
    const [, id, pay] = fixedMatch;
    const data = await body(request);
    if (pay && method === 'POST') {
      const rule = await env.DB.prepare('SELECT * FROM fixed_expenses WHERE id=? AND enabled=1').bind(id).first<FixedExpense>();
      if (!rule || rule.automatic) throw new HttpError('Despesa não disponível para pagamento.');
      const date = today();
      const occurrence = rule.cadence === 'monthly' ? String(data.occurrence ?? '') : rule.next_date;
      if (!occurrence || (rule.cadence === 'monthly' && (!rule.start_month || !monthsBetween(rule.start_month, date.slice(0, 7)).includes(occurrence)))) throw new HttpError('Referência inválida.');
      const next = rule.cadence === '30days' ? addDays(occurrence, 30) : null;
      const statements = [env.DB.prepare(`INSERT INTO transactions (id,description,amount,kind,account,category,date,fixed_id,occurrence)
        SELECT ?,description,amount,'expense',account,category,?,id,? FROM fixed_expenses WHERE id=? AND enabled=1 AND automatic=0
        ON CONFLICT(fixed_id,occurrence) DO UPDATE SET deleted=0,date=excluded.date,amount=excluded.amount,account=excluded.account WHERE transactions.deleted=1`)
        .bind(crypto.randomUUID(), date, occurrence, id)];
      if (rule.cadence !== 'monthly') statements.push(env.DB.prepare('UPDATE fixed_expenses SET next_date=?,last_paid=?,enabled=? WHERE id=? AND next_date=?').bind(next, date, next ? 1 : 0, id, occurrence));
      else statements.push(env.DB.prepare('UPDATE fixed_expenses SET last_paid=? WHERE id=?').bind(date, id));
      await env.DB.batch(statements);
    } else {
      if (pay || (method === 'POST' && id) || (method === 'PUT' && !id)) throw new HttpError('Operação inválida.');
      // Reconcile the old rule first, so edits never rewrite already-due charges.
      await reconcile(env.DB);
      const f = fields(data);
      if (!['30days', 'once', 'monthly'].includes(String(data.cadence))) throw new HttpError('Escolha uma frequência válida.');
      if (data.cadence !== 'monthly' && !validDate(data.next_date)) throw new HttpError('Informe a próxima data.');
      if (data.cadence === 'monthly' && (typeof data.start_month !== 'string' || !validDate(`${data.start_month}-01`))) throw new HttpError('Informe o mês inicial.');
      if (data.last_paid && !validDate(data.last_paid)) throw new HttpError('Informe uma data de pagamento válida.');
      const values = [f.description, f.amount, f.account, f.category, data.cadence, data.cadence === 'monthly' ? null : data.next_date, data.last_paid || null, data.cadence === 'monthly' ? data.start_month : null, data.cadence !== 'monthly' && data.automatic === true ? 1 : 0, data.enabled === false ? 0 : 1];
      if (id) {
        const result = await env.DB.prepare('UPDATE fixed_expenses SET description=?,amount=?,account=?,category=?,cadence=?,next_date=?,last_paid=?,start_month=?,automatic=?,enabled=? WHERE id=?').bind(...values, id).run();
        if (!result.meta.changes) throw new HttpError('Despesa não encontrada.', 404);
      } else await env.DB.prepare('INSERT INTO fixed_expenses (description,amount,account,category,cadence,next_date,last_paid,start_month,automatic,enabled,id) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(...values, crypto.randomUUID()).run();
    }
    return Response.json({ ok: true });
  }
  throw new HttpError('Página não encontrada.', 404);
}

/** Protects API responses from caching and hides internal errors from the browser. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return new Response('Não encontrado', { status: 404 });
    let response: Response;
    try { response = await api(request, env); }
    catch (error) {
      const known = error instanceof HttpError;
      if (!known) console.error(JSON.stringify({ event: 'api_error', path: new URL(request.url).pathname, message: error instanceof Error ? error.message : 'unknown' }));
      response = Response.json({ error: known ? error.message : 'Não foi possível salvar. Tente novamente.' }, { status: known ? error.status : 500 });
    }
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  },
  /** Cron continues automatic entries even while the website is closed. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await reconcile(env.DB);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),
      env.DB.prepare('DELETE FROM login_attempts WHERE CAST(substr(bucket,1,instr(bucket,\':\')-1) AS INTEGER)<?').bind(Math.floor(Date.now() / 900000) - 4),
    ]);
  },
} satisfies ExportedHandler<Env>;
