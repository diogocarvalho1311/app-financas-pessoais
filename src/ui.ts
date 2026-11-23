/** Shared, escaped markup and Brazilian formatting for the browser UI. */
import type { Account, FixedExpense, Transaction } from './finance';

/** Snapshot returned by the authenticated API; never stored in browser localStorage. */
export interface Data { accounts: Account[]; transactions: Transaction[]; fixed: FixedExpense[]; today: string }
/** Navigation and filtering state for the single desktop workspace. */
export interface State {
  /** Public demo mode renders fictional in-memory records and disables private actions. */
  demo?: boolean;
  data: Data; tab: 'transactions' | 'dashboard' | 'fixed' | 'accounts';
  mode: 'month' | 'custom'; month: string; from: string; to: string;
  account: string; kind: string; query: string; page: number;
}

/** Escapes user-entered strings for both text nodes and quoted attributes. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Formats integer cents as Brazilian reais, without floating point arithmetic in storage. */
export function money(cents: number): string { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
/** Formats date-only strings without a UTC-to-local date shift. */
export function dateLabel(date: string | null): string { return date ? date.split('-').reverse().join('/') : '—'; }
/** Returns an editable currency string such as 1.234,56. */
export function moneyInput(cents: number): string { return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
/** Formats monthly references and preserves their year. */
export function monthLabel(month: string): string { return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }

/** Local outline icons keep the UI independent of external image and font services. */
export function icon(name: string): string {
  const paths: Record<string, string> = {
    plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6ZM13 6l5 5"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    down: '<path d="M12 4v16m-6-6 6 6 6-6"/>', up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
    wallet: '<path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h15v11H5a2 2 0 0 1-2-2V6M21 12h-5v5h5"/><path d="M17 14.5h1"/>',
    chart: '<path d="M4 3v18h17M8 16v-5M13 16V6M18 16v-8"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3"/>',
    repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
    logout: '<path d="M9 4H4v16h5M9 12h12m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
    star: '<path d="m12 2 2.7 6.6 7.1.6-5.4 4.6 1.7 7L12 17l-6.1 3.8 1.7-7-5.4-4.6 7.1-.6Z"/>',
    list: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M9 9v11M13 13h4M13 17h4"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
    music: '<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
    heart: '<path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>',
    cloud: '<path d="M6 18a5 5 0 1 1 1-9 6 6 0 0 1 11-1 5 5 0 1 1 1 10Z"/>',
    receipt: '<path d="M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2ZM9 9h6M9 13h6"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.wallet}</svg>`;
}

/** Supplies month boundaries, including leap years, without local date conversions. */
export function range(state: State): [string, string] {
  if (state.mode === 'custom') return [state.from, state.to];
  const start = `${state.month}-01`;
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return [start, end.toISOString().slice(0, 10)];
}

/** Filters period and account first; text and kind are optional table-only filters. */
export function rows(state: State, table = false): Transaction[] {
  const [from, to] = range(state);
  return state.data.transactions.filter(t => t.date >= from && t.date <= to && (state.account === 'all' || t.account === state.account)
    && (!table || ((state.kind === 'all' || t.kind === state.kind) && `${t.description} ${t.category}`.toLocaleLowerCase('pt-BR').includes(state.query.toLocaleLowerCase('pt-BR')))));
}

/** Adds income and expenses independently so opening balances stay out of cash flow. */
export function totals(transactions: Transaction[]): { income: number; expense: number } {
  return transactions.reduce((sum, t) => { sum[t.kind] += t.amount; return sum; }, { income: 0, expense: 0 });
}

/** Uses the supplied multicolor palette for category stickers, independent of status. */
export function categoryTag(category: string): string {
  const name: Record<string, string> = { 'Salário': 'salary', 'Compra': 'purchase', 'Dízimo': 'tithe', 'Mãe': 'mother' };
  return `<span class="tag ${name[category] ?? ''}">${esc(category)}</span>`;
}

/** Displays a brief message only after the server confirms the operation. */
export function toast(message: string): void {
  const target = document.querySelector<HTMLDivElement>('#toast')!;
  target.textContent = message;
  target.classList.add('visible');
  window.clearTimeout(Number(target.dataset.timer));
  target.dataset.timer = String(window.setTimeout(() => target.classList.remove('visible'), 4000));
}

/** JSON transport always checks HTTP status, preserving a failed form for correction. */
export async function api<T = { ok: boolean }>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') window.dispatchEvent(new Event('session-expired'));
    throw new Error(result.error ?? 'Não foi possível concluir. Tente novamente.');
  }
  return result;
}
