/**
 * Strona podglądowa panelu: prawdziwa treść (packages/content/dist) i postacie demonstracyjne,
 * których statusy wyliczają się z fixtures z gry – działa tu ta sama logika co w userscripcie.
 */
import type { BuiltContent } from '@kp/content';
import {
  applyScanResult,
  computeStatuses,
  emptyProgress,
  indexContent,
  mergeProgress,
  parseQuestLog,
  parseTeleportList,
  setManualStatus,
  setQuestLists,
  setSetting,
  setStepDone,
  setTracked,
  upsertCharacter,
  type CharacterInfo,
  type Progress,
  type QuestLogEntry,
  type Scan,
} from '@kp/core';
import chapters from '../../content/dist/content/chapters.json';
import guides from '../../content/dist/content/guides.json';
import locations from '../../content/dist/content/locations.json';
import manifest from '../../content/dist/content/manifest.json';
import quests from '../../content/dist/content/quests.json';
import qbHtml from '../../../fixtures/qb_list.html?raw';
import tpHtml from '../../../fixtures/tp_list.html?raw';
import dziennikTsv from '../../../fixtures/dziennik_s21.tsv?raw';
import { mount, type PanelProps } from '../src';

const content = { locations, chapters, quests, guides } as unknown as BuiltContent;
const index = indexContent(content);
const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

/** Dziennik z s21 (eksport TSV autora) → wpisy jak z parsera dziennika. */
const s21Log: QuestLogEntry[] = dziennikTsv
  .split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#'))
  .map((l, i) => {
    const [locName = '', locId = '0', status = '', name = ''] = l.split('\t');
    return {
      qid: i + 1,
      name,
      stage: name.replace(/\s+[IVX]+$/, ''),
      locId: Number(locId),
      locName,
      isMain: /^Hakaishin/.test(name),
      isTracked: status === 'Aktywne',
    };
  });
const teleports = parseTeleportList(doc(tpHtml));

const demo: {
  info: CharacterInfo;
  scan?: Scan;
  manual?: [string, 'done' | 'active' | 'available'][];
}[] = [
  {
    info: { key: 's21:c3465', name: 'Butcher', race: 7, reborn: 5, loc: 1359 },
    scan: { at: Date.now() - 60_000, lokalizatorActive: true, teleports, questLog: s21Log },
  },
  {
    info: { key: 's18:c100', name: 'Testowa', race: 0, reborn: 5, loc: 1359 },
    scan: {
      at: Date.now() - 3_600_000,
      lokalizatorActive: true,
      teleports,
      questLog: parseQuestLog(doc(qbHtml)),
    },
  },
  {
    info: { key: 's21:c42', name: 'Nowicjusz', race: 0, reborn: 0, loc: 27 },
    manual: [
      ['goku-n/1/zguba', 'done'],
      ['goku-n/2/trening-na-wyspie', 'done'],
      ['goku-n/2/niedowiarek', 'active'],
    ],
  },
];

let progress: Progress = emptyProgress();
const scans = new Map<string, Scan>();
for (const { info, scan, manual } of demo) {
  progress = upsertCharacter(progress, info, scan?.at ?? Date.now());
  if (scan) {
    scans.set(info.key, scan);
    const result = computeStatuses({
      index,
      character: info,
      scan,
      progress: progress.characters[info.key],
    });
    progress = applyScanResult(progress, info.key, scan, result);
  }
  for (const [slug, status] of manual ?? [])
    progress = setManualStatus(progress, info.key, slug, status, Date.now());
}
// Przykład autora: „Duchy Ognia” na Io – wszystko poza ostatnim krokiem (exp) zrobione, odłożone na później.
progress = setStepDone(progress, 's21:c3465', 'hborn/988/duchy-ognia', 0, true, 3, Date.now());
progress = setStepDone(progress, 's21:c3465', 'hborn/988/duchy-ognia', 1, true, 3, Date.now());
progress = setQuestLists(progress, 's21:c3465', 'hborn/988/duchy-ognia', ['Na później'], Date.now());

let active: string = demo[0]!.info.key;
let layout: 'panel' | 'app' = 'panel';
const host = document.getElementById('panel')!;
const frame = document.getElementById('frame')!;

const props = (): PanelProps => ({
  content,
  contentVersion: manifest.version,
  progress,
  activeCharacter: active,
  currentLoc: progress.characters[active]?.lastLoc.v ?? undefined,
  scan: scans.get(active),
  layout,
  onSetManual: (slug, status) =>
    update((p) => setManualStatus(p, active, slug, status, Date.now())),
  onSetStep: (slug, step, done, total) =>
    update((p) => setStepDone(p, active, slug, step, done, total, Date.now())),
  onSetLists: (slug, lists) => update((p) => setQuestLists(p, active, slug, lists, Date.now())),
  onSelectCharacter: (key) => {
    active = key;
    update((p) => p);
  },
  onSetTracked: (key, tracked) => update((p) => setTracked(p, key, tracked, Date.now())),
  onSetting: (name, value) => update((p) => setSetting(p, name, value, Date.now())),
  onImport: (imported) => update((p) => mergeProgress(p, imported)),
});

const handle = mount(host, props());
function update(change: (p: Progress) => Progress) {
  progress = change(progress);
  handle.update(props());
}

function setLayout(next: 'panel' | 'app') {
  layout = next;
  frame.className = next === 'app' ? 'phone' : 'game';
  document.getElementById('mode-panel')!.setAttribute('aria-pressed', String(next === 'panel'));
  document.getElementById('mode-app')!.setAttribute('aria-pressed', String(next === 'app'));
  handle.update(props());
}
document.getElementById('mode-panel')!.addEventListener('click', () => setLayout('panel'));
document.getElementById('mode-app')!.addEventListener('click', () => setLayout('app'));
if (window.matchMedia('(max-width: 600px)').matches) setLayout('app');
