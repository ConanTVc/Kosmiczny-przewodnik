/**
 * Obudowa panelu na stronie gry: host z Shadow DOM przy krawędzi ekranu, przycisk otwierania,
 * uchwyt do zmiany szerokości i skrót Alt+K. To jedyne elementy, które skrypt dodaje do strony.
 */
import { readLocal, writeLocal } from './storage';

export interface PanelUi {
  open: boolean;
  side: 'right' | 'left';
  width: number;
  wizardCollapsed: boolean;
}

export const DEFAULT_UI: PanelUi = {
  open: true,
  side: 'right',
  width: 380,
  wizardCollapsed: false,
};
const UI_KEY = 'ui';
const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const Z = '2147483000';

export interface PanelShell {
  /** Element, w którym montujemy panel (`mount` z @kp/ui). */
  host: HTMLElement;
  ui: PanelUi;
  setUi(patch: Partial<PanelUi>): void;
  toggle(): void;
  destroy(): void;
}

const css = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, styles);

export function createPanelShell(onUiChange: (ui: PanelUi) => void): PanelShell {
  let ui: PanelUi = readLocal(UI_KEY, DEFAULT_UI);

  const host = document.createElement('div');
  host.id = 'kp-panel-host';
  const handle = document.createElement('div');
  handle.id = 'kp-resize-host';
  const toggleHost = document.createElement('div');
  toggleHost.id = 'kp-toggle-host';
  const toggleShadow = toggleHost.attachShadow({ mode: 'open' });
  toggleShadow.innerHTML = `<style>
    button { all: initial; box-sizing: border-box; display: block; width: 28px; padding: 12px 0;
      background: #f4b400; color: #1a1300; font: 700 12px/1 system-ui, sans-serif; cursor: pointer;
      writing-mode: vertical-rl; text-align: center; letter-spacing: .08em;
      box-shadow: 0 2px 10px rgba(0,0,0,.5); }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  </style><button type="button" title="Kosmiczny Przewodnik (Alt+K)" aria-label="Pokaż przewodnik">PRZEWODNIK</button>`;
  const toggleButton = toggleShadow.querySelector('button')!;

  const apply = () => {
    const right = ui.side === 'right';
    const width = Math.min(Math.max(ui.width, MIN_WIDTH), MAX_WIDTH);
    css(host, {
      position: 'fixed',
      top: '0',
      bottom: '0',
      left: right ? '' : '0',
      right: right ? '0' : '',
      width: `${width}px`,
      maxWidth: '100vw',
      zIndex: Z,
      boxShadow: '0 0 24px rgba(0,0,0,.55)',
      transform: ui.open ? 'none' : `translateX(${right ? '' : '-'}100%)`,
      visibility: ui.open ? 'visible' : 'hidden',
      transition: 'transform .18s ease, visibility .18s',
    });
    css(handle, {
      position: 'fixed',
      top: '0',
      bottom: '0',
      width: '6px',
      left: right ? '' : `${width - 3}px`,
      right: right ? `${width - 3}px` : '',
      zIndex: Z,
      cursor: 'ew-resize',
      display: ui.open ? 'block' : 'none',
    });
    css(toggleHost, {
      position: 'fixed',
      top: '35%',
      left: right ? '' : '0',
      right: right ? '0' : '',
      zIndex: Z,
      display: ui.open ? 'none' : 'block',
    });
    toggleButton.style.borderRadius = right ? '8px 0 0 8px' : '0 8px 8px 0';
  };

  const setUi = (patch: Partial<PanelUi>) => {
    ui = { ...ui, ...patch };
    writeLocal(UI_KEY, ui);
    apply();
    onUiChange(ui);
  };
  const toggle = () => setUi({ open: !ui.open });

  toggleButton.addEventListener('click', toggle);

  // Zmiana szerokości przeciąganiem krawędzi panelu.
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const width = ui.side === 'right' ? window.innerWidth - ev.clientX : ev.clientX;
      ui = { ...ui, width: Math.min(Math.max(Math.round(width), MIN_WIDTH), MAX_WIDTH) };
      apply();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      setUi({});
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  });

  // Alt+K – pokaż/ukryj (poza polami tekstowymi gry).
  const onKey = (e: KeyboardEvent) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyK') return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
      return;
    e.preventDefault();
    toggle();
  };
  document.addEventListener('keydown', onKey);

  document.body.append(host, handle, toggleHost);
  apply();

  return {
    host,
    get ui() {
      return ui;
    },
    setUi,
    toggle,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      host.remove();
      handle.remove();
      toggleHost.remove();
    },
  };
}
