/** Twarda spacja z kodu – edytory potrafią zamienić escape na niewidoczny znak. */
const NBSP_RE = new RegExp(String.fromCharCode(0xa0), 'g');
const TRUNCATED_RE = /(?:\.\.\.|…)\s*$/;

/** Gra skraca długie nazwy w panelu postępów do „...”. */
export function isTruncatedName(name: string): boolean {
  return TRUNCATED_RE.test(name);
}

/**
 * Klucz do porównywania nazw zadań: bez końcowych spacji i kropek, pojedyncze spacje, małe litery,
 * jednolite myślniki. Dopiski zostają częścią klucza w jednej formie: `[LV2]`, `[ LVL 2 ]` → `[lv2]`,
 * `[III]` → `[iii]` – „Wymiana substancji [LV2]” i „[LV3]” to różne zadania.
 */
export function normalizeQuestName(name: string): string {
  return name
    .normalize('NFC')
    .replace(NBSP_RE, ' ')
    .replace(TRUNCATED_RE, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\[\s*lvl?\s*(\d+)\s*\]/gi, '[lv$1]')
    .replace(/\[\s*([ivx]+)\s*\]/gi, '[$1]')
    .trim()
    .replace(/[.\s]+$/, '')
    .toLocaleLowerCase('pl');
}

const PART_SUFFIX_RE = /\s+(?:\[lv\d+\]|\[[ivx]+\]|[ivx]+|\d+)$/;

/**
 * Nazwa bez numeru części – długie zadania dostają w grze kolejne części („Hakaishin II”,
 * „Pamiątka 2”, „Wymiana [III]”), a solucja często podaje samą nazwę.
 */
export function questBaseName(name: string): string {
  return normalizeQuestName(name).replace(PART_SUFFIX_RE, '');
}

/** „Teleport - Hiper Kuźnia” → „teleport”: autor solucji dopisał cel po myślniku. */
export function nameBeforeDash(name: string): string | undefined {
  const n = normalizeQuestName(name);
  const i = n.indexOf(' - ');
  return i > 0 ? n.slice(0, i) : undefined;
}

/** Nazwa z gry pasuje do nazwy z treści (z obsługą nazw skróconych do „...”). */
export function sameQuestName(fromGame: string, fromContent: string): boolean {
  const content = normalizeQuestName(fromContent);
  const game = normalizeQuestName(fromGame);
  return isTruncatedName(fromGame) ? content.startsWith(game) : content === game;
}
