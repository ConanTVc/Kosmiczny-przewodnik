import { BOM_RE, foldLoose, foldName, levenshtein } from './text';

export interface GameLocation {
  id: number;
  name: string;
}

export type MatchMethod = 'dokładna' | 'bez-znaków' | 'wariant' | 'literówka' | 'zawiera' | 'brak';

export interface LocationMatch {
  /** Nazwa z solucji (po wycięciu komentarzy). */
  query: string;
  id?: number;
  method: MatchMethod;
  candidates: number[];
  /** Powód do ręcznej weryfikacji. */
  review?: string;
  /** ID leży o najwyżej 3 od sąsiednich lokacji w fabule – dopasowanie pewne. */
  nearAnchor?: boolean;
}

/** Wczytuje `lista_wszystkich_lokacji.txt` (linie `id,nazwa`). */
export function parseLocationList(text: string): GameLocation[] {
  return text
    .replace(BOM_RE, '')
    .split(/\r?\n/)
    .map((l) => /^(\d+),(.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ id: Number(m[1]), name: m[2]!.trim() }));
}

/** Czyta `data-loc` i `data-reborn` z HTML listy teleportacji (fixtures). */
export function parseTeleportReborns(html: string): Map<number, number> {
  const result = new Map<number, number>();
  for (const m of html.matchAll(/<tr[^>]*\bdata-reborn="(\d+)"[^>]*\bdata-loc="(\d+)"/g)) {
    result.set(Number(m[2]), Number(m[1]));
  }
  return result;
}

/** Usuwa powtórzony segment nazwy: „Omega - Omega - Opuszczona Planeta” → „Omega - Opuszczona Planeta”. */
function dedupeSegments(name: string): string {
  const parts = name.split(/\s*[-–—]\s*/);
  return parts.filter((p, i) => i === 0 || foldLoose(p) !== foldLoose(parts[i - 1]!)).join(' - ');
}

function variants(name: string): string[] {
  const base = dedupeSegments(name);
  const out = new Set([base]);
  if (/^planeta\s/i.test(base)) out.add(base.replace(/^planeta\s+/i, ''));
  else out.add(`Planeta ${base}`);
  out.add(base.replace(/\s*-\s*/g, ' '));
  return [...out];
}

export class LocationIndex {
  private readonly exact = new Map<string, number[]>();
  private readonly loose = new Map<string, number[]>();

  constructor(readonly list: readonly GameLocation[]) {
    for (const loc of list) {
      push(this.exact, foldName(loc.name), loc.id);
      push(this.loose, foldLoose(loc.name), loc.id);
    }
  }

  candidates(query: string): Omit<LocationMatch, 'id' | 'review'> {
    const exact = this.exact.get(foldName(query));
    if (exact) return { query, method: 'dokładna', candidates: exact };
    const loose = this.loose.get(foldLoose(query));
    if (loose) return { query, method: 'bez-znaków', candidates: loose };
    for (const v of variants(query)) {
      const hit = this.exact.get(foldName(v)) ?? this.loose.get(foldLoose(v));
      if (hit) return { query, method: 'wariant', candidates: hit };
    }
    // Literówki: odległość edycyjna do ~15% długości
    const q = foldLoose(dedupeSegments(query));
    const limit = Math.max(1, Math.floor(q.length * 0.15));
    let best = Infinity;
    let fuzzy: number[] = [];
    for (const [key, ids] of this.loose) {
      if (Math.abs(key.length - q.length) > limit) continue;
      const d = levenshtein(q, key);
      if (d < best) {
        best = d;
        fuzzy = [...ids];
      } else if (d === best) {
        fuzzy.push(...ids);
      }
    }
    if (best <= limit) return { query, method: 'literówka', candidates: fuzzy };
    // Nazwa z solucji zawiera nazwę z gry albo odwrotnie (min. 6 znaków)
    if (q.length >= 6) {
      const contains: number[] = [];
      for (const [key, ids] of this.loose) {
        if (key.length >= 6 && (key.includes(q) || q.includes(key))) contains.push(...ids);
      }
      if (contains.length > 0 && contains.length <= 5)
        return { query, method: 'zawiera', candidates: contains };
    }
    return { query, method: 'brak', candidates: [] };
  }

  /** Nazwa jest na liście lokacji (dokładnie albo bez polskich znaków). */
  isKnown(name: string): boolean {
    return this.exact.has(foldName(name)) || this.loose.has(foldLoose(name));
  }

  name(id: number): string | undefined {
    return this.list.find((l) => l.id === id)?.name;
  }
}

function push(map: Map<string, number[]>, key: string, id: number) {
  const arr = map.get(key);
  if (arr) arr.push(id);
  else map.set(key, [id]);
}

/** Odległość ID od sąsiadów w fabule, do której lokacja jest „po drodze”; dalej = powrót do dawnej. */
const NEAR = 150;

/**
 * Dopasowuje lokacje rozdziału (w kolejności fabuły) do ID. Lokacje dodawano do gry po kolei,
 * więc fabuła idzie zwykle po kolejnych ID. Nazwy jednoznaczne są kotwicami. Przy kilku
 * kandydatach:
 *  1. odpadają ID wyższe niż najwyższa kotwica rozdziału (rozdział nie wraca do lokacji, których
 *     jeszcze nie było),
 *  2. kandydat blisko sąsiednich kotwic → bierzemy najbliższego,
 *  3. inaczej to powrót do dawnej lokacji → bierzemy tę, którą znamy z wcześniejszych rozdziałów
 *     (`known`); lokacje o tej samej nazwie spoza naszych solucji to zwykle fabuła innej rasy.
 */
export function matchChapterLocations(
  index: LocationIndex,
  names: readonly string[],
  known: ReadonlySet<number> = new Set(),
): LocationMatch[] {
  const matches: LocationMatch[] = names.map((n) => ({ ...index.candidates(n) }));
  for (const m of matches) {
    if (m.candidates.length === 1) m.id = m.candidates[0];
  }
  const anchors = matches.filter((m) => m.candidates.length === 1).map((m) => m.id!);
  const maxAnchor = anchors.length ? Math.max(...anchors) : Infinity;
  const anchorAround = (i: number, dir: -1 | 1): number | undefined => {
    for (let j = i + dir; j >= 0 && j < matches.length; j += dir) {
      const m = matches[j]!;
      if (m.candidates.length === 1) return m.id;
    }
    return undefined;
  };

  matches.forEach((m, i) => {
    const neighbours = [anchorAround(i, -1), anchorAround(i, 1)].filter(
      (x): x is number => x !== undefined,
    );
    const distance = (id: number) =>
      neighbours.length ? Math.min(...neighbours.map((n) => Math.abs(n - id))) : 0;

    if (m.candidates.length > 1) {
      const all = [...new Set(m.candidates)];
      const past = all.filter((id) => id <= maxAnchor);
      const pool = past.length ? past : all;
      const byDistance = [...pool].sort((a, b) => distance(a) - distance(b) || a - b);
      const nearest = byDistance[0]!;
      if (pool.length === 1) {
        m.id = nearest;
      } else if (neighbours.length && distance(nearest) <= NEAR) {
        m.id = nearest;
        if (byDistance.length > 1 && distance(byDistance[1]!) === distance(nearest)) {
          m.review = `Kilka lokacji o tej nazwie (${byDistance.join(', ')}) w tej samej odległości – wybrano ${m.id}, sprawdź`;
        }
      } else {
        const familiar = byDistance.filter((id) => known.has(id));
        m.id = familiar[0] ?? nearest;
        if (familiar.length !== 1) {
          m.review = `Kilka lokacji o tej nazwie (${byDistance.join(', ')}) – wybrano ${m.id}, sprawdź`;
        }
      }
    }
    if (m.id === undefined) {
      m.review = 'Nie znaleziono lokacji o tej nazwie na liście – podaj ID';
      return;
    }
    if (m.method === 'literówka' || m.method === 'zawiera') {
      m.review = `Dopasowano przybliżenie (${m.method}): „${index.name(m.id)}” (ID ${m.id}) – sprawdź`;
    }
    // ID tuż obok sąsiednich lokacji w fabule potwierdza dopasowanie
    m.nearAnchor = neighbours.length > 0 && distance(m.id) <= 3;
  });
  return matches;
}
