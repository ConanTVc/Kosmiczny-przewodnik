# Raport migracji solucji i poradników

Wygenerowany przez `pnpm content:migrate`. Oryginały w `solucje/` i `poradniki/` są nietknięte.

## Podsumowanie

| Rozdział | Plik | Autor | Lokacje | Zadania (gł./pob./codz./powt.) | Etapy | requires | Do decyzji |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Nonborn – Goku | `goku-n.json` | BaronCorbin | 97 | 148 (90/54/4/0) | 314 | 3 | 0 |
| Rborn – Goku | `goku-r.json` | BaronCorbin | 38 | 47 (38/9/0/0) | 98 | 0 | 1 |
| Nonborn – Cumber | `cumber-n.json` | Naruto | 18 | 43 (18/21/4/0) | 99 | 1 | 0 |
| Rborn – Cumber | `cumber-r.json` | Naruto | 15 | 29 (15/14/0/0) | 58 | 0 | 0 |
| Gborn | `gborn.json` | _(pusty)_ | 129 | 189 (88/101/0/0) | 442 | 2 | 0 |
| Uborn | `uborn.json` | _(pusty)_ | 111 | 224 (112/103/8/1) | 569 | 7 | 1 |
| Sborn | `sborn.json` | _(pusty)_ | 104 | 278 (95/174/8/1) | 1271 | 7 | 1 |
| Hborn | `hborn.json` | _(pusty)_ | 238 | 751 (239/510/2/0) | 2842 | 83 | 0 |
| Mborn | `mborn.json` | _(pusty)_ | 110 | 384 (114/270/0/0) | 1970 | 54 | 2 |

Lokacje: 1508 z listy gry w `data/locations.json`, 810 z rebornem (użyte w solucjach albo w fixtures), 11 z aliasami nazw z solucji, 2 oznaczonych „bez teleportu”.

## Co zrobiła migracja

- Każdy rozdział to lokacje w kolejności fabuły (numeracja = kolejność), w każdej zadania główne i poboczne w jednolitym formacie.
- Lokacje dopasowane do ID z `lista_wszystkich_lokacji.txt` po nazwie; przy powtarzających się nazwach wybrane ID najbliższe sąsiednim lokacjom w fabule.
- Kolejne sekcje tej samej lokacji połączone; zadanie główne rozbite na kilka sekcji scalone w etapy.
- Wymagania/nagrody zaraz po nagłówku lokacji (bez nazwy zadania) = kontynuacja poprzedniego zadania w nowej lokacji.
- Usunięte „✓ Wykonane”, prefiksy „Wymagania:”/„Nagroda:”, postęp autora wyzerowany (`52/55` → `0/55`), prywatne liczby doświadczenia w nagrodach (`[ +2 395 …]`) usunięte.
- Nazwy pisane WIELKIMI LITERAMI ujednolicone do stylu gry (liczby rzymskie i skróty zostają).
- Luźny tekst uproszczony: nawigacja w trybie rozkazującym („Idź do lokacji…”), wybory jako „Wybór: … / Autor wybrał: …”, „Uwaga!!” sklejone z treścią, bonusy lokacji w jednej linii, bez powtórzeń.
- Komentarze w nawiasach przy nazwach przeniesione do wskazówek (`tips`) albo notatek lokacji.
- `requires` ustawione, gdy pierwszym wymaganiem jest „Wykonać zadanie: X”.

## Wymaga Twojej decyzji (5)

Te miejsca mają też pole `review` w danych – po sprawdzeniu usuń je.

- `Goku.txt:1194` – Lokacja „Lodowa Dolina Północ”: Dopasowano przybliżenie (zawiera): „Lodowa Dolina” (95) – sprawdź
- `Mborn.txt:942` – Zadanie „Strach Ma Wielkie Oczy”: Nie znaleziono zadania „Hakaishin IV” (z „Wykonać zadanie”) – requires nieustawione
- `Mborn.txt:1520` – Zadanie „Strach Ma Wielkie Oczy”: Nie znaleziono zadania „Strach ma Wielkie Oczy II” (z „Wykonać zadanie”) – requires nieustawione
- `Sborn.txt:717` – Lokacja „RAJSKA SALA TRENINGOWA”: ID 215 jest daleko od sąsiednich lokacji (670, 671) – sprawdź
- `Uborn.txt:391` – Lokacja „Dom”: ID 688 jest daleko od sąsiednich lokacji (397, 395) – sprawdź

## Do szybkiego przejrzenia (16)

Dopasowania przybliżone (literówki) i rzeczy informacyjne – prawdopodobnie poprawne.

- `Cumber.txt:165` – Lokacja „Planeta Eurilia z innej lini czasowej”: Dopasowano przybliżenie (literówka): „Planete Eurilia z innej lini czasowej” (1111) – sprawdź
- `Cumber.txt:180` – Lokacja „Planeta Eurilia z innej lini czasowej”: Dopasowano przybliżenie (literówka): „Planete Eurilia z innej lini czasowej” (1111) – sprawdź
- `Cumber.txt:250` – Lokacja „Między wymiarowa pustka”: Dopasowano przybliżenie (literówka): „Międzywymiarowa pustka” (1116) – sprawdź
- `Cumber.txt:411` – Lokacja „Planeta we wszechświecie jedenastym”: Dopasowano przybliżenie (literówka): „Planeta we wszechświecie jedynastym” (1122) – sprawdź
- `Gborn.txt:249` – Pominięto puste zadanie „Nowy wróg” (brak wymagań i nagród)
- `Goku.txt:341` – Lokacja „Siedziba Mistrzów”: ID 359 jest daleko od sąsiednich lokacji (27, 28) – sprawdź
- `Goku.txt:468` – Lokacja „Siedziba Pteodora”: Dopasowano przybliżenie (literówka): „Siedziba Pterodora” (34) – sprawdź
- `Hborn.txt:4775` – Lokacja „PLANETA SU”: Dopasowano przybliżenie (literówka): „Planet Su” (1233) – sprawdź
- `Hborn.txt:5045` – Pominięto puste zadanie „Teleport - Niebiańska Kuźnia” (brak wymagań i nagród) – nazwa trafiła do notatki lokacji
- `Hborn.txt:7132` – Pominięto puste zadanie „Powrót do Domu” (brak wymagań i nagród)
- `Hborn.txt:7544` – Lokacja „OKOLICE ZAMKU KRÓLEWESKIEGO - ILUZJA”: Dopasowano przybliżenie (literówka): „Okolice Zamku Królewskiego - Iluzja” (1350) – sprawdź
- `Hborn.txt:7594` – Lokacja „MIEJSCE LĄDOWANIA RADITZA - ILUZJA”: Dopasowano przybliżenie (literówka): „Miejsce Lądowanie Raditza - Iluzja” (1351) – sprawdź
- `Sborn.txt:109` – Lokacja „PLANETA KAIO”: ID 39 jest daleko od sąsiednich lokacji (649, 650) – sprawdź
- `Sborn.txt:1567` – Lokacja „WYSPA GENIALNEGO ŻÓŁWIA”: ID 2 jest daleko od sąsiednich lokacji (720, 719) – sprawdź
- `Sborn.txt:2452` – Lokacja „GÓRSKIE ZBOCZA”: ID 53 jest daleko od sąsiednich lokacji (771, 772) – sprawdź
- `Uborn.txt:1936` – Pominięto puste zadanie „Wymiar U35545XT” (brak wymagań i nagród)

## Poradniki

- **Koszty struktur klanowych** → `data/guides/koszty-struktur-klanowych.md` (z `poradniki/Koszty Struktur klanowych.txt`)
- **Zadania codzienne** → `data/guides/zadania-codzienne.md` (z `poradniki/zadania codzienne/Zadania Codzienne.txt`)
- **Tajemne Skrzynie – zawartość** → `data/guides/skrzynie.md` (przepisane ręcznie ze zrzutów `poradniki/skrzynie/`)

## Ostrzeżenia walidacji (13)

- Pola review (opisane wyżej): 5
- Brak autora (sourceCredit.author pusty): 8
