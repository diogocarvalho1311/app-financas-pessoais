/** Creates an ignored local bootstrap secret without overwriting an existing password. */
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

try {
  await writeFile(new URL('../.dev.vars', import.meta.url), `# Local development only; never commit this file.\nBOOTSTRAP_PASSWORD="${randomBytes(24).toString('base64url')}"\n`, { mode: 0o600, flag: 'wx' });
  console.log('Senha inicial criada no arquivo local .dev.vars.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('O arquivo .dev.vars existente foi preservado.');
}
