/** Protects the spending estimate from duplicate debits, forecasts and account mixing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spendingRoom, type Account, type FixedExpense, type Transaction } from '../src/finance.ts';

const accounts: Account[] = [
  { id: 'PF', opening_balance: 100000, opening_date: '2026-01-01' },
  { id: 'PJ', opening_balance: 50000, opening_date: '2026-01-01' },
];

/** Creates a fictional current monthly obligation, with explicit overrides per scenario. */
function rule(overrides: Partial<FixedExpense> = {}): FixedExpense {
  return { id: 'monthly', description: 'Contribuição fictícia', amount: 10000, account: 'PF', category: 'Dízimo', cadence: 'monthly', next_date: null, last_paid: null, start_month: '2026-04', automatic: 0, enabled: 1, ...overrides };
}

/** Creates a fictional paid monthly entry; future dates represent planned payments. */
function entry(overrides: Partial<Transaction> = {}): Transaction {
  return { id: 'paid', description: 'Pagamento fictício', amount: 10000, kind: 'expense', account: 'PF', category: 'Dízimo', date: '2026-06-10', fixed_id: 'monthly', occurrence: '2026-06', ...overrides };
}

test('current-month room includes arrears and remains unchanged when a reserved bill is paid', () => {
  const rules = [rule()];
  const before = spendingRoom(accounts, [], rules, '2026-06-18', 'PF');
  assert.deepEqual(before, { balance: 100000, reserved: 30000, savings: 0, available: 70000, shortfall: 0, until: '2026-06-30' });
  const paid = spendingRoom(accounts, [entry()], rules, '2026-06-18', 'PF');
  assert.equal(paid.balance, 90000);
  assert.equal(paid.reserved, 20000);
  assert.equal(paid.available, before.available, 'Paying a reserved occurrence must not lower the limit twice');
  assert.equal(spendingRoom(accounts, [], rules, '2026-06-18', 'PF').available, paid.available, 'Removing a payment must restore its reserve');
});

test('one-off obligations reserve overdue and current-month bills but exclude later and paused rules', () => {
  const rules = [
    rule({ id: 'overdue', cadence: 'once', next_date: '2026-05-01', amount: 3000 }),
    rule({ id: 'due', cadence: 'once', next_date: '2026-06-30', amount: 12000, account: 'PJ' }),
    rule({ id: 'later', cadence: 'once', next_date: '2026-07-01', amount: 9000 }),
    rule({ id: 'paused', cadence: 'once', next_date: '2026-06-20', enabled: 0 }),
    rule({ id: 'monthly-paused', enabled: 0 }),
    rule({ id: 'monthly-later', start_month: '2026-07' }),
  ];
  const snapshot = JSON.stringify({ accounts, rules });
  const room = spendingRoom(accounts, [], rules, '2026-06-18');
  assert.equal(room.reserved, 15000);
  assert.equal(room.available, 135000);
  assert.equal(spendingRoom(accounts, [], rules, '2026-06-18', 'PF').reserved, 3000);
  assert.equal(spendingRoom(accounts, [], rules, '2026-06-18', 'PJ').reserved, 12000);
  assert.equal(JSON.stringify({ accounts, rules }), snapshot, 'The calculation must not mutate records');
});

test('30-day rules reserve every remaining occurrence, including two charges in a long month', () => {
  const rules = [rule({ id: 'subscription', cadence: '30days', next_date: '2026-01-01', amount: 1990, automatic: 1 })];
  const paid = entry({ fixed_id: 'subscription', occurrence: '2026-01-01', date: '2026-01-01', amount: 1990 });
  const before = spendingRoom(accounts, [], rules, '2026-01-01', 'PF');
  assert.equal(before.reserved, 3980);
  const after = spendingRoom(accounts, [paid], rules, '2026-01-01', 'PF');
  assert.equal(after.reserved, 1990);
  assert.equal(after.available, before.available);
  assert.equal(spendingRoom(accounts, [], [rule({ cadence: '30days', next_date: '2027-01-01' })], '2026-12-31').reserved, 0);
});

test('future fixed payments reserve their actual amount once and never consume forecast income', () => {
  const transactions = [
    entry({ id: 'future-payment', occurrence: '2026-06', date: '2026-06-25', amount: 7000 }),
    entry({ id: 'future-income', kind: 'income', date: '2026-06-25', amount: 900000, fixed_id: null, occurrence: null }),
    entry({ id: 'future-purchase', date: '2026-06-26', amount: 5000, fixed_id: null, occurrence: null }),
  ];
  // An edited rule must not double-reserve an already recorded occurrence in a different account.
  const rules = [rule({ start_month: '2026-06', amount: 20000, account: 'PJ' })];
  const all = spendingRoom(accounts, transactions, rules, '2026-06-18');
  assert.equal(all.balance, 150000);
  assert.equal(all.reserved, 7000);
  assert.equal(all.available, 143000);
  assert.equal(spendingRoom(accounts, transactions, rules, '2026-06-18', 'PF').reserved, 7000);
  assert.equal(spendingRoom(accounts, transactions, rules, '2026-06-18', 'PJ').reserved, 0);
  const realized = spendingRoom(accounts, transactions, rules, '2026-06-25');
  assert.equal(realized.reserved, 0);
  assert.equal(realized.balance, 1043000);
});

test('postponed and disabled-rule future payments remain reserved when their obligation is due', () => {
  const transactions = [
    entry({ id: 'late-payment', date: '2026-07-05', occurrence: '2026-05', amount: 7000 }),
    entry({ id: 'disabled-rule-payment', fixed_id: 'once', occurrence: '2026-06-28', date: '2026-07-02', amount: 3000 }),
    entry({ id: 'later-payment', fixed_id: 'later', occurrence: '2026-07-04', date: '2026-07-04', amount: 5000 }),
  ];
  assert.equal(spendingRoom(accounts, transactions, [rule({ enabled: 0 })], '2026-06-18').reserved, 10000);
  assert.equal(spendingRoom(accounts, transactions, [rule()], '2026-06-18').reserved, 30000);
});

test('insufficient funds clamp the available amount at zero and expose the exact shortfall', () => {
  const room = spendingRoom(accounts, [], [rule({ amount: 60000 })], '2026-06-18');
  assert.equal(room.available, 0);
  assert.equal(room.shortfall, 30000);
  assert.equal(room.reserved, 180000);
  const overdrawn: Account[] = [{ ...accounts[0], opening_balance: -500 }];
  assert.equal(spendingRoom(overdrawn, [], [], '2026-06-18').available, 0);
  assert.equal(spendingRoom(overdrawn, [], [], '2026-06-18').shortfall, 500);
});

test('month-end follows leap years and preserves paid monthly occurrences from previous years', () => {
  assert.equal(spendingRoom(accounts, [], [], '2028-02-15').until, '2028-02-29');
  assert.equal(spendingRoom(accounts, [], [], '2027-02-15').until, '2027-02-28');
  const rules = [rule({ start_month: '2026-12' })];
  const payments = [entry({ occurrence: '2026-12', date: '2026-12-31' })];
  assert.equal(spendingRoom(accounts, payments, rules, '2027-01-15').reserved, 10000);
});

test('salary reserves thirty percent only after receipt, by account, with cent rounding', () => {
  const salary = entry({ id: 'salary', kind: 'income', category: 'Salário', amount: 10001, fixed_id: null, occurrence: null });
  const forecast = { ...salary, id: 'forecast', account: 'PJ' as const, date: '2026-06-25', amount: 90000 };
  const ordinary = { ...salary, id: 'other-income', category: 'Mãe', amount: 20000 };
  const old = { ...salary, id: 'old', date: '2025-12-31', amount: 50000 };
  const tx = [salary, forecast, ordinary, old];
  const room = spendingRoom(accounts, tx, [], '2026-06-18');
  assert.equal(room.savings, 3000);
  assert.equal(room.available, room.balance - 3000);
  assert.equal(spendingRoom(accounts, tx, [], '2026-06-18', 'PJ').savings, 0);
  assert.equal(spendingRoom(accounts, tx, [], '2026-06-25').savings, 30000);
  assert.equal(spendingRoom(accounts, [{ ...salary, amount: 20000 }], [], '2026-06-18').savings, 6000);
  assert.equal(spendingRoom(accounts, [], [], '2026-06-18').savings, 0, 'Deleting a salary removes only its calculated reserve');
});

test('an initial reserve protects salary already in the balance and persists across months', () => {
  const baseline = { account: 'PF' as const, amount: 30000, start_date: '2026-06-18' };
  const initial = spendingRoom(accounts, [], [rule()], '2026-06-18', 'PF', baseline);
  assert.equal(initial.balance, 100000, 'The baseline must not create another income or debit');
  assert.equal(initial.reserved, 30000, 'Tithes remain part of fixed expenses, once');
  assert.equal(initial.savings, 30000);
  assert.equal(initial.available, 40000);
  assert.equal(spendingRoom(accounts, [], [], '2026-06-18', 'PJ', baseline).savings, 0);
  const nextSalary = entry({ kind: 'income', category: 'Salário', amount: 100000, fixed_id: null, occurrence: null, date: '2026-07-05' });
  const earlierSalary = { ...nextSalary, id: 'already-covered', date: '2026-06-10' };
  const beforePayday = spendingRoom(accounts, [earlierSalary, nextSalary], [], '2026-07-01', 'PF', baseline);
  assert.equal(beforePayday.savings, 30000, 'Month changes and a forecast do not release savings');
  assert.equal(spendingRoom(accounts, [nextSalary], [], '2026-07-05', 'PF', baseline).savings, 60000);
  assert.equal(spendingRoom(accounts, [nextSalary], [], '2026-08-05', 'PF', baseline).savings, 60000);
  const todaySalary = { ...nextSalary, date: baseline.start_date };
  assert.equal(spendingRoom(accounts, [todaySalary], [], baseline.start_date, 'PF', baseline).savings, 60000);
});

test('paying an already reserved tithe does not double-charge savings and shortfalls include both reserves', () => {
  const baseline = { account: 'PF' as const, amount: 30000, start_date: '2026-06-01' };
  const before = spendingRoom(accounts, [], [rule()], '2026-06-18', 'PF', baseline);
  const after = spendingRoom(accounts, [entry()], [rule()], '2026-06-18', 'PF', baseline);
  assert.equal(before.available, after.available);
  assert.equal(after.savings, before.savings);
  const insufficient = spendingRoom([{ ...accounts[0], opening_balance: 20000 }], [], [rule()], '2026-06-18', 'PF', baseline);
  assert.equal(insufficient.available, 0);
  assert.equal(insufficient.shortfall, 40000);
});
