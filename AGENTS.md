# Kalkulator bezglutenowy — zasady dla agentów

Odpowiadaj po polsku. Szczegóły każdego modułu: `docs/SZCZEGOLY.md` — czytaj tylko potrzebny fragment (grep po nazwie), nie całość.

## Cel i warunki
Kalkulator ciast bezglutenowych (drożdżowe + bezdrożdżowe): z mąk w spiżarni dobiera mieszankę i liczy gramy, by ciasto było jak najbliższe pszennemu.
- Tylko darmowe usługi (GitHub, Cloudflare Workers/KV w darmowych limitach, Open Food Facts).
- Bez logowania, dwie osoby w domu, wspólne dane. Telefon (Samsung S21 Ultra) i laptop.
- Bez frameworków i builda. Współczynniki są szacunkowe.

## Mapa plików
| Plik | Co tam jest |
|---|---|
| engine.js | `GFEngine`: składniki `INGREDIENT_MATRIX`, klasy `RHEOLOGY_CLASSES`, przepisy drożdżowe `BAKES`, `solveFlourBlend`, `calculateLaboratoryFormulation`, `ovenPlan`, smak `FLAVOR`, tekstura `TEXTURE`, psyllium |
| pastry.js | przepisy bezdrożdżowe `PASTRY_BAKES`, klasy 7–12, `solvePastryBlend`, `calculateRecipe` (wspólne wejście), `CATEGORIES`, `PAV` |
| nutrition.js | `nutritionOf` — wartości odżywcze |
| sync.js | `GFSync.mergeState` — scalanie stanu domu |
| worker.js | API: `/api/state` (KV), `/api/off`, `/api/label` (Workers AI), `/api/timers` + cron push |
| index.html | cały interfejs: widoki, spiżarnia, urządzenia (`DEVS`, `devFit`, `gorCard`), MUM5, tryb gotowania, „Jak wyszło?” (`FBI`, `calFor`) |
| version.js / sw.js | wersja + `APP_CHANGELOG`; PWA i cache |

## Nowy przepis — checklista
- Dane: `BAKES` (drożdżowe, + `CAT_BY_ID`) lub `PASTRY_BAKES` (z `category`); źródło w komentarzu.
- index.html: `SIMILAR`, pasujące `THEMES`; smażony/gotowany → `FRY`; pieczony → ewent. `GOR_ID`; MUM5 → ewent. `MUM_HAND`/`MUM_LAM`.
- Od składnika → `anchor` + `unitWeight`.

## Zawsze
- Wdrożenie: wpis na górze `APP_CHANGELOG` i podbicie wersji w version.js. Nowy plik → `FILES` w sw.js.
- Nowe pole stanu domu → obsłuż w `mergeState` + test.
- Kalibrację czytaj przez `calFor(id)`. Karta urządzenia to źródło kroków — zmieniaj ją, nie `cookView`.
- NIE commituj `.vapid-private.json`. Nie podpowiadaj wagi MUM5 (użytkownik waży na HOTO co 1 g).
- Zmiany wyglądu tylko w CSS (blok „Wygląd 3.0”), bez zmian id/struktury HTML.
- Po większych zmianach zaktualizuj `docs/SZCZEGOLY.md`.

## Testy (przed wdrożeniem zmian w przepisach/krokach/urządzeniach)
`node tests/proporcje.js`, `node tests/obciazenie.js`, `node tests/synchronizacja.js`, `node tests/minutniki.js`, `node tests/kroki.js` (Playwright). Kod 1 = błąd.
