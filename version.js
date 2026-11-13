/* Wersja aplikacji i lista zmian – JEDNO źródło. Ładowane przez stronę i przez sw.js (nazwa pamięci offline).
   Przy każdym wdrożeniu: dopisz wpis NA GÓRZE i podbij numer. */
self.APP_CHANGELOG = [
  { v: "2.5.0", d: "13.11.2026", t: ["Przy każdym przepisie: szacunkowe podobieństwo do wersji pszennej (smak, konsystencja) z krótką uwagą, czego się spodziewać."] },
  { v: "2.4.0", d: "13.11.2026", t: ["Numer wersji, lista zmian i przycisk „Sprawdź aktualizację” na dole strony.",
    "Instalacja na telefonie działa też, gdy przeglądarka nie pokazuje sama okienka (instrukcja dla Chrome i Samsung Internet)."] },
  { v: "2.3.0", d: "13.11.2026", t: ["Po zminimalizowaniu i powrocie aplikacja wraca do tego samego miejsca: przepis, ilości, przewinięcie, tryb gotowania, minutniki."] },
  { v: "2.2.0", d: "12.11.2026", t: ["Wartości odżywcze ciasta: kcal i makroskładniki na 100 g, 1 sztukę i całość.",
    "Smak jak pszenny: dobór mąk z uwzględnieniem smaku, wyrastanie w lodówce, ocena smaku w „Jak wyszło?”."] },
  { v: "2.1.0", d: "11.11.2026", t: ["Aplikacja na telefon, praca bez internetu, tryb gotowania z minutnikami.",
    "Wspólna spiżarnia dla domu, kalibracja „Jak wyszło?”, wyszukiwanie mąk w polskich sklepach."] },
  { v: "2.0.0", d: "11.11.2026", t: ["55 przepisów (drożdżowe i bezdrożdżowe), wyszukiwarka przepisów, model pieczenia, mąki ze sklepów."] }
];
self.APP_VERSION = self.APP_CHANGELOG[0].v;
