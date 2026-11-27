/** Verifies standard arithmetic, percentages and recovery without financial records. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calculator, calculatorNumber } from '../src/calculator-math.ts';

/** Enters a sequence as if using the calculator's digit and action keys. */
function calculate(keys: string[]): Calculator {
  const calculator = new Calculator();
  for (const key of keys) calculator.press(key);
  return calculator;
}

test('calculator performs four operations, chains sequentially and repeats equals', () => {
  assert.equal(calculate(['8', '+', '2', '=']).value, '10');
  assert.equal(calculate(['8', '-', '2', '=']).value, '6');
  assert.equal(calculate(['8', '*', '2', '=']).value, '16');
  assert.equal(calculate(['8', '/', '2', '=']).value, '4');
  assert.equal(calculate(['2', '+', '3', '*', '4', '=']).value, '20');
  assert.equal(calculate(['2', '+', '*', '4', '=']).value, '8');
  assert.equal(calculate(['2', '+', '3', '=', '=']).value, '8');
  assert.equal(calculate(['2', '+', '3', '=', '7', '*', '2', '=']).value, '14');
});

test('calculator accepts decimals, signed operands, backspace and readable Brazilian formatting', () => {
  assert.equal(calculate(['.', '1', '+', '.', '2', '=']).value, '0.3');
  assert.equal(calculate(['1', '2', 'backspace', '+', '2', '=']).value, '3');
  assert.equal(calculate(['8', '*', 'sign', '2', '=']).value, '-16');
  assert.equal(calculate(['5', 'sign', 'sign']).value, '5');
  assert.equal(calculatorNumber('1234.50'), '1.234,50');
  assert.equal(calculatorNumber('0.'), '0,');
});

test('percentages use the left operand for addition and subtraction and fractions for multiplication', () => {
  assert.equal(calculate(['2', '0', '0', '+', '1', '0', '%', '=']).value, '220');
  assert.equal(calculate(['2', '0', '0', '-', '1', '0', '%', '=']).value, '180');
  assert.equal(calculate(['2', '0', '0', '*', '1', '0', '%', '=']).value, '20');
  assert.equal(calculate(['5', '0', '%']).value, '0.5');
});

test('division by zero is recoverable and clear removes the entire previous calculation', () => {
  const calculator = calculate(['8', '/', '0', '=']);
  assert.equal(calculator.value, 'Erro');
  assert.match(calculator.expression, /dividir por zero/);
  calculator.press('4'); calculator.press('+'); calculator.press('2'); calculator.press('=');
  assert.equal(calculator.value, '6');
  calculator.press('clear'); calculator.press('=');
  assert.equal(calculator.value, '0'); assert.equal(calculator.expression, '');
});
