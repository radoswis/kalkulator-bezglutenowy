# Instrukcje dla asystentów AI (Claude, ChatGPT/Codex, Google Antigravity)

Czytaj ten plik przed każdą zmianą. Odpowiadaj i komentuj po polsku.

## Cel aplikacji
Kalkulator bezglutenowych ciast drożdżowych. Użytkownik wybiera wypiek, zaznacza mąki, które ma, podaje ilość (sztuki lub gramy). Aplikacja sama dobiera najlepszą mieszankę z posiadanych mąk i liczy gramy: mąki, woda, psyllium, sól, drożdże, tłuszcz, cukier, jajka. Cel: ciasto jak najbliższe glutenowemu.

## Warunki twarde
- Tylko darmowe rozwiązania (GitHub, Cloudflare Pages/Workers/D1 w limitach darmowych, Open Food Facts, Tesseract.js).
- Bez logowania. Dwie osoby w domu, wspólne dane.
- Działa na telefonie (Samsung S21 Ultra) i laptopie.

## Stan obecny (v1.0 – GF Rheology & Formulation Engine)
- `engine.js` – silnik (globalny `GFEngine`, działa też w Node: `require("./engine.js")`). Typy w JSDoc.
  - `INGREDIENT_MATRIX` – składniki: `macros` (g/100 g), `wac_cold`, `wac_hot` (na razie informacyjnie), `flavorProfile`, `role`, mixy: `isCommercialMix`, `hasHPMC`, `starchBase`, `mixPriority`; `maxShare` = limit udziału.
  - `RHEOLOGY_CLASSES` – 6 klas reologicznych: zakresy hydratacji bazowej, psyllium, tłuszczu, jajek, cukru i cel profilu mąk (skrobia = udział frakcji skrobiowej, białko, błonnik).
  - `BAKES` – 27 wypieków zmapowanych na klasy; domyślne porcje 500–750 g.
  - `solveFlourBlend()` – zaznaczone mąki to SPIŻARNIA. Gdy jest gotowy mix: baza (Mix B > Mix It! > Mix C) 65–100% + 1–2 mąki 20–35%, czyste skrobie zablokowane (wyjątek: tapioka 5% w klasach formowanych/wałkowanych/bogatych). Bez mixu: wspinaczka po siatce 5%. Filtr smaku dla słodkich (tylko jaglana, owsiana, ryżowa, migdałowa, sorgo).
  - `calculateLaboratoryFormulation()` – ΔWAC = (WAC_mix − 0,96) × 0,65 × 100 pp; tłuszcz −0,40 pp na każdy % powyżej 5; cukier −0,25 pp powyżej 6% i kompensacja drożdży; jajka = 75% wody (odejmowane od wody do dolania); mikroskładniki < 10 g zaokrąglane do 0,5 g, woda domyka bilans.
  - `validateDefaultBatches()` – kontrola: porcje 500–750 g, sól/drożdże/psyllium ≥ 4,5 g. Uruchom po każdej zmianie danych.
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
