/** Checks password replacement, session revocation and one-off payment restoration locally. */
import { request } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5173';
const password = (await readFile('.dev.vars', 'utf8')).match(/BOOTSTRAP_PASSWORD="([^"]+)"/)[1];
const replacement = crypto.randomUUID();
const contexts = await Promise.all([1, 2].map(() => request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } })));
const [a, b] = contexts;
try {
  const bindings = await (await a.get('/cdn-cgi/local/explorer/api/d1/database')).json();
  const database = bindings.result.find(binding => binding.name === 'DB');
  await a.post(`/cdn-cgi/local/explorer/api/d1/database/${database.uuid}/raw`, { data: { sql: 'DELETE FROM login_attempts' } });
  assert.equal((await a.post('/api/login', { data: { password } })).status(), 200);
  assert.equal((await b.post('/api/login', { data: { password } })).status(), 200);
  const before = await (await a.get('/api/data')).json();
  const deadline = before.fixed.find(r => r.id === 'bill').next_date;
  assert.equal((await a.post('/api/fixed/bill/pay', { data: {} })).status(), 200);
  let data = await (await a.get('/api/data')).json();
  const payment = data.transactions.find(t => t.fixed_id === 'bill');
  assert.ok(payment);
  assert.equal(data.fixed.find(r => r.id === 'bill').enabled, 0);
  await a.delete(`/api/transactions/${payment.id}`);
  data = await (await a.get('/api/data')).json();
  const bill = data.fixed.find(r => r.id === 'bill');
  assert.equal(bill.enabled, 1);
  assert.equal(bill.next_date, deadline);
  assert.equal(bill.last_paid, null);
  assert.equal((await a.put('/api/password', { data: { current: password, password: replacement } })).status(), 200);
  assert.equal((await b.get('/api/data')).status(), 401);
  await a.post('/api/logout', { data: {} });
  assert.equal((await a.post('/api/login', { data: { password } })).status(), 401);
  assert.equal((await a.post('/api/login', { data: { password: replacement } })).status(), 200);
  assert.equal((await a.put('/api/password', { data: { current: replacement, password } })).status(), 200);
  await a.post('/api/logout', { data: {} });
  console.log('PASS: PBKDF2 password change, bootstrap replacement, other-device session revocation, and restoring a deleted one-off payment.');
} finally { await Promise.all(contexts.map(c => c.dispose())); }
