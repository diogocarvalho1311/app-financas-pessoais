/** Deployment resources; credentials belong in Cloudflare secrets or .dev.vars. */
import { bindings, defineConfig, triggers } from 'cf/config';
import { existsSync, readFileSync } from 'node:fs';

/** Machine-local resource IDs are optional in development and never enter the repository. */
const privatePath = new URL('./deployment.local.json', import.meta.url);
const privateResources: { accountId?: string; databaseId?: string } = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, 'utf8')) : {};

export default defineConfig({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? privateResources.accountId,
  worker: {
    name: 'minhas-financas-pessoais',
    entrypoint: './src/worker.ts',
    compatibilityDate: '2026-11-22',
    workersDev: true,
    // Public preview paths render the SPA; API paths always run authentication first.
    assets: { notFoundHandling: 'single-page-application', runWorkerFirst: ['/api/*'] },
    env: {
      DB: bindings.d1({ id: process.env.FINANCE_DATABASE_ID ?? privateResources.databaseId, name: 'minhas-financas-pessoais' }),
      BOOTSTRAP_PASSWORD: bindings.secret(),
    },
    // Daily at 06:00 São Paulo; the API also reconciles missed occurrences.
    triggers: [triggers.scheduled({ schedule: '0 9 * * *' })],
    observability: { enabled: true, traces: { enabled: true } },
  },
});
