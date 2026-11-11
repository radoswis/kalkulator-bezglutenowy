# Instrukcje dla asystentów AI (Claude, ChatGPT/Codex, Google Antigravity)

Czytaj ten plik przed każdą zmianą. Odpowiadaj i komentuj po polsku.

## Cel aplikacji
Kalkulator bezglutenowych ciast drożdżowych. Użytkownik wybiera wypiek, zaznacza mąki, które ma, podaje ilość (sztuki lub gramy). Aplikacja sama dobiera najlepszą mieszankę z posiadanych mąk i liczy gramy: mąki, woda, psyllium, sól, drożdże, tłuszcz, cukier, jajka. Cel: ciasto jak najbliższe glutenowemu.

## Warunki twarde
- Tylko darmowe rozwiązania (GitHub, Cloudflare Pages/Workers/D1 w limitach darmowych, Open Food Facts, Tesseract.js).
- Bez logowania. Dwie osoby w domu, wspólne dane.
- Działa na telefonie (Samsung S21 Ultra) i laptopie.

## Stan obecny (v2.0 – 55 przepisów: 27 drożdżowych + 28 bezdrożdżowych)
- `engine.js` – silnik (globalny `GFEngine`, działa też w Node: `require("./engine.js")`). Typy w JSDoc.
  - `INGREDIENT_MATRIX` – składniki: `macros` (g/100 g), `wac_cold`, `wac_hot` (na razie informacyjnie), `flavorProfile`, `role`, mixy: `isCommercialMix`, `hasHPMC`, `starchBase`, `mixPriority`; `maxShare` = limit udziału.
  - `RHEOLOGY_CLASSES` – 6 klas reologicznych: zakresy hydratacji bazowej, psyllium, tłuszczu, jajek, cukru i cel profilu mąk (skrobia = udział frakcji skrobiowej, białko, błonnik).
  - `BAKES` – 27 wypieków zmapowanych na klasy; domyślne porcje 500–750 g.
  - `solveFlourBlend()` – zaznaczone mąki to SPIŻARNIA. Gdy jest gotowy mix: baza (Mix B > Mix It! > Mix C) 65–100% + 1–2 mąki 20–35%, czyste skrobie zablokowane (wyjątek: tapioka 5% w klasach formowanych/wałkowanych/bogatych). Bez mixu: wspinaczka po siatce 5%. Filtr smaku dla słodkich (tylko jaglana, owsiana, ryżowa, migdałowa, sorgo).
  - `calculateLaboratoryFormulation()` – ΔWAC = (WAC_mix − 0,96) × 0,65 × 100 pp; tłuszcz −0,40 pp na każdy % powyżej 5; cukier −0,25 pp powyżej 6% i kompensacja drożdży; jajka = 75% wody (odejmowane od wody do dolania); mikroskładniki < 10 g zaokrąglane do 0,5 g, woda domyka bilans.
  - Przepis podaje DROŻDŻE ŚWIEŻE (= suche × 3, wliczone w bilans masy); suche tylko jako zamiennik w notce. Drożdże suche: baza 1,45% (wytrawne), 1,5% (słodkie); mnożnik osmotyczny podnosi słodkie do ok. 1,9–2,25%.
  - Klasa wałkowana ma `proteinPriority: 2` (większa waga białka w koszcie solvera).
  - Instrukcje: ciasta formowane rosną RAZ, po uformowaniu (bez wyrastania w misce); ciasta wlewane rosną w formie.
  - `validateDefaultBatches()` – kontrola: porcje 500–750 g, sól/drożdże/psyllium ≥ 4,5 g. Uruchom po każdej zmianie danych.
- `pastry.js` – rozszerzenie (ładowane PO engine.js): 28 przepisów bezdrożdżowych, klasy 7–12 (`PASTRY_CLASSES`), składniki receptur (`COMPONENTS`), solver `solvePastryBlend()`:
  - `YEAST_HYDROCOLLOID_MODE` (klasa 7: pierogi, tortilla, makaron) – jedna baza komercyjna, Mix B pierwszy, tapioka preferowana ok. 10–15%.
  - `PASTRY_STARCH_MODE` (klasy 8–12) – czyste skrobie odblokowane, Mix C preferowany, tapioka karana (gumowatość) chyba że przepis ją preferuje; koszt = odległość od ZAKRESU celu.
  - Receptury w % od mąk (`basis: "flour"`) albo od masy ciasta (`basis: "total"` + `flourPct`, np. kopytka, sernik).
  - Każdy przepis ma własne `steps(ctx)` (gramatury wstawiane w tekst, jajka z liczbą sztuk). Bilans masy domyka największy składnik.
  - `calculateRecipe()` – jedno wejście dla wszystkich 55 przepisów; `validateAllRecipes(pantryIds)` – test całości.
- Mąki i mieszanki ze sklepów (Auchan, Carrefour i in.): pole `brands` (marki), `composition` (skład z etykiety), flagi `wheatStarch` (skrobia pszenna BG – ostrzeżenie), `leavened` (spulchniacz – wykluczone z drożdżowych), `batterOnly`, `savoryOnly`, `saltPct` (sól w mieszance odejmowana od soli przepisu), `starchLike`, `idealExclude`.
- `suggestIdealBlend(bakeId, pantryIds)` – najlepszy zestaw z całej bazy (bez skrobi pszennej i produktów niszowych/o nieznanym składzie), porównany ze spiżarnią; w UI sekcja „Najlepszy zestaw do tego przepisu” + przycisk dodania brakujących.
- Solvery mają pamięć podręczną (przepis + spiżarnia).
- Kategorie w UI: `CATEGORIES` (8 grup), wypieki drożdżowe mapowane w `YEAST_CATEGORY`.
- `index.html` – interfejs; spiżarnia i własne mąki w `localStorage`.
- Psyllium = łuska babki jajowatej (Plantago ovata) lub płesznik.
- Wszystkie współczynniki są SZACUNKOWE (ze specyfikacji, bez pomiarów). Makro Mix It!/Mix C do weryfikacji z etykietą.

## Plan (kolejność)
1. Kalibracja współczynników na prawdziwych wypiekach + ocena wypieku (za suche / kleiste / płaskie) korygująca wodę.
2. Cloudflare Worker jako proxy do Open Food Facts (wyszukiwanie po nazwie i kodzie kreskowym).
3. Cloudflare D1: wspólna baza mąk i ocen zamiast `localStorage`.
4. Skan kodu kreskowego (BarcodeDetector / ZXing) i OCR etykiety (Tesseract.js).
5. Więcej gotowych mieszanek z polskich sklepów.
6. `wac_hot` – wykorzystać do prognozy czerstwienia / czasu pieczenia.

## Zasady zmian
- Nie dodawaj frameworków ani builda bez potrzeby.
- Każda zmiana danych w `BASE` / `BAKES`: dopisz źródło w komentarzu.
- Po zmianie `optimize()` sprawdź czas obliczeń (ma być < 100 ms dla 15 mąk).
- Aktualizuj sekcję „Stan obecny” w tym pliku po większych zmianach.
