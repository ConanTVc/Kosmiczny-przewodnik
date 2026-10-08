/**
 * Obudowa panelu na stronie gry: host z Shadow DOM przy krawędzi ekranu, ikona w pasku szybkich
 * akcji gry (albo zapasowy przycisk w rogu), uchwyt do zmiany szerokości i skrót Alt+K.
 * To jedyne elementy, które skrypt dodaje do strony.
 */
import { readLocal, writeLocal } from '@kp/ui';

export interface PanelUi {
  /** Panel widoczny (rozwinięty albo zwinięty do belki). */
  open: boolean;
  /** Zwinięty do samej belki w rogu. */
  minimized: boolean;
  side: 'right' | 'left';
  width: number;
  wizardCollapsed: boolean;
}

export const DEFAULT_UI: PanelUi = {
  open: true,
  minimized: false,
  side: 'right',
  width: 380,
  wizardCollapsed: false,
};
const UI_KEY = 'ui';
const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const Z = '2147483000';
/** Co ile sprawdzamy, czy gra nie przerysowała paska szybkich akcji (i nie zgubiła ikony). */
const QUICK_BAR_CHECK_MS = 2000;

const COMPASS = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="currentColor" d="M16 8l-2.4 5.6L8 16l2.4-5.6z"/></svg>`;
const BUTTON_CSS = `button { all: initial; box-sizing: border-box; display: flex; align-items: center;
    justify-content: center; width: 100%; height: 100%; border-radius: 6px; background: #f4b400;
    color: #1a1300; cursor: pointer; }
  button:hover { background: #ffc933; }
  button:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  svg { width: 72%; height: 72%; }`;

export interface PanelShell {
  /** Element, w którym montujemy panel (`mount` z @kp/ui). */
  host: HTMLElement;
  ui: PanelUi;
  setUi(patch: Partial<PanelUi>): void;
  toggle(): void;
  /** Czy ikona siedzi w pasku szybkich akcji gry (inaczej – przycisk w rogu). */
  inQuickBar(): boolean;
  destroy(): void;
}

const css = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, styles);

/** Host z Shadow DOM i jednym przyciskiem – bez klas gry, więc jej skrypty go nie obsługują. */
function iconButton(id: string, onClick: () => void): HTMLElement {
  const host = document.createElement('div');
  host.id = id;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${BUTTON_CSS}</style><button type="button" title="Kosmiczny Przewodnik (Alt+K)" aria-label="Pokaż lub schowaj przewodnik">${COMPASS}</button>`;
  shadow.querySelector('button')!.addEventListener('click', onClick);
  // Klik w naszą ikonę nie dociera do obsługi kliknięć gry.
  host.addEventListener('click', (e) => e.stopPropagation());
  return host;
}

/** Pasek szybkich akcji gry (Prywatne, Klan, Teleportacje…) – tylko odczyt położenia. */
const findQuickBar = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('.qlink')?.parentElement ?? null;

export function createPanelShell(onUiChange: (ui: PanelUi) => void): PanelShell {
  let ui: PanelUi = readLocal(UI_KEY, DEFAULT_UI);

  const host = document.createElement('div');
  host.id = 'kp-panel-host';
  const handle = document.createElement('div');
  handle.id = 'kp-resize-host';

  const setUi = (patch: Partial<PanelUi>) => {
    ui = { ...ui, ...patch };
    writeLocal(UI_KEY, ui);
    apply();
    onUiChange(ui);
  };
  // Pokazanie zawsze rozwija panel – zwinięty do belki był tylko „na chwilę”.
  const toggle = () => setUi(ui.open ? { open: false } : { open: true, minimized: false });

  const quickIcon = iconButton('kp-quick-host', toggle);
  const cornerIcon = iconButton('kp-corner-host', toggle);

  /** Dokleja ikonę na końcu paska szybkich akcji; rozmiar podpatruje u sąsiedniej ikony gry. */
  const placeQuickIcon = () => {
    try {
      const bar = findQuickBar();
      if (!bar) {
        quickIcon.remove();
        return;
      }
      if (quickIcon.parentElement === bar) return;
      const sample = bar.querySelector<HTMLElement>('.qlink');
      const s = sample ? getComputedStyle(sample) : undefined;
      const size = (v: string | undefined) => (v && v !== 'auto' && v !== '0px' ? v : '32px');
      css(quickIcon, {
        display: s?.display && s.display !== 'none' ? s.display : 'inline-block',
        cssFloat: s?.cssFloat ?? '',
        width: size(s?.width),
        height: size(s?.height),
        margin: s?.margin ?? '0 2px',
        verticalAlign: 'middle',
        boxSizing: 'border-box',
        padding: '2px',
      });
      bar.append(quickIcon);
    } catch {
      // brak paska = zostaje przycisk w rogu
    }
  };

  const apply = () => {
    placeQuickIcon();
    const right = ui.side === 'right';
    const width = Math.min(Math.max(ui.width, MIN_WIDTH), MAX_WIDTH);
    const mini = ui.open && ui.minimized;
    css(host, {
      position: 'fixed',
      top: '0',
      bottom: mini ? '' : '0',
      left: right ? '' : '0',
      right: right ? '0' : '',
      width: mini ? 'auto' : `${width}px`,
      maxWidth: mini ? `min(${width}px, 100vw)` : '100vw',
      zIndex: Z,
      boxShadow: '0 0 24px rgba(0,0,0,.55)',
      borderRadius: mini ? (right ? '0 0 0 10px' : '0 0 10px 0') : '0',
      overflow: 'hidden',
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
      display: ui.open && !ui.minimized ? 'block' : 'none',
    });
    css(cornerIcon, {
      position: 'fixed',
      bottom: '12px',
      left: right ? '' : '12px',
      right: right ? '12px' : '',
      width: '40px',
      height: '40px',
      zIndex: Z,
      boxShadow: '0 2px 10px rgba(0,0,0,.5)',
      borderRadius: '6px',
      display: !ui.open && !quickIcon.isConnected ? 'block' : 'none',
    });
  };

  // Gra potrafi przerysować pasek (np. po zmianie postaci) – wtedy doklejamy ikonę ponownie.
  const timer = window.setInterval(() => {
    const before = quickIcon.isConnected;
    placeQuickIcon();
    if (before !== quickIcon.isConnected) apply();
  }, QUICK_BAR_CHECK_MS);

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

  document.body.append(host, handle, cornerIcon);
  apply();

  return {
    host,
    get ui() {
      return ui;
    },
    setUi,
    toggle,
    inQuickBar: () => quickIcon.isConnected,
    destroy: () => {
      window.clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      host.remove();
      handle.remove();
      quickIcon.remove();
      cornerIcon.remove();
    },
  };
}
