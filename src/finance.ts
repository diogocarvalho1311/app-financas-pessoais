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

/** A purchase wish with an estimated price in cents; never contributes to account balances. */
export interface ShoppingItem { id: string; description: string; amount: number }

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

/** A current-month spending estimate; all monetary fields are integer cents. */
export interface SpendingRoom {
  /** Today's balance of the selected accounts, excluding future income and payments. */
  balance: number;
  /** Unpaid fixed expenses through month end, including older outstanding occurrences. */
  reserved: number;
  /** Non-negative balance remaining after the fixed-expense reserve. */
  available: number;
  /** Amount missing when the current balance cannot cover the reserve. */
  shortfall: number;
  /** Last calendar day of the current month, independent of the transaction filters. */
  until: string;
}

/**
 * Reserves unpaid fixed obligations through the end of today's month, by account.
 * Paid occurrences already affect the balance and are never deducted twice.
 * Future fixed entries reserve their recorded amount once, even if a rule was paused
 * or the payment was moved past its due month. Income forecasts and shopping wishes
 * are excluded. This is a calculation only; it never changes saved records.
 */
export function spendingRoom(accounts: Account[], transactions: Transaction[], fixed: FixedExpense[], date: string, account = 'all'): SpendingRoom {
  const month = date.slice(0, 7);
  const last = new Date(`${month}-01T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const until = last.toISOString().slice(0, 10);
  const selected = accounts.filter(a => account === 'all' || a.id === account);
  const ids = new Set<string>(selected.map(a => a.id));
  const current = selected.reduce((sum, a) => sum + balance(a, transactions, date), 0);
  const recorded = new Map(transactions.filter(t => t.kind === 'expense' && t.fixed_id && t.occurrence)
    .map(t => [`${t.fixed_id}:${t.occurrence}`, t]));
  const counted = new Set<string>();
  let reserved = 0;

  /** A recorded future payment keeps its actual amount and account, once per entry. */
  const reserveEntry = (t: Transaction): void => {
    if (t.date > date && ids.has(t.account) && !counted.has(t.id)) {
      reserved += t.amount;
      counted.add(t.id);
    }
  };
  for (const t of transactions) {
    if (t.kind !== 'expense' || !t.fixed_id || t.date <= date) continue;
    const due = t.occurrence;
    const dueByMonthEnd = due && ((/^20\d{2}-\d{2}$/.test(due) && due <= month) || (validDate(due) && due <= until));
    if (t.date <= until || dueByMonthEnd) reserveEntry(t);
  }
  for (const rule of fixed) {
    if (!rule.enabled) continue;
    const occurrences = rule.cadence === 'monthly' ? monthsBetween(rule.start_month ?? month, month) : [];
    if (rule.cadence !== 'monthly') {
      let due = rule.next_date;
      // The supported 2000–2099 range contains fewer than 1,220 thirty-day charges.
      for (let count = 0; due && due <= until && count < 1220; count++) {
        occurrences.push(due);
        due = rule.cadence === '30days' ? addDays(due, 30) : null;
      }
    }
    for (const occurrence of occurrences) {
      const entry = recorded.get(`${rule.id}:${occurrence}`);
      if (entry) reserveEntry(entry);
      else if (ids.has(rule.account)) reserved += rule.amount;
    }
  }
  return { balance: current, reserved, available: Math.max(0, current - reserved), shortfall: Math.max(0, reserved - current), until };
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
