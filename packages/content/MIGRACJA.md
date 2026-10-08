# Raport migracji solucji i poradników

Wygenerowany przez `pnpm content:migrate`. Oryginały w `solucje/` i `poradniki/` są nietknięte.

## Podsumowanie

| Rozdział | Plik | Autor | Lokacje | Zadania (gł./pob./codz./powt.) | Etapy | requires | Do decyzji |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Nonborn – Goku | `goku-n.json` | BaronCorbin | 97 | 148 (90/54/4/0) | 314 | 3 | 0 |
| Rborn – Goku | `goku-r.json` | BaronCorbin | 38 | 47 (38/9/0/0) | 98 | 0 | 0 |
| Nonborn – Cumber | `cumber-n.json` | Naruto | 18 | 43 (18/21/4/0) | 99 | 1 | 0 |
| Rborn – Cumber | `cumber-r.json` | Naruto | 15 | 29 (15/14/0/0) | 58 | 0 | 0 |
| Gborn | `gborn.json` | _(pusty)_ | 129 | 189 (88/101/0/0) | 442 | 2 | 0 |
| Uborn | `uborn.json` | _(pusty)_ | 111 | 224 (112/103/8/1) | 569 | 7 | 0 |
| Sborn | `sborn.json` | _(pusty)_ | 104 | 278 (95/174/8/1) | 1271 | 7 | 0 |
| Hborn | `hborn.json` | _(pusty)_ | 238 | 751 (239/510/2/0) | 2842 | 83 | 0 |
| Mborn | `mborn.json` | _(pusty)_ | 110 | 384 (114/270/0/0) | 1970 | 54 | 0 |

Lokacje: 1508 z listy gry w `data/locations.json`, 809 z rebornem (użyte w solucjach albo w fixtures), 11 z aliasami nazw z solucji, 2 oznaczonych „bez teleportu”.

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

## Wymaga Twojej decyzji (0)

„linia” to numer linii w pliku TXT, „ID” to ID lokacji w grze. Te miejsca mają też pole `review` w danych – po sprawdzeniu usuń je.

Brak.

## Do szybkiego przejrzenia (15)

Dopasowania przybliżone (literówki) i rzeczy informacyjne – prawdopodobnie poprawne.

- **Cumber.txt, linia 165** – Lokacja „Planeta Eurilia z innej lini czasowej”: Dopasowano przybliżenie (literówka): „Planete Eurilia z innej lini czasowej” (ID 1111) – sprawdź
- **Cumber.txt, linia 180** – Lokacja „Planeta Eurilia z innej lini czasowej”: Dopasowano przybliżenie (literówka): „Planete Eurilia z innej lini czasowej” (ID 1111) – sprawdź
- **Cumber.txt, linia 250** – Lokacja „Między wymiarowa pustka”: Dopasowano przybliżenie (literówka): „Międzywymiarowa pustka” (ID 1116) – sprawdź
- **Cumber.txt, linia 411** – Lokacja „Planeta we wszechświecie jedenastym”: Dopasowano przybliżenie (literówka): „Planeta we wszechświecie jedynastym” (ID 1122) – sprawdź
- **Gborn.txt, linia 249** – Pominięto puste zadanie „Nowy wróg” (brak wymagań i nagród)
- **Goku.txt, linia 468** – Lokacja „Siedziba Pteodora”: Dopasowano przybliżenie (literówka): „Siedziba Pterodora” (ID 34) – sprawdź
- **Goku.txt, linia 1194** – Lokacja „Lodowa Dolina Północ”: Dopasowano przybliżenie (zawiera): „Lodowa Dolina” (ID 95) – sprawdź
- **Hborn.txt, linia 4775** – Lokacja „PLANETA SU”: Dopasowano przybliżenie (literówka): „Planet Su” (ID 1233) – sprawdź
- **Hborn.txt, linia 5045** – Pominięto puste zadanie „Teleport - Niebiańska Kuźnia” (brak wymagań i nagród) – nazwa trafiła do notatki lokacji
- **Hborn.txt, linia 7132** – Pominięto puste zadanie „Powrót do Domu” (brak wymagań i nagród)
- **Hborn.txt, linia 7544** – Lokacja „OKOLICE ZAMKU KRÓLEWESKIEGO - ILUZJA”: Dopasowano przybliżenie (literówka): „Okolice Zamku Królewskiego - Iluzja” (ID 1350) – sprawdź
- **Hborn.txt, linia 7594** – Lokacja „MIEJSCE LĄDOWANIA RADITZA - ILUZJA”: Dopasowano przybliżenie (literówka): „Miejsce Lądowanie Raditza - Iluzja” (ID 1351) – sprawdź
- **Mborn.txt, linia 942** – Zadanie „Strach Ma Wielkie Oczy” wymaga „Hakaishin IV” – to kolejna część fabuły głównej z numerem nadawanym w grze; requires nieustawione
- **Mborn.txt, linia 1520** – Zadanie „Strach Ma Wielkie Oczy” wymaga „Strach ma Wielkie Oczy II” – to kolejna część fabuły głównej z numerem nadawanym w grze; requires nieustawione
- **Uborn.txt, linia 1936** – Pominięto puste zadanie „Wymiar U35545XT” (brak wymagań i nagród)

## Poradniki

- **Koszty struktur klanowych** → `data/guides/koszty-struktur-klanowych.md` (z `poradniki/Koszty Struktur klanowych.txt`)
- **Zadania codzienne** → `data/guides/zadania-codzienne.md` (z `poradniki/zadania codzienne/Zadania Codzienne.txt`)
- **Tajemne Skrzynie – zawartość** → `data/guides/skrzynie.md` (przepisane ręcznie ze zrzutów `poradniki/skrzynie/`)

## Ostrzeżenia walidacji (8)

- Brak autora (sourceCredit.author pusty): 8
