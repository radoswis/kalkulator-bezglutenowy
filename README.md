# Kalkulator ciast bezglutenowych

Liczy proporcje ponad 130 bezglutenowych przepisów (obecnie 137: 52 drożdżowe i 85 bezdrożdżowych) w 12 kategoriach: chleby, bułki, pizza i chlebki płaskie, słodkie drożdżowe, ciasto francuskie i rogale, pierogi, kluski i makarony, naleśniki, placki i gofry, pączki i słodkie smażone, ciastka i kruche, ciasta, torty i desery, przekąski wytrawne oraz panierki, sosy i dodatki. Sam dobiera mieszankę z mąk, które masz w spiżarni, i podaje instrukcję krok po kroku.

Co jeszcze potrafi:
- wartości odżywcze ciasta (100 g, 1 sztuka, całość),
- tryb „Gotuj krok po kroku” z minutnikami,
- ustawienia dla urządzeń: piekarnik Gorenje, air fryer, OptiGrill, frytkownica, kuchenka, robot Bosch MUM5,
- spiżarnia wspólna dla domu, wyszukiwanie mąk w Open Food Facts, skaner kodu kreskowego i zdjęcie etykiety,
- ocena „Jak wyszło?”, która poprawia przepis przy następnym razie.

Pliki: `index.html` (interfejs), `engine.js` (silnik drożdżowy), `pastry.js` (wyroby bezdrożdżowe).

## Na telefonie
Otwórz stronę w Chrome na telefonie i kliknij „Zainstaluj na telefonie” (albo menu ⋮ → „Dodaj do ekranu głównego”). Aplikacja działa wtedy bez internetu.

## Uruchomienie lokalne
Otwórz `index.html` w przeglądarce. Nic nie trzeba instalować.

## Wdrożenie na GitHub
1. Na github.com: **New repository** → nazwa `kalkulator-bezglutenowy` → Create.
2. **Add file → Upload files** → przeciągnij wszystkie pliki z tej paczki → Commit.

## Wdrożenie na Cloudflare Pages
1. Cloudflare → Workers & Pages → Create → Pages → **Connect to Git** → wybierz repozytorium.
2. Framework preset: **None**, Build command: puste, Output directory: `/`.
3. Deploy. Każdy push na `main` aktualizuje stronę.

## Praca z asystentami AI
- **Google Antigravity**: sklonuj repozytorium (Clone repository) i otwórz folder. Agent czyta `AGENTS.md`.
- **ChatGPT**: połącz GitHub (Ustawienia → Connectors / Codex) i wskaż repozytorium. Codex czyta `AGENTS.md`.
- **Claude**: podłącz repozytorium w sesji kodu.

Po każdej sesji pracy rób commit, żeby kolejny asystent widział aktualny kod.
