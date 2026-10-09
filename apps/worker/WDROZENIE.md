# Wdrożenie serwera synchronizacji (pierwszy raz z Cloudflare)

Serwer synchronizacji to mały program na Cloudflare (Worker) z bazą D1. Darmowy plan wystarcza: 100 000 zapisów i 5 mln odczytów dziennie, bez karty płatniczej. Po przekroczeniu limitu synchronizacja czeka do 2:00 w nocy (00:00 UTC), a postęp nic nie traci, bo zostaje na urządzeniach.

Wszystkie polecenia wpisujesz w terminalu w folderze `apps/worker`:

```
cd apps/worker
```

## 1. Konto Cloudflare

Załóż darmowe konto na https://dash.cloudflare.com/sign-up i potwierdź adres e-mail.

## 2. Zalogowanie terminala

```
pnpm login
```

Otworzy się przeglądarka. Kliknij **Allow**, żeby terminal mógł wdrażać na Twoje konto.

## 3. Baza danych

```
pnpm db:create
```

Na końcu pojawi się fragment z `"database_id": "…"`. Skopiuj ten identyfikator i wklej go w pliku `wrangler.jsonc` zamiast `00000000-0000-0000-0000-000000000000`.

Potem utwórz tabele:

```
pnpm db:migrate
```

Na pytanie o potwierdzenie odpowiedz `y`.

## 4. Wdrożenie

```
pnpm release
```

Przy pierwszym wdrożeniu Cloudflare może poprosić o wybór nazwy subdomeny `workers.dev`, np. `twojanazwa`. Na końcu dostaniesz adres serwera:

```
https://kosmiczny-przewodnik-sync.twojanazwa.workers.dev
```

Otwórz go w przeglądarce. Powinien pokazać `{"ok":true,…}`.

## 5. Adres serwera w GitHubie

1. Wejdź w repozytorium na GitHubie: **Settings → Secrets and variables → Actions → zakładka Variables → New repository variable**.
2. Nazwa: `KP_SYNC_URL`. Wartość: adres z punktu 4 (bez `/` na końcu).
3. Uruchom wdrożenie: zakładka **Actions** na górnym pasku repozytorium (nie w Settings) → po lewej **GitHub Pages** → po prawej przycisk **Run workflow** → zielony **Run workflow**. Zamiast tego wystarczy też dowolny push do .

Po kilku minutach skrypt w grze i aplikacja na telefon mają synchronizację. Skrypt zaktualizuje się sam.

## Jak z tego korzystać

- **Komputer:** ⚙ w panelu → **Synchronizacja → Utwórz kod synchronizacji**. Pojawi się kod `KOSMO-…` i QR.
- **Telefon:** zeskanuj QR aparatem (aplikacja otworzy się i połączy sama) albo wpisz kod przy pierwszym uruchomieniu lub w Ustawieniach.
- Postać dodana na telefonie ręcznie, zanim był sync: w **Postacie → Połącz z postacią z gry** jej postęp przejdzie do postaci z gry.

## Bezpieczeństwo

- Kod ma 140 bitów losowości, więc nie da się go zgadnąć. W bazie leży tylko jego skrót (SHA-256), a sam kod znają tylko Twoje urządzenia.
- Serwer zawsze **scala** postęp, nigdy go nie nadpisuje. Nawet ktoś z kodem nie skasuje Twoich zmian wysłaniem starych danych. Daty „z przyszłości” serwer obcina, żeby nie dało się wygrać scalania na zawsze.
- Limity chronią przed spamem:
  - 3 nowe kody na minutę z jednego IP i 2000 na dobę na cały serwer,
  - 20 zapisów na minutę na kod i 40 na IP,
  - 60 zapytań na minutę na IP,
  - 256 KB na zapytanie, 30 postaci na kod.
- Zapytania przechodzą walidację schematem. Treść postępu nie trafia do logów.
- Kody nieużywane ponad rok są usuwane automatycznie (codziennie o 3:17 UTC).

## Aktualizacja serwera

Po zmianach w `apps/worker`:

```
cd apps/worker
pnpm release
```

Jeśli doszła nowa migracja w `migrations/`, najpierw `pnpm db:migrate`.
