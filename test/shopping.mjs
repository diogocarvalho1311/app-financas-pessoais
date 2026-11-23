/** Verifies persistent wishlist CRUD against local Workers/D1 without touching real accounts. */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5173';
const password = (await readFile('.dev.vars', 'utf8')).match(/BOOTSTRAP_PASSWORD="([^"]+)"/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

/** Uses the actual session cookie and same-origin request semantics from the browser. */
const request = async (path, method = 'GET', data) => page.evaluate(async ({ path, method, data }) => {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: response.status, data: await response.json() };
}, { path, method, data });

try {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Entrar nas minhas finanças' }).waitFor();
  assert.equal((await request('/shopping', 'POST', { description: 'Privado', amount: 100 })).status, 401);
  assert.equal((await request('/shopping/unknown', 'PUT', { description: 'Privado', amount: 100 })).status, 401);
  assert.equal((await request('/shopping/unknown', 'DELETE')).status, 401);
  await page.getByLabel('Sua senha').fill(password);
  await page.getByRole('button', { name: 'Entrar nas minhas finanças' }).click();
  await page.getByRole('heading', { name: 'Entradas e saídas', exact: true }).waitFor();
  const baseline = (await request('/data')).data;
  assert.deepEqual(baseline.shopping, []);
  const balance = await page.locator('.metric.balance').innerText();

  await page.getByRole('button', { name: 'Lista de compras', exact: true }).click();
  await page.getByRole('heading', { name: 'Sua próxima compra começa aqui' }).waitFor();
  assert.match(await page.locator('.shopping-total').innerText(), /0,00/);
  assert.equal(await page.locator('.period-bar').count(), 0);
  await page.getByRole('button', { name: 'Adicionar primeiro item' }).click();
  await page.getByLabel('Nome do item').fill('  Monitor de exemplo  ');
  await page.getByLabel('Valor estimado (R$)').fill('0,00');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.locator('.form-error').filter({ hasText: 'maior que zero' }).waitFor();
  assert.equal(await page.getByLabel('Nome do item').inputValue(), '  Monitor de exemplo  ');
  await page.getByLabel('Valor estimado (R$)').fill('1.250,90');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('cell', { name: 'Monitor de exemplo', exact: true }).waitFor();
  assert.match(await page.locator('.shopping-total').innerText(), /1\.250,90/);
  const first = (await request('/data')).data.shopping[0];
  assert.equal(first.amount, 125090);
  await request('/shopping', 'POST', { ...first });
  assert.equal((await request('/data')).data.shopping.length, 1, 'Retrying a create must not duplicate a wish');

  await page.reload();
  await page.getByRole('button', { name: 'Lista de compras', exact: true }).click();
  await page.getByRole('cell', { name: 'Monitor de exemplo', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Editar Monitor de exemplo', exact: true }).click();
  assert.equal(await page.getByLabel('Valor estimado (R$)').inputValue(), '1.250,90');
  await page.getByLabel('Nome do item').fill('Monitor ajustado');
  await page.getByLabel('Valor estimado (R$)').fill('999,99');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('cell', { name: 'Monitor ajustado', exact: true }).waitFor();
  assert.match(await page.locator('.shopping-total').innerText(), /999,99/);

  await page.getByRole('button', { name: 'Adicionar item', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Nome do item').fill('<img src=x onerror="window.bad=true">');
  await page.getByLabel('Valor estimado (R$)').fill('20,01');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('cell', { name: '<img src=x onerror="window.bad=true">', exact: true }).waitFor();
  assert.equal(await page.locator('.shopping-panel img').count(), 0);
  assert.equal(await page.evaluate(() => window.bad), undefined);
  assert.match(await page.locator('.shopping-total').innerText(), /1\.020,00/);
  const second = (await request('/data')).data.shopping.find(item => item.id !== first.id);

  // Reject malformed input on create and edit, and keep existing records intact.
  for (const invalid of [{ amount: 0 }, { amount: -1 }, { amount: 1.1 }, { amount: '100' }, { amount: 100000000000 }, { description: '   ' }, { description: 'a'.repeat(101) }]) {
    assert.equal((await request('/shopping', 'POST', { description: 'Inválido', amount: 100, ...invalid })).status, 400);
    assert.equal((await request(`/shopping/${first.id}`, 'PUT', { description: 'Inválido', amount: 100, ...invalid })).status, 400);
  }
  assert.equal((await request('/shopping/missing', 'PUT', { description: 'Exemplo', amount: 100 })).status, 404);
  assert.equal((await request('/shopping/missing', 'DELETE')).status, 404);
  const foreign = await fetch(`${origin}/api/shopping`, { method: 'POST', headers: { Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'Inválido', amount: 100 }) });
  assert.equal(foreign.status, 403);

  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/shopping-desktop.png', fullPage: true });
  for (const width of [1250, 1100, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Shopping layout overflow at ${width}`);
    assert.ok(await page.getByRole('button', { name: 'Adicionar item', exact: true }).isVisible());
  }
  await page.screenshot({ path: 'test-results/shopping-small.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Remover Monitor ajustado', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal((await request('/data')).data.shopping.length, 2);
  await page.getByRole('button', { name: 'Remover Monitor ajustado', exact: true }).click();
  await page.getByRole('button', { name: 'Remover item', exact: true }).click();
  await page.locator('dialog').waitFor({ state: 'hidden' });
  assert.match(await page.locator('.shopping-total').innerText(), /20,01/);
  assert.equal((await request(`/shopping/${second.id}`, 'DELETE')).status, 200);
  await page.reload();
  await page.getByRole('heading', { name: 'Entradas e saídas', exact: true }).waitFor();
  assert.equal(await page.locator('.metric.balance').innerText(), balance);
  const after = (await request('/data')).data;
  assert.deepEqual(after.accounts, baseline.accounts);
  assert.deepEqual(after.transactions, baseline.transactions);
  assert.deepEqual(after.fixed, baseline.fixed);
  assert.deepEqual(after.shopping, []);
  await page.getByRole('button', { name: 'Lista de compras', exact: true }).click();
  await page.getByRole('heading', { name: 'Sua próxima compra começa aqui' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: persistent wishlist create/edit/delete, BRL totals, retry safety, validation, escaped names, protected routes, responsive layout, and unchanged financial balances/ledger.');
} finally { await browser.close(); }
