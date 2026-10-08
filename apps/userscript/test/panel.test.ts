import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPanelShell, type PanelShell } from '../src/panel';

/** Pasek szybkich akcji jak w grze: `div.option.qlink` obok siebie. */
function gameQuickBar(): HTMLElement {
  const bar = document.createElement('div');
  bar.id = 'quick_bar';
  bar.innerHTML =
    '<div class="option qlink" data-option="tele"></div><div id="quick_allSubs"></div>';
  document.body.append(bar);
  return bar;
}

const iconButton = (id: string) =>
  document.getElementById(id)?.shadowRoot?.querySelector('button') ?? null;

describe('obudowa panelu w grze', () => {
  let shell: PanelShell | undefined;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    shell?.destroy();
    vi.useRealTimers();
  });

  it('ikona trafia na koniec paska szybkich akcji i pokazuje/chowa panel', () => {
    const bar = gameQuickBar();
    const onUi = vi.fn();
    shell = createPanelShell(onUi);
    const quick = document.getElementById('kp-quick-host')!;
    expect(quick.parentElement).toBe(bar);
    expect(bar.lastElementChild).toBe(quick);
    // bez klas gry – jej skrypty nie traktują ikony jak swojej
    expect(quick.className).toBe('');
    expect(shell.inQuickBar()).toBe(true);

    const gameClick = vi.fn();
    document.addEventListener('click', gameClick);
    iconButton('kp-quick-host')!.click();
    expect(shell.ui.open).toBe(false);
    expect(gameClick).not.toHaveBeenCalled(); // klik nie dociera do obsługi gry
    expect(document.getElementById('kp-corner-host')!.style.display).toBe('none');
    iconButton('kp-quick-host')!.click();
    expect(shell.ui).toMatchObject({ open: true, minimized: false });
    document.removeEventListener('click', gameClick);
  });

  it('gdy gra przerysuje pasek, ikona wraca', () => {
    gameQuickBar().remove();
    shell = createPanelShell(() => {});
    expect(shell.inQuickBar()).toBe(false);
    const bar = gameQuickBar();
    vi.advanceTimersByTime(2000);
    expect(document.getElementById('kp-quick-host')?.parentElement).toBe(bar);
  });

  it('bez paska szybkich akcji schowany panel otwiera przycisk w rogu', () => {
    shell = createPanelShell(() => {});
    shell.setUi({ open: false });
    const corner = document.getElementById('kp-corner-host')!;
    expect(corner.style.display).toBe('block');
    iconButton('kp-corner-host')!.click();
    expect(shell.ui.open).toBe(true);
    expect(corner.style.display).toBe('none');
  });

  it('zwinięty panel to sama belka w rogu, stan zostaje w localStorage', () => {
    shell = createPanelShell(() => {});
    shell.setUi({ minimized: true });
    const host = document.getElementById('kp-panel-host')!;
    expect(host.style.bottom).toBe('');
    expect(host.style.width).toBe('auto');
    expect(document.getElementById('kp-resize-host')!.style.display).toBe('none');
    expect(JSON.parse(localStorage.getItem('kp:ui')!)).toMatchObject({ minimized: true });
    // Pokazanie po schowaniu zawsze rozwija panel
    shell.toggle();
    shell.toggle();
    expect(shell.ui).toMatchObject({ open: true, minimized: false });
  });
});
