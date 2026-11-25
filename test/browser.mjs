/** Exercises real Workers/D1 behavior and the desktop UI against local development only. */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { addDays } from '../src/finance.ts';

// PREVIEW_ORIGIN may select another local port when 5173 is used by another project.
const origin = process.env.PREVIEW_ORIGIN ?? 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname) || new URL(origin).protocol !== 'http:') {
  throw new Error('Execute testes de escrita somente em um servidor HTTP local com banco descartável.');
}
const password = (await readFile('.dev.vars', 'utf8')).match(/BOOTSTRAP_PASSWORD="([^"]+)"/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const request = async (path, method = 'GET', data) => page.evaluate(async ({ path, method, data }) => {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: response.status, data: await response.json() };
}, { path, method, data });

/** Sets only the salary baseline in the disposable local D1; never contacts Cloudflare production. */
async function salaryBaseline(value) {
  const explorer = `${origin}/cdn-cgi/local/explorer/api/d1/database`;
  const databases = await (await fetch(explorer)).json();
  const db = databases.result.find(item => item.name === 'DB');
  const sql = "DELETE FROM settings WHERE key='salary_reserve';" + (value
    ? `INSERT INTO settings VALUES ('salary_reserve','${JSON.stringify(value).replaceAll("'", "''")}');` : '');
  const response = await fetch(`${explorer}/${db.uuid}/raw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql }) });
  assert.equal((await response.json()).success, true);
}
let injectedBaseline = false;

try {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Entrar nas minhas finanças' }).waitFor();
  assert.equal((await request('/data')).status, 401);
  await page.getByLabel('Sua senha').fill(password);
  await page.getByRole('button', { name: 'Entrar nas minhas finanças' }).click();
  await page.getByRole('heading', { name: 'Entradas e saídas', exact: true }).waitFor();
  assert.match(await page.locator('.metric.balance').innerText(), /3\.250,00/);
  const initial = (await request('/data')).data;
  assert.equal(initial.transactions.length, 0);
  assert.equal(initial.fixed.find(r => r.id === 'music').next_date, addDays(initial.today, 3));
  assert.equal(initial.fixed.find(r => r.id === 'cloud').next_date, addDays(initial.today, 30));

  assert.equal(initial.salaryReserve, null);
  const baseline = { account: 'PF', amount: 30000, start_date: initial.today };
  injectedBaseline = true;
  await salaryBaseline(baseline);
  await page.reload();
  await page.getByRole('heading', { name: 'Entradas e saídas', exact: true }).waitFor();
  const reserved = (await request('/data')).data;
  assert.deepEqual(reserved.salaryReserve, baseline);
  assert.deepEqual(reserved.accounts, initial.accounts);
  assert.deepEqual(reserved.transactions, initial.transactions);
  assert.match(await page.locator('.metric.spending').innerText(), /Para guardar \(30% do salário\):.*300,00/);
  await salaryBaseline(null);
  injectedBaseline = false;
  await page.reload();
  await page.getByRole('heading', { name: 'Entradas e saídas', exact: true }).waitFor();

  await page.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
  await page.getByLabel('Movimento', { exact: true }).selectOption('income');
  await page.getByLabel('Descrição', { exact: true }).fill('Salário teste');
  await page.getByLabel('Valor (R$)', { exact: true }).fill('125,76');
  await page.getByLabel('Categoria', { exact: true }).selectOption('Salário');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('cell', { name: 'Salário teste', exact: true }).waitFor();
  assert.match(await page.locator('.metric.balance').innerText(), /3\.375,76/);
  assert.match(await page.locator('.metric.spending').innerText(), /37,73/);
  await page.getByRole('button', { name: 'Editar Salário teste', exact: true }).click();
  await page.getByLabel('Valor (R$)', { exact: true }).fill('100,00');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.locator('dialog').waitFor({ state: 'hidden' });
  assert.match(await page.locator('.metric.balance').innerText(), /3\.350,00/);
  assert.match(await page.locator('.metric.spending').innerText(), /30,00/);
  await page.getByRole('searchbox').fill('não existe');
  await page.getByRole('heading', { name: 'Nenhum lançamento encontrado' }).waitFor();
  await page.getByRole('searchbox').fill('');
  await page.getByLabel('Filtrar por conta').selectOption('PJ');
  assert.match(await page.locator('.metric.balance').innerText(), /750,00/);
  await page.getByLabel('Filtrar por conta').selectOption('all');
  await page.getByRole('button', { name: 'Excluir Salário teste', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir lançamento', exact: true }).click();
  await page.locator('dialog').waitFor({ state: 'hidden' });
  assert.match(await page.locator('.metric.balance').innerText(), /3\.250,00/);

  await page.getByRole('button', { name: 'Despesas fixas', exact: true }).click();
  const tithe = page.locator('.fixed-card').filter({ has: page.getByRole('heading', { name: 'Contribuição de exemplo', exact: true }) });
  assert.match(await tithe.innerText(), /2 meses pendentes/);
  await tithe.getByRole('button', { name: 'Marcar como pago' }).first().click();
  await page.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await page.locator('dialog').waitFor({ state: 'hidden' });
  assert.match(await tithe.innerText(), /1 mês pendente/);
  let snapshot = (await request('/data')).data;
  const payment = snapshot.transactions.find(t => t.fixed_id === 'monthly');
  assert.equal(payment.amount, 10000);
  assert.equal(payment.occurrence, initial.fixed.find(r => r.id === 'monthly').start_month);
  // A retried payment must not debit the same month again.
  await request('/fixed/monthly/pay', 'POST', { occurrence: payment.occurrence });
  assert.equal((await request('/data')).data.transactions.filter(t => t.fixed_id === 'monthly').length, 1);
  await request(`/transactions/${payment.id}`, 'DELETE');
  await page.reload();
  await page.getByRole('button', { name: 'Despesas fixas', exact: true }).click();
  assert.match(await tithe.innerText(), /2 meses pendentes/);
  await page.getByRole('button', { name: 'Editar Assinatura de exemplo', exact: true }).click();
  assert.equal(await page.getByLabel('Valor (R$)', { exact: true }).inputValue(), '19,90');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  // Validation, foreign-origin CSRF and future-dated balance behavior use the real API.
  assert.equal((await request('/transactions', 'POST', { description: 'Inválido', amount: 0, kind: 'expense', account: 'PF', category: 'Compra', date: initial.today })).status, 400);
  const foreign = await fetch(`${origin}/api/transactions`, { method: 'POST', headers: { Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(foreign.status, 403);
  const plannedId = crypto.randomUUID();
  const payload = { id: plannedId, description: '<script>teste</script>', amount: 1000, kind: 'expense', account: 'PF', category: 'Compra', date: addDays(initial.today, 9) };
  assert.equal((await request('/transactions', 'POST', payload)).status, 200);
  await request('/transactions', 'POST', payload);
  snapshot = (await request('/data')).data;
  assert.equal(snapshot.transactions.filter(t => t.id === plannedId).length, 1);
  await page.reload();
  await page.getByRole('heading', { name: 'Entradas e saídas', exact: true }).waitFor();
  assert.match(await page.locator('.metric.balance').innerText(), /3\.250,00/);
  await page.getByRole('button', { name: 'Personalizado', exact: true }).click();
  await page.getByLabel('Data final', { exact: true }).fill(addDays(initial.today, 40));
  await page.getByRole('cell', { name: '<script>teste</script>', exact: true }).waitFor();
  assert.match(await page.locator('table').innerText(), /Previsto/);
  await page.screenshot({ path: 'test-results/desktop-table.png', fullPage: true });
  await request(`/transactions/${plannedId}`, 'DELETE');

  await page.getByRole('button', { name: 'Resumo', exact: true }).click();
  await page.getByRole('heading', { name: 'Saídas por categoria' }).waitFor();
  await page.getByRole('button', { name: 'Contas', exact: true }).click();
  await page.getByRole('heading', { name: 'Conta PF', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Entradas e saídas', exact: true }).click();
  await page.screenshot({ path: 'test-results/desktop-empty.png', fullPage: true });
  for (const width of [1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`);
  }
  const automaticRule = { description: 'Teste automático', amount: 77, account: 'PJ', category: 'Compra', cadence: '30days', next_date: initial.today, automatic: true, enabled: true };
  assert.equal((await request('/fixed', 'POST', automaticRule)).status, 200);
  await Promise.all([request('/data'), request('/data')]);
  snapshot = (await request('/data')).data;
  const rule = snapshot.fixed.find(r => r.description === 'Teste automático');
  const automatic = snapshot.transactions.filter(t => t.fixed_id === rule.id);
  assert.equal(automatic.length, 1, 'Concurrent reconciliation must never double-debit');
  assert.equal(automatic[0].amount, 77);
  await request(`/fixed/${rule.id}`, 'PUT', { ...automaticRule, next_date: rule.next_date, enabled: false });
  await request(`/transactions/${automatic[0].id}`, 'DELETE');
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.getByRole('button', { name: 'Entrar nas minhas finanças' }).waitFor();
  assert.equal((await request('/data')).status, 401);
  assert.deepEqual(errors, []);
  console.log('PASS: login, balances, create/edit/delete, filters, tithes, idempotency, CSRF, validation, future dates, dashboard, accounts, responsive layout and logout.');
} finally { try { if (injectedBaseline) await salaryBaseline(null); } finally { await browser.close(); } }
