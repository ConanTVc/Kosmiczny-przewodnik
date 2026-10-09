// @vitest-environment jsdom
import {
  applyScanResult,
  computeStatuses,
  emptyProgress,
  indexContent,
  parseQuestLog,
  parseTeleportList,
  removeCharacter,
  setManualStatus,
  upsertCharacter,
  type Progress,
} from '@kp/core';
import { render } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { fixtureDocument, loadRealContent } from '../../core/test/helpers';
import { Markdown } from '../src/components/Markdown';
import { parseInline, parseMarkdown } from '../src/markdown';
import { mount, type PanelProps } from '../src';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Markdown – bezpieczny renderer', () => {
  it('parsuje to, czego używa treść', () => {
    expect(
      parseMarkdown(
        '## Fortece\n\n| Poziom | Koszt |\n| --- | --- |\n| 1 | 50 KP |\n\n- a\n- **b**',
      ),
    ).toEqual([
      { t: 'h', level: 2, c: [{ t: 'text', v: 'Fortece' }] },
      {
        t: 'table',
        head: [[{ t: 'text', v: 'Poziom' }], [{ t: 'text', v: 'Koszt' }]],
        rows: [[[{ t: 'text', v: '1' }], [{ t: 'text', v: '50 KP' }]]],
      },
      { t: 'ul', items: [[{ t: 'text', v: 'a' }], [{ t: 'b', c: [{ t: 'text', v: 'b' }] }]] },
    ]);
    expect(parseMarkdown('Linia 1\nLinia 2')[0]).toEqual({
      t: 'p',
      c: [{ t: 'text', v: 'Linia 1' }, { t: 'br' }, { t: 'text', v: 'Linia 2' }],
    });
  });

  it('linki tylko http(s) – inne schematy zostają tekstem', () => {
    expect(parseInline('[ok](https://kosmiczni.pl)')).toEqual([
      { t: 'a', href: 'https://kosmiczni.pl', c: [{ t: 'text', v: 'ok' }] },
    ]);
    expect(parseInline('[zły](javascript:alert(1))')[0]).toMatchObject({ t: 'text' });
  });

  it('surowy HTML z treści jest wyświetlany jako tekst, nigdy nie trafia do DOM', () => {
    const el = document.createElement('div');
    render(
      <Markdown text={'<img src=x onerror="alert(1)"> <script>alert(2)</script> **ok**'} />,
      el,
    );
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(2)</script>');
    expect(el.querySelector('strong')?.textContent).toBe('ok');
  });
});

describe('panel z prawdziwą treścią (fixtures z gry)', () => {
  const content = loadRealContent();
  const index = indexContent(content);
  const key = 's18:c100';
  const scan = {
    at: 1000,
    lokalizatorActive: true,
    teleports: parseTeleportList(fixtureDocument('tp_list.html')),
    questLog: parseQuestLog(fixtureDocument('qb_list.html')),
  };
  let progress: Progress = upsertCharacter(
    emptyProgress(),
    { key, name: 'Testowa', race: 0, reborn: 5, loc: 1359 },
    1,
  );
  progress = applyScanResult(
    progress,
    key,
    scan,
    computeStatuses({ index, character: { race: 0, reborn: 5 }, scan }),
  );

  const setup = () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onSetManual = vi.fn();
    const onSetStep = vi.fn();
    const onSetLists = vi.fn();
    const props: PanelProps = {
      content,
      progress,
      activeCharacter: key,
      currentLoc: 1359,
      scan,
      onSetManual,
      onSetStep,
      onSetLists,
      onSelectCharacter: vi.fn(),
      onSetTracked: vi.fn(),
      onSetting: vi.fn(),
      onImport: vi.fn(),
    };
    const handle = mount(host, props);
    const root = host.shadowRoot!;
    const click = async (el: Element | null | undefined) => {
      (el as HTMLElement).click();
      await tick();
    };
    const tab = (label: string) =>
      [...root.querySelectorAll('.kp-tab')].find((t) => t.textContent === label);
    return { host, root, handle, click, tab, onSetManual, onSetStep, onSetLists };
  };

  it('montuje się w Shadow DOM ze stylami i pokazuje bieżącą lokację', () => {
    const { root } = setup();
    expect(root.querySelector('style')?.textContent).toContain('.kp-app');
    expect(root.querySelector('.kp-loc-name')?.textContent).toBe('Pałac Aniołów');
    const main = [...root.querySelectorAll('.kp-quest')].find((q) =>
      q.textContent?.includes('Hakaishin'),
    );
    expect(main?.querySelector('.kp-chip')?.textContent).toBe('W trakcie');
    // Zadanie w trakcie jest rozwinięte – kroki i przyciski ręczne widoczne
    expect(main?.querySelector('.kp-steps li')).not.toBeNull();
  });

  it('ręczne oznaczenie woła callback z ID zadania', async () => {
    const { root, click, onSetManual } = setup();
    const btn = [...root.querySelectorAll('.kp-actions button')].find(
      (b) => b.textContent === 'Zrobione',
    );
    await click(btn);
    expect(onSetManual).toHaveBeenCalledWith('hborn/1359/hakaishin', 'done');
  });

  it('zakładki: postęp z filtrami, przed tobą, poradniki z tabelą, postacie, ustawienia', async () => {
    const { root, click, tab } = setup();

    await click(tab('Postęp'));
    expect(root.querySelectorAll('.kp-filter').length).toBe(11); // 4 rodzaje + 7 statusów
    expect(root.querySelector('.kp-chapter-head')).not.toBeNull();
    expect(root.querySelector('details.kp-note summary')?.textContent).toMatch(
      /nie ma w solucjach/,
    );

    await click(tab('Przed tobą'));
    const chapterSelect = root.querySelector('#kp-ahead-chapter') as HTMLSelectElement;
    expect(chapterSelect.value).toBe('hborn');
    expect([...chapterSelect.options].map((o) => o.value)).toContain('mborn');

    await click(tab('Szukaj'));
    expect(root.querySelectorAll('.kp-row').length).toBe(3);
    await click(
      [...root.querySelectorAll('.kp-row')].find((r) => r.textContent?.includes('Koszty')),
    );
    expect(root.querySelector('.kp-md table')).not.toBeNull();

    await click(tab('Postacie'));
    expect(root.textContent).toContain('Testowa');

    // w wąskim panelu „Ustawienia” to ikona ⚙ w nagłówku, nie zakładka
    expect(tab('Ustawienia')).toBeUndefined();
    await click(root.querySelector('[aria-label="Ustawienia"]'));
    const textarea = root.querySelector('textarea')!;
    textarea.value = '{"zly": true}';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    await click([...root.querySelectorAll('button')].find((b) => b.textContent === 'Importuj'));
    expect(root.querySelector('.kp-error')?.textContent).toMatch(/nie wygląda na kopię/);
  });

  it('bez postaci prosi o jej wybranie zamiast się wywracać', () => {
    const host = document.createElement('div');
    mount(host, {
      content,
      progress: emptyProgress(),
      onSetManual: vi.fn(),
      onSetStep: vi.fn(),
      onSetLists: vi.fn(),
      onSelectCharacter: vi.fn(),
      onSetTracked: vi.fn(),
      onSetting: vi.fn(),
      onImport: vi.fn(),
    });
    expect(host.shadowRoot!.textContent).toContain('Wybierz postać');
  });

  it('unmount sprząta Shadow DOM', () => {
    const { root, handle } = setup();
    handle.unmount();
    expect(root.childNodes.length).toBe(0);
  });
});

describe('kroki, listy, wyszukiwarka i fabuła krok po kroku', () => {
  const content = loadRealContent();
  const key = 's21:c3465';
  const progress = upsertCharacter(
    emptyProgress(),
    { key, name: 'Butcher', race: 7, reborn: 5, loc: 1359 },
    1,
  );
  const mountPanel = (extra: Partial<PanelProps> = {}) => {
    const host = document.createElement('div');
    document.body.append(host);
    const calls = { onSetStep: vi.fn(), onSetLists: vi.fn() };
    mount(host, {
      content,
      progress,
      activeCharacter: key,
      currentLoc: 1359,
      onSetManual: vi.fn(),
      ...calls,
      onSelectCharacter: vi.fn(),
      onSetTracked: vi.fn(),
      onSetting: vi.fn(),
      onImport: vi.fn(),
      ...extra,
    });
    const root = host.shadowRoot!;
    const click = async (el: Element | null | undefined) => {
      (el as HTMLElement).click();
      await tick();
    };
    const tab = (label: string) =>
      [...root.querySelectorAll('.kp-tab')].find((t) => t.textContent === label);
    const button = (text: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    return { root, click, tab, button, calls };
  };

  it('odhaczenie kroku i „Na później” wołają callbacki', async () => {
    const { root, click, calls } = mountPanel();
    await click(root.querySelector('.kp-quest-head'));
    const box = root.querySelector('.kp-step-check') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(calls.onSetStep).toHaveBeenCalledWith(
      expect.stringMatching(/^hborn\/1359\//),
      0,
      true,
      expect.any(Number),
    );
    await click(
      [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Na później')),
    );
    expect(calls.onSetLists).toHaveBeenCalledWith(expect.stringMatching(/^hborn\/1359\//), [
      'Na później',
    ]);
  });

  it('wyszukiwarka: nagroda bez polskich znaków → zadanie w „Tutaj”', async () => {
    const { root, click, tab } = mountPanel();
    await click(tab('Szukaj'));
    const input = root.querySelector('#kp-search') as HTMLInputElement;
    input.value = 'czerwone senzu';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const rewards = [...root.querySelectorAll('.kp-block')].find((b) =>
      b.querySelector('.kp-h')?.textContent?.startsWith('Nagrody'),
    );
    expect(rewards?.querySelector('mark')?.textContent?.toLowerCase()).toContain('czerwone'); // podświetlone najdłuższe słowo
    await click(rewards?.querySelector('.kp-hit'));
    expect(root.querySelector('.kp-quest-focus')).not.toBeNull();
  });

  it('przed tobą: fabuła krok po kroku pokazuje zadania główne z krokami', async () => {
    const { root, click, tab } = mountPanel();
    await click(tab('Przed tobą'));
    expect((root.querySelector('#kp-ahead-chapter') as HTMLSelectElement).value).toBe('hborn');
    expect(root.querySelectorAll('.kp-story').length).toBeGreaterThan(0);
    expect(root.querySelector('.kp-story .kp-steps')).not.toBeNull();
  });

  it('„Tutaj” chowa zrobione zadania za przyciskiem „Pokaż zrobione”', async () => {
    const quest = indexContent(content)
      .byLoc.get(1359)!
      .find((q) => q.slug.startsWith('hborn/'))!;
    const { root, click, button } = mountPanel({
      progress: setManualStatus(progress, key, quest.slug, 'done', 2),
    });
    const names = () => [...root.querySelectorAll('.kp-quest-name')].map((n) => n.textContent);
    expect(names()).not.toContain(quest.name);
    await click(button('Pokaż zrobione (1)'));
    expect(names()).toContain(quest.name);
    expect(button('Ukryj zrobione')).toBeDefined();
  });

  it('klik w belkę i × chowają panel', async () => {
    const onCollapse = vi.fn();
    const onClose = vi.fn();
    const { root, click } = mountPanel({ onCollapse, onClose });
    await click(root.querySelector('.kp-brand-btn'));
    await click(root.querySelector('[aria-label="Schowaj panel"]'));
    expect(onCollapse).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('usunięcie postaci wymaga potwierdzenia; usunięta znika z listy', async () => {
    const onRemoveCharacter = vi.fn();
    const { root, click, tab, button } = mountPanel({ onRemoveCharacter });
    await click(tab('Postacie'));
    await click(button('Usuń'));
    expect(onRemoveCharacter).not.toHaveBeenCalled();
    expect(root.querySelector('.kp-confirm')?.textContent).toContain('Butcher');
    await click(button('Anuluj'));
    expect(root.querySelector('.kp-confirm')).toBeNull();
    await click(button('Usuń'));
    await click(button('Usuń postać'));
    expect(onRemoveCharacter).toHaveBeenCalledWith(key);

    const host = document.createElement('div');
    mount(host, {
      content,
      progress: removeCharacter(progress, key, 5),
      activeCharacter: key,
      initialTab: 'characters',
      onSetManual: vi.fn(),
      onSetStep: vi.fn(),
      onSetLists: vi.fn(),
      onSelectCharacter: vi.fn(),
      onSetTracked: vi.fn(),
      onSetting: vi.fn(),
      onImport: vi.fn(),
    });
    expect(host.shadowRoot!.textContent).not.toContain('Butcher');
  });
});

describe('synchronizacja i łączenie postaci', () => {
  const content = loadRealContent();
  const game = upsertCharacter(
    emptyProgress(),
    { key: 's21:c3465', name: 'Butcher', race: 7, reborn: 5, loc: 1359 },
    1,
  );
  const progress = upsertCharacter(
    game,
    { key: 's0:m77', name: 'Z telefonu', race: 7, reborn: 5 },
    2,
  );
  const mountWith = (extra: Partial<PanelProps>) => {
    const host = document.createElement('div');
    document.body.append(host);
    mount(host, {
      content,
      progress,
      activeCharacter: 's0:m77',
      onSetManual: vi.fn(),
      onSetStep: vi.fn(),
      onSetLists: vi.fn(),
      onSelectCharacter: vi.fn(),
      onSetTracked: vi.fn(),
      onSetting: vi.fn(),
      onImport: vi.fn(),
      ...extra,
    });
    const root = host.shadowRoot!;
    const button = (text: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    const click = async (el: Element | null | undefined) => {
      (el as HTMLElement).click();
      await tick();
    };
    return { root, button, click };
  };

  it('kod z QR dla telefonu; odłączenie wymaga potwierdzenia', async () => {
    const onDisconnect = vi.fn();
    const { root, button, click } = mountWith({
      initialTab: 'settings',
      layout: 'app',
      sync: {
        code: 'KOSMO-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG',
        state: 'synced',
        lastSync: 5,
        shareUrl: 'https://example.test/app/#kod=KOSMO-AAAA',
        onDisconnect,
      },
    });
    expect(root.querySelector('.kp-sync-code .kp-code')?.textContent).toContain('KOSMO-AAAA');
    expect(root.querySelector('svg.kp-qr path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(root.querySelector('.kp-sync-state')?.textContent).toContain('Zsynchronizowano');
    await click(button('Odłącz to urządzenie'));
    expect(onDisconnect).not.toHaveBeenCalled();
    await click(button('Odłącz'));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('bez kodu: utworzenie albo połączenie istniejącym kodem', async () => {
    const onCreate = vi.fn();
    const onConnect = vi.fn();
    const { root, button, click } = mountWith({
      initialTab: 'settings',
      layout: 'app',
      sync: { state: 'off', onCreate, onConnect },
    });
    await click(button('Utwórz kod synchronizacji'));
    expect(onCreate).toHaveBeenCalledOnce();
    const input = root.querySelector('input[aria-label="Kod synchronizacji"]') as HTMLInputElement;
    input.value = ' kosmo-aaaa ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    (input.form as HTMLFormElement).requestSubmit();
    await tick();
    expect(onConnect).toHaveBeenCalledWith('kosmo-aaaa');
  });

  it('postać z telefonu można połączyć z postacią z gry', async () => {
    const onLinkCharacter = vi.fn();
    const { button, click } = mountWith({ initialTab: 'characters', onLinkCharacter });
    await click(button('Połącz z postacią z gry'));
    await click(button('Połącz'));
    expect(onLinkCharacter).toHaveBeenCalledWith('s0:m77', 's21:c3465');
  });
});
