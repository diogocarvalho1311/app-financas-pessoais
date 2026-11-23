/** Uploads only requested static asset buckets using a short-lived JWT supplied on stdin. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Raw TTY input prevents the short-lived credential from echoing into a tool transcript.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write('Ready for upload JSON on stdin (hidden).\n');
const input = await new Promise(resolve => {
  let value = '';
  process.stdin.on('data', chunk => {
    value += chunk.toString();
    if (value.includes('\n')) {
      process.stdin.pause();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      resolve(value.slice(0, value.indexOf('\n')));
    }
  });
});
const { jwt, buckets, account, manifest, directory } = JSON.parse(input);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
let completion = jwt;
for (const bucket of buckets) {
  const form = new FormData();
  for (const hash of bucket) {
    const path = Object.keys(manifest).find(key => manifest[key].hash === hash);
    if (!path) throw new Error('Manifest entry missing');
    const bytes = await readFile(join(directory, path));
    if (createHash('sha256').update(bytes).digest('hex').slice(0, 32) !== hash) throw new Error('Asset changed after manifest generation');
    const extension = path.slice(path.lastIndexOf('.'));
    form.append(hash, new Blob([bytes.toString('base64')], { type: mime[extension] ?? 'application/octet-stream' }), hash);
  }
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/assets/upload?base64=true`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: form });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(JSON.stringify(result.errors));
  if (result.result.jwt) completion = result.result.jwt;
}
process.stdout.write(JSON.stringify({ jwt: completion }));
