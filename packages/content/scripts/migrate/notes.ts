/**
 * Upraszczanie luźnego tekstu autorów: nawigacja w trybie rozkazującym, jednolity zapis wyborów
 * w dialogach, etykiety („Uwaga:”) sklejone z treścią, bez powtórzeń.
 */
import { foldLoose, levenshtein, normalizeCase } from './text';

/** Zdania, których nie da się uprościć regułami – zamiana 1:1 (null = usuń). */
const EXACT: Record<string, string | null> = {
  'Nagroda to punkty PvM zależna od naszego aktualnego poziomu doświadczenia':
    'Punkty PvM (zależne od poziomu doświadczenia)',
  'Nagroda to punkty PVP zależna od naszego aktualnego poziomu doświadczenia':
    'Punkty PvP (zależne od poziomu doświadczenia)',
  'Nagroda jest losowa (Może to być kk, skrzynie, senzu itp.)': 'Losowa: kk, skrzynie, senzu itp.',
  'Nagroda jest losowa i zależna od ilości oddanych substancji (Może to być kk, skrzynie, senzu itp.)':
    'Losowa, zależna od liczby oddanych substancji: kk, skrzynie, senzu itp.',
  'to punkty PvM zależna od naszego aktualnego poziomu doświadczenia':
    'Punkty PvM (zależne od poziomu doświadczenia)',
  'to punkty PVP zależna od naszego aktualnego poziomu doświadczenia':
    'Punkty PvP (zależne od poziomu doświadczenia)',
  'jest losowa (Może to być kk, skrzynie, senzu itp.)': 'Losowa: kk, skrzynie, senzu itp.',
  'jest losowa i zależna od ilości oddanych substancji (Może to być kk, skrzynie, senzu itp.)':
    'Losowa, zależna od liczby oddanych substancji: kk, skrzynie, senzu itp.',
  '[Od tego momentu nasze zadanie zaczyna nas cofać na poprzednie lokacje]':
    'Od tego momentu zadanie cofa na poprzednie lokacje.',
  'Jest to lokacja, z której otrzymujemy dodatkowe osiągnięcia':
    'W tej lokacji zdobywasz dodatkowe osiągnięcia.',
  'W zadaniach gdzie mamy wybór przedstawie oba warianty':
    'W zadaniach z wyborem opisane są oba warianty.',
  'Pomijam np. inną ilość poziomów do zdobycia itp.': null,
  'Znane inne warianty w zadaniach losowych, zmieniające całkowicie zadanie.':
    'Zadania losowe mają też inne warianty, które całkowicie zmieniają zadanie (różnice typu inna liczba poziomów są pominięte).',
  'Informacja o wariantach': null,
  'Parę Dialogów': 'Kilka dialogów.',
  'Zatwierdzamy kilka dialogów.': 'Zatwierdź kilka dialogów.',
  'Tego nie ma': 'Tego etapu nie ma.',
  'Jeżeli zadanie będzie zmienone, a będę znał jego inny wariant zostanie to tu opisane':
    'Znane inne warianty zadania są opisane poniżej.',
  'Wybrałem 11, bo mam 11 poziom areny. Lepiej odpowiedzieć z prawdą, bo długo będzie się robiło to zadanie.':
    'Odpowiedz zgodnie z prawdą (autor: 11) – inaczej zadanie będzie trwało długo.',
  'Wybrałem łatwy, bo nagroda jest taka sama za każdy rodzaj trudności':
    'Wybierz łatwy – nagroda jest taka sama na każdym poziomie.',
  'tylko trudny, na łatwym oddaje się redki': 'Tylko trudny – na łatwym oddaje się Red Senzu.',
  'Ale wciąż działa losowość, zamiast 4x instancja nr 4 dostałem 30 wypraw':
    'Losowość nadal działa – autor zamiast 4x instancji nr 4 dostał 30 wypraw.',
  'Po wybraniu pomagam, musimy wykonać 14 instancji':
    'Po wybraniu „pomagam” trzeba wykonać 14 instancji.',
  'Do wyboru są również pozostałe żywioły, od tego zależey później nasza nagroda':
    'Do wyboru są też pozostałe żywioły – od wyboru zależy nagroda:',
  'Może się nie powieść wtedy znowu oddajemy ZENI':
    'Może się nie powieść – wtedy oddaj ZENI ponownie.',
  'Tutaj oddajemy określoną ilość punktów pvm to zależy ile chcemy oddać':
    'Oddajesz wybraną liczbę punktów PvM.',
  'Ja wybrałem 500k': 'Autor wybrał: 500k',
  'Smocza Podróż': null,
  'KONIEC FABUŁY H': 'Koniec fabuły Hborn.',
  'Koniec zadania': 'Koniec zadania.',
};

/** Komentarze wycięte z nazw zadań/lokacji (nawiasy) – uproszczenia lub usunięcie (null). */
const NAME_NOTES: Record<string, string | null> = {
  'fajny troll hehe': null,
  koniec: null,
  codzienne: null,
  poboczne: 'Lokacja poboczna.',
  'To zadanie można wykonywać w nieskończoność': 'Można powtarzać bez końca.',
  'Zadanie można powtarzać.': 'Można powtarzać bez końca.',
  'To zadanie moim zdaniem nie opłacalne, bo na lokacji Sborna w innym zadaniu można zrobić szybciej i mniej zasobów pobiera':
    'Nieopłacalne – na Sbornie inne zadanie daje to szybciej i taniej.',
  'Z tej lokacji nie można się teleportować': 'Z tej lokacji nie można się teleportować.',
  'teleport po lewej stronie': 'Teleport po lewej stronie.',
  'teleport po prawej stronie': 'Teleport po prawej stronie.',
};

/** 1. os. l. mn. → tryb rozkazujący (2. os. l. poj.). */
const VERBS: [RegExp, string][] = [
  [/\bidziemy\b/giu, 'idź'],
  [/\budajemy się\b/giu, 'idź'],
  [/\bwrac(?:a)?my\b/giu, 'wróć'],
  [/\bteleportujemy się\b/giu, 'teleportuj się'],
  [/\bprzenosimy się\b/giu, 'przenieś się'],
  [/\bużywamy\b/giu, 'użyj'],
  [/\bszukamy\b/giu, 'szukaj'],
  [/\bpodnosimy\b/giu, 'podnieś'],
  [/\boddajemy\b/giu, 'oddaj'],
  [/\bpowtarzamy\b/giu, 'powtórz'],
  [/\bdostajemy\b/giu, 'dostajesz'],
  [/\botrzymujemy\b/giu, 'otrzymujesz'],
  [/\bzatwierdzamy\b/giu, 'zatwierdź'],
  [/\bwchodzimy\b/giu, 'wejdź'],
  [/\bmusimy\b/giu, 'musisz'],
  [/\bchcemy\b/giu, 'chcesz'],
  [/\bmamy\b/giu, 'masz'],
  [/\bjesteśmy\b/giu, 'jesteś'],
  [/\bznaleźliśmy\b/giu, 'znalazłeś'],
  [/\bznajduję się\b/giu, 'znajduje się'],
  [/\bproponuje\b/giu, 'proponuję'],
  [/\b(?:Lokacji|Lokcji)\b/gu, 'lokacji'],
  [/\bDo lokacji\b/gu, 'do lokacji'],
  [/\bna Północ\b/gu, 'na północ'],
];

/** Etykiety, które łączymy z następną linią. */
const LABELS: [RegExp, string | null][] = [
  [/^Uwaga!*$/i, 'Uwaga:'],
  [/^Alternatywny wariant$/i, 'Inny wariant:'],
  [/^Informacja dodatkowa$/i, null],
  [/^Bonusy lokacji$/i, 'Bonusy lokacji:'],
];

// \b w JS nie widzi polskich liter – zamieniamy granice słów na wersję z \p{L}.
const VERBS_U: [RegExp, string][] = VERBS.map(([re, to]) => [
  new RegExp(
    re.source.replace(/^\\b/, '(?<![\\p{L}\\p{N}])').replace(/\\b$/, '(?![\\p{L}\\p{N}])'),
    re.flags,
  ),
  to,
]);

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pl') + text.slice(1);
}

/** Wielka litera tylko na początku zdania – „Lokacji” w środku zdania ma być małą. */
function replaceVerb(text: string, re: RegExp, to: string): string {
  return text.replace(re, (m: string, ...args: unknown[]) => {
    const offset = args[args.length - 2] as number;
    return offset === 0 && /^\p{Lu}/u.test(m) ? capitalize(to) : to;
  });
}

/** Nazwy lokacji WIELKIMI LITERAMI w zdaniu nawigacji → styl gry. */
function normalizeLocationsInText(text: string): string {
  return text.replace(
    /(lokacji|na|do)\s+([\p{Lu}\d][\p{Lu}\d\s\-–'’]*[\p{Lu}\d])(?=\s*(?:\(|,|\.|$|\si\s))/gu,
    (m, pre: string, name: string) =>
      /\p{Lu}{2,}/u.test(name) ? `${pre} ${normalizeCase(name)}` : m,
  );
}

/** Nagrody opisane zdaniem („Nagroda to punkty PvM zależna od…”) – ta sama tabela zamian. */
export function simplifyReward(text: string): string {
  const t = text.trim();
  return t in EXACT ? (EXACT[t] ?? t) : t;
}

/** Upraszcza jedną linię. Zwraca null, gdy linię należy usunąć. */
export function simplifyLine(raw: string): string | null {
  const line = raw.trim();
  if (line in EXACT) return EXACT[line] ?? null;

  let t = line;
  // Wybory w dialogach
  t = t.replace(/^(?:Mamy|Masz)\s+wybór\s*:?\s*/iu, 'Wybór: ');
  t = t.replace(/^(?:Opcja wyboru|Do wyboru)\s*:?\s*/iu, 'Wybór: ');
  t = t.replace(/^Mamy pytanie\s+/iu, 'Pytanie: ');
  t = t.replace(/^(?:Ja\s+)?wy?brałem\s*:?\s*/iu, 'Autor wybrał: ');
  if (/^\(([^()]+)\)$/.test(t)) t = t.replace(/^\(([^()]+)\)$/, 'Wariant: $1');

  // Nawigacja i 1. osoba liczby mnogiej
  for (const [re, to] of VERBS_U) t = replaceVerb(t, re, to);
  t = normalizeLocationsInText(t);
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  t = capitalize(t);
  // Kropka na końcu zdań nawigacji
  if (
    /^(?:Idź|Wróć|Teleportuj|Przenieś|Szukaj|Podnieś|Wejdź|Zatwierdź|Teraz|Następnie|Po )/u.test(
      t,
    ) &&
    /[\p{L})]$/u.test(t)
  )
    t += '.';
  return t;
}

/** Upraszcza listę linii: etykiety sklejone z następną linią, bonusy w jednej linii, bez powtórzeń. */
export function simplifyLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  let pendingLabel: string | null = null;
  let bonus: string[] | null = null;

  const flushBonus = () => {
    if (bonus) out.push(`**Bonusy lokacji:** ${bonus.join('; ')}`);
    bonus = null;
  };

  for (const raw of lines) {
    const label = LABELS.find(([re]) => re.test(raw.trim()));
    if (label) {
      flushBonus();
      if (label[1] === 'Bonusy lokacji:') bonus = [];
      else pendingLabel = label[1];
      continue;
    }
    if (bonus && /^\d[\d\s]*\s*%/.test(raw.trim())) {
      bonus.push(raw.trim().replace(/(\d)\s+%/, '$1%'));
      continue;
    }
    flushBonus();
    const simple = simplifyLine(raw);
    if (simple === null) continue;
    const text = pendingLabel ? `**${pendingLabel}** ${simple}` : simple;
    pendingLabel = null;
    if (isNearDuplicate(simple, out)) continue;
    out.push(text);
  }
  flushBonus();
  return out;
}

const NAVIGATION_RE = /^(?:Idź|Wróć|Teleportuj|Przenieś|Udaj|Teraz|Następnie)/u;

/**
 * Ta sama treść była przed chwilą (także z literówką albo z etykietą „Uwaga:”). Nawigacji nie
 * ruszamy – „idź do X, wróć do Y” powtarza się celowo.
 */
function isNearDuplicate(text: string, previous: readonly string[]): boolean {
  if (NAVIGATION_RE.test(text)) return previous[previous.length - 1] === text;
  const key = foldLoose(text);
  return previous.slice(-3).some((p) => {
    const other = foldLoose(p.replace(/^\*\*[^*]+\*\*\s*/, ''));
    return other === key || (key.length > 20 && levenshtein(other, key) <= 3);
  });
}

/**
 * Usuwa linie, które już padły wcześniej w tym samym zadaniu (`seen` jest uzupełniane).
 * Autorzy kopiowali ostrzeżenia przeplecione z nagrodami, więc trafiały do kilku etapów.
 */
export function dropRepeated(lines: readonly string[], seen: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const body = line.replace(/^\*\*[^*]+\*\*\s*/, '');
    if (!NAVIGATION_RE.test(body)) {
      const key = foldLoose(body);
      if (seen.some((s) => s === key || (key.length > 20 && levenshtein(s, key) <= 3))) continue;
      seen.push(key);
    }
    out.push(line);
  }
  return out;
}

/** Komentarz z nazwy → wskazówka (null = pomiń). */
export function simplifyNameNote(note: string): string | null {
  const t = note.trim();
  if (t in NAME_NOTES) return NAME_NOTES[t] ?? null;
  const portal = /^(\d+)\s*\|\s*(\d+)$/.exec(t);
  if (portal) return `Portal [${portal[1]}|${portal[2]}].`;
  if (/^[NRGUSHM]\s?\d[\d ]*$/.test(t)) return `Wymagany poziom: ${t}.`;
  return capitalize(simplifyLine(t) ?? t);
}
