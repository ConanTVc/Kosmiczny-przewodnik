# Kosmiczny Przewodnik

Solucje, poradniki i tracker zadań do gry przeglądarkowej [Kosmiczni](https://kosmiczni.pl) (świat Dragon Ball).

Przewodnik pokaże solucję dla lokacji, w której jesteś, i sam rozpozna, które zadania masz zrobione,
w trakcie albo jeszcze przed sobą. Na komputerze jako panel w grze, na telefonie jako osobna aplikacja.

> **Projekt w budowie.** Gotowa jest treść, a panel w grze i aplikacja na telefon są w przygotowaniu.

## Co jest już gotowe

- **Solucje:** Nonborn i Rborn dla Goku i Cumbera oraz wspólna fabuła Gborn, Uborn, Sborn, Hborn i Mborn – ok. 2100 zadań w ponad 800 lokacjach, każda lokacja połączona z ID z gry.
- **Poradniki:** koszty struktur klanowych, zadania codzienne, zawartość Tajemnych Skrzyń.

## Jak to będzie działać

- Skrypt **tylko czyta** to, co gra pokazuje na ekranie (lista teleportacji, dziennik zadań). Nigdy nic nie klika, nie wysyła niczego do serwera gry i nie zmienia gry.
- Twórca gry zgodził się na narzędzie, które czyta dane gry.
- Postęp zapisuje się na Twoim urządzeniu; synchronizacja między komputerem a telefonem będzie opcjonalna, na kod (bez zakładania konta).
- Gdy przewodnik nie jest pewien, czy zadanie jest zrobione, nie zgaduje – zapyta Ciebie.

## Autorzy solucji

- Nonborn i Rborn – Goku: **BaronCorbin**
- Nonborn i Rborn – Cumber: **Naruto**
- Pozostałe solucje i poradniki – podpisy zostaną uzupełnione.

## Dla programistów

Monorepo pnpm (TypeScript, Vite). Wymaga Node.js 22+ i pnpm 10.

```sh
pnpm install
pnpm test            # testy
pnpm content:build   # walidacja treści i build do packages/content/dist/content
```

Treść jest w `packages/content/data` (rozdziały JSON + poradniki Markdown); błędy walidacji pokazują plik i miejsce w pliku.
