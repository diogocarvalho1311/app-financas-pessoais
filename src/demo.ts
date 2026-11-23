/** Fictional, deterministic preview data. This module never imports or calls the private API. */
import type { Data } from './ui';

/** A fixed reference date makes the public preview reproducible in any time zone. */
export const DEMO_DATE = '2026-06-18';

/** Returns a fresh fictional dataset, isolated from authenticated account records. */
export function createDemoData(): Data {
  return {
    today: DEMO_DATE,
    accounts: [
      { id: 'PF', opening_balance: 180000, opening_date: '2026-06-01' },
      { id: 'PJ', opening_balance: 90000, opening_date: '2026-06-01' },
    ],
    transactions: [
      { id: 'demo-12', description: 'Compra planejada', amount: 8500, kind: 'expense', account: 'PF', category: 'Compra', date: '2026-06-26' },
      { id: 'demo-11', description: 'Recebimento previsto', amount: 50000, kind: 'income', account: 'PJ', category: 'Salário', date: '2026-06-24' },
      { id: 'demo-10', description: 'Nuvem Exemplo', amount: 990, kind: 'expense', account: 'PJ', category: 'Compra', date: '2026-06-17', fixed_id: 'demo-cloud', occurrence: '2026-06-17' },
      { id: 'demo-9', description: 'Transporte', amount: 4200, kind: 'expense', account: 'PF', category: 'Compra', date: '2026-06-16' },
      { id: 'demo-8', description: 'Mercado', amount: 5475, kind: 'expense', account: 'PF', category: 'Compra', date: '2026-06-15' },
      { id: 'demo-7', description: 'Música Exemplo', amount: 1990, kind: 'expense', account: 'PF', category: 'Compra', date: '2026-06-12', fixed_id: 'demo-music', occurrence: '2026-06-12' },
      { id: 'demo-6', description: 'Projeto de exemplo', amount: 90000, kind: 'income', account: 'PJ', category: 'Salário', date: '2026-06-12' },
      { id: 'demo-5', description: 'Internet', amount: 8990, kind: 'expense', account: 'PF', category: 'Compra', date: '2026-06-10' },
      { id: 'demo-4', description: 'Ajuda para mãe', amount: 25000, kind: 'expense', account: 'PF', category: 'Mãe', date: '2026-06-08' },
      { id: 'demo-3', description: 'Contribuição mensal', amount: 15000, kind: 'expense', account: 'PF', category: 'Dízimo', date: '2026-06-07', fixed_id: 'demo-monthly', occurrence: '2026-06' },
      { id: 'demo-2', description: 'Compras da semana', amount: 23650, kind: 'expense', account: 'PF', category: 'Compra', date: '2026-06-06' },
      { id: 'demo-1', description: 'Salário de exemplo', amount: 450000, kind: 'income', account: 'PF', category: 'Salário', date: '2026-06-05' },
      { id: 'demo-may-2', description: 'Compras de maio', amount: 120000, kind: 'expense', account: 'PF', category: 'Compra', date: '2026-05-14' },
      { id: 'demo-may-1', description: 'Salário de maio', amount: 430000, kind: 'income', account: 'PF', category: 'Salário', date: '2026-05-05' },
      { id: 'demo-april-2', description: 'Compras de abril', amount: 160000, kind: 'expense', account: 'PF', category: 'Compra', date: '2026-04-14' },
      { id: 'demo-april-1', description: 'Salário de abril', amount: 420000, kind: 'income', account: 'PF', category: 'Salário', date: '2026-04-05' },
    ],
    fixed: [
      { id: 'demo-music', description: 'Música Exemplo', amount: 1990, account: 'PF', category: 'Compra', cadence: '30days', next_date: '2026-07-12', last_paid: '2026-06-12', start_month: null, automatic: 1, enabled: 1 },
      { id: 'demo-cloud', description: 'Nuvem Exemplo', amount: 990, account: 'PJ', category: 'Compra', cadence: '30days', next_date: '2026-07-17', last_paid: '2026-06-17', start_month: null, automatic: 1, enabled: 1 },
      { id: 'demo-bill', description: 'Cobrança de exemplo', amount: 12000, account: 'PJ', category: 'Compra', cadence: 'once', next_date: '2026-06-28', last_paid: null, start_month: null, automatic: 0, enabled: 1 },
      { id: 'demo-monthly', description: 'Contribuição mensal', amount: 15000, account: 'PF', category: 'Dízimo', cadence: 'monthly', next_date: null, last_paid: '2026-06-07', start_month: '2026-04', automatic: 0, enabled: 1 },
    ],
  };
}
