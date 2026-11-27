/** In-memory arithmetic for a standard sequential calculator; never evaluates code. */
type Operator = '+' | '-' | '*' | '/';
const symbols: Record<Operator, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

/** Formats the editable decimal string without losing its trailing comma or zeros. */
export function calculatorNumber(value: string): string {
  if (value.includes('e')) return value.replace('.', ',');
  const [integer, fraction] = value.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction === undefined ? '' : `,${fraction}`);
}

/** Basic calculator with contextual percentages and repeated equals, without persistence. */
export class Calculator {
  /** Editable number in decimal-point notation, or a short error label. */
  value = '0';
  /** Human-readable pending operation or explanation of an arithmetic error. */
  expression = '';
  private total: number | null = null;
  private operator: Operator | null = null;
  private waiting = false;
  private replace = false;
  private failed = false;
  private repeat: { operator: Operator; operand: number } | null = null;

  /** Clears the calculation, including error and repeated-operation state. */
  clear(): void {
    this.value = '0'; this.expression = ''; this.total = null; this.operator = null;
    this.waiting = false; this.replace = false; this.failed = false; this.repeat = null;
  }

  /** Accepts digits, decimal point, operators, equals and named editing actions. */
  press(key: string): void {
    if (key === 'clear') { this.clear(); return; }
    if (this.failed) {
      if (!/^\d$/.test(key) && key !== '.') return;
      this.clear();
    }
    if (/^\d$/.test(key)) {
      if (this.replace && !this.operator) this.expression = '';
      if (this.replace) this.value = '0';
      if (this.value.replace(/\D/g, '').length < 14) {
        this.value = this.value === '0' ? key : this.value === '-0' ? `-${key}` : this.value + key;
      }
      this.replace = false; this.waiting = false; this.repeat = null;
    } else if (key === '.') {
      if (this.replace) this.value = '0';
      if (!this.value.includes('.') && !this.value.includes('e')) this.value += '.';
      this.replace = false; this.waiting = false; this.repeat = null;
    } else if (key === 'backspace') {
      if (this.waiting) return;
      this.value = this.value.includes('e') ? '0' : this.value.slice(0, -1);
      if (!this.value || this.value === '-') this.value = '0';
      this.replace = false; this.repeat = null;
    } else if (key === 'sign') {
      if (this.waiting) { this.value = '0'; this.replace = false; }
      this.value = this.value.startsWith('-') ? this.value.slice(1) : `-${this.value}`;
      this.waiting = false; this.repeat = null;
    } else if (key === '%') {
      const base = this.operator === '+' || this.operator === '-' ? this.total ?? 1 : 1;
      this.setValue(base * Number(this.value) / 100);
      this.replace = true; this.waiting = false; this.repeat = null;
    } else if (['+', '-', '*', '/'].includes(key)) {
      if (this.operator && !this.waiting && !this.calculate(this.operator, this.total!, Number(this.value))) return;
      this.total = Number(this.value); this.operator = key as Operator;
      this.expression = `${calculatorNumber(this.value)} ${symbols[this.operator]}`;
      this.waiting = true; this.replace = true; this.repeat = null;
    } else if (key === '=') {
      const operation = this.operator ?? this.repeat?.operator;
      if (!operation) return;
      const left = this.operator ? this.total! : Number(this.value);
      const right = this.operator ? (this.waiting ? left : Number(this.value)) : this.repeat!.operand;
      const expression = `${calculatorNumber(String(left))} ${symbols[operation]} ${calculatorNumber(String(right))} =`;
      if (!this.calculate(operation, left, right)) return;
      this.expression = expression; this.repeat = { operator: operation, operand: right };
      this.operator = null; this.total = null; this.waiting = false; this.replace = true;
    }
  }

  /** Applies one operation; division by zero remains a recoverable user-visible error. */
  private calculate(operator: Operator, left: number, right: number): boolean {
    if (operator === '/' && right === 0) {
      this.fail('Não é possível dividir por zero'); return false;
    }
    const value = operator === '+' ? left + right : operator === '-' ? left - right : operator === '*' ? left * right : left / right;
    return this.setValue(value);
  }

  /** Removes binary floating-point noise and rejects non-finite results. */
  private setValue(value: number): boolean {
    if (!Number.isFinite(value)) { this.fail('Resultado fora do limite'); return false; }
    this.value = String(Number(value.toPrecision(14)));
    return true;
  }

  /** Keeps invalid arithmetic inside the calculator rather than throwing into the app. */
  private fail(message: string): void {
    this.clear(); this.failed = true; this.value = 'Erro'; this.expression = message;
  }
}
