# Prompty do Claude Code – Kosmiczny Przewodnik

Jak używać:
- `CLAUDE.md` i folder `fixtures/` muszą leżeć w katalogu głównym projektu, zanim zaczniesz. Claude Code czyta `CLAUDE.md` sam.
- Wklejaj **jeden prompt naraz**. Po każdym sprawdź wynik (czy działa, czy testy przechodzą), dopiero potem następny.
- Jeśli coś pójdzie nie tak, napisz Claude Code wprost, co nie działa – nie wklejaj od nowa całego promptu.

---

## Prompt 1 – inwentaryzacja treści i szkielet repo

```
Przeczytaj CLAUDE.md. Zanim cokolwiek zmienisz:

1. Przejrzyj cały folder projektu i zrób inwentaryzację istniejących solucji i poradników: jakie pliki, jaki format, jaka struktura, jakie informacje zawierają (lokacje, zadania, reborny, rasy, kroki, nagrody, autorzy). Pokaż mi podsumowanie i 2–3 reprezentatywne przykłady.
2. Zaproponuj schemat treści (zod) dopasowany do tego, co już mam, z polami potrzebnymi do automatycznego wykrywania:
   - locations: { id (= data-loc z gry), name, reborn, aliases?, notes? }
   - quests: { slug (stabilny, nasz), name, locId, kind: "main"|"side", races?: number[] (brak = wszystkie), rebornMin?, rebornMax?, requires?: slug[], steps: [{ title, body (markdown) }], rewards?, tips?, sourceCredit }
   - guides: poradniki markdown z tagami i sourceCredit.
   Wskaż, czego w mojej treści brakuje (np. ID lokacji), i zaproponuj, jak to uzupełnić.
3. Przedstaw plan struktury monorepo i migracji. POCZEKAJ na moją akceptację.

Po akceptacji:
- monorepo pnpm z workspace'ami z CLAUDE.md, wspólny tsconfig, eslint + prettier, vitest, .gitignore,
- packages/content ze schematami, skrypt migracji moich plików do nowego formatu (oryginały zostają nietknięte),
- `pnpm content:build`: walidacja (czytelne błędy ze ścieżką), unikalność slugów, poprawność requires i locId, generowanie dist/content/*.json + manifest.json z wersją i hashami,
- raport migracji: co przeszło, co wymaga mojej ręcznej poprawki.
```

## Prompt 2 – logika (packages/core)

```
Przeczytaj CLAUDE.md. Zbuduj packages/core (bez DOM w logice; parsery przyjmują element/Document, w testach jsdom):

1. Typy postaci, treści i postępu.
2. normalizeQuestName(): trim, wielokrotne spacje → jedna, ujednolicenie wielkości liter i dopisków [LVx]/[III] (dopisek zostaje częścią klucza, w znormalizowanej formie).
3. parseTeleportList(root) → [{ locId, name, reborn, hasQuest, isCurrent }].
4. parseQuestLog(root) → [{ qid, name, stage, locId, locName, isMain, isTracked }].
5. computeStatuses(content, character, scan) wg reguł statusów z CLAUDE.md. Scan: { at, lokalizatorActive, teleports?, questLog? }. Bez aktywnego lokalizatora NIE wnioskuj "done" z braku QUEST. Zadania z dziennika bez odpowiednika w treści zwróć jako "unmatched".
6. filterForCharacter(content, race, reborn): co dotyczy postaci teraz i co jest przed nią.
7. Model postępu: { version, settings, characters: { [charKey]: { name, race, reborn, lastLoc, lastSeen, lastScan, quests: { [slug]: { status, source, at } } } } }.
8. mergeProgress(a, b): last-write-wins per zadanie i per pole (nie cały dokument), deterministyczne i przemienne.

Testy vitest na fixtures/tp_list.html i fixtures/qb_list.html oraz przypadki: brak lokalizatora, "Rutyna" w lokacjach 1338 i 1358, końcowe spacje, zadanie główne, nieśledzone zadanie, ręczne nadpisanie vs auto, konflikty w merge. Uruchom testy i pokaż wynik.
```

## Prompt 3 – wspólne UI (packages/ui)

```
Przeczytaj CLAUDE.md. Zbuduj packages/ui w Preact z montowaniem w Shadow DOM (funkcja mount(host, props)).

Widoki:
- "Tutaj": solucja dla bieżącej lokacji (zadania, kroki, wskazówki, status każdego zadania).
- "Postęp": zadania postaci pogrupowane po rebornie i lokacji, filtry (do zrobienia / w trakcie / zrobione / przed tobą), ręczne odhaczanie, "przywróć auto" przy ręcznym nadpisaniu.
- "Przed tobą": nadchodzące lokacje i zadania wg rebornu.
- "Poradniki": wyszukiwarka po guides.
- "Postacie": lista śledzonych postaci, przełączanie, wyłączanie śledzenia.
- "Ustawienia": kod synchronizacji, eksport/import JSON, motyw.

Ciemny motyw domyślny, czytelny w wąskim panelu (~380px) i na telefonie. Markdown renderowany bezpiecznie (bez surowego HTML). UI nie zna źródła danych: dostaje content, stan postępu i callbacki. Dodaj stronę deweloperską (vite dev) z moją prawdziwą treścią i przykładowym postępem do podglądu.
```

## Prompt 4 – userscript (apps/userscript)

```
Przeczytaj CLAUDE.md. Najpierw plan, potem zbuduj apps/userscript z vite-plugin-monkey:

1. @match dla kosmiczni.pl i subdomen, @grant none (działamy w kontekście strony, GAME dostępne bezpośrednio), @updateURL/@downloadURL na GitHub Pages.
2. Adapter gry – jedyny moduł dotykający GAME: czeka aż GAME będzie dostępne, co 2 s czyta WYŁĄCZNIE pola z białej listy, emituje zdarzenia: brak postaci, zmiana postaci, zmiana lokacji, zmiana stanu lokalizatora. Wszystko w try/catch.
3. Obserwator DOM (MutationObserver): gdy pojawi się lub zmieni #tp_list albo #qb_list, parsuje parserami z core i zapisuje skan. Nic nie klika.
4. Kreator skanu w panelu: (a) wybierz postać, (b) lokalizator – pokaż ile zostało albo wyjaśnij, że bez niego wykrywanie nie działa, (c) "otwórz Teleportacje", (d) "otwórz Dziennik zadań", (e) podsumowanie: ile zadań zrobione / w trakcie / do wzięcia + lista "unmatched".
5. Nowa postać → "Śledzić tę postać?" (tak / nie / zawsze śledź nowe), zapis w settings.
6. Panel wysuwany z boku, pozycja i stan zapamiętane, nie zasłania kluczowych elementów gry, skrót klawiszowy pokaż/ukryj.
7. Treść z GitHub Pages (manifest + cache w localStorage, offline na ostatniej wersji). W trybie dev – treść lokalna.
8. Postęp zapisywany lokalnie (klucze z prefiksem projektu).

Na koniec instrukcja ręcznego testu w grze krok po kroku (jak zainstalować wersję dev w Tampermonkey).
```

## Prompt 5 – synchronizacja (apps/worker)

```
Przeczytaj CLAUDE.md. Najpierw plan, potem zbuduj apps/worker (Cloudflare Workers + KV, wrangler) i klienta sync w core:

API:
- POST /v1/codes → nowy kod synchronizacji (≥128 bitów losowości, czytelny format typu KOSMO-XXXX-XXXX-XXXX-XXXX bez mylących znaków).
- GET /v1/sync/:code → dokument + ETag.
- PUT /v1/sync/:code z If-Match → przy konflikcie 412 + aktualna wersja; klient scala mergeProgress i ponawia.
Zabezpieczenia: w KV klucz = hash kodu (nie sam kod), limit 256 KB, walidacja schematem, rate limiting per IP, CORS tylko dla kosmiczni.pl i naszej PWA, brak logowania treści.

Klient: sync w tle po zmianie (debounce) i przy starcie, status w UI (zsynchronizowano / offline / błąd), "połącz z istniejącym kodem" (scalanie, nie nadpisywanie), "odłącz". Eksport/import JSON jako zapas.

Testy workera (vitest + miniflare) i instrukcja wdrożenia krok po kroku dla kogoś, kto pierwszy raz używa Cloudflare.
```

## Prompt 6 – PWA na telefon (apps/pwa)

```
Przeczytaj CLAUDE.md. Zbuduj apps/pwa (Vite + vite-plugin-pwa) na packages/ui:

- Instalowalna (manifest, ikony, ekran startowy), offline (service worker cache'uje aplikację i treść; aktualizacja treści w tle z komunikatem "nowa wersja solucji").
- Pierwsze uruchomienie: "Wpisz kod synchronizacji z gry" albo "Używaj bez synchronizacji".
- Po synchronizacji otwiera się na ostatnio widzianej postaci i lokacji (lastLoc z PC). Gdy śledzona jest jedna postać, pomija ekran wyboru.
- Bez synchronizacji: ręczne dodanie postaci (rasa + reborn).
- Ręczne odhaczanie, duże elementy dotykowe, dolny pasek nawigacji.
- Deploy na GitHub Pages pod /app.
```

## Prompt 7 – wydanie

```
Przeczytaj CLAUDE.md. Przygotuj wydanie:

1. GitHub Actions: lint + testy + content:build na każdym PR; na main: build treści, PWA i userscriptu i publikacja na GitHub Pages (content/, app/, kosmiczny-przewodnik.user.js). Automatyczne wersjonowanie userscriptu.
2. README dla graczy: co to jest, instalacja na PC (Tampermonkey/Violentmonkey) i telefonie (PWA), jak działa skan i lokalizator, sekcja "Prywatność": dokładna lista czytanych pól, co trafia do synchronizacji, czego skrypt nigdy nie robi, informacja o zgodzie twórcy gry.
3. CONTRIBUTING.md: jak dodać solucję (format, walidacja, sourceCredit), szablon PR.
4. Przejrzyj całość pod kątem zasad z CLAUDE.md i wypisz odstępstwa.
5. Powiedz mi krok po kroku, co mam kliknąć na GitHubie, żeby włączyć Pages.
```

## Prompt 8 – dodawanie kolejnych solucji (używaj wielokrotnie)

```
Przeczytaj CLAUDE.md i schematy w packages/content. Poniżej wklejam (albo wskazuję plik) nową solucję. Przekształć ją na nasz format: dopasuj locId po nazwie lokacji (jeśli jej nie ma w locations – dodaj i oznacz do weryfikacji), nadaj stabilne slugi, ustaw races/rebornMin/rebornMax/requires, wpisz sourceCredit. Uruchom content:build i napraw błędy. Na koniec wypisz wszystko, czego nie byłeś pewien.

Autor/źródło: [WPISZ]
[TU WKLEJ SOLUCJĘ albo podaj ścieżkę pliku]
```
