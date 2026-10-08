# Kosmiczny Przewodnik

Solucje, poradniki i tracker zadań do polskiej gry przeglądarkowej **Kosmiczni** (kosmiczni.pl, świat Dragon Ball).
Dla autora i dla innych graczy. Twórca gry zgodził się na narzędzie, które **czyta** dane gry.

## Architektura (monorepo pnpm, TypeScript strict, Vite)

- `packages/content` – treść solucji i poradników (JSON/Markdown) + schematy zod + walidator. Publikowana przez GitHub Pages jako statyczne pliki z `manifest.json` (wersja + hashe).
- `packages/core` – czysta logika bez DOM: typy, filtrowanie treści pod postać, parsery HTML gry, wyliczanie statusów zadań, model postępu, scalanie przy synchronizacji. Testy vitest.
- `packages/ui` – wspólny komponent UI w Preact, montowany w Shadow DOM (izolacja od CSS gry).
- `apps/userscript` – Tampermonkey/Violentmonkey (vite-plugin-monkey). Panel wstrzykiwany w grę na PC, automatyczne wykrywanie.
- `apps/pwa` – osobna aplikacja na telefon (instalowalna, offline). Bez dostępu do gry: postęp ręczny + dane z synchronizacji.
- `apps/worker` – Cloudflare Worker + KV, synchronizacja postępu kodem synchronizacji (bez kont).

## Istniejąca treść

W repo są już solucje i poradniki napisane przez autora (część własna, część za zgodą autorów). To jest **źródło prawdy**:
- nie usuwaj i nie przepisuj ich bez pytania,
- migracja do nowego formatu = kopia/konwersja skryptem, oryginały zostają do czasu mojej akceptacji,
- każda solucja ma pole `sourceCredit` (autor/źródło).

## Twarde zasady

1. **Tylko odczyt.** Skrypt NIGDY nie klika, nie wysyła żądań do serwera gry, nie wywołuje funkcji gry, nie modyfikuje obiektu `GAME`. Jedyna ingerencja w DOM to własny panel.
2. **Biała lista danych.** Z `GAME` czytamy wyłącznie: `GAME.server`, `GAME.getTime()`, `GAME.char_data.{id, name, race, reborn, loc, bonus18}`. Nigdy nie czytamy ani nie wysyłamy `login`, `captcha`, `sitekey`, `pid` ani innych pól.
3. **Local-first.** Wszystko działa offline, synchronizacja w tle.
4. **Błąd skryptu nie może zepsuć gry** – wszystko, co dotyka strony, w try/catch.
5. Teksty interfejsu po polsku.

## Dane gry

- Gdy postać nie jest wybrana, `GAME.char_data === undefined` → komunikat „Wybierz postać”.
- Klucz postaci: `` `s${GAME.server}:c${GAME.char_data.id}` `` (np. `s18:c3465`). Gracz może mieć wiele postaci na serwerze i wiele serwerów; może też chcieć śledzić tylko jedną.
- Rasy (`char_data.race`): 0 Goku, 1 Vegeta, 2 Gohan, 3 Trunks, 4 Broly, 5 Black, 6 Bardock, 7 Cumber.
- Reborny (`char_data.reborn`): 0 Nonborn, 1 Rborn, 2 Gborn, 3 Uborn, 4 Sborn, 5 Hborn, 6 Mborn. Litery w grze: R, G, U, S, H, M (`<span class="rN">`).
- `char_data.loc` = ID bieżącej lokacji (to samo ID co `data-loc` w teleportacjach i dzienniku).
- **Lokalizator** (wymagany do wykrywania zadań): aktywny gdy `char_data.bonus18 - GAME.getTime() > 0`; wynik w sekundach (≈86400 = 24 h).

### Lista teleportacji – `#tp_list tr.loc2_option`
- `data-loc` = ID lokacji, `data-reborn` = reborn lokacji, `data-nazwa` = nazwa + nazwa potwora (nie używać do dopasowania),
- nazwa lokacji = tekst pierwszego `<td>` bez znacznika, po trim,
- `span.hasq1` („QUEST”) = w lokacji są niezrobione zadania,
- klasa `current` = bieżąca lokacja, klasa `fav` = ulubiona,
- klasa `travel_loc_XXXXX` i `data-loc` przycisku `set_fav_loc` to inne ID (wpis ulubionych), NIE ID lokacji.
- **Brak `hasq1` oznacza „wszystko zrobione” TYLKO gdy lokalizator jest aktywny.** Bez lokalizatora nie wnioskujemy nic.
- Lokacja nieobecna na liście = jeszcze nieodkryta (to jest „przed tobą”).

### Dziennik zadań – `#qb_list tr[id^="quest_log_tr"]`
- `data-qid` w przyciskach, nazwa `.qname`, etap `.grey`, lokacja = element `[data-option="go_teleport"]` (`data-loc` + tekst),
- `.qb_right` z tekstem „[ GŁÓWNE ]” = zadanie główne (nie ma przycisku forget_quest),
- przycisk `data-option="cancel_track"` = śledzone, `activate_track` = nieśledzone.
- `qid` to ID instancji u postaci, NIE identyfikator typu zadania – nie kluczujemy po nim treści.
- Nazwy powtarzają się między lokacjami („Rutyna” w 1338 i 1358), mają końcowe spacje i dopiski `[LV2]`, `[III]` → dopasowanie zawsze po **(locId + znormalizowana nazwa)**.

Przykładowy HTML: `fixtures/tp_list.html`, `fixtures/qb_list.html` (serwer 18, postać Hborn, lokalizator aktywny, bieżąca lokacja 1359).

## Statusy zadań (priorytet od góry)

1. `manual` – ręczne ustawienie gracza zawsze wygrywa (można cofnąć do auto).
2. `active` – zadanie jest w dzienniku.
3. `done` – lokacja widoczna w teleportacjach bez QUEST przy aktywnym lokalizatorze.
4. `available` – lokacja ma QUEST, a zadania nie ma w dzienniku.
5. `locked` – lokacja nieodkryta / reborn za niski / niespełnione `requires`.
6. `unknown` – brak danych.

Każdy status pamięta źródło (`auto`/`manual`) i znacznik czasu. Zadania z dziennika, których nie ma w solucjach, trafiają na listę `unmatched`.

## Skan (userscript)

Skaner tylko obserwuje (MutationObserver na pojawienie się `#tp_list` / `#qb_list`), nigdy nie klika za gracza. Kreator prowadzi gracza:
wybierz postać → sprawdź lokalizator → otwórz Teleportacje → otwórz Dziennik zadań → podsumowanie.

## Konwencje

- TypeScript strict, małe moduły, bez zbędnych zależności.
- Testy dla `packages/core` (vitest, jsdom dla parserów).
- Commit po każdym ukończonym etapie, opisowe wiadomości po polsku.
- Przed większą zmianą: krótki plan, potem kod.
