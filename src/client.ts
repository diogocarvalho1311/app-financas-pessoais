/** Browser controller. The server is the source of truth; no financial data is cached locally. */
import './style.css';
import { today, validDate } from './finance';
import { accountForm, deleteForm, deleteShoppingForm, fixedForm, passwordForm, payForm, shoppingForm, transactionForm } from './forms';
import { api, dateLabel, esc, rows, toast, type Data, type State } from './ui';
import { loginView, view } from './views';
import { createDemoData, DEMO_DATE } from './demo';
import { mountCalculator } from './calculator';

const app = document.querySelector<HTMLDivElement>('#app')!;
const calculator = mountCalculator();
const demo = /^\/demo\/?$/.test(location.pathname);
const date = demo ? DEMO_DATE : today();
const state: State = {
  demo,
  data: demo ? createDemoData() : { accounts: [], transactions: [], fixed: [], shopping: [], today: date },
  tab: 'transactions', mode: 'month', month: date.slice(0, 7), from: `${date.slice(0, 7)}-01`, to: date,
  account: 'all', kind: 'all', query: '', page: 1,
};
let loggedIn = demo;
let refreshVersion = 0;

/** Repaints while preserving the focused filter and its text selection. */
function render(): void {
  calculator.setVisible(true);
  const focused = document.activeElement as HTMLInputElement | null;
  const key = focused?.dataset.filter;
  const selection = focused?.selectionStart;
  app.innerHTML = view(state);
  if (state.demo) {
    app.querySelectorAll('[data-edit], [data-delete], [data-edit-fixed], [data-pay], [data-edit-account], [data-action="password"], [data-action="new-transaction"], [data-action="new-fixed"], [data-action="logout"]').forEach(element => element.remove());
    app.querySelector('#transactions-title')?.closest('.panel')?.querySelectorAll('tr').forEach(row => row.lastElementChild?.remove());
  }
  if (key) {
    const target = app.querySelector<HTMLInputElement>(`[data-filter="${key}"]`);
    target?.focus();
    if (target?.type === 'search' && selection !== null && selection !== undefined) target.setSelectionRange(selection, selection);
  }
}

/** Fetches one consistent snapshot, then updates every view from the confirmed data. */
async function refresh(): Promise<void> {
  if (state.demo) { render(); return; }
  const version = ++refreshVersion;
  const data = await api<Data>('/data');
  if (version !== refreshVersion) return;
  state.data = data; loggedIn = true; render();
}

/** A missing or expired session returns to login and clears in-memory financial records. */
function login(error = ''): void {
  calculator.setVisible(false);
  refreshVersion++;
  loggedIn = false;
  state.data = { accounts: [], transactions: [], fixed: [], shopping: [], today: today() };
  document.querySelector<HTMLDialogElement>('#modal')!.close();
  app.innerHTML = loginView(error);
  app.querySelector<HTMLInputElement>('[name=password]')?.focus();
}

/** Exports the entire filtered period, escaping spreadsheet formulas and CSV quotes. */
function exportCsv(): void {
  const quote = (value: unknown, column: number) => {
    const text = column === 1 ? String(value).replace(/^(\s*[=+@\-]|[\t\r])/, "'$&") : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [['Data', 'Descrição', 'Movimento', 'Categoria', 'Conta', 'Valor (R$)', 'Status'], ...rows(state, true).map(t => [dateLabel(t.date), t.description, t.kind === 'income' ? 'Entrada' : 'Saída', t.category, t.account, `${t.kind === 'expense' ? '-' : ''}${(t.amount / 100).toFixed(2).replace('.', ',')}`, t.date > state.data.today ? 'Previsto' : 'Realizado'])].map(row => row.map(quote).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'minhas-financas.csv'; link.click(); URL.revokeObjectURL(url);
}

/** Handles navigation and actions from real buttons, keeping the UI keyboard accessible. */
app.addEventListener('click', async event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || button.disabled || !loggedIn) return;
  const d = button.dataset;
  if (d.tab) { state.tab = d.tab as State['tab']; state.page = 1; render(); return; }
  if (d.mode) { state.mode = d.mode as State['mode']; state.page = 1; render(); return; }
  if (d.shift) {
    const value = new Date(`${state.month}-01T12:00:00Z`); value.setUTCMonth(value.getUTCMonth() + Number(d.shift));
    const month = value.toISOString().slice(0, 7);
    if (validDate(`${month}-01`)) { state.month = month; state.page = 1; render(); } return;
  }
  if (d.page) { state.page = Number(d.page); render(); return; }
  if (state.demo) {
    if (d.action === 'clear-filters') { state.account = 'all'; state.kind = 'all'; state.query = ''; state.page = 1; render(); }
    if (d.action === 'export') exportCsv();
    return;
  }
  const item = state.data.transactions.find(t => t.id === (d.edit ?? d.delete));
  const rule = state.data.fixed.find(f => f.id === (d.editFixed ?? d.pay));
  const wish = state.data.shopping.find(s => s.id === (d.editShopping ?? d.deleteShopping));
  if (d.editShopping && wish) shoppingForm(refresh, wish);
  if (d.deleteShopping && wish) deleteShoppingForm(refresh, wish);
  if (d.edit && item) transactionForm(state, refresh, item);
  if (d.delete && item) deleteForm(refresh, item);
  if (d.editFixed && rule) fixedForm(state, refresh, rule);
  if (d.pay && rule) payForm(state, refresh, rule, d.occurrence);
  if (d.editAccount) accountForm(state, refresh, d.editAccount);
  if (d.action === 'new-transaction') transactionForm(state, refresh);
  if (d.action === 'new-fixed') fixedForm(state, refresh);
  if (d.action === 'new-shopping') shoppingForm(refresh);
  if (d.action === 'password') passwordForm();
  if (d.action === 'clear-filters') { state.account = 'all'; state.kind = 'all'; state.query = ''; state.page = 1; render(); }
  if (d.action === 'export') exportCsv();
  if (d.action === 'logout') {
    button.disabled = true;
    try { await api('/logout', 'POST', {}); login(); } catch (cause) { toast(cause instanceof Error ? cause.message : 'Não foi possível sair.'); button.disabled = false; }
  }
});

/** Validates period edits before rendering, avoiding empty native date values. */
function filter(event: Event): void {
  const input = event.target as HTMLInputElement;
  const key = input.dataset.filter;
  if (!key || !loggedIn) return;
  const value = input.value;
  if ((key === 'month' && !validDate(`${value}-01`)) || (['from', 'to'].includes(key) && !validDate(value))) return;
  if (key === 'from' && value > state.to || key === 'to' && value < state.from) return;
  if (key === 'query') state.query = value;
  else if (key === 'month') state.month = value;
  else if (key === 'from') state.from = value;
  else if (key === 'to') state.to = value;
  else if (key === 'kind') state.kind = value;
  else if (key === 'account') state.account = value;
  state.page = 1; render();
}
app.addEventListener('input', event => { if ((event.target as HTMLInputElement).type === 'search') filter(event); });
app.addEventListener('change', event => { if ((event.target as HTMLInputElement).type !== 'search') filter(event); });

/** Keeps login errors next to the password field and prevents duplicate requests. */
app.addEventListener('submit', async event => {
  if (state.demo) return;
  if ((event.target as HTMLFormElement).id !== 'login-form') return;
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const button = form.querySelector<HTMLButtonElement>('button')!;
  if (button.disabled) return;
  button.disabled = true;
  try {
    await api('/login', 'POST', { password: new FormData(form).get('password') });
    await refresh();
  } catch (cause) {
    form.querySelector<HTMLElement>('.form-error')!.textContent = cause instanceof Error ? cause.message : 'Não foi possível entrar.';
    button.disabled = false;
  }
});
window.addEventListener('session-expired', () => { if (!state.demo) login(loggedIn ? 'Seu acesso expirou. Entre novamente.' : ''); });
window.addEventListener('focus', () => { if (loggedIn && !document.querySelector<HTMLDialogElement>('#modal')!.open) void refresh().catch(() => {}); });

// Demo refresh renders only fictional records; private routes consult authenticated API state.
void refresh().catch(cause => {
  if (!app.querySelector('#login-form')) {
    app.innerHTML = `<main class="login-page"><section class="login-card"><h1>Não foi possível carregar</h1><p>${esc(cause instanceof Error ? cause.message : 'Verifique sua conexão e recarregue a página.')}</p><button class="button" id="retry">Tentar novamente</button></section></main>`;
    app.querySelector('#retry')!.addEventListener('click', () => location.reload());
  }
});
