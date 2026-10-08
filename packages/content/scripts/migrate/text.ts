/** Narzędzia tekstowe migracji: rozpoznawanie linii solucji i normalizacja zapisu. */

/** BOM i twarda spacja tworzone z kodów – narzędzia edycji zamieniają escape'y na niewidoczne znaki. */
export const BOM_RE = new RegExp(`^${String.fromCharCode(0xfeff)}`);
export const NBSP_RE = new RegExp(String.fromCharCode(0xa0), 'g');

export const DONE_RE = /^\s*✓?\s*Wykonane\s*$/;

/** `(Płacę)Wymagania:` – nawias przed prefiksem to wybrany wariant dialogu, zostawiamy go. */
const REQ_PREFIX_RE = /^\s*(\([^)]*\)\s*)?Wymagani[ae]\s*:?\s*/i;
const REWARD_PREFIX_RE = /^\s*(?:Za\s+[\d\s]+\s+)?Nag(?:roda|orda|oda|rda)\s*:\s*/i;
/** „Nagroda 750 ZENI”, „NagrodaSakwa…”, „Nagroda5 …” – bez dwukropka. */
const REWARD_LOOSE_RE = /^\s*Nag(?:roda|orda|oda)(?=\s|[\p{Lu}\d])\s*/u;

/** Linie wymagań, które autorzy zapisali bez prefiksu „Wymagania:”. */
const REQ_VERB_RE =
  /^\s*(?:Pokona[jć]|Wykona[jć]|Wykonane|Zdoby[ćt]e?|Zdobądź|Zbierz|Oddaj|Opanować|Osiągnąć|Zaczekać|Spędzone|Wpisane|Wytrenu[jć]|Wytrenowana|Wygrane|Udaj się na wyprawy|Zapłaci[ćc]|Wykorzystane|Rozwiąż|Ulepsz|Wymagane odrodzenie|Wymagany poziom|Poziom (?:arenowy|umiejętności|Osiągnięcia)|Limit Kart|Wydropione|Pokonani przeciwnicy|PA równe|Aktywny SSJ|Wkład PU)(?![\p{L}\p{N}])/iu;

/** Przedmiot z ilością na końcu („Diabelski Klejnot x500”) – nagroda bez prefiksu. */
const ITEM_QTY_RE = /\sx\s?\d[\d ]*$/;

export type LineKind = 'requirement' | 'reward' | 'text';

export function classifyLine(line: string): { kind: LineKind; text: string } {
  const t = line.trim();
  if (REWARD_PREFIX_RE.test(t))
    return { kind: 'reward', text: t.replace(REWARD_PREFIX_RE, '').trim() };
  const req = REQ_PREFIX_RE.exec(t);
  if (req) {
    const rest = t.slice(req[0].length).trim();
    // „Wymagania: Nagroda: …” – literówka w Cumber.txt
    if (REWARD_PREFIX_RE.test(rest))
      return { kind: 'reward', text: rest.replace(REWARD_PREFIX_RE, '').trim() };
    const variant = req[1]?.trim();
    return { kind: 'requirement', text: variant ? `${variant} ${rest}` : rest };
  }
  if (REQ_VERB_RE.test(t)) return { kind: 'requirement', text: t };
  if (REWARD_LOOSE_RE.test(t))
    return { kind: 'reward', text: t.replace(REWARD_LOOSE_RE, '').trim() };
  if (ITEM_QTY_RE.test(t)) return { kind: 'reward', text: t };
  return { kind: 'text', text: t };
}

/** Usuwa z nagrody prywatne liczby autora, np. `[ +2 395 107 219 337 560]`. */
export function cleanReward(text: string): string {
  return text.replace(/\s*[[{]\s*\+\s*[\d\s]+\]/g, '').trim();
}

const PROGRESS_RE = /((?:\d+ )*\d+) ?(?:kk|KK)? ?\/(?= ?x? ?\d)/g;

/**
 * Zeruje postęp autora w wymaganiu: `Osiągnąć poziom: 52/55` → `0/55`, `Oddaj PSK 38 125/14 000`
 * → `0/14 000`. Liczby mają spację jako separator tysięcy, więc z cyfr przed „/” bierzemy tylko
 * najdłuższą poprawną liczbę od prawej (`instancje numer 1 2/2` → `numer 1 0/2`).
 */
export function zeroProgress(text: string): string {
  return text.replace(NBSP_RE, ' ').replace(PROGRESS_RE, (_m, digits: string) => {
    const groups = digits.split(' ');
    let start = groups.length - 1;
    while (start > 0 && groups[start]!.length === 3 && groups[start - 1]!.length <= 3) start--;
    const kept = groups.slice(0, start).join(' ');
    return `${kept ? `${kept} ` : ''}0/`;
  });
}

/** Porządkuje drobny zapis: spacje, odstęp po dwukropku po słowie, „( ” i „ )”. */
export function tidy(text: string): string {
  return text
    .replace(NBSP_RE, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+:/g, ':')
    .replace(/(?<=[\p{L})\]])(:)(?=\S)/gu, ': ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

const LOWER_WORDS = new Set([
  'i',
  'w',
  'z',
  'na',
  'do',
  'dla',
  'od',
  'po',
  'za',
  'o',
  'u',
  'we',
  'ze',
  'ku',
  'oraz',
  'lub',
  'a',
  'bez',
  'pod',
  'nad',
  'przed',
  'przy',
  'nie',
  'się',
  'jak',
  'to',
]);
const SPECIAL_WORDS: Record<string, string> = { PVP: 'PvP', PVM: 'PvM', XD: 'xD' };
const KEEP_UPPER_RE = /^(?:SSJ\d?|SSJB|UI|PSK|KK|PA|HP|SC|NPC|EXP|TP|CC|KP|PU|PZ|LV\d*|LVL\d*)$/;
const ROMAN_RE = /^(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})$/;

function isAllCaps(text: string): boolean {
  return /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);
}

/**
 * Ujednolica nazwy zapisane WIELKIMI LITERAMI do stylu gry („Kopalnia Kryształów”).
 * Nazwy z małymi literami zostają bez zmian. Liczby rzymskie i skróty (SSJ, PSK, PvP) zostają.
 */
export function normalizeCase(text: string): string {
  if (!isAllCaps(text)) return text;
  const tokens = text.split(/(\s+|[-–—/()[\],.:'’"]+)/);
  const words = tokens.filter((t) => /\p{L}/u.test(t));
  const lastWord = words[words.length - 1];
  let wordIndex = 0;
  return tokens
    .map((tok) => {
      if (!/\p{L}/u.test(tok)) return tok;
      const isFirst = wordIndex === 0;
      wordIndex++;
      const special = SPECIAL_WORDS[tok];
      if (special) return special;
      if (KEEP_UPPER_RE.test(tok)) return tok;
      if (ROMAN_RE.test(tok) && (tok !== 'I' || tok === lastWord)) return tok;
      const lower = tok.toLocaleLowerCase('pl');
      if (!isFirst && LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('pl') + lower.slice(1);
    })
    .join('');
}

const PL_MAP: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

export function slugify(text: string, maxLength = 60): string {
  const base = text
    .toLocaleLowerCase('pl')
    .replace(/[ąćęłńóśźż]/g, (c) => PL_MAP[c] ?? c)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= maxLength) return base || 'x';
  return base.slice(0, maxLength).replace(/-[^-]*$/, '') || base.slice(0, maxLength);
}

/** Klucz do porównywania nazw lokacji: bez wielkości liter, z ujednoliconymi myślnikami i spacjami. */
export function foldName(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[’`]/g, "'")
    .replace(/\s*[-–—]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/g, '')
    .trim()
    .toLocaleLowerCase('pl');
}

/** Jak foldName, ale dodatkowo bez polskich znaków – do dopasowań przybliżonych. */
export function foldLoose(text: string): string {
  return foldName(text)
    .replace(/[ąćęłńóśźż]/g, (c) => PL_MAP[c] ?? c)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}
