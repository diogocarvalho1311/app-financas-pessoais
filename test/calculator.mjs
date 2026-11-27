/** Exercises the calculator on fictional demo data; no private API is permitted. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.PREVIEW_ORIGIN ?? 'http://127.0.0.1:5191';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort(); });
  await page.goto(`${origin}/demo`);
  await page.getByRole('heading', { name: 'Entradas e saídas', exact: true }).waitFor();
  const balance = await page.locator('.metric.balance').innerText();
  await page.getByRole('button', { name: 'Abrir calculadora', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Calculadora', exact: true });
  const display = panel.getByLabel('Visor da calculadora');
  await panel.waitFor();
  assert.equal(await display.evaluate(element => element === document.activeElement), true);
  await page.keyboard.type('200+10%'); await page.keyboard.press('Enter');
  assert.equal(await display.innerText(), '220');
  await panel.getByRole('button', { name: 'Limpar calculadora', exact: true }).click();
  for (const key of ['8', 'Dividir', '2', 'Calcular resultado']) await panel.getByRole('button', { name: key, exact: true }).click();
  assert.equal(await display.innerText(), '4');
  await display.focus(); await page.keyboard.press('Delete');
  await page.keyboard.type('0,1+0,2'); await page.keyboard.press('Enter');
  assert.equal(await display.innerText(), '0,3');
  await page.getByRole('button', { name: 'Resumo', exact: true }).click();
  assert.equal(await panel.isVisible(), true);
  assert.equal(await display.innerText(), '0,3', 'Navigation keeps the calculation');
  await page.getByRole('button', { name: 'Entradas e saídas', exact: true }).click();
  await page.getByRole('searchbox').fill('123');
  assert.equal(await display.innerText(), '0,3', 'Typing in a site field must not operate the calculator');
  await page.getByRole('searchbox').fill('');
  assert.equal(await page.locator('.metric.balance').innerText(), balance);
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 700 });
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width);
    assert.ok(bounds.y + bounds.height <= 700);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/calculator.png' });
  await display.focus(); await page.keyboard.press('Escape');
  assert.equal(await panel.isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Abrir calculadora', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Enter'); await panel.waitFor();
  await panel.getByRole('button', { name: 'Fechar calculadora', exact: true }).click();
  assert.equal(await panel.isVisible(), false);
  assert.deepEqual(requests, []); assert.deepEqual(errors, []);
  console.log('PASS: calculator arithmetic, percentage, decimal comma, keyboard, focus, responsive popup, navigation and zero private API calls.');
} finally { await browser.close(); }
