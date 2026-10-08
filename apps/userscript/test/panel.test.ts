import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPanelShell, type PanelShell } from '../src/panel';

const el = (id: string) => document.getElementById(id)!;
const tabButton = () => el('kp-tab-host').shadowRoot!.querySelector('button')!;
const altK = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyK' }));

describe('obudowa panelu w grze', () => {
  let shell: PanelShell | undefined;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });
  afterEach(() => shell?.destroy());

  it('bez wybranej postaci nie widać ani panelu, ani zakładki; Alt+K nic nie robi', () => {
    shell = createPanelShell(() => {});
    expect(el('kp-panel-host').style.display).toBe('none');
    expect(el('kp-tab-host').style.display).toBe('none');
    altK();
    expect(shell.ui.open).toBe(true);
    shell.setPresent(true);
    expect(el('kp-panel-host').style.display).toBe('block');
    expect(el('kp-panel-host').style.visibility).toBe('visible');
  });

  it('schowany panel to sama zakładka ⋮ w rogu; klik ją rozwija', () => {
    const onUi = vi.fn();
    shell = createPanelShell(onUi);
    shell.setPresent(true);
    shell.setUi({ open: false });
    expect(el('kp-panel-host').style.visibility).toBe('hidden');
    expect(el('kp-resize-host').style.display).toBe('none');
    const tab = el('kp-tab-host');
    expect(tab.style.display).toBe('block');
    expect(tab.style.top).toBe('0px');
    expect(tabButton().textContent).toBe('⋮');
    tabButton().click();
    expect(shell.ui.open).toBe(true);
    expect(tab.style.display).toBe('none');
    expect(onUi).toHaveBeenCalled();
  });

  it('Alt+K przełącza, stan zostaje w localStorage (bez starych pól)', () => {
    localStorage.setItem('kp:ui', JSON.stringify({ open: true, minimized: true, side: 'left' }));
    shell = createPanelShell(() => {});
    shell.setPresent(true);
    altK();
    expect(shell.ui.open).toBe(false);
    const saved = JSON.parse(localStorage.getItem('kp:ui')!) as Record<string, unknown>;
    expect(saved).toEqual({ open: false, side: 'left', width: 380, wizardCollapsed: false });
    expect(el('kp-tab-host').style.left).toBe('0px');
  });

  it('gdy postać wyjdzie z gry (ekran wyboru postaci), wszystko znika', () => {
    shell = createPanelShell(() => {});
    shell.setPresent(true);
    shell.setUi({ open: false });
    shell.setPresent(false);
    expect(el('kp-panel-host').style.display).toBe('none');
    expect(el('kp-tab-host').style.display).toBe('none');
  });
});
