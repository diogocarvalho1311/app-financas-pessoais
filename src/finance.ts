/** Shared financial rules. Money is always integer cents and dates are date-only. */
export const CATEGORIES = ['Salário', 'Compra', 'Dízimo', 'Mãe'] as const;

/** A real or planned entry; deleted rows are excluded before leaving the API. */
export interface Transaction {
  id: string; description: string; amount: number; kind: 'income' | 'expense';
  account: 'PF' | 'PJ'; category: string; date: string;
  fixed_id?: string | null; occurrence?: string | null;
}

/** Opening balances form a snapshot; earlier history does not change that snapshot. */
export interface Account { id: 'PF' | 'PJ'; opening_balance: number; opening_date: string }

/** Monthly expenses without deadlines are paid explicitly, after salary arrives. */
export interface FixedExpense {
  id: string; description: string; amount: number; account: 'PF' | 'PJ'; category: string;
  cadence: '30days' | 'once' | 'monthly'; next_date: string | null; last_paid: string | null;
  start_month: string | null; automatic: number; enabled: number;
}

/** Returns the calendar date in the user's time zone, including around midnight UTC. */
export function today(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Adds exact calendar days, so a 30-day subscription never becomes a calendar month. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Rejects nonexistent dates, malformed strings and unsupported calendar years. */
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Parses Brazilian currency without accepting extra decimals or ambiguous separators. */
export function parseMoney(value: string): number {
  const clean = value.trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(clean)) throw new Error('Use um valor como 1.234,56.');
  const [whole, decimals = ''] = clean.replaceAll('.', '').split(',');
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 99999999999) throw new Error('Valor fora do limite permitido.');
  return cents;
}

/** Computes today's account balance without applying future or pre-snapshot entries. */
export function balance(account: Account, transactions: Transaction[], until: string): number {
  return account.opening_balance + transactions.filter(t => t.account === account.id && t.date >= account.opening_date && t.date <= until)
    .reduce((sum, t) => sum + (t.kind === 'income' ? t.amount : -t.amount), 0);
}

/** Produces at most 1,200 month references, retaining unpaid monthly obligations. */
export function monthsBetween(start: string, end: string): string[] {
  const result: string[] = [];
  let month = start;
  while (month <= end && result.length < 1200) {
    result.push(month);
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    month = date.toISOString().slice(0, 7);
  }
  return result;
}
