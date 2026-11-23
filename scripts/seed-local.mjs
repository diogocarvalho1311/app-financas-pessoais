/** Initializes the local D1 simulation after npm run dev; never contacts production. */
import { readFile, readdir } from 'node:fs/promises';
import { addDays, today } from '../src/finance.ts';

const explorer = 'http://127.0.0.1:5173/cdn-cgi/local/explorer/api';
const bindings = await (await fetch(`${explorer}/d1/database`)).json();
const database = bindings.result?.find(binding => binding.name === 'DB');
if (!database) throw new Error('Inicie npm run dev com o binding DB configurado.');
// Apply every additive migration in order for both new and existing local databases.
const migrations = new URL('../migrations/', import.meta.url);
const files = (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort();
let sql = (await Promise.all(files.map(file => readFile(new URL(file, migrations), 'utf8')))).join('\n');
if (process.argv.includes('--fixtures')) {
  const date = today();
  const previous = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const replacements = { TODAY: date, NEXT_MUSIC: addDays(date, 3), LAST_MUSIC: addDays(date, -27), NEXT_CLOUD: addDays(date, 30), BILL_DUE: addDays(date, 29), PREVIOUS_MONTH: previous.toISOString().slice(0, 7) };
  const fixture = await readFile(new URL('../test/fixtures.sql', import.meta.url), 'utf8');
  sql += fixture.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in replacements)) throw new Error('Fixture date marker is unknown.');
    return replacements[key];
  });
}
const response = await fetch(`${explorer}/d1/database/${database.uuid}/raw`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql }),
});
const result = await response.json();
if (!response.ok || !result.success) throw new Error(JSON.stringify(result.errors));
console.log('Banco local inicializado. Registros existentes foram preservados.');
