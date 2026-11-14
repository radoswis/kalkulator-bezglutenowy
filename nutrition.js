/**
 * Wartości odżywcze ciasta (bez nadzienia). Ładować PO engine.js i pastry.js.
 *
 * Źródła wartości na 100 g:
 *  - mąki i mieszanki: etykiety producentów (Schär, Bezgluten, Grano, Ocelio, Foods by Ann, Elovena, Incola i in.);
 *    dla mąk jednoskładnikowych bez etykiety: tabele składu żywności IŻŻ (Kunachowicz i in.) / USDA FoodData Central,
 *  - pozostałe składniki: tabele IŻŻ / USDA (wartości typowe).
 * Energia liczona przelicznikami z rozporządzenia UE 1169/2011: białko i węglowodany 4 kcal/g, tłuszcz 9, błonnik 2.
 * Dokładność ok. ±10% (różnice między partiami produktów, odparowanie wody, wchłanianie tłuszczu przy smażeniu).
 */
(function (global) {
  "use strict";
  const G = global.GFEngine;
  if (!G) throw new Error("nutrition.js wymaga engine.js i pastry.js");

  /** @typedef {{fat:number, carbs:number, sugar:number, fiber:number, protein:number, salt:number}} Nutr  g/100 g */
  /** [tłuszcz, węglowodany, w tym cukry, błonnik, białko, sól] na 100 g */
  const N = (fat, carbs, sugar, fiber, protein, salt = 0) => ({ fat, carbs, sugar, fiber, protein, salt });

  // ---------- Mąki, skrobie, mieszanki, dodatki wiążące ----------
  const FLOUR_NUTR = {
    ryz: N(1.4, 80, 0.1, 2.4, 7),        ryzb: N(2.8, 76, 0.9, 4.6, 7.5),    gry: N(3, 70, 1, 6, 12),
    kuk: N(3.9, 74, 0.6, 7, 7),          jag: N(4, 73, 1, 4, 11),            ows: N(7, 59, 1, 10, 13),
    cie: N(6, 48, 10, 11, 20, 0.1),      ama: N(6.5, 62, 1.7, 7, 14),        sor: N(3.5, 70, 2.5, 6, 10),
    tef: N(2.4, 65, 2, 8, 12),           mig: N(50, 7, 4, 11, 21),           kok: N(14, 21, 9, 39, 19, 0.1),
    szi: N(0.1, 85, 0, 0, 0.3),          skk: N(0.1, 86, 0, 0, 0.3),         tap: N(0.1, 87, 0, 0, 0.2),
    mixb: N(1.5, 76, 2, 6, 3.7, 0.03),   mixit: N(0.5, 82, 1, 4.5, 1.5),     mixc: N(1, 80, 1.5, 3, 3),
    bzbread: N(0.9, 82, 0.5, 3.5, 1.9),  bzmulti: N(3.4, 84, 0.5, 1.4, 0.9), bzekstra: N(2.2, 85, 3, 2, 0.6),
    bznalesn: N(0.6, 83, 3, 2, 2.1, 1.3), scharmehl: N(0.5, 84, 1.5, 4.7, 1), granouni: N(0.9, 80, 1, 0.6, 4.8),
    ocelio: N(1, 78, 1, 3.5, 4.1),       fbaprot: N(3, 60, 2, 5.4, 16, 1.4), dynia: N(14, 10, 2, 8, 48),
    kasztan: N(3.7, 70, 18, 8, 6.4),     ryzklei: N(1, 80, 0, 1, 6),
    psy: N(0.6, 2, 0, 85, 2),            xan: N(0, 0, 0, 78, 0, 3)
  };

  // ---------- Pozostałe składniki receptur ----------
  const BUTTER = N(82, 0.6, 0.6, 0, 0.7, 0.02), OIL = N(100, 0, 0, 0, 0), MILK = N(2, 4.8, 4.8, 0, 3.3, 0.1), WATER = N(0, 0, 0, 0, 0);
  const half = (a, b) => Object.fromEntries(Object.keys(a).map(k => [k, (a[k] + b[k]) / 2]));
  const OTHER_NUTR = {
    water: WATER, hotWater: WATER, coldWater: WATER, iceWater: WATER,
    milk: MILK, milkOrYogurt: MILK, lemonMilk: MILK, milkWater: half(MILK, WATER), milkOrWater: half(MILK, WATER),
    buttermilk: N(1.5, 4.7, 4.7, 0, 3.1, 0.1), kefir: N(2, 4.5, 4.5, 0, 3.4, 0.1), sourCream: N(18, 3.6, 3.6, 0, 2.7, 0.1),
    eggs: N(10, 0.7, 0.4, 0, 12.5, 0.35), yolks: N(27, 0.6, 0.6, 0, 16, 0.12),
    butter: BUTTER, softButter: BUTTER, coldButter: BUTTER, meltedButter: BUTTER, butterOrOil: BUTTER, butterOrCream: BUTTER, oil: OIL,
    sugar: N(0, 100, 100, 0, 0), brownSugar: N(0, 98, 97, 0, 0, 0.07), powderedSugar: N(0, 100, 100, 0, 0), honey: N(0, 80, 80, 0, 0.3),
    salt: N(0, 0, 0, 0, 0, 100),
    yeast: N(1.9, 10, 0, 8, 8.4, 0.1),                 // drożdże świeże
    bakingPowder: N(0, 28, 0, 0, 0, 25), bakingSoda: N(0, 0, 0, 0, 0, 68),
    vinegarOrSpirit: WATER,                            // alkohol odparowuje przy smażeniu; ocet ~0 kcal
    spice: N(8, 50, 2, 20, 6), cinnamon: N(1.2, 27, 2, 53, 4), cocoa: N(11, 13, 1, 33, 20, 0.05),
    quark: N(4.7, 3.7, 3.7, 0, 18.7, 0.1), cheesecakeQuark: N(10, 3, 3, 0, 13, 0.1), potatoes: N(0.1, 17, 0.8, 1.8, 1.9, 0.01), rawPotatoes: N(0.1, 17, 0.8, 1.8, 1.9, 0.01),
    darkChocolate: N(42, 33, 28, 11, 8, 0.02), chocolateChips: N(30, 60, 52, 6, 5), banana: N(0.3, 20, 12, 2.6, 1.1), carrot: N(0.2, 7, 4.7, 2.8, 0.9, 0.1)
  };

  /** Szacunek wartości z białka i błonnika dla mąk bez danych (np. własnych). */
  function estimateFlour(i) {
    const m = i.macros || {};
    if (i.nutrition) return i.nutrition;
    const protein = m.protein ?? 8, fiber = m.fiber ?? 4, fat = m.fat ?? 2;
    const carbs = m.starch ?? Math.max(0, 88 - protein - fiber - fat);
    return N(fat, carbs, 1, fiber, protein, 0);
  }
  const kcalOf = n => n.protein * 4 + n.carbs * 4 + n.fat * 9 + n.fiber * 2;

  // ---------- Zmiana masy przy obróbce: [utrata wody, wchłonięty olej] jako ułamek masy ciasta ----------
  const PASTRY_COOK = {
    pierogi: [0, 0], makaron: [0, 0], leniwe: [0, 0], kopytka: [0, 0], kluski_slaskie: [0, 0], gnocchi: [0, 0], pyzy: [0, 0], kluski_lane: [0, 0], quiche: [0.1, 0], // gotowane: masa ok. bez zmian
    tortilla: [0.1, 0], oponki: [0.08, 0.12], faworki: [0.1, 0.2], tempura: [0.1, 0.15], racuchy: [0.1, 0.1],
    nalesniki: [0.15, 0.02], pancakes: [0.12, 0.02], gofry: [0.15, 0],
    pierniczki: [0.1, 0], kruche_ciastka: [0.1, 0], cookies: [0.1, 0], tarta: [0.1, 0], szarlotka: [0.1, 0],
    biszkopt: [0.1, 0], lava_cake: [0.05, 0], brownie: [0.08, 0], sernik: [0.1, 0],
    muffinki: [0.1, 0], babka_piaskowa: [0.1, 0], banana_bread: [0.12, 0], marchewkowe: [0.1, 0], parzone: [0.25, 0]
  };
  function cookChange(bake) {
    if (bake.family === "pastry") return PASTRY_COOK[bake.id] || [0.1, 0];
    if (bake.id === "paczki" || bake.id === "langosz") return [0.05, 0.1];
    if (bake.id === "naan" || bake.id === "english_muffin") return [0.1, 0];
    return bake.unitWeight >= 300 ? [0.12, 0] : [0.15, 0];
  }

  /**
   * Wartości odżywcze wyniku z calculateRecipe().
   * @param {any} r  wynik przepisu (lines, blend, bake)
   * @param {number} pieces  liczba sztuk
   * @returns {{total:Nutr & {kcal:number}, piece:Nutr & {kcal:number}, per100:Nutr & {kcal:number}, rawWeight:number, cookedWeight:number, oil:number, pieces:number}}
   */
  function nutritionOf(r, pieces = 1) {
    const ing = new Map((r.blend || []).map(x => [x.ingredient.id, x.ingredient]));
    const sum = N(0, 0, 0, 0, 0, 0);
    let raw = 0;
    const add = (n, g) => { for (const k in sum) sum[k] += (n[k] * g) / 100; };
    for (const l of r.lines) {
      if (l.key === "flour") continue;               // suma mąk – liczymy składowe
      const g = l.grams; raw += g;
      if (l.sub) { const i = ing.get(l.key); add(FLOUR_NUTR[l.key] || (i ? estimateFlour(i) : estimateFlour({})), g); continue; }
      if (l.key === "fat") { add(r.bake.sweet ? BUTTER : OIL, g); continue; } // drożdżowe: „Masło” albo „Oliwa / masło”
      const n = FLOUR_NUTR[l.key] || OTHER_NUTR[l.key];
      if (n) add(n, g);
    }
    const [loss, oilFrac] = cookChange(r.bake);
    const oil = raw * oilFrac;
    add(OIL, oil);
    const cooked = raw * (1 - loss) + oil;
    const withKcal = o => Object.assign(o, { kcal: kcalOf(o) });
    const scale = f => withKcal(Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v * f])));
    return {
      total: scale(1), piece: scale(1 / Math.max(1, pieces)), per100: scale(cooked > 0 ? 100 / cooked : 0),
      rawWeight: raw, cookedWeight: cooked, oil, pieces
    };
  }

  Object.assign(G, { nutritionOf, FLOUR_NUTR, OTHER_NUTR });
})(typeof window !== "undefined" ? window : globalThis);
