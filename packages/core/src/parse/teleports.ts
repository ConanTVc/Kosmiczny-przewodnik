import type { TeleportEntry } from '../types';

const ROW_SELECTOR = '#tp_list tr.loc2_option';

function toInt(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value);
}

/** Nazwa lokacji = tekst pierwszej komórki bez znacznika „QUEST”. */
function locationName(cell: Element): string {
  let text = '';
  for (const node of Array.from(cell.childNodes)) {
    if (node.nodeType === 1 && (node as Element).classList.contains('hasq1')) continue;
    text += node.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Lista teleportacji (`#tp_list tr.loc2_option`). `data-loc` wiersza to ID lokacji;
 * `travel_loc_XXX` i `data-loc` przycisku ulubionych to inne ID – nie używamy.
 * Wiersze z niepoprawnymi danymi są pomijane.
 */
export function parseTeleportList(root: ParentNode): TeleportEntry[] {
  const entries: TeleportEntry[] = [];
  for (const row of Array.from(root.querySelectorAll(ROW_SELECTOR))) {
    const locId = toInt(row.getAttribute('data-loc'));
    const cell = row.querySelector('td');
    if (locId === undefined || !cell) continue;
    entries.push({
      locId,
      name: locationName(cell),
      reborn: toInt(row.getAttribute('data-reborn')) ?? 0,
      hasQuest: cell.querySelector('.hasq1') !== null,
      isCurrent: row.classList.contains('current'),
      isFav: row.classList.contains('fav'),
    });
  }
  return entries;
}

function isHidden(el: Element): boolean {
  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  return (
    el.hasAttribute('hidden') ||
    style?.display === 'none' ||
    el.classList.contains('hidden') ||
    el.classList.contains('d-none')
  );
}

/**
 * Czy lista jest przefiltrowana (pola „Szukaj”/„Reborn” nad listą). Rozpoznajemy ukryte wiersze;
 * jeśli gra filtruje przez usuwanie wierszy, wołający musi to wykryć sam (np. po polu wyszukiwania).
 */
export function isTeleportListFiltered(root: ParentNode): boolean {
  return Array.from(root.querySelectorAll(ROW_SELECTOR)).some(isHidden);
}
