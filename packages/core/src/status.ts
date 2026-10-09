import type { BuiltQuest, Race, Reborn } from '@kp/content';
import { filterForCharacter, isForRace, type ContentIndex } from './content';
import { matchGameQuest, type MatchResult } from './match';
import type {
  CharacterProgress,
  MapQuest,
  QuestLogEntry,
  QuestStatus,
  QuestStatusResult,
  Scan,
  StatusBasis,
} from './types';

export interface StatusInput {
  index: ContentIndex;
  character: { race: Race; reborn: Reborn };
  /** Bieżący odczyt gry; brak = tylko to, co wiemy z postępu i treści (np. telefon). */
  scan?: Scan;
  /** Zapisany postęp postaci (ręczne ustawienia i wcześniejsze skany). */
  progress?: CharacterProgress;
  /** Czas dla statusów wyliczonych bez skanu (ms). */
  now?: number;
}

export interface MatchedEntry {
  entry: QuestLogEntry;
  match: MatchResult;
}

export interface StatusOutput {
  /** Status każdego zadania, które dotyczy postaci (teraz i „przed tobą”). */
  statuses: Record<string, QuestStatusResult>;
  matched: MatchedEntry[];
  /** Zadania z dziennika bez odpowiednika w treści. */
  unmatched: QuestLogEntry[];
  /** Zadania z mapy lokacji bez odpowiednika w treści. */
  unmatchedMap: UnmatchedMapQuest[];
}

export interface UnmatchedMapQuest {
  locId: number;
  quest: MapQuest;
}

/** Zadania, które wracają (codzienne, powtarzalne) – nigdy nie są „zrobione” na stałe. */
const RECURRING = new Set<BuiltQuest['kind']>(['daily', 'repeatable']);

/**
 * Wylicza statusy zadań postaci wg priorytetu: ręczne > w trakcie > zrobione > do wzięcia >
 * zablokowane > nieznane. Gdy coś jest tylko przypuszczeniem, `certain: false` – gracz potwierdza.
 * Bez aktywnego lokalizatora z braku „QUEST” nic nie wnioskujemy.
 */
export function computeStatuses(input: StatusInput): StatusOutput {
  const { index, character, scan, progress } = input;
  const now = scan?.at ?? input.now ?? Date.now();
  const view = filterForCharacter(index.content, character.race, character.reborn);
  const relevant = [...view.current, ...view.ahead];
  const relevantSlugs = new Set(relevant.map((q) => q.slug));
  const out = new Map<string, QuestStatusResult>();

  const set = (
    slug: string,
    status: QuestStatus,
    basis: StatusBasis,
    certain: boolean,
    reason: string,
    at = now,
  ): void => {
    if (!relevantSlugs.has(slug)) return;
    const prev = out.get(slug);
    // Pierwszy wynik wygrywa. Wyjątek: kolejny dowód tego samego statusu, ale pewny, potwierdza
    // przypuszczenie (np. „nie ma na mapie” + lokacja bez QUEST przy lokalizatorze).
    if (prev && !(prev.status === status && !prev.certain && certain && prev.basis !== 'manual'))
      return;
    out.set(slug, {
      status,
      source: basis === 'manual' ? 'manual' : 'auto',
      basis,
      at,
      certain,
      reason,
    });
  };
  const statusOf = (slug: string) => out.get(slug)?.status;
  const applicable = (q: BuiltQuest) => isForRace(q, character.race);

  // 1. Ręczne ustawienia gracza zawsze wygrywają.
  for (const q of relevant) {
    const manual = progress?.quests[q.slug]?.manual;
    if (manual?.v) set(q.slug, manual.v, 'manual', true, 'Ustawione ręcznie', manual.at);
  }

  // 2. Dziennik zadań → w trakcie.
  const matched: MatchedEntry[] = [];
  const unmatched: QuestLogEntry[] = [];
  const activeMainOrder = new Map<string, number>();
  for (const entry of scan?.questLog ?? []) {
    const match = matchGameQuest(index, entry, applicable);
    if (!match) {
      unmatched.push(entry);
      continue;
    }
    matched.push({ entry, match });
    set(
      match.quest.slug,
      'active',
      'scan',
      match.certain,
      match.certain ? 'W dzienniku zadań' : 'W dzienniku zadań – dopasowane po nazwie, sprawdź',
    );
    if (match.quest.kind === 'main' && match.certain) {
      const order = activeMainOrder.get(match.quest.chapter) ?? 0;
      activeMainOrder.set(match.quest.chapter, Math.max(order, match.quest.order));
    }
  }

  // 2a. Wcześniejsze części zadania, którego dalsza część jest w trakcie, są zrobione.
  for (const { match } of matched) {
    let prev = match.quest.continues;
    while (prev && statusOf(prev) !== 'active') {
      set(prev, 'done', 'scan', match.certain, 'Dalsza część tego zadania jest w trakcie');
      prev = index.quests.get(prev)?.continues;
    }
  }

  // 2b. Fabuła główna: przed bieżącym zadaniem głównym zrobione, dalej – przed tobą.
  for (const [chapter, order] of activeMainOrder) {
    for (const q of relevant) {
      if (q.chapter !== chapter || q.kind !== 'main') continue;
      if (q.order < order) set(q.slug, 'done', 'scan', true, 'Fabuła główna jest już dalej');
      else if (q.order > order) set(q.slug, 'locked', 'scan', true, 'Przed tobą w fabule głównej');
    }
  }

  // 3. Fabuła główna wcześniejszych rebornów jest ukończona.
  for (const q of view.current) {
    const chapter = index.chapters.get(q.chapter);
    if (q.kind === 'main' && chapter && chapter.reborn < character.reborn) {
      set(q.slug, 'done', 'content', true, 'Reborn ukończony');
    }
  }

  const continuesMet = (q: BuiltQuest) => !q.continues || statusOf(q.continues) === 'done';

  // 3a. Mapa lokacji (GAME.map_quests): są tam zadania w trakcie i do wzięcia, zrobionych nie ma.
  //     Działa bez lokalizatora.
  const logQids = new Set((scan?.questLog ?? []).map((e) => e.qid));
  const unmatchedMap: UnmatchedMapQuest[] = [];
  for (const map of scan?.mapQuests ?? []) {
    const onMap = new Set<string>();
    for (const mq of map.quests) {
      const match = matchGameQuest(
        index,
        { name: mq.name, locId: map.locId, isMain: mq.isMain },
        applicable,
      );
      if (!match) {
        unmatchedMap.push({ locId: map.locId, quest: mq });
        continue;
      }
      onMap.add(match.quest.slug);
      if (logQids.has(mq.qid)) continue; // w trakcie – już ustalone z dziennika
      if (scan?.questLog) {
        set(
          match.quest.slug,
          'available',
          'scan',
          match.certain,
          'Na mapie, a nie ma go w dzienniku – do wzięcia',
          map.at,
        );
      } else {
        set(
          match.quest.slug,
          'available',
          'scan',
          false,
          'Na mapie – do wzięcia albo w trakcie (otwórz dziennik zadań)',
          map.at,
        );
      }
    }
    // Zadania tej lokacji, których nie ma na mapie (w trakcie też by tam były) – zrobione albo
    // jeszcze nieodblokowane. Poboczne z jedną lokacją uznajemy za zrobione na pewno; główne
    // zostają niepewne, bo fabuła wraca na stare lokacje.
    for (const q of view.current) {
      if (q.locId !== map.locId || onMap.has(q.slug) || RECURRING.has(q.kind)) continue;
      if (!continuesMet(q)) continue;
      const singlePlace = q.kind === 'side' && !q.continues && !q.alsoAt?.length;
      set(
        q.slug,
        'done',
        'scan',
        singlePlace,
        singlePlace
          ? 'Nie ma go na mapie lokacji ani w dzienniku – zrobione'
          : 'Nie ma go już na mapie – pewnie zrobione',
        map.at,
      );
    }
  }

  // 4. Teleportacje – tylko z aktywnym lokalizatorem.
  const teleports = scan?.lokalizatorActive ? scan.teleports : undefined;
  const tpByLoc = new Map((teleports ?? []).map((t) => [t.locId, t]));
  if (teleports) {
    // Lokacja widoczna bez „QUEST” → wszystko tam zrobione.
    for (const q of view.current) {
      const t = tpByLoc.get(q.locId);
      if (t && !t.hasQuest && !RECURRING.has(q.kind) && continuesMet(q)) {
        set(q.slug, 'done', 'scan', true, 'Lokacja bez znacznika QUEST');
      }
    }
    // Lokacja z „QUEST”, a zadania nie ma w dzienniku → do wzięcia. Pewne tylko, gdy to jedyne
    // takie zadanie w lokacji i znacznika nie tłumaczy nic innego.
    const activeLocs = new Set((scan?.questLog ?? []).map((e) => e.locId));
    const byLoc = new Map<number, BuiltQuest[]>();
    for (const q of view.current) {
      if (!tpByLoc.get(q.locId)?.hasQuest) continue;
      byLoc.set(q.locId, [...(byLoc.get(q.locId) ?? []), q]);
    }
    for (const [locId, quests] of byLoc) {
      const takeable = quests.filter(
        (q) => q.kind === 'side' && !out.has(q.slug) && continuesMet(q),
      );
      if (!takeable.length) continue;
      const explained =
        !scan?.questLog || activeLocs.has(locId) || quests.some((q) => RECURRING.has(q.kind));
      const certain = !explained && takeable.length === 1;
      for (const q of takeable) {
        set(
          q.slug,
          'available',
          'scan',
          certain,
          certain
            ? 'Lokacja ma znacznik QUEST, a zadania nie ma w dzienniku'
            : 'Lokacja ma znacznik QUEST – to albo inne zadanie stąd jest do zrobienia',
        );
      }
    }
  }

  // 5. Zapamiętane wcześniejsze skany. Zadanie „w trakcie”, którego nie ma już w pełnym
  //    dzienniku, zostało pewnie ukończone (albo zapomniane).
  for (const q of relevant) {
    const auto = progress?.quests[q.slug]?.auto;
    if (!auto || out.has(q.slug)) continue;
    if (scan?.questLog && auto.v.status === 'active') {
      set(q.slug, 'done', 'scan', false, 'Zniknęło z dziennika – pewnie zrobione');
    } else {
      set(q.slug, auto.v.status, 'history', auto.v.certain, 'Z wcześniejszego skanu', auto.at);
    }
  }

  // 6. Zrobione zadanie → zrobione też to, czego wymagało, i jego wcześniejsze części.
  const queue = [...out]
    .filter(([, r]) => r.status === 'done')
    .map(([slug, r]) => ({ slug, certain: r.certain }));
  while (queue.length) {
    const { slug, certain } = queue.pop()!;
    const q = index.quests.get(slug);
    for (const dep of [...(q?.requires ?? []), ...(q?.continues ? [q.continues] : [])]) {
      if (out.has(dep)) continue;
      set(dep, 'done', 'content', certain, 'Wymagane przez zrobione zadanie');
      queue.push({ slug: dep, certain });
    }
  }

  // 7. Zablokowane.
  for (const q of view.ahead) set(q.slug, 'locked', 'content', true, 'Wymaga wyższego rebornu');
  for (const q of relevant) {
    const prev = q.continues && out.get(q.continues);
    if (prev && prev.status !== 'done') {
      const name = index.quests.get(q.continues!)?.name ?? q.continues!;
      set(q.slug, 'locked', 'content', prev.certain, `Najpierw wcześniejsza część: ${name}`);
    }
  }
  if (teleports && !scan?.teleportsPartial) {
    for (const q of view.current) {
      if (out.has(q.slug) || tpByLoc.has(q.locId)) continue;
      if (index.locations.get(q.locId)?.teleport === false) continue;
      const mainOrder = activeMainOrder.get(q.chapter);
      if (mainOrder !== undefined) {
        // Lokacje za bieżącym zadaniem głównym są nieodkryte; te przed nim pewnie nie mają teleportu.
        if (q.order > mainOrder) set(q.slug, 'locked', 'scan', true, 'Lokacja jeszcze nieodkryta');
        continue;
      }
      if ((index.chapters.get(q.chapter)?.reborn ?? 0) < character.reborn) continue;
      set(
        q.slug,
        'locked',
        'scan',
        false,
        'Lokacji nie ma na liście teleportacji – nieodkryta albo bez teleportu',
      );
    }
  }

  // 8. Reszta – nie wiemy.
  for (const q of relevant) {
    set(q.slug, 'unknown', 'content', false, 'Brak danych – zeskanuj grę albo oznacz ręcznie');
  }

  return { statuses: Object.fromEntries(out), matched, unmatched, unmatchedMap };
}
