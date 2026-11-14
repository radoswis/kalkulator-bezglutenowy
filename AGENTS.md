# Instrukcje dla asystentów AI (Claude, ChatGPT/Codex, Google Antigravity)

Czytaj ten plik przed każdą zmianą. Odpowiadaj i komentuj po polsku.

## Cel aplikacji
Kalkulator bezglutenowych ciast drożdżowych. Użytkownik wybiera wypiek, zaznacza mąki, które ma, podaje ilość (sztuki lub gramy). Aplikacja sama dobiera najlepszą mieszankę z posiadanych mąk i liczy gramy: mąki, woda, psyllium, sól, drożdże, tłuszcz, cukier, jajka. Cel: ciasto jak najbliższe glutenowemu.

## Warunki twarde
- Tylko darmowe rozwiązania (GitHub, Cloudflare Pages/Workers/D1 w limitach darmowych, Open Food Facts, Tesseract.js).
- Bez logowania. Dwie osoby w domu, wspólne dane.
- Działa na telefonie (Samsung S21 Ultra) i laptopie.

## Stan obecny (v2.6 – 61 przepisów: 30 drożdżowych + 31 bezdrożdżowych)
- `engine.js` – silnik (globalny `GFEngine`, działa też w Node: `require("./engine.js")`). Typy w JSDoc.
  - `INGREDIENT_MATRIX` – składniki: `macros` (g/100 g), `wac_cold`, `wac_hot` (na razie informacyjnie), `flavorProfile`, `role`, mixy: `isCommercialMix`, `hasHPMC`, `starchBase`, `mixPriority`; `maxShare` = limit udziału.
  - `RHEOLOGY_CLASSES` – 6 klas reologicznych: zakresy hydratacji bazowej, psyllium, tłuszczu, jajek, cukru i cel profilu mąk (skrobia = udział frakcji skrobiowej, białko, błonnik).
  - `BAKES` – 30 wypieków zmapowanych na klasy; domyślne porcje 500–750 g.
  - `solveFlourBlend()` – zaznaczone mąki to SPIŻARNIA. Gdy jest gotowy mix: baza (Mix B > Mix It! > Mix C) 65–100% + 1–2 mąki 20–35%, czyste skrobie zablokowane (wyjątek: tapioka 5% w klasach formowanych/wałkowanych/bogatych). Bez mixu: wspinaczka po siatce 5%. Filtr smaku dla słodkich (tylko jaglana, owsiana, ryżowa, migdałowa, sorgo).
  - `calculateLaboratoryFormulation()` – ΔWAC = (WAC_mix − 0,96) × 0,65 × 100 pp; tłuszcz −0,40 pp na każdy % powyżej 5; cukier −0,25 pp powyżej 6% i kompensacja drożdży; jajka = 75% wody (odejmowane od wody do dolania); mikroskładniki < 10 g zaokrąglane do 0,5 g, woda domyka bilans.
  - Przepis podaje DROŻDŻE ŚWIEŻE (= suche × 3, wliczone w bilans masy); suche tylko jako zamiennik w notce. Drożdże suche: baza 1,45% (wytrawne), 1,5% (słodkie); mnożnik osmotyczny podnosi słodkie do ok. 1,9–2,25%.
  - Klasa wałkowana ma `proteinPriority: 2` (większa waga białka w koszcie solvera).
  - Instrukcje: ciasta formowane rosną RAZ, po uformowaniu (bez wyrastania w misce); ciasta wlewane rosną w formie.
  - `validateDefaultBatches()` – kontrola: porcje 500–750 g, sól/drożdże/psyllium ≥ 4,5 g. Uruchom po każdej zmianie danych.
- `pastry.js` – rozszerzenie (ładowane PO engine.js): 31 przepisów bezdrożdżowych, klasy 7–12 (`PASTRY_CLASSES`), składniki receptur (`COMPONENTS`), solver `solvePastryBlend()`:
  - `YEAST_HYDROCOLLOID_MODE` (klasa 7: pierogi, tortilla, makaron) – jedna baza komercyjna, Mix B pierwszy, tapioka preferowana ok. 10–15%.
  - `PASTRY_STARCH_MODE` (klasy 8–12) – czyste skrobie odblokowane, Mix C preferowany, tapioka karana (gumowatość) chyba że przepis ją preferuje; koszt = odległość od ZAKRESU celu.
  - Receptury w % od mąk (`basis: "flour"`) albo od masy ciasta (`basis: "total"` + `flourPct`, np. kopytka, sernik).
  - Każdy przepis ma własne `steps(ctx)` (gramatury wstawiane w tekst, jajka z liczbą sztuk). Bilans masy domyka największy składnik.
  - `calculateRecipe()` – jedno wejście dla wszystkich 61 przepisów; `validateAllRecipes(pantryIds)` – test całości.
- Mąki i mieszanki ze sklepów (Auchan, Carrefour i in.): pole `brands` (marki), `composition` (skład z etykiety), flagi `wheatStarch` (skrobia pszenna BG – ostrzeżenie), `leavened` (spulchniacz – wykluczone z drożdżowych), `batterOnly`, `savoryOnly`, `saltPct` (sól w mieszance odejmowana od soli przepisu), `starchLike`, `idealExclude`.
- `suggestIdealBlend(bakeId, pantryIds)` – najlepszy zestaw z całej bazy (bez skrobi pszennej i produktów niszowych/o nieznanym składzie), porównany ze spiżarnią; w UI sekcja „Najlepszy zestaw do tego przepisu” + przycisk dodania brakujących.
- Solvery mają pamięć podręczną (przepis + spiżarnia).
- Model pieczenia (`OVEN_BASE`, `ovenPlan()` w engine.js): temperatura bazowa jak dla pszennego, obniżana o 10–20°C przy cukrze/jajkach/tłuszczu (`browningDrop`) i o dodatkowe 10°C dla wypieków z nadzieniem, min. 160°C; czas ×1,2 dla ciast bezglutenowych + 5% na każde 5°C mniej; góra–dół bez termoobiegu; `doneness` = jak sprawdzić upieczenie (96–98°C w środku dla dużych). Kalibracja: paszteciki 11.11 – przy 200°C wyjęte po 16 min, wierzch gotowy, środek mógł chwilę dłużej → ustawione 180°C, 20–24 min (OVEN_BASE paszteciki).
- `worker.js` + `wrangler.jsonc`: Worker serwuje pliki (`.assetsignore` ukrywa pliki techniczne) i API:
  - `GET/PUT /api/state` – wspólny stan domu w KV `DATA` (klucz `state:v1`): `{pantry, custom, calib}`; bez logowania; UI zapisuje grupowo co 1,5 s (limit darmowy KV: 1000 zapisów/dzień).
  - `GET /api/off?q=` – pośrednik do Open Food Facts (nazwa lub kod kreskowy): najpierw Polska + kategoria mąk, potem Polska (filtr nazw `FLOUR_RE`), na końcu świat; do 8 wyników, polskie pierwsze, pole `poland`.
- Kalibracja „Jak wyszło?” (index.html: `FB_RULE`, `applyFeedback`): oceny zmieniają per przepis `calib[bakeId] = {water (pkt %), yeast (%), temp (°C), time (%)}` z limitami `CAP`. Silniki przyjmują `calib`; `ovenPlan(b, calib)` przelicza temperaturę i czas; w przepisach bezdrożdżowych i smażonych korekta temp./czasu jest pokazywana jako notka.
- Aplikacja na telefon (PWA): `manifest.webmanifest`, ikony `icon-*.png`, `sw.js` (praca bez internetu: pliki z pamięci, nowa wersja pobierana w tle; `/api/*` zawsze z sieci). Przycisk „Zainstaluj na telefonie” (beforeinstallprompt). `version.js` = numer wersji i lista zmian (jedno źródło; nazwa cache w sw.js = wersja). PRZY KAŻDYM WDROŻENIU dopisz wpis na górze `APP_CHANGELOG` i podbij numer. Stopka: wersja, „Co nowego”, „Sprawdź aktualizację”; nowy SW czeka i pokazuje pasek „Odśwież teraz” (skipWaiting po kliknięciu). Instalacja: przycisk zawsze widoczny (poza trybem aplikacji); bez `beforeinstallprompt` pokazuje instrukcję Chrome/Samsung Internet. Nowy plik → dopisz do `FILES` w sw.js.
- Licznik smażenia/gotowania partiami (index.html: `FRY[id] = [strona1 s, strona2 s (0 = bez odwracania), sztuk w partii, nazwa, od wypłynięcia]`, `FRY_STEP` = regex kroku, `fryStart/fryTick/fryHtml`); stan `fry` zapisywany w `saveUI`. Nowy przepis smażony/gotowany = dopisz do `FRY`.
- Minutniki w sekundach (`findTimes` → s; domyślne czasy dla nagrzewania, studzenia, gotowania ziemniaków). Odhaczanie składników: wiersze `tr[data-ing]`, `doneIng` + `ingSig()` (reset po zmianie przepisu/ilości).
- Tryb gotowania (index.html): `openCook()` – kroki na cały ekran, przesuwanie palcem/strzałkami, minutniki wykrywane z tekstu kroku (`findTimes`), dźwięk + wibracja, blokada wygaszania ekranu (Wake Lock), pasek minutników na dole po zamknięciu.
- Smak (engine.js): `FLAVOR` = intensywność smaku mąki 0–1 + nuta (sorgo 0,1, owsiana 0,2 … gryczana 0,9), `flavorOf()` (w słodkich nuty słodkie ×0,5), `tasteOf(blend)` = opis smaku mieszanki. `tasteWeight(bake, taste, calib)`: tryb „wheat” (domyślny, `TASTE_W`=50; w „wheat” białko/błonnik liczone do zakresu z luzem, bo strukturę trzyma psyllium), tryb „bold” = 0. `boldByDesign` (chleb gryczany, z `preferFlour`), `masked` (czekoladowe, korzenne – waga ×0,3). `calib.taste` (ocena „Smak nie jak pszenny”, 0–3) wzmacnia wagę o 50% na poziom.
- Wyrastanie w lodówce (`coldProof`): drożdże ×0,6, letnia woda, uformowane sztuki 8–14 h w lodówce + 30–60 min w cieple. Preferencje domu `prefs = {taste, proof}` zapisywane wspólnie z resztą stanu.
- `nutrition.js` (ładowany po pastry.js): `nutritionOf(result, pieces)` – wartości odżywcze samego ciasta (bez nadzienia): mąki z etykiet producentów (`FLOUR_NUTR`), pozostałe składniki z tabel IŻŻ/USDA (`OTHER_NUTR`), energia wg przeliczników UE (4/4/9/2); 100 g gotowego wyrobu z utratą wody i wchłoniętym olejem (`PASTRY_COOK`, `cookChange`). W UI zwijana tabela: 100 g / 1 szt. / całość.
- Tekstura (engine.js: `TEXTURE` [chew, soft, short, grit] per mąka, `TEXTURE_ROLE` dla własnych, `TEX_TARGET` per klasa = pszenny wzorzec, przepis może nadpisać `texture`): `textureCost` dodawany w `blendCost` i `pastryCost`; tapioka > 30% karana; `textureMatch` (0–100) w wyniku przepisu (na razie niewyświetlany). Wartości SZACUNKOWE.
- Zaparzka (index.html, `tzOn`): klasy formowane/wałkowane/bogate (bez pizzy neapolitańskiej i pity) + chleb tostowy: 5% mąk + 5× woda, brane z odważonych składników (bilans bez zmian); ciasta niewlewane: 15–20 min odpoczynku przed formowaniem.
- Podobieństwo do pszennego (index.html: `SIMILAR`, `simHtml`): szacunek % + uwaga per przepis, pokazywany pod opisem przepisu. Nowy przepis = dopisz wpis do `SIMILAR`.
- Przepis drożdżowy może mieć `shapeStep(ctx)` (własny krok formowania zamiast ogólnego z klasy) i `preBake` (krok tuż przed pieczeniem); tryb pieczenia `griddle` = sucha patelnia (English muffin).
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
