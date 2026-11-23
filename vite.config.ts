/** Vite serves the desktop UI and builds its API in the Workers runtime. */
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { homedir } from 'node:os';
import { join } from 'node:path';

// SQLite state stays outside the Google Drive checkout to avoid sync-related locks.
export default defineConfig({ plugins: [cloudflare({ persistState: { path: process.env.FINANCE_LOCAL_STATE ?? join(homedir(), '.local/share/minhas-financas/state') } })] });
