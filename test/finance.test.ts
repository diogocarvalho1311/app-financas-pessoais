/** Protects the financial invariants that affect balances, recurrence and date boundaries. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, balance, monthsBetween, parseMoney, today, validDate, type Transaction } from '../src/finance.ts';

test('Brazilian amounts retain exact cents and reject ambiguous values', () => {
  assert.equal(parseMoney('2.345,67'), 234567);
  assert.equal(parseMoney('19,90'), 1990);
  assert.equal(parseMoney('1'), 100);
  assert.equal(parseMoney('120,05'), 12005);
  for (const value of ['12.90', '1,234', '-1', 'abc', '1.00,00']) assert.throws(() => parseMoney(value));
});

test('subscriptions advance by 30 days instead of one calendar month', () => {
  assert.equal(addDays('2026-10-26', 30), '2026-11-25');
  assert.equal(addDays('2026-11-22', 30), '2026-12-22');
  assert.equal(addDays('2026-12-22', 30), '2027-01-21');
});

test('São Paulo calendar date does not advance at midnight UTC', () => {
  assert.equal(today(new Date('2026-11-23T01:00:00Z')), '2026-11-22');
  assert.equal(today(new Date('2026-11-23T04:00:00Z')), '2026-11-23');
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-11-22'), true);
});

test('opening balance excludes older history, future entries and the other account', () => {
  const account = { id: 'PF' as const, opening_balance: 250000, opening_date: '2026-11-22' };
  const entry = { id: 'a', description: 'Teste', category: 'Compra', kind: 'expense' as const, account: 'PF' as const, date: '2026-11-22', amount: 1990 };
  const transactions: Transaction[] = [entry, { ...entry, date: '2026-10-26' }, { ...entry, date: '2026-11-25' }, { ...entry, account: 'PJ' }, { ...entry, kind: 'income', amount: 10000 }];
  assert.equal(balance(account, transactions, '2026-11-22'), 258010);
  assert.equal(balance(account, [], '2026-11-22'), 250000);
});

test('monthly obligations retain October and November without creating a deadline', () => {
  assert.deepEqual(monthsBetween('2026-10', '2026-11'), ['2026-10', '2026-11']);
  assert.deepEqual(monthsBetween('2026-12', '2027-01'), ['2026-12', '2027-01']);
  assert.deepEqual(monthsBetween('2026-12', '2026-11'), []);
});
