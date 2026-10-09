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
- `site/index.html` – strona startowa na GitHub Pages. Workflow `.github/workflows/pages.yml` publikuje na każdy push do main: `/` (strona), `/app/` (PWA), `/content/` (treść + manifest), `/kosmiczny-przewodnik.user.js` + `.meta.js`. `ci.yml` sprawdza pull requesty.

## Istniejąca treść

Solucje i poradniki napisane przez autora (część własna, część za zgodą autorów) są zmigrowane do `packages/content/data` (rozdziały JSON, `locations.json`, poradniki Markdown). Migrację autor zaakceptował – **źródłem prawdy jest teraz `packages/content/data`**:
- nie usuwaj i nie przepisuj treści bez pytania; poprawki rób w `data/`, a `pnpm content:build` musi przechodzić,
- oryginały TXT/PNG (`solucje/`, `poradniki/`) są tylko lokalnie u autora (w `.gitignore`) – `pnpm content:migrate --force` nadpisałby ręczne poprawki w `data/`, więc nie uruchamiamy go dla istniejących rozdziałów,
- nowe solucje dodajemy jako nowe rozdziały (Prompt 8),
- każda solucja ma pole `sourceCredit` (autor/źródło); puste = autor uzupełni.

## Twarde zasady

1. **Tylko odczyt.** Skrypt NIGDY nie klika, nie wysyła żądań do serwera gry, nie wywołuje funkcji gry, nie modyfikuje obiektu `GAME`. Jedyna ingerencja w DOM to własny panel (host z Shadow DOM przy krawędzi ekranu + mała zakładka „⋮” w rogu, gdy panel jest schowany). Bez wybranej postaci (`GAME` brak albo `GAME.char_id` 0) nie pokazujemy niczego.
2. **Biała lista danych.** Z `GAME` czytamy wyłącznie: `GAME.server`, `GAME.getTime()`, `GAME.char_id` (czy postać jest wybrana; dopisane 2026-10-08), `GAME.char_data.{id, name, race, reborn, loc, bonus18}` oraz `GAME.map_quests` (z każdego wpisu tylko `{qb_id, rtype, main, name}`; dopisane za zgodą autora 2026-10-08). Nigdy nie czytamy ani nie wysyłamy `login`, `captcha`, `sitekey`, `pid` ani innych pól.
3. **Local-first.** Wszystko działa offline, synchronizacja w tle.
4. **Błąd skryptu nie może zepsuć gry** – wszystko, co dotyka strony, w try/catch.
5. Teksty interfejsu po polsku.

## Dane gry

- Gdy postać nie jest wybrana (`GAME` nie istnieje, `GAME.char_id` = 0 albo brak, `GAME.char_data === undefined`) → panelu w grze nie ma wcale.
- Klucz postaci: `` `s${GAME.server}:c${GAME.char_data.id}` `` (np. `s18:c3465`). Gracz może mieć wiele postaci na serwerze i wiele serwerów; może też chcieć śledzić tylko jedną. Postać dodana ręcznie na telefonie (bez ID z gry): `s{serwer|0}:m{czas dodania}`. Usunięcie postaci = znacznik `removed` (postęp czyszczony, znacznik zostaje dla synchronizacji); gdy postać znowu pojawi się w grze, jest traktowana jak nowa.
- Rasy (`char_data.race`): 0 Goku, 1 Vegeta, 2 Gohan, 3 Trunks, 4 Broly, 5 Black, 6 Bardock, 7 Cumber.
- Reborny (`char_data.reborn`): 0 Nonborn, 1 Rborn, 2 Gborn, 3 Uborn, 4 Sborn, 5 Hborn, 6 Mborn. Litery w grze: R, G, U, S, H, M (`<span class="rN">`).
- `char_data.loc` = ID bieżącej lokacji (to samo ID co `data-loc` w teleportacjach i dzienniku).
- **Lokalizator** (wymagany do wykrywania zadań): aktywny gdy `char_data.bonus18 - GAME.getTime() > 0`; wynik w sekundach (≈86400 = 24 h).
- ID lokacji rosną w kolejności dodawania do gry (Nonborn/Rborn Goku najniższe, potem Gborn → Mborn; Cumber dodany niedawno ma wysokie ID). Fabuła wraca do dawnych lokacji – wtedy ID jest niższe niż reszta rozdziału, nigdy wyższe. Nonborn/Rborn każdej rasy ma własne lokacje (np. „Rajska Sala Treningowa” 54 to Goku, 215 inna rasa), od Gborn fabuła jest wspólna.
- Część lokacji Nonborna jest wspólna dla kilku ras (Pałac Wszechmogącego 27, Dom 35, Głębia 84 …) – gra odblokowuje je np. Goku, Vegecie i Cumberowi. Zadania poboczne stamtąd mogą mieć postacie różnych ras (build daje im wszystkie rasy, chyba że kilka ras ma własny opis).

### Lista teleportacji – `#tp_list tr.loc2_option`
- `data-loc` = ID lokacji, `data-reborn` = reborn lokacji, `data-nazwa` = nazwa + nazwa potwora (nie używać do dopasowania),
- nazwa lokacji = tekst pierwszego `<td>` bez znacznika, po trim,
- `span.hasq1` („QUEST”) = w lokacji są niezrobione zadania,
- klasa `current` = bieżąca lokacja, klasa `fav` = ulubiona,
- klasa `travel_loc_XXXXX` i `data-loc` przycisku `set_fav_loc` to inne ID (wpis ulubionych), NIE ID lokacji.
- **Brak `hasq1` oznacza „wszystko zrobione” TYLKO gdy lokalizator jest aktywny.** Bez lokalizatora nie wnioskujemy nic.
- Lokacja nieobecna na liście = jeszcze nieodkryta (to jest „przed tobą”), **z wyjątkiem lokacji bez teleportu** – tych nigdy nie ma na liście (w treści `teleport: false`).
- Nad listą są pola „Szukaj” i „Reborn” – gdy gracz ich użył, lista jest przefiltrowana i z braku lokacji nic nie wnioskujemy (skan częściowy).

### Dziennik zadań – `#qb_list tr[id^="quest_log_tr"]`
- `data-qid` w przyciskach, nazwa `.qname`, etap `.grey`, lokacja = element `[data-option="go_teleport"]` (`data-loc` + tekst),
- `.qb_right` z tekstem „[ GŁÓWNE ]” = zadanie główne (nie ma przycisku forget_quest),
- przycisk `data-option="cancel_track"` = śledzone, `activate_track` = nieśledzone (wyszarzone „Aktywuj”, klasa `disabled` – zadanie nie jest w panelu postępów, ale nie jest skończone).
- `qid` to ID instancji u postaci, NIE identyfikator typu zadania – nie kluczujemy po nim treści.
- Nazwy powtarzają się między lokacjami („Rutyna” w 1338 i 1358), mają końcowe spacje i dopiski `[LV2]`, `[III]` → dopasowanie zawsze po **(locId + znormalizowana nazwa)**.
- Lokacja w dzienniku = lokacja, w której zadanie jest **teraz**. Zadania przechodzą między lokacjami; w solucji to kolejne sekcje z tym samym zadaniem.
- Długie zadania (główne co 100 kroków) dostają w grze kolejne części z numerem: „Hakaishin”, „Hakaishin II”…; podobnie „Pamiątka 2”. W solucji nazwa bywa bez numeru → zadanie główne dopasowujemy po lokacji, a numer części tolerujemy.
### Zadania na mapie bieżącej lokacji – `GAME.map_quests`
- Obiekt: klucz = pozycja na mapie (`"16_10"`), wartość = tablica `{qb_id, rtype, main, name}`. Dotyczy lokacji `GAME.char_data.loc`.
- Pokazuje zadania **w trakcie i jeszcze niewzięte**; zrobionych nie ma. Działa bez lokalizatora.
- `main: 1` = zadanie główne, `main: 0` = poboczne, `main: 0` + `rtype: 1` = codzienne.
- `qb_id` = `data-qid` z dziennika (`quest_log_tr629351`) = `track_quest_629351` w panelu postępów – łączymy po nim bez zgadywania.
- Zadanie na mapie, którego nie ma w dzienniku → do wzięcia. Zadanie tej lokacji z treści, którego nie ma na mapie → zrobione: **pewne** dla pobocznego z jedną lokacją (bez `alsoAt`, pierwsza część – bez `continues`), **niepewne** dla głównego (fabuła wraca na stare lokacje) i przechodzącego przez kilka lokacji. Codziennych z braku na mapie nie oznaczamy.
- Dowody się sumują: niepewne „zrobione” zmienia się w pewne, gdy potwierdzi je inne źródło (lokacja bez QUEST przy lokalizatorze, wcześniejszy pewny skan). Ręczne ustawienie zawsze wygrywa.
- Zadania codzienne (i powtarzalne) nie liczą się do postępu – fabuła = główne + poboczne.

### Panel „Postępy zadań” – `#quest_track_con .qtrack`
- `data-loc` elementu = lokacja zadania, nazwa w `<b>` – gra skraca długie nazwy do „...” (dopasowanie po początku nazwy); id elementu `track_quest_{qid}`.
- Pokazuje tylko śledzone zadania i nie każdy typ wymagań – źródło pomocnicze, główne to dziennik.

### Dopasowanie wpisu z gry do treści (sprawdzone na `fixtures/dziennik_s21.tsv`: 135/141, reszty nie ma w solucjach)
1. lokacja zadania (`locId` albo `alsoAt` – lokacje, do których zadanie przechodzi) + znormalizowana nazwa (też `aliases`); przy kilku trafieniach pierwszeństwo ma część, której główną lokacją jest ta z dziennika,
2. jw., ale bez numeru części („Hakaishin II” ↔ „Hakaishin”, `[LV2]`) albo nazwa z gry = część nazwy z solucji przed „ - ” („Teleport” ↔ „Teleport - Hiper Kuźnia”),
3. zadanie główne (`[ GŁÓWNE ]`) – po lokacji, nie po nazwie,
4. nazwa jednoznaczna w całej treści, mimo innej lokacji – dopasowanie „po nazwie” (mniej pewne, oznaczać w UI),
5. inaczej → `unmatched`.
- **Auto-wykrywanie nie musi być idealne.** Gdy nie ma pewności (dopasowanie „po nazwie”, brak lokalizatora, skan częściowy), nie zgadujemy – status `unknown` / „niepewne” i gracz sam oznacza, czy zrobił. Lepiej „nie wiem” niż błędne „zrobione”.
- Kolejne części zadania przechodzącego przez kilka lokacji są połączone przez `continues` (część B jest dalszym ciągiem A) – aktywna późniejsza część oznacza, że wcześniejsze są zrobione.
- `requires` („Wykonać zadanie: X” w krokach) **nie blokuje wzięcia** – w grze oba zadania bywają naraz w dzienniku („Panteon Anarchii” i „Panteon Anarchii II”). Wynika z niego tylko: zadanie zrobione ⇒ X zrobione.

Przykładowe dane: `fixtures/tp_list.html`, `fixtures/qb_list.html` (serwer 18, postać Hborn, lokalizator aktywny, bieżąca lokacja 1359), `fixtures/dziennik_s21.tsv` i `fixtures/postepy_s21.tsv` (serwer 21, postać Cumber na Hborn – eksport skryptem z konsoli).

## Statusy zadań (priorytet od góry)

1. `manual` – ręczne ustawienie gracza zawsze wygrywa (można cofnąć do auto).
2. `active` – zadanie jest w dzienniku.
3. `done` – lokacja widoczna w teleportacjach bez QUEST przy aktywnym lokalizatorze.
4. `available` – lokacja ma QUEST, a zadania nie ma w dzienniku.
5. `locked` – lokacja nieodkryta / reborn za niski / wcześniejsza część zadania (`continues`) nieskończona / dalej w fabule głównej.
6. `unknown` – brak danych.

Każdy status pamięta źródło (`auto`/`manual`) i znacznik czasu. Zadania z dziennika, których nie ma w solucjach, trafiają na listę `unmatched`.

## Skan (userscript)

Skaner tylko obserwuje (MutationObserver na pojawienie się `#tp_list` / `#qb_list`), nigdy nie klika za gracza. Kreator prowadzi gracza:
wybierz postać → sprawdź lokalizator → otwórz Teleportacje → otwórz Dziennik zadań → podsumowanie.
Kreator krok po kroku tylko dla postaci bez pełnego skanu; potem jedna zwinięta linia (skan i tak odświeża się w tle, gdy gracz otworzy Teleportacje albo Dziennik). Nie pokazujemy czasu lokalizatora – tylko aktywny/nieaktywny.

## Konwencje

- TypeScript strict, małe moduły, bez zbędnych zależności.
- Testy dla `packages/core` (vitest, jsdom dla parserów).
- Commit po każdym ukończonym etapie, opisowe wiadomości po polsku.
- Przed większą zmianą: krótki plan, potem kod.
