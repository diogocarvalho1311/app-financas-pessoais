/** Pure HTML views for the finance workspace, with all dynamic text escaped. */
import { balance, CATEGORIES, monthsBetween, type FixedExpense } from './finance';
import { categoryTag, dateLabel, esc, icon, money, monthLabel, range, rows, totals, type State } from './ui';

/** Calculates missing monthly payments; no deadline is invented for the tithe. */
export function pendingMonths(state: State, rule: FixedExpense): string[] {
  return monthsBetween(rule.start_month ?? state.data.today.slice(0, 7), state.data.today.slice(0, 7))
    .filter(month => !state.data.transactions.some(t => t.fixed_id === rule.id && t.occurrence === month));
}

/** Persistent horizontal tabs keep the main table one click away. */
function navigation(state: State): string {
  const tabs = [['transactions', 'list', 'Entradas e saídas'], ['dashboard', 'chart', 'Resumo'], ['fixed', 'repeat', 'Despesas fixas'], ['shopping', 'cart', 'Lista de compras'], ['accounts', 'wallet', 'Contas']];
  return `<header class="topbar"><div class="topbar-inner"><div class="brand"><span class="brand-mark" aria-hidden="true">$</span>minhas finanças</div>
    <nav class="nav" aria-label="Navegação principal">${tabs.map(([id, image, label]) => `<button class="tab ${state.tab === id ? 'active' : ''}" data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ''}>${icon(image)}${label}</button>`).join('')}</nav>
    <div class="topbar-end"><span class="private-label">${icon('lock')}${state.demo ? 'Demonstração' : 'Só seu'}</span><button class="icon-button" data-action="logout" aria-label="Sair da conta" title="Sair">${icon('logout')}</button></div></div></header>`;
}

/** A shared monthly/custom period applies to both the table and dashboard. */
function period(state: State): string {
  const [from, to] = range(state);
  return `<div class="period-bar"><div class="period-switch" aria-label="Tipo de período"><button data-mode="month" class="${state.mode === 'month' ? 'active' : ''}" aria-pressed="${state.mode === 'month'}">Por mês</button><button data-mode="custom" class="${state.mode === 'custom' ? 'active' : ''}" aria-pressed="${state.mode === 'custom'}">Personalizado</button></div>
    <div class="period-inputs">${state.mode === 'month' ? `<button class="icon-button" data-shift="-1" aria-label="Mês anterior">${icon('left')}</button><input aria-label="Mês selecionado" data-filter="month" type="month" value="${state.month}" min="2000-01" max="2099-12"><button class="icon-button" data-shift="1" aria-label="Próximo mês">${icon('right')}</button>` : `<input type="date" aria-label="Data inicial" data-filter="from" value="${state.from}" min="2000-01-01" max="${state.to}"><span class="small">até</span><input type="date" aria-label="Data final" data-filter="to" value="${state.to}" min="${state.from}" max="2099-12-31">`}</div>
    <span class="period-description">${dateLabel(from)} a ${dateLabel(to)}</span></div>`;
}

/** Current balances are independent of selected period; cash flow only includes realized rows. */
function metrics(state: State): string {
  const accounts = state.data.accounts.filter(a => state.account === 'all' || a.id === state.account);
  const current = accounts.reduce((sum, a) => sum + balance(a, state.data.transactions, state.data.today), 0);
  const total = totals(rows(state).filter(t => t.date <= state.data.today));
  return `<section class="metrics" aria-label="Resumo financeiro"><article class="metric balance"><div class="metric-label">Saldo atual ${state.account !== 'all' ? `· ${state.account}` : ''}<span class="round-icon">${icon('wallet')}</span></div><div class="metric-value">${money(current)}</div><div class="metric-note account-inline">${accounts.map(a => `<span><strong>${a.id}</strong> ${money(balance(a, state.data.transactions, state.data.today))}</span>`).join('')}</div></article>
    <article class="metric income"><div class="metric-label">Entradas no período<span class="round-icon">${icon('down')}</span></div><div class="metric-value">${money(total.income)}</div><p class="metric-note">Recebimentos realizados</p></article>
    <article class="metric expense"><div class="metric-label">Saídas no período<span class="round-icon">${icon('up')}</span></div><div class="metric-value">${money(total.expense)}</div><p class="metric-note">Pagamentos realizados</p></article></section>`;
}

/** Account filter appears in both financial views, preserving the same selection. */
function accountFilter(state: State): string {
  return `<select data-filter="account" aria-label="Filtrar por conta"><option value="all">Todas as contas</option><option value="PF" ${state.account === 'PF' ? 'selected' : ''}>Conta PF</option><option value="PJ" ${state.account === 'PJ' ? 'selected' : ''}>Conta PJ</option></select>`;
}

/** Empty states distinguish a new account from a filter with no matching records. */
function empty(state: State): string {
  const filtered = state.query || state.kind !== 'all' || state.account !== 'all';
  return `<div class="empty"><div class="empty-icon">${icon('list')}</div><h3>${filtered ? 'Nenhum lançamento encontrado' : 'Tudo começa com um lançamento'}</h3><p>${filtered ? 'Ajuste os filtros para encontrar o que procura.' : 'Adicione uma entrada ou saída. Seus saldos iniciais já estão registrados e não contam como receita.'}</p><button class="button ${filtered ? '' : 'primary'}" data-action="${filtered ? 'clear-filters' : 'new-transaction'}">${icon(filtered ? 'close' : 'plus')}${filtered ? 'Limpar filtros' : 'Adicionar lançamento'}</button></div>`;
}

/** Main table paginates 20 rows and keeps all filtered totals visible. */
function transactions(state: State): string {
  const list = rows(state, true);
  const total = totals(list);
  const pages = Math.max(1, Math.ceil(list.length / 20));
  state.page = Math.min(state.page, pages);
  const page = list.slice((state.page - 1) * 20, state.page * 20);
  const pending = state.data.fixed.filter(r => r.enabled && r.cadence === 'monthly').reduce((sum, r) => sum + pendingMonths(state, r).length, 0);
  return `${period(state)}${metrics(state)}${pending ? `<aside class="notice">${icon('info')}<p>Você tem <strong>${pending} ${pending === 1 ? 'pagamento mensal pendente' : 'pagamentos mensais pendentes'}</strong>. Marque como pago quando fizer o pagamento.</p><button class="text-button" data-tab="fixed">Ver despesas fixas</button></aside>` : ''}
    <section class="panel" aria-labelledby="transactions-title"><div class="panel-heading"><div><h2 id="transactions-title">Seus lançamentos</h2><p>O que entrou, o que saiu. Tudo aqui.</p></div><button class="button" data-action="export" ${!list.length ? 'disabled' : ''}>${icon('download')}Exportar CSV</button></div>
    <div class="filters"><div class="search-box">${icon('search')}<input type="search" data-filter="query" aria-label="Buscar descrição ou categoria" placeholder="Buscar um lançamento…" value="${esc(state.query)}"></div>
    <select data-filter="kind" aria-label="Filtrar por movimento"><option value="all">Entradas e saídas</option><option value="income" ${state.kind === 'income' ? 'selected' : ''}>Só entradas</option><option value="expense" ${state.kind === 'expense' ? 'selected' : ''}>Só saídas</option></select>${accountFilter(state)}<span class="filter-count">${list.length} ${list.length === 1 ? 'lançamento' : 'lançamentos'}</span></div>
    ${list.length ? `<div class="table-scroll"><table><caption class="hidden">Entradas e saídas do período selecionado</caption><thead><tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Movimento</th><th scope="col">Categoria</th><th scope="col">Conta</th><th scope="col" class="numeric">Valor</th><th scope="col" class="numeric">Ações</th></tr></thead><tbody>${page.map(t => `<tr><td>${dateLabel(t.date)}${t.date > state.data.today ? '<div class="row-subtitle">Previsto</div>' : ''}</td><td class="row-description">${esc(t.description)}${t.fixed_id ? `<div class="row-subtitle">Despesa fixa${t.occurrence?.length === 7 ? ` · ${monthLabel(t.occurrence)}` : ''}</div>` : ''}</td><td><span class="tag ${t.kind}">${icon(t.kind === 'income' ? 'down' : 'up')}${t.kind === 'income' ? 'Entrada' : 'Saída'}</span></td><td>${categoryTag(t.category)}</td><td><span class="tag account">${t.account}</span></td><td class="numeric amount">${t.kind === 'income' ? '+' : '−'} ${money(t.amount)}</td><td><div class="actions"><button class="icon-button" data-edit="${t.id}" aria-label="Editar ${esc(t.description)}">${icon('edit')}</button><button class="icon-button" data-delete="${t.id}" aria-label="Excluir ${esc(t.description)}">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>` : empty(state)}
    <div class="table-footer"><div class="table-totals"><span>Entradas <strong>${money(total.income)}</strong></span><span>Saídas <strong>${money(total.expense)}</strong></span><span>Resultado <strong>${money(total.income - total.expense)}</strong></span></div>${pages > 1 ? `<div class="pagination"><button class="icon-button" data-page="${state.page - 1}" aria-label="Página anterior" ${state.page <= 1 ? 'disabled' : ''}>${icon('left')}</button>${state.page} / ${pages}<button class="icon-button" data-page="${state.page + 1}" aria-label="Próxima página" ${state.page >= pages ? 'disabled' : ''}>${icon('right')}</button></div>` : '<span>Inclui lançamentos previstos</span>'}</div></section>`;
}

/** Compact dashboard describes actual cash flow and has an honest zero-data state. */
function dashboard(state: State): string {
  const list = rows(state).filter(t => t.date <= state.data.today);
  const total = totals(list);
  const cats = CATEGORIES.map(category => ({ category, amount: list.filter(t => t.kind === 'expense' && t.category === category).reduce((sum, t) => sum + t.amount, 0) })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const monthly = [...new Set(list.map(t => t.date.slice(0, 7)))].sort().reverse();
  return `${period(state)}<div class="period-bar" style="max-width:200px">${accountFilter(state)}</div>${metrics(state)}<div class="dashboard-grid"><section class="panel"><h2>Saídas por categoria</h2>${cats.length ? cats.map(c => `<div class="category-item"><div class="category-label">${categoryTag(c.category)}<strong>${money(c.amount)}</strong></div><div class="bar-track" role="img" aria-label="${esc(c.category)}: ${(c.amount / total.expense * 100).toFixed(0)}% das saídas"><div class="bar-fill" style="width:${c.amount / total.expense * 100}%"></div></div></div>`).join('') : '<p class="summary-note">Nenhuma saída realizada neste período. As categorias aparecem aqui quando você registrar um pagamento.</p>'}</section>
    <section class="panel"><h2>Resultado do período</h2><div class="metric-value">${money(total.income - total.expense)}</div><p class="summary-note">Entradas menos saídas realizadas no período selecionado.</p><div class="warning-note">O saldo atual inclui os saldos iniciais das contas. Por isso, ele pode ser diferente do resultado do período.</div></section></div>
    <section class="panel monthly-summary"><div class="panel-heading"><div><h2>Mês a mês</h2><p>Apenas lançamentos realizados dentro do período selecionado.</p></div></div>${monthly.length ? `<div class="table-scroll"><table><thead><tr><th scope="col">Mês</th><th scope="col" class="numeric">Entradas</th><th scope="col" class="numeric">Saídas</th><th scope="col" class="numeric">Resultado</th></tr></thead><tbody>${monthly.map(month => { const sum = totals(list.filter(t => t.date.startsWith(month))); return `<tr><td>${monthLabel(month)}</td><td class="numeric">${money(sum.income)}</td><td class="numeric">${money(sum.expense)}</td><td class="numeric amount">${money(sum.income - sum.expense)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty"><p>Seus totais mensais aparecerão aqui depois do primeiro lançamento.</p></div>'}</section>`;
}

/** Recurring cards separate automatic debits from monthly payments without deadlines. */
function fixed(state: State): string {
  return `<p class="fixed-intro">As despesas configuradas para cada 30 dias podem ser lançadas automaticamente. Pagamentos mensais sem prazo ficam pendentes até serem marcados como pagos. Cobranças únicas mantêm o prazo cadastrado.</p><div class="fixed-grid">${state.data.fixed.map(r => {
    const pending = r.cadence === 'monthly' ? pendingMonths(state, r) : [];
    const paid = r.cadence === 'once' && !r.enabled && state.data.transactions.some(t => t.fixed_id === r.id);
    const image = r.id === 'spotify' ? 'music' : r.id === 'drive' ? 'cloud' : r.category === 'Dízimo' ? 'heart' : 'receipt';
    return `<article class="fixed-card ${!r.enabled ? 'paused' : ''}"><div class="fixed-top"><div class="fixed-title"><span class="fixed-logo">${icon(image)}</span><div><h3>${esc(r.description)}</h3><p>${r.cadence === '30days' ? 'A cada 30 dias' : r.cadence === 'monthly' ? 'Todo mês · sem prazo' : 'Cobrança única'}</p></div></div><button class="icon-button" data-edit-fixed="${r.id}" aria-label="Editar ${esc(r.description)}">${icon('edit')}</button></div><div class="fixed-amount">${money(r.amount)} <span class="small muted">${r.cadence === 'once' ? '' : '/ vez'}</span></div><div>${categoryTag(r.category)} <span class="tag account">Conta ${r.account}</span></div>
      <dl class="fixed-details"><div><dt>${r.cadence === 'once' ? 'Prazo máximo' : r.cadence === 'monthly' ? 'Quando pagar' : 'Próximo lançamento'}</dt><dd>${r.cadence === 'monthly' ? 'Após o salário' : dateLabel(r.next_date)}</dd></div><div><dt>Último pagamento</dt><dd>${dateLabel(r.last_paid)}</dd></div></dl><div class="fixed-bottom">${!r.enabled ? `<p>${paid ? 'Pagamento registrado.' : 'Despesa pausada.'}</p>` : r.cadence === 'monthly' ? pending.length ? `<p>${pending.length} ${pending.length === 1 ? 'mês pendente' : 'meses pendentes'}</p>${pending.map(month => `<div class="pending-item"><span>${monthLabel(month)}</span><button class="button" data-pay="${r.id}" data-occurrence="${month}">Marcar como pago</button></div>`).join('')}` : '<p>Todos os meses pagos até agora.</p>' : r.automatic ? `<p>${icon('repeat')} Lançamento automático na data acima.</p>` : `<button class="button" data-pay="${r.id}">${icon('check')}Marcar como pago</button>${r.next_date && r.next_date < state.data.today ? '<p style="margin-top:10px">Prazo vencido · pagamento pendente.</p>' : ''}`}</div></article>`;
  }).join('')}</div>`;
}

/** Lists all purchase wishes regardless of period, keeping estimates out of the ledger. */
function shopping(state: State): string {
  const items = state.data.shopping;
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return `<section class="panel shopping-panel" aria-labelledby="shopping-title"><div class="panel-heading"><div><h2 id="shopping-title">O que quero comprar</h2><p>Uma lista para planejar suas próximas compras.</p></div><span class="tag purchase">${items.length} ${items.length === 1 ? 'item' : 'itens'}</span></div>
    ${items.length ? `<div class="table-scroll"><table><caption class="hidden">Itens que quero comprar e seus valores estimados</caption><thead><tr><th scope="col">Item</th><th scope="col" class="numeric">Valor estimado</th>${state.demo ? '' : '<th scope="col" class="numeric">Ações</th>'}</tr></thead><tbody>${items.map(item => `<tr><td class="row-description">${esc(item.description)}</td><td class="numeric amount">${money(item.amount)}</td>${state.demo ? '' : `<td><div class="actions"><button class="icon-button" data-edit-shopping="${esc(item.id)}" aria-label="Editar ${esc(item.description)}">${icon('edit')}</button><button class="icon-button" data-delete-shopping="${esc(item.id)}" aria-label="Remover ${esc(item.description)}">${icon('trash')}</button></div></td>`}</tr>`).join('')}</tbody></table></div>` : `<div class="empty"><div class="empty-icon">${icon('cart')}</div><h3>Sua próxima compra começa aqui</h3><p>Adicione o que quer comprar e um valor estimado para se planejar.</p>${state.demo ? '' : `<button class="button primary" data-action="new-shopping">${icon('plus')}Adicionar primeiro item</button>`}</div>`}
    <div class="table-footer shopping-total"><span>Total estimado <strong>${money(total)}</strong></span><span>Estimativas não alteram seus saldos.</span></div></section>`;
}

/** Account settings explain snapshot dates before offering an opening-balance edit. */
function accounts(state: State): string {
  return `<div class="accounts-grid">${state.data.accounts.map(a => `<article class="account-card"><div class="metric-label"><h2>Conta ${a.id}</h2><span class="sticker" style="background:${a.id === 'PF' ? '#55db9c' : '#ffd731'}">${icon('wallet')}</span></div><div class="metric-value">${money(balance(a, state.data.transactions, state.data.today))}</div><div class="account-details"><p>Saldo inicial: <strong>${money(a.opening_balance)}</strong></p><p>Data de referência: <strong>${dateLabel(a.opening_date)}</strong></p><p>Já inclui os custos fixos pagos até essa data.</p></div><button class="button" data-edit-account="${a.id}">${icon('edit')}Ajustar saldo inicial</button></article>`).join('')}</div><div class="settings-row"><div><h2>Seu acesso</h2><p>Uma senha só sua para manter as finanças em privado.</p></div><button class="button" data-action="password">${icon('lock')}Alterar senha</button></div>`;
}

/** The default table uses authenticated records or an explicitly labeled fictional preview. */
export function view(state: State): string {
  const headings = { transactions: ['Entradas e saídas', 'Seu dinheiro, sem complicação.', 'star'], dashboard: ['Seu mês, em resumo', 'Uma visão simples do que aconteceu com seu dinheiro.', 'chart'], fixed: ['Despesas fixas', 'Organize o que se repete. E o que ainda precisa pagar.', 'repeat'], shopping: ['Lista de compras', 'O que você quer comprar, com espaço para se planejar.', 'cart'], accounts: ['Suas contas', 'Pessoal e empresa, cada uma no seu lugar.', 'wallet'] };
  const [title, description, sticker] = headings[state.tab];
  return `${navigation(state)}${state.demo ? `<aside class="demo-banner" role="note">${icon('info')}<strong>Demonstração</strong><span>Dados fictícios · somente visualização · sem conexão com contas reais</span></aside>` : ''}<main class="page"><header class="page-heading"><div class="heading-copy"><div class="section-kicker">${icon('calendar')}${dateLabel(state.data.today)} <span>· ${state.demo ? 'Exemplo de controle financeiro' : 'Seu controle pessoal'}</span></div><div class="title-line"><h1>${title}</h1><span class="sticker" aria-hidden="true">${icon(sticker)}</span></div><p>${description}</p></div>${state.tab === 'transactions' || state.tab === 'dashboard' ? `<button class="button primary" data-action="new-transaction">${icon('plus')}Novo lançamento</button>` : state.tab === 'fixed' ? `<button class="button primary" data-action="new-fixed">${icon('plus')}Nova despesa</button>` : state.tab === 'shopping' && !state.demo ? `<button class="button primary" data-action="new-shopping">${icon('plus')}Adicionar item</button>` : ''}</header>
    ${state.tab === 'transactions' ? transactions(state) : state.tab === 'dashboard' ? dashboard(state) : state.tab === 'fixed' ? fixed(state) : state.tab === 'shopping' ? shopping(state) : accounts(state)}
    <footer class="page-footer"><p>${icon('lock')}${state.demo ? 'Todos os valores desta demonstração são fictícios.' : 'Seus dados salvos com segurança na Cloudflare.'}</p><span>${state.tab === 'shopping' ? 'Planeje suas compras com valores estimados.' : 'Saldos até hoje · lançamentos futuros aparecem como previstos.'}</span></footer></main>`;
}

/** Public login surface reveals no account data before authentication. */
export function loginView(error = ''): string {
  return `<main class="login-page"><section class="login-card"><span class="sticker login-sticker" aria-hidden="true">${icon('lock')}</span><div class="brand"><span class="brand-mark" aria-hidden="true">$</span>minhas finanças</div><h1>Seu dinheiro.<br>Seu espaço.</h1><p>Entre para acompanhar suas entradas, saídas e o que vem pela frente.</p><form id="login-form"><label class="field">Sua senha<input type="password" name="password" autocomplete="current-password" maxlength="256" required autofocus placeholder="Digite sua senha"></label><p class="form-error" role="alert">${esc(error)}</p><button class="button primary" type="submit">${icon('lock')}Entrar nas minhas finanças</button></form><p class="login-footnote">Um controle simples, só seu.</p></section></main>`;
}
