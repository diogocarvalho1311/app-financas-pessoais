/** Accessible native dialogs for editing entries, recurrence rules and account snapshots. */
import { addDays, CATEGORIES, parseMoney, type FixedExpense, type Transaction } from './finance';
import { api, dateLabel, esc, icon, money, moneyInput, monthLabel, toast, type State } from './ui';

const modal = document.querySelector<HTMLDialogElement>('#modal')!;

/** Presents a modal and keeps failed submissions editable, with duplicate-submit protection. */
function dialog(title: string, content: string, save: (data: FormData) => Promise<void>, label = 'Salvar', danger = false): void {
  modal.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="icon-button" data-close aria-label="Fechar janela">${icon('close')}</button></div><form class="dialog-body">${content}<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="button" data-close>Cancelar</button><button type="submit" class="button ${danger ? 'danger' : 'primary'}">${label}</button></div></form>`;
  modal.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => modal.close()));
  modal.querySelector('form')!.onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    const error = form.querySelector<HTMLParagraphElement>('.form-error')!;
    if (submit.disabled) return;
    submit.disabled = true;
    error.textContent = '';
    try { await save(new FormData(form)); modal.close(); }
    catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível salvar. Tente novamente.'; }
    finally { submit.disabled = false; }
  };
  modal.showModal();
}

/** Renders a labeled input with escaped values; all returned markup belongs to a dialog. */
function input(label: string, name: string, value: string, type = 'text', extra = '', full = false): string {
  return `<label class="field ${full ? 'full' : ''}">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}

/** Renders a native select, preserving keyboard navigation and form semantics. */
function select(label: string, name: string, selected: string, choices: [string, string][], full = false): string {
  return `<label class="field ${full ? 'full' : ''}">${label}<select name="${name}" aria-label="${esc(label)}">${choices.map(([value, text]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
}

/** Shared fields use positive BRL amounts; direction is stored separately. */
function common(value?: Partial<Transaction | FixedExpense>): string {
  return `${input('Descrição', 'description', value?.description ?? '', 'text', 'required maxlength="100" placeholder="Ex.: salário de novembro"', true)}
    ${input('Valor (R$)', 'amount', value?.amount ? moneyInput(value.amount) : '', 'text', 'required inputmode="decimal" placeholder="0,00"')}
    ${select('Conta', 'account', value?.account ?? 'PF', [['PF', 'Conta PF'], ['PJ', 'Conta PJ']])}
    ${select('Categoria', 'category', value?.category ?? 'Compra', CATEGORIES.map(c => [c, c]))}`;
}

/** Adds or edits one ledger entry, using a stable UUID to make a retried create idempotent. */
export function transactionForm(state: State, refresh: () => Promise<void>, item?: Transaction): void {
  const id = item?.id ?? crypto.randomUUID();
  dialog(item ? 'Editar lançamento' : 'Novo lançamento', `<div class="form-grid">${select('Movimento', 'kind', item?.kind ?? 'expense', [['expense', 'Saída'], ['income', 'Entrada']], true)}${common(item)}${input('Data', 'date', item?.date ?? state.data.today, 'date', 'required min="2000-01-01" max="2099-12-31"')}</div><p class="dialog-intro" style="margin-top:20px;margin-bottom:0">Datas futuras ficam como previstas e entram no saldo quando o dia chegar.</p>`, async form => {
    await api(`/transactions${item ? `/${item.id}` : ''}`, item ? 'PUT' : 'POST', { id, description: form.get('description'), amount: parseMoney(String(form.get('amount'))), account: form.get('account'), category: form.get('category'), kind: form.get('kind'), date: form.get('date') });
    await refresh(); toast(item ? 'Lançamento atualizado.' : 'Lançamento adicionado.');
  });
}

/** Changes future occurrences without silently modifying past transactions. */
export function fixedForm(state: State, refresh: () => Promise<void>, item?: FixedExpense): void {
  dialog(item ? 'Editar despesa fixa' : 'Nova despesa fixa', `<p class="dialog-intro">Alterações valem para os próximos lançamentos. Os pagamentos já registrados ficam no histórico.</p><div class="form-grid">${common(item)}${select('Frequência', 'cadence', item?.cadence ?? '30days', [['30days', 'A cada 30 dias'], ['monthly', 'Todo mês, sem prazo'], ['once', 'Cobrança única']])}
    <div class="field full" data-due>${input('Próxima data / prazo', 'next_date', item?.next_date ?? addDays(state.data.today, 30), 'date', 'min="2000-01-01" max="2099-12-31"')}</div>
    <div class="field full" data-month>${input('Mês inicial', 'start_month', item?.start_month ?? state.data.today.slice(0, 7), 'month', 'min="2000-01" max="2099-12"')}<small>Um pagamento por mês, sem data limite.</small></div>
    ${input('Último pagamento (opcional)', 'last_paid', item?.last_paid ?? '', 'date', 'min="2000-01-01" max="2099-12-31"', true)}
    <label class="check-field" data-auto><input type="checkbox" name="automatic" ${item?.automatic || !item ? 'checked' : ''}>Lançar automaticamente na próxima data</label>
    <label class="check-field"><input type="checkbox" name="enabled" ${!item || item.enabled ? 'checked' : ''}>Despesa ativa</label></div>`, async form => {
    await api(`/fixed${item ? `/${item.id}` : ''}`, item ? 'PUT' : 'POST', { description: form.get('description'), amount: parseMoney(String(form.get('amount'))), account: form.get('account'), category: form.get('category'), cadence: form.get('cadence'), next_date: form.get('next_date'), last_paid: form.get('last_paid'), start_month: form.get('start_month'), automatic: form.has('automatic'), enabled: form.has('enabled') });
    await refresh(); toast('Despesa fixa salva.');
  });
  const update = () => {
    const monthly = modal.querySelector<HTMLSelectElement>('[name=cadence]')!.value === 'monthly';
    modal.querySelector('[data-due]')!.classList.toggle('hidden', monthly);
    modal.querySelector('[data-auto]')!.classList.toggle('hidden', monthly);
    modal.querySelector('[data-month]')!.classList.toggle('hidden', !monthly);
    modal.querySelector<HTMLInputElement>('[name=next_date]')!.required = !monthly;
    modal.querySelector<HTMLInputElement>('[name=start_month]')!.required = monthly;
  };
  modal.querySelector('[name=cadence]')!.addEventListener('change', update);
  update();
}

/** Confirms an actual payment before it affects the selected account balance. */
export function payForm(state: State, refresh: () => Promise<void>, item: FixedExpense, occurrence?: string): void {
  dialog('Registrar pagamento', `<p>${esc(item.description)}${occurrence ? ` · ${monthLabel(occurrence)}` : ''}</p><div class="confirm-amount">${money(item.amount)}</div><p class="dialog-intro">Este pagamento será registrado como uma saída da conta ${item.account} hoje, ${dateLabel(state.data.today)}.</p>`, async () => {
    await api(`/fixed/${item.id}/pay`, 'POST', { occurrence }); await refresh(); toast('Pagamento registrado.');
  }, 'Confirmar pagamento');
}

/** Deletion restores the balance; deleting a monthly payment makes that month pending again. */
export function deleteForm(refresh: () => Promise<void>, item: Transaction): void {
  dialog('Excluir lançamento?', `<p><strong>${esc(item.description)}</strong></p><div class="confirm-amount">${money(item.amount)}</div><p class="dialog-intro">O valor será removido dos totais e do saldo.${item.fixed_id ? ' A regra da despesa fixa será mantida.' : ''}</p>`, async () => {
    await api(`/transactions/${item.id}`, 'DELETE'); await refresh(); toast('Lançamento excluído.');
  }, 'Excluir lançamento', true);
}

/** Edits the snapshot, explicitly warning that older entries are treated as history. */
export function accountForm(state: State, refresh: () => Promise<void>, id: string): void {
  const item = state.data.accounts.find(a => a.id === id)!;
  dialog(`Saldo inicial · Conta ${id}`, `<p class="dialog-intro">Informe o saldo que já existia na data de referência, com os custos pagos até então já aplicados.</p><div class="form-grid">${input('Saldo inicial (R$)', 'opening_balance', moneyInput(item.opening_balance), 'text', 'required inputmode="decimal"')}${input('Data de referência', 'opening_date', item.opening_date, 'date', 'required min="2000-01-01" max="2099-12-31"')}</div><div class="warning-note">Entradas e saídas a partir dessa data alteram o saldo. Lançamentos anteriores ficam apenas no histórico.</div>`, async form => {
    const text = String(form.get('opening_balance')).trim();
    await api(`/accounts/${id}`, 'PUT', { opening_balance: text.startsWith('-') ? -parseMoney(text.slice(1)) : parseMoney(text), opening_date: form.get('opening_date') });
    await refresh(); toast('Saldo inicial atualizado.');
  });
}

/** Replaces the bootstrap password and revokes sessions on other devices. */
export function passwordForm(): void {
  dialog('Alterar sua senha', `<div class="form-grid">${input('Senha atual', 'current', '', 'password', 'required autocomplete="current-password"', true)}${input('Nova senha', 'password', '', 'password', 'required minlength="12" maxlength="128" autocomplete="new-password"', true)}${input('Repita a nova senha', 'confirmation', '', 'password', 'required minlength="12" maxlength="128" autocomplete="new-password"', true)}</div><p class="dialog-intro" style="margin-top:18px">Use pelo menos 12 caracteres. Outros acessos serão encerrados.</p>`, async form => {
    if (form.get('password') !== form.get('confirmation')) throw new Error('As novas senhas não são iguais.');
    await api('/password', 'PUT', { current: form.get('current'), password: form.get('password') }); toast('Senha alterada.');
  });
}
