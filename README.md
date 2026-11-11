# Kalkulator ciast bezglutenowych

Liczy proporcje 55 bezglutenowych przepisów: ciasta drożdżowe, pierogi i kluski, naleśniki i panierki, kruche, biszkopty i desery. Sam dobiera mieszankę z mąk, które masz w spiżarni, i podaje instrukcję krok po kroku.

Pliki: `index.html` (interfejs), `engine.js` (silnik drożdżowy), `pastry.js` (wyroby bezdrożdżowe).

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
