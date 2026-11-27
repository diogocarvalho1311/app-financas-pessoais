/** Floating calculator, isolated from the financial views and private API. */
import './calculator.css';
import { Calculator, calculatorNumber } from './calculator-math';
import { icon } from './ui';

/** Mounts once outside the rerendered app; hiding it clears all entered numbers. */
export function mountCalculator(): { setVisible: (visible: boolean) => void } {
  const root = document.createElement('div');
  root.className = 'calculator'; root.hidden = true;
  const keys = [
    ['clear', 'C', 'Limpar calculadora'], ['backspace', '⌫', 'Apagar último dígito'], ['%', '%', 'Porcentagem'], ['/', '÷', 'Dividir'],
    ['7', '7', '7'], ['8', '8', '8'], ['9', '9', '9'], ['*', '×', 'Multiplicar'],
    ['4', '4', '4'], ['5', '5', '5'], ['6', '6', '6'], ['-', '−', 'Subtrair'],
    ['1', '1', '1'], ['2', '2', '2'], ['3', '3', '3'], ['+', '+', 'Somar'],
    ['sign', '+/−', 'Trocar sinal'], ['0', '0', '0'], ['.', ',', 'Vírgula decimal'], ['=', '=', 'Calcular resultado'],
  ];
  root.innerHTML = `<section class="calculator-panel" id="calculator-panel" role="dialog" aria-modal="false" aria-labelledby="calculator-title" hidden>
    <div class="calculator-heading"><h2 id="calculator-title">Calculadora</h2><button type="button" class="icon-button" data-calculator-close aria-label="Fechar calculadora">${icon('close')}</button></div>
    <div class="calculator-screen"><p class="calculator-expression" aria-hidden="true"></p><output class="calculator-display" aria-label="Visor da calculadora" aria-live="polite" aria-atomic="true" tabindex="0">0</output></div>
    <div class="calculator-keys">${keys.map(([key, label, name]) => `<button type="button" class="calculator-key${['/', '*', '-', '+'].includes(key) ? ' calculator-operator' : ''}${key === '=' ? ' calculator-equals' : ''}" data-calculator-key="${key}" aria-label="${name}">${label}</button>`).join('')}</div>
    <p class="calculator-help">Use o teclado · Enter para calcular · Esc para fechar</p>
  </section><button type="button" class="calculator-launcher" aria-label="Abrir calculadora" title="Calculadora" aria-controls="calculator-panel" aria-expanded="false" aria-haspopup="dialog">${icon('calculator')}</button>`;
  document.body.append(root);
  const panel = root.querySelector<HTMLElement>('.calculator-panel')!;
  const launcher = root.querySelector<HTMLButtonElement>('.calculator-launcher')!;
  const display = root.querySelector<HTMLOutputElement>('.calculator-display')!;
  const expression = root.querySelector<HTMLElement>('.calculator-expression')!;
  const calculator = new Calculator();

  /** Updates text nodes only, preserving button focus and the surrounding site. */
  function paint(): void {
    display.textContent = calculatorNumber(calculator.value);
    expression.textContent = calculator.expression;
  }

  /** Opens without a backdrop; closing restores focus only when it was inside the popup. */
  function toggle(open: boolean): void {
    const restore = panel.contains(document.activeElement);
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    launcher.setAttribute('aria-label', open ? 'Fechar calculadora' : 'Abrir calculadora');
    if (open) display.focus();
    else if (restore) launcher.focus();
  }

  launcher.addEventListener('click', () => toggle(panel.hasAttribute('hidden')));
  root.querySelector('[data-calculator-close]')!.addEventListener('click', () => toggle(false));
  panel.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-calculator-key]');
    if (button) { calculator.press(button.dataset.calculatorKey!); paint(); }
  });
  panel.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); toggle(false); return; }
    // Enter and Space on a focused button keep their native activation behavior.
    if (event.key === 'Enter' && (event.target as HTMLElement).closest('button')) return;
    const key = ({ ',': '.', Enter: '=', Backspace: 'backspace', Delete: 'clear', c: 'clear', C: 'clear' } as Record<string, string>)[event.key] ?? event.key;
    if (/^[\d.+\-*/%=]$/.test(key) || ['backspace', 'clear'].includes(key)) {
      event.preventDefault(); calculator.press(key); paint();
    }
  });
  return {
    /** Login/logout clears transient calculator content; navigation keeps it available. */
    setVisible(visible: boolean): void {
      root.hidden = !visible;
      if (!visible) { toggle(false); calculator.clear(); paint(); }
    },
  };
}
