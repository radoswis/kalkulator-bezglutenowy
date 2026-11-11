# Instrukcje dla asystentów AI (Claude, ChatGPT/Codex, Google Antigravity)

Czytaj ten plik przed każdą zmianą. Odpowiadaj i komentuj po polsku.

## Cel aplikacji
Kalkulator bezglutenowych ciast drożdżowych. Użytkownik wybiera wypiek, zaznacza mąki, które ma, podaje ilość (sztuki lub gramy). Aplikacja sama dobiera najlepszą mieszankę z posiadanych mąk i liczy gramy: mąki, woda, psyllium, sól, drożdże, tłuszcz, cukier, jajka. Cel: ciasto jak najbliższe glutenowemu.

## Warunki twarde
- Tylko darmowe rozwiązania (GitHub, Cloudflare Pages/Workers/D1 w limitach darmowych, Open Food Facts, Tesseract.js).
- Bez logowania. Dwie osoby w domu, wspólne dane.
- Działa na telefonie (Samsung S21 Ultra) i laptopie.

## Stan obecny (v0.2)
Jeden plik `index.html` (HTML + CSS + JS, bez builda). Dane w tablicach JS:
- Psyllium = łuska babki jajowatej (Plantago ovata) lub babki płesznik — ten sam składnik w obliczeniach.
- `BASE` – mąki: `a` chłonność wody (g/g), `P` białko %, `F` błonnik %, `fl` siła smaku 0–1, `cap` maks. udział, `t` typ: `pelna` | `skrobia` | `mix`, `b` = zawiera zagęstnik.
- `B` / `BAKES` – 27 wypieków: `s` docelowy udział skrobi, `psy` % psyllium, `h` mnożnik hydratacji, `sol`, `dr` (drożdże suche), `ol`, `cu`, `ja` – w % od masy mąki; `w` waga sztuki.
- `TGT` – cele mieszanki dla grup wypieków (białko, błonnik, maks. smak).
- Zaznaczone mąki to SPIŻARNIA (stan magazynowy), nie lista do użycia. `optimize()` sam wybiera od 1 do wszystkich: wspinaczka z krokiem 5% (przesunięcia między parami mąk), start z każdej mąki i każdej pary. Minimalizuje `score()`: odchyłka białka, błonnika, udziału skrobi (`ss` – mix liczony jako ok. połowa skrobi), kara za smak, `cap`, liczbę mąk; premia za gotowy mix (sprawdzona baza), kara za Mix C w drożdżowym.
- Hydratacja = Σ(udział × chłonność) + psyllium × 9 (+ guma ksantanowa × 5), × mnożnik wypieku.
- Gotowe mixy: optymalizator może użyć ich jako bazy i zaproponować dosypanie innych mąk. Psyllium zmniejszane proporcjonalnie do udziału mixu (mix ma już zagęstnik). P/F mixów są SZACUNKOWE – do podmiany na dane z etykiet.
- Własne mąki: formularz; chłonność szacowana z białka i błonnika; zapis w `localStorage`.

Wszystkie współczynniki są SZACUNKOWE. Nie podawaj ich jako pewnych.

## Plan (kolejność)
1. Kalibracja współczynników na prawdziwych wypiekach + ocena wypieku (za suche / kleiste / płaskie) korygująca wodę.
2. Cloudflare Worker jako proxy do Open Food Facts (wyszukiwanie po nazwie i kodzie kreskowym).
3. Cloudflare D1: wspólna baza mąk i ocen zamiast `localStorage`.
4. Skan kodu kreskowego (BarcodeDetector / ZXing) i OCR etykiety (Tesseract.js).
5. Więcej gotowych mieszanek z polskich sklepów.
6. Podział `index.html` na pliki (`app.js`, `data/*.json`) dopiero gdy zrobi się za duży.

## Zasady zmian
- Nie dodawaj frameworków ani builda bez potrzeby.
- Każda zmiana danych w `BASE` / `BAKES`: dopisz źródło w komentarzu.
- Po zmianie `optimize()` sprawdź czas obliczeń (ma być < 100 ms dla 15 mąk).
- Aktualizuj sekcję „Stan obecny” w tym pliku po większych zmianach.
