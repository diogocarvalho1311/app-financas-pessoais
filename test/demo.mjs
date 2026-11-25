/** Tests the public preview and proves that navigation never requests the private API. */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = process.env.PREVIEW_ORIGIN ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addCookies([{ name: 'finance_session', value: 'unrelated-private-session', url: origin }]);
  const page = await context.newPage();
  const apiRequests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { apiRequests.push(route.request().url()); return route.abort(); });
  assert.equal((await page.goto(`${origin}/demo`)).status(), 200);
  await page.getByRole('heading', { name: 'Entradas e saídas', exact: true }).waitFor();
  assert.match(await page.locator('.demo-banner').innerText(), /Dados fictícios/);
  await page.getByRole('cell', { name: 'Salário de exemplo', exact: true }).waitFor();
  assert.equal(await page.locator('[data-edit], [data-delete], [data-pay], [data-action="new-transaction"]').count(), 0);
  const body = await page.locator('body').innerText();
  assert.ok(body.includes('Salário de exemplo'));
  assert.match(await page.locator('.metric.spending .metric-value').innerText(), /6\.827,05/);
  assert.match(await page.locator('.metric.spending').innerText(), /420,00/);
  assert.match(await page.locator('.metric.spending').innerText(), /30\/06\/2026/);
  await mkdir('docs', { recursive: true });
  await page.screenshot({ path: 'docs/demo.png', fullPage: true });
  await page.getByRole('searchbox').fill('Transporte');
  assert.equal(await page.locator('tbody tr').count(), 1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const download = await downloadPromise;
  assert.match(await readFile(await download.path(), 'utf8'), /Transporte/);
  await page.getByRole('searchbox').fill('');
  await page.getByLabel('Filtrar por conta').selectOption('PJ');
  assert.ok(!(await page.locator('table').innerText()).includes('Salário de exemplo'));
  assert.match(await page.locator('.metric.spending .metric-value').innerText(), /1\.670,10/);
  await page.getByLabel('Filtrar por conta').selectOption('PF');
  assert.match(await page.locator('.metric.spending .metric-value').innerText(), /5\.156,95/);
  await page.getByLabel('Filtrar por conta').selectOption('all');
  await page.getByRole('button', { name: 'Resumo', exact: true }).click();
  await page.getByRole('button', { name: 'Personalizado', exact: true }).click();
  await page.getByLabel('Data inicial', { exact: true }).fill('2026-04-01');
  await page.getByLabel('Data final', { exact: true }).fill('2026-06-30');
  assert.equal(await page.locator('.monthly-summary tbody tr').count(), 3);
  assert.match(await page.locator('.metric.spending .metric-value').innerText(), /6\.827,05/, 'Changing the report period must not change current spending room');
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Summary overflow at ${width}`);
    assert.ok(await page.getByRole('article', { name: 'Disponível para gastar', exact: true }).isVisible());
    assert.ok(await page.locator('.metric.spending .metric-value').evaluate(el => el.scrollWidth <= el.clientWidth), `Spending value clipped at ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Despesas fixas', exact: true }).click();
  assert.equal(await page.locator('.fixed-card').count(), 4);
  await page.getByRole('button', { name: 'Lista de compras', exact: true }).click();
  assert.equal(await page.locator('.shopping-panel tbody tr').count(), 3);
  assert.match(await page.locator('.shopping-total').innerText(), /915,00/);
  assert.equal(await page.locator('[data-edit-shopping], [data-delete-shopping], [data-action="new-shopping"]').count(), 0);
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Shopping layout overflow at ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Contas', exact: true }).click();
  await page.getByRole('heading', { name: 'Conta PF', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Alterar senha' }).count(), 0);
  await page.reload();
  await page.getByRole('cell', { name: 'Salário de exemplo', exact: true }).waitFor();
  for (const width of [1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Layout overflow at ${width}`);
  }
  assert.deepEqual(apiRequests, [], 'The public preview must never contact the private API, even with a session cookie');
  assert.deepEqual(errors, []);
  const anonymous = await browser.newContext();
  const privatePage = await anonymous.newPage();
  await privatePage.goto(origin);
  await privatePage.getByRole('button', { name: 'Entrar nas minhas finanças' }).waitFor();
  assert.equal((await anonymous.request.get(`${origin}/api/data`)).status(), 401);
  console.log('PASS: fictional preview, all tabs and filters, CSV, responsive layout, no mutation actions, zero private API requests, private login unchanged.');
} finally { await browser.close(); }
