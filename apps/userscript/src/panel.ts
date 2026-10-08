/**
 * Obudowa panelu na stronie gry: host z Shadow DOM przy krawędzi ekranu, mała zakładka „⋮”
 * w rogu (panel schowany), uchwyt do zmiany szerokości i skrót Alt+K. To jedyne elementy,
 * które skrypt dodaje do strony. Gdy w grze nie ma wybranej postaci, nie widać niczego.
 */
import { readLocal, writeLocal } from '@kp/ui';

export interface PanelUi {
  /** Panel rozwinięty; schowany = sama zakładka „⋮” w rogu. */
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

const TAB_CSS = `button { all: initial; box-sizing: border-box; display: flex; align-items: center;
    justify-content: center; width: 100%; height: 100%; background: rgba(17,19,26,.92);
    color: #f4b400; font: 700 20px/1 system-ui, sans-serif; cursor: pointer;
    border: 1px solid #2f3547; box-shadow: 0 2px 10px rgba(0,0,0,.5); }
  button:hover { background: #222634; }
  button:focus-visible { outline: 2px solid #f4b400; outline-offset: -3px; }`;

export interface PanelShell {
  /** Element, w którym montujemy panel (`mount` z @kp/ui). */
  host: HTMLElement;
  ui: PanelUi;
  setUi(patch: Partial<PanelUi>): void;
  toggle(): void;
  /** Czy w grze jest wybrana postać – bez niej panel i zakładka są niewidoczne. */
  setPresent(present: boolean): void;
  destroy(): void;
}

const css = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, styles);

export function createPanelShell(onUiChange: (ui: PanelUi) => void): PanelShell {
  const stored = readLocal<PanelUi>(UI_KEY, DEFAULT_UI);
  let ui: PanelUi = {
    open: stored.open,
    side: stored.side,
    width: stored.width,
    wizardCollapsed: stored.wizardCollapsed,
  };
  let present = false;

  const host = document.createElement('div');
  host.id = 'kp-panel-host';
  const handle = document.createElement('div');
  handle.id = 'kp-resize-host';
  const tab = document.createElement('div');
  tab.id = 'kp-tab-host';
  const tabShadow = tab.attachShadow({ mode: 'open' });
  tabShadow.innerHTML = `<style>${TAB_CSS}</style><button type="button" title="Kosmiczny Przewodnik (Alt+K)" aria-label="Pokaż przewodnik">⋮</button>`;
  const tabButton = tabShadow.querySelector('button')!;

  const apply = () => {
    const right = ui.side === 'right';
    const width = Math.min(Math.max(ui.width, MIN_WIDTH), MAX_WIDTH);
    const shown = present && ui.open;
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
      transform: shown ? 'none' : `translateX(${right ? '' : '-'}100%)`,
      visibility: shown ? 'visible' : 'hidden',
      display: present ? 'block' : 'none',
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
      display: shown ? 'block' : 'none',
    });
    css(tab, {
      position: 'fixed',
      top: '0',
      left: right ? '' : '0',
      right: right ? '0' : '',
      width: '22px',
      height: '40px',
      zIndex: Z,
      display: present && !ui.open ? 'block' : 'none',
    });
    tabButton.style.borderRadius = right ? '0 0 0 8px' : '0 0 8px 0';
  };

  const setUi = (patch: Partial<PanelUi>) => {
    ui = { ...ui, ...patch };
    writeLocal(UI_KEY, ui);
    apply();
    onUiChange(ui);
  };
  const toggle = () => setUi({ open: !ui.open });

  tabButton.addEventListener('click', toggle);

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

  // Alt+K – pokaż/schowaj (poza polami tekstowymi gry i tylko z wybraną postacią).
  const onKey = (e: KeyboardEvent) => {
    if (!present || !e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyK') return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
      return;
    e.preventDefault();
    toggle();
  };
  document.addEventListener('keydown', onKey);

  document.body.append(host, handle, tab);
  apply();

  return {
    host,
    get ui() {
      return ui;
    },
    setUi,
    toggle,
    setPresent: (next) => {
      if (next === present) return;
      present = next;
      apply();
    },
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      host.remove();
      handle.remove();
      tab.remove();
    },
  };
}
