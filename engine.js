/**
 * GF Rheology & Formulation Engine v1.0
 * Deterministyczny silnik receptur bezglutenowych ciast drożdżowych.
 *
 * Wszystkie wartości procentowe odnoszą się do masy mąk (procenty piekarskie, mąki = 100%).
 * Wartości liczbowe pochodzą ze specyfikacji projektu i literatury; są punktem startowym
 * i wymagają kalibracji prawdziwymi wypiekami. Makro gotowych mieszanek: do weryfikacji z etykietą.
 *
 * Udostępnia globalny obiekt `GFEngine` (działa bez builda, w przeglądarce i w Node).
 */
(function (global) {
  "use strict";

  /** @typedef {'neutral'|'mild_sweet'|'earthy'|'savory'} FlavorProfile */
  /** @typedef {'commercial_base'|'wholegrain_structure'|'pure_starch'|'high_protein'|'hydrocolloid'} Role */
  /** @typedef {{protein:number, fiber:number, starch:number, fat:number, ash:number}} Macros  g/100 g */
  /**
   * @typedef {Object} Ingredient
   * @property {string} id
   * @property {string} name
   * @property {Role} role
   * @property {FlavorProfile} flavorProfile
   * @property {Macros} macros
   * @property {number} wac_cold  g wody / g składnika w 20–25°C
   * @property {number} wac_hot   g wody / g składnika w 62–85°C (miękisz, czerstwienie; obecnie informacyjnie)
   * @property {boolean} [isCommercialMix]
   * @property {boolean} [hasHPMC]
   * @property {number} [starchBase]  udział frakcji skrobiowej w gotowej mieszance (0–1)
   * @property {number} [mixPriority] wyższy = preferowany jako baza drożdżowa
   * @property {number} [maxShare]    maks. udział w mieszance (0–1)
   * @property {boolean} [custom]     mąka dodana przez użytkownika
   * @property {string} [brands]       przykładowe marki w sklepach
   * @property {string} [composition]  skład z etykiety
   * @property {boolean} [wheatStarch] zawiera skrobię pszenną bezglutenową
   * @property {boolean} [leavened]    zawiera spulchniacz – nie do ciast drożdżowych
   * @property {boolean} [batterOnly]  tylko do ciast lejących (naleśniki, pancakes)
   * @property {boolean} [savoryOnly]  nie do słodkich
   * @property {number} [saltPct]      sól zawarta w mieszance, g/100 g
   * @property {boolean} [idealExclude] produkt niszowy – nie podpowiadany w „najlepszym zestawie”
   * @property {number} [starchLike]   udział, w jakim mąka działa jak skrobia (0–1)
   */

  /** @param {number} protein @param {number} fiber @param {number} starch @param {number} fat @param {number} ash @returns {Macros} */
  const M = (protein, fiber, starch, fat, ash) => ({ protein, fiber, starch, fat, ash });

  /** @type {Ingredient[]} */
  const INGREDIENT_MATRIX = [
    { id: "ryz", brands: "SamGo, Incola",   name: "Ryżowa biała",          role: "wholegrain_structure", flavorProfile: "neutral",    macros: M(7, 2.4, 78, 1.4, 0.6), wac_cold: 0.78, wac_hot: 2.2 },
    { id: "ryzb",  name: "Ryżowa brązowa",        role: "wholegrain_structure", flavorProfile: "mild_sweet", macros: M(7.5, 4.6, 72, 2.8, 1.3), wac_cold: 0.88, wac_hot: 2.4 },
    { id: "gry", brands: "Bezgluten, NaturaVena",   name: "Gryczana jasna",        role: "wholegrain_structure", flavorProfile: "earthy",     macros: M(12, 6, 66, 3, 2),     wac_cold: 0.95, wac_hot: 2.8, maxShare: 0.4 },
    { id: "kuk", brands: "Bezgluten",   name: "Kukurydziana",          role: "wholegrain_structure", flavorProfile: "mild_sweet", macros: M(7, 7, 70, 3.9, 1.2),  wac_cold: 0.82, wac_hot: 2.5, maxShare: 0.3 },
    { id: "jag", brands: "NaturaVena",   name: "Jaglana",               role: "wholegrain_structure", flavorProfile: "mild_sweet", macros: M(11, 4, 68, 4, 2),     wac_cold: 0.90, wac_hot: 2.6, maxShare: 0.3 },
    { id: "ows", brands: "Elovena",   name: "Owsiana bezglutenowa",  role: "wholegrain_structure", flavorProfile: "mild_sweet", macros: M(13, 10, 58, 7, 1.8),  wac_cold: 0.98, wac_hot: 3.0, maxShare: 0.35 },
    { id: "cie", brands: "Incola",   name: "Z ciecierzycy",         role: "high_protein",         flavorProfile: "savory",     macros: M(20, 11, 45, 6, 3),    wac_cold: 0.95, wac_hot: 2.6, maxShare: 0.25 },
    { id: "ama",   name: "Amarantusowa",          role: "high_protein",         flavorProfile: "earthy",     macros: M(14, 7, 60, 6.5, 2.9), wac_cold: 0.92, wac_hot: 2.7, maxShare: 0.25 },
    { id: "sor",   name: "Z sorgo",               role: "wholegrain_structure", flavorProfile: "neutral",    macros: M(10, 6, 70, 3.5, 1.6), wac_cold: 0.92, wac_hot: 2.6 },
    { id: "tef",   name: "Z teff",                role: "wholegrain_structure", flavorProfile: "earthy",     macros: M(12, 8, 65, 2.4, 2.4), wac_cold: 0.92, wac_hot: 2.7, maxShare: 0.35 },
    { id: "mig", brands: "Auchan, Bio Planet",   name: "Migdałowa",             role: "high_protein",         flavorProfile: "mild_sweet", macros: M(21, 11, 5, 50, 3),    wac_cold: 0.50, wac_hot: 0.8, maxShare: 0.1 },
    { id: "kok",   name: "Kokosowa",              role: "wholegrain_structure", flavorProfile: "mild_sweet", macros: M(19, 39, 10, 14, 3),   wac_cold: 4.20, wac_hot: 5.0, maxShare: 0.08 },
    { id: "szi",   name: "Skrobia ziemniaczana",  role: "pure_starch",          flavorProfile: "neutral",    macros: M(0.3, 0, 85, 0.1, 0.3), wac_cold: 0.62, wac_hot: 10 },
    { id: "skk", brands: "Amizea il Molino",   name: "Skrobia kukurydziana",  role: "pure_starch",          flavorProfile: "neutral",    macros: M(0.3, 0, 86, 0.1, 0.1), wac_cold: 0.68, wac_hot: 7 },
    { id: "tap",   name: "Tapioka",               role: "pure_starch",          flavorProfile: "neutral",    macros: M(0.2, 0, 87, 0.1, 0.1), wac_cold: 0.65, wac_hot: 9 },
    { id: "mixb",  name: "Schär Mix B",           role: "commercial_base",      flavorProfile: "neutral",    macros: M(3.7, 6, 70, 1.5, 1),  wac_cold: 1.02, wac_hot: 3.2, isCommercialMix: true, hasHPMC: true,  starchBase: 0.45, mixPriority: 3 },
    { id: "mixit", name: "Schär Mix It! Universal", role: "commercial_base",    flavorProfile: "neutral",    macros: M(1.5, 4.5, 78, 0.5, 0.5),  wac_cold: 0.88, wac_hot: 3.0, isCommercialMix: true, hasHPMC: true,  starchBase: 0.50, mixPriority: 2 },
    { id: "mixc",  name: "Schär Mix C",           role: "commercial_base",      flavorProfile: "neutral",    macros: M(3, 3, 75, 1, 0.8),    wac_cold: 0.82, wac_hot: 2.8, isCommercialMix: true, hasHPMC: false, starchBase: 0.55, mixPriority: 1 },
    // --- Mieszanki ze sklepów (Auchan, Carrefour i in.) – skład z etykiet producentów ---
    { id: "bzbread", name: "Bezgluten Bread Mix (chleb i pizza)", brands: "Bezgluten", role: "commercial_base", flavorProfile: "neutral", macros: M(1.9, 3.5, 78, 0.9, 1), wac_cold: 1.0, wac_hot: 3.2, isCommercialMix: true, hasHPMC: true, starchBase: 0.7, mixPriority: 2.5,
      composition: "skrobia kukurydziana, pełnoziarnista mąka owsiana BG (6%), mąka ryżowa, guma ksantanowa, HPMC, błonnik z babki płesznik" },
    { id: "bzmulti", name: "Bezgluten Multi Mix", brands: "Bezgluten", role: "commercial_base", flavorProfile: "neutral", macros: M(0.9, 1.4, 79, 3.4, 0.5), wac_cold: 0.85, wac_hot: 3.0, isCommercialMix: true, hasHPMC: false, starchBase: 0.85, mixPriority: 1.2,
      composition: "skrobia kukurydziana, skrobia ziemniaczana, mąka kukurydziana, mąka jaglana, guma ksantanowa, guma guar" },
    { id: "bzekstra", name: "Bezgluten Ekstra Uniwersalna", brands: "Bezgluten", role: "commercial_base", flavorProfile: "neutral", macros: M(0.6, 2, 84, 2.2, 0.5), wac_cold: 0.85, wac_hot: 3.0, isCommercialMix: true, hasHPMC: true, starchBase: 0.9, mixPriority: 1,
      wheatStarch: true, leavened: true, composition: "skrobia pszenna bezglutenowa, skrobia kukurydziana, mąka kukurydziana, glukoza, guma guar, HPMC, błonnik ziemniaczany, regulator kwasowości, spulchniacz" },
    { id: "bznalesn", name: "Bezgluten Naleśnikowo-pierogowa", brands: "Bezgluten", role: "commercial_base", flavorProfile: "neutral", macros: M(2.1, 2, 80, 0.6, 1.5), wac_cold: 0.9, wac_hot: 3.0, isCommercialMix: true, hasHPMC: true, starchBase: 0.8, mixPriority: 1,
      wheatStarch: true, leavened: true, saltPct: 1.3, composition: "skrobia kukurydziana, skrobia ziemniaczana, mąka ryżowa, skrobia pszenna bezglutenowa, glukoza, guma guar, HPMC, błonnik ziemniaczany, regulator kwasowości, spulchniacz; sól 1,3 g/100 g" },
    { id: "scharmehl", name: "Schär Mehl Farine (uniwersalna)", brands: "Schär", role: "commercial_base", flavorProfile: "neutral", macros: M(1, 4.7, 78, 0.5, 0.5), wac_cold: 0.88, wac_hot: 3.0, isCommercialMix: true, hasHPMC: false, starchBase: 0.7, mixPriority: 1.8,
      composition: "skrobia kukurydziana, mąka ryżowa, mąka kukurydziana, guma guar, dekstroza" },
    { id: "granouni", idealExclude: true, name: "Grano Mieszanka uniwersalna", brands: "Grano", role: "commercial_base", flavorProfile: "neutral", macros: M(4.8, 0.6, 79, 0.9, 1), wac_cold: 0.85, wac_hot: 3.0, isCommercialMix: true, hasHPMC: false, starchBase: 0.6, mixPriority: 1.3,
      composition: "skład do uzupełnienia z etykiety (wartości odżywcze z bazy Fitatu)" },
    { id: "ocelio", idealExclude: true, name: "Ocelio mieszanka do pizzy (z gryczaną)", brands: "Ocelio", role: "commercial_base", flavorProfile: "neutral", macros: M(4.1, 3.5, 77, 1, 1), wac_cold: 0.92, wac_hot: 3.0, isCommercialMix: true, hasHPMC: false, starchBase: 0.55, mixPriority: 1.5,
      composition: "skład do uzupełnienia z etykiety (wartości odżywcze z Frisco)" },
    { id: "fbaprot", idealExclude: true, name: "Foods by Ann naleśniki proteinowe", brands: "Foods by Ann", role: "commercial_base", flavorProfile: "mild_sweet", macros: M(16, 5.4, 55, 3, 2), wac_cold: 1.0, wac_hot: 3.0, isCommercialMix: true, hasHPMC: false, starchBase: 0.3, mixPriority: 1,
      leavened: true, batterOnly: true, saltPct: 1.4, composition: "mąka ryżowa, tapioka, białko grochu, mąka z ciecierzycy, mąka kokosowa, maltitol, mąka lniana, soda, babka płesznik, aromat, sól" },
    // --- Nowe mąki jednoskładnikowe ---
    { id: "dynia", idealExclude: true, name: "Z pestek dyni", brands: "Grano", role: "high_protein", flavorProfile: "savory", macros: M(48, 8, 4, 14, 6), wac_cold: 1.2, wac_hot: 1.5, maxShare: 0.1, savoryOnly: true,
      composition: "100% odtłuszczone pestki dyni; błonnik szacunkowy (brak w źródle)" },
    { id: "kasztan", name: "Kasztanowa", brands: "Incola", role: "wholegrain_structure", flavorProfile: "mild_sweet", macros: M(6.4, 8, 60, 3.7, 2), wac_cold: 0.9, wac_hot: 2.6, maxShare: 0.3,
      composition: "100% kasztany jadalne; błonnik szacunkowy (brak w źródle)" },
    { id: "ryzklei", idealExclude: true, name: "Z ryżu kleistego (słodkiego)", brands: "Cook brand", role: "wholegrain_structure", flavorProfile: "neutral", macros: M(6, 1, 80, 1, 0.5), wac_cold: 0.85, wac_hot: 4.0, maxShare: 0.2, starchLike: 0.5,
      composition: "100% ryż kleisty; wartości typowe dla tej mąki (do sprawdzenia z etykietą)" },
    { id: "psy",   name: "Psyllium (łuska babki jajowatej / płesznik)", role: "hydrocolloid", flavorProfile: "neutral", macros: M(2, 85, 0, 0.6, 3), wac_cold: 14.5, wac_hot: 16 },
    { id: "xan",   name: "Guma ksantanowa",       role: "hydrocolloid",         flavorProfile: "neutral",    macros: M(0, 0, 0, 0, 7),       wac_cold: 10, wac_hot: 10 }
  ];

  /**
   * @typedef {Object} RheologyClass
   * @property {string} label
   * @property {[number,number]} hydration  TrueHydration_Base, %
   * @property {[number,number]} psyllium   %
   * @property {[number,number]} fat        %
   * @property {[number,number]} eggs       %
   * @property {[number,number]} sugar      %
   * @property {number} [proteinPriority]  mnożnik wagi białka w koszcie solvera
   * @property {{starch:[number,number], protein:[number,number], fiber:[number,number]}} target
   *   starch = udział frakcji skrobiowej w mieszance mąk (czyste skrobie + starchBase mieszanek), %
   */
  /** @type {Record<string, RheologyClass>} */
  const RHEOLOGY_CLASSES = {
    RHEO_POURABLE_HIGH_HYDRATION: { label: "Wlewane i foremkowe, wysokowodne", hydration: [102, 115], psyllium: [1.7, 2.0], fat: [3, 6], eggs: [0, 0], sugar: [0, 3],
      target: { starch: [38, 41], protein: [7.0, 8.0], fiber: [4.5, 5.5] } },
    RHEO_FREE_STANDING_LOAF: { label: "Bochenki wolnostojące", hydration: [88, 94], psyllium: [2.4, 2.7], fat: [2, 4], eggs: [0, 0], sugar: [0, 3],
      target: { starch: [35, 40], protein: [8.0, 9.5], fiber: [5.0, 6.5] } },
    RHEO_TENSILE_SHAPED: { label: "Rozciągane i formowane ręcznie", hydration: [80, 85], psyllium: [2.5, 2.8], fat: [4, 7], eggs: [0, 8], sugar: [0, 6],
      target: { starch: [40, 43], protein: [7.5, 8.5], fiber: [4.0, 5.0] } },
    RHEO_LAMINATED_ROLLED_STUFFED: { label: "Wałkowane, zwijane, lepione", proteinPriority: 2, hydration: [73, 77], psyllium: [2.7, 3.0], fat: [9, 12], eggs: [8, 12], sugar: [0, 5],
      target: { starch: [38, 42], protein: [7.5, 8.5], fiber: [4.0, 4.8] } },
    RHEO_STIFF_EXTRUDED_BOILED: { label: "Sztywne, wałeczki i obgotowywane", hydration: [65, 71], psyllium: [2.3, 2.6], fat: [4, 10], eggs: [0, 5], sugar: [0, 4],
      target: { starch: [42, 45], protein: [8.0, 9.0], fiber: [3.5, 4.5] } },
    RHEO_ENRICHED_BRIOCHE_FRIED: { label: "Bogate, słodkie i smażone", hydration: [71, 76], psyllium: [2.8, 3.3], fat: [12, 18], eggs: [15, 25], sugar: [10, 16],
      target: { starch: [40, 43], protein: [7.5, 9.0], fiber: [3.8, 4.5] } }
  };

  /**
   * @typedef {Object} Bake
   * @property {string} id
   * @property {string} name
   * @property {keyof RHEOLOGY_CLASSES} rheologyClass
   * @property {number} salt      %
   * @property {number} yeastDry  % (bazowe, przed kompensacją)
   * @property {number} fat       %
   * @property {number} sugar     %
   * @property {number} eggs      %
   * @property {number} [hydration] nadpisanie TrueHydration_Base, %
   * @property {number} [psyllium]  nadpisanie psyllium, %
   * @property {number} unitWeight  g
   * @property {number} defaultCount
   * @property {string} unit
   * @property {string} bakeNote
   * @property {boolean} [sweet]  filtr smaku: tylko mąki neutralne i łagodne
   */
  /** @type {Bake[]} */
  const BAKES = [
    // RHEO_POURABLE_HIGH_HYDRATION
    { id: "focaccia",    name: "Focaccia",              rheologyClass: "RHEO_POURABLE_HIGH_HYDRATION", salt: 2.2, yeastDry: 1.45, fat: 6, sugar: 0, eggs: 0, unitWeight: 700, defaultCount: 1, unit: "blacha", bakeNote: "230°C, 20–25 min" },
    { id: "pizza_blacha", name: "Pizza z blachy",       rheologyClass: "RHEO_POURABLE_HIGH_HYDRATION", salt: 2.0, yeastDry: 1.45, fat: 5, sugar: 1, eggs: 0, unitWeight: 750, defaultCount: 1, unit: "blacha", bakeNote: "230°C, 18–22 min" },
    { id: "pizza_patelnia", name: "Pizza z patelni",    rheologyClass: "RHEO_POURABLE_HIGH_HYDRATION", salt: 2.0, yeastDry: 1.45, fat: 6, sugar: 1, eggs: 0, unitWeight: 350, defaultCount: 2, unit: "pizza", bakeNote: "220°C, 15 min" },
    { id: "chleb_tostowy", name: "Chleb tostowy",       rheologyClass: "RHEO_POURABLE_HIGH_HYDRATION", salt: 2.0, yeastDry: 1.45, fat: 4, sugar: 3, eggs: 0, unitWeight: 700, defaultCount: 1, unit: "forma", bakeNote: "190°C, 45 min" },
    { id: "ciabatta",    name: "Ciabatta",              rheologyClass: "RHEO_POURABLE_HIGH_HYDRATION", salt: 2.0, yeastDry: 1.45, fat: 3, sugar: 0, eggs: 0, unitWeight: 350, defaultCount: 2, unit: "bochenek", bakeNote: "230°C, 30 min z parą" },
    // RHEO_FREE_STANDING_LOAF
    { id: "chleb_jasny", name: "Chleb jasny",           rheologyClass: "RHEO_FREE_STANDING_LOAF", salt: 2.0, yeastDry: 1.45, fat: 2, sugar: 1, eggs: 0, unitWeight: 700, defaultCount: 1, unit: "bochenek", bakeNote: "220°C 15 min, potem 200°C 40 min" },
    { id: "chleb_gryczany", name: "Chleb gryczany / ciemny", rheologyClass: "RHEO_FREE_STANDING_LOAF", salt: 2.0, yeastDry: 1.45, fat: 2, sugar: 1, eggs: 0, unitWeight: 700, defaultCount: 1, unit: "bochenek", bakeNote: "220°C 15 min, potem 200°C 45 min" },
    { id: "bagietka",    name: "Bagietka",              rheologyClass: "RHEO_FREE_STANDING_LOAF", salt: 2.0, yeastDry: 1.45, fat: 2, sugar: 0, eggs: 0, unitWeight: 300, defaultCount: 2, unit: "bagietka", bakeNote: "240°C, 25 min z parą" },
    // RHEO_TENSILE_SHAPED
    { id: "pizza_neapol", name: "Pizza neapolitańska",  rheologyClass: "RHEO_TENSILE_SHAPED", salt: 2.2, yeastDry: 1.45, fat: 4, sugar: 0, eggs: 0, unitWeight: 220, defaultCount: 3, unit: "pizza", bakeNote: "250–300°C, 6–8 min, najlepiej na kamieniu" },
    { id: "pita",        name: "Pita",                  rheologyClass: "RHEO_TENSILE_SHAPED", salt: 2.0, yeastDry: 1.45, fat: 4, sugar: 1, eggs: 0, unitWeight: 90, defaultCount: 8, unit: "placek", bakeNote: "260°C, 4–5 min" },
    { id: "naan",        name: "Naan",                  rheologyClass: "RHEO_TENSILE_SHAPED", salt: 1.8, yeastDry: 1.45, fat: 6, sugar: 3, eggs: 0, unitWeight: 100, defaultCount: 6, unit: "placek", bakeNote: "sucha patelnia, ok. 2 min na stronę" },
    { id: "hamburger",   name: "Bułki hamburgerowe",    rheologyClass: "RHEO_TENSILE_SHAPED", salt: 1.8, yeastDry: 1.45, fat: 7, sugar: 5, eggs: 8, unitWeight: 90, defaultCount: 8, unit: "bułka", bakeNote: "200°C, 18 min" },
    { id: "subway",      name: "Bułki subway / hot dog", rheologyClass: "RHEO_TENSILE_SHAPED", salt: 1.8, yeastDry: 1.45, fat: 6, sugar: 4, eggs: 5, unitWeight: 110, defaultCount: 6, unit: "bułka", bakeNote: "200°C, 20 min" },
    { id: "kajzerki",    name: "Kajzerki",              rheologyClass: "RHEO_TENSILE_SHAPED", salt: 2.0, yeastDry: 1.45, fat: 4, sugar: 2, eggs: 0, unitWeight: 80, defaultCount: 8, unit: "bułka", bakeNote: "220°C, 20 min z parą" },
    // RHEO_LAMINATED_ROLLED_STUFFED
    { id: "calzone",     name: "Calzone",               rheologyClass: "RHEO_LAMINATED_ROLLED_STUFFED", salt: 2.0, yeastDry: 1.45, fat: 10, sugar: 1, eggs: 8, unitWeight: 250, defaultCount: 3, unit: "calzone", bakeNote: "240°C, 12–15 min" },
    { id: "paszteciki",  name: "Paszteciki",            rheologyClass: "RHEO_LAMINATED_ROLLED_STUFFED", salt: 1.8, yeastDry: 1.45, fat: 11, sugar: 3, eggs: 10, unitWeight: 60, defaultCount: 12, unit: "pasztecik", bakeNote: "200°C, 20 min" },
    { id: "pierogi_drozdzowe", name: "Pierogi drożdżowe", rheologyClass: "RHEO_LAMINATED_ROLLED_STUFFED", salt: 1.6, yeastDry: 1.45, fat: 11, sugar: 4, eggs: 10, unitWeight: 50, defaultCount: 12, unit: "pieróg", bakeNote: "190°C, 20 min" },
    // RHEO_STIFF_EXTRUDED_BOILED
    { id: "bajgle",      name: "Bajgle",                rheologyClass: "RHEO_STIFF_EXTRUDED_BOILED", salt: 2.0, yeastDry: 1.45, fat: 4, sugar: 3, eggs: 0, unitWeight: 100, defaultCount: 6, unit: "bajgiel", bakeNote: "1 min gotowania, potem 210°C 20 min" },
    { id: "precle",      name: "Precle",                rheologyClass: "RHEO_STIFF_EXTRUDED_BOILED", salt: 2.0, yeastDry: 1.45, fat: 5, sugar: 2, eggs: 0, unitWeight: 100, defaultCount: 6, unit: "precel", bakeNote: "kąpiel sodowa, potem 210°C 15 min" },
    { id: "grissini",    name: "Grissini",              rheologyClass: "RHEO_STIFF_EXTRUDED_BOILED", salt: 2.0, yeastDry: 1.45, fat: 10, sugar: 0, eggs: 0, unitWeight: 30, defaultCount: 20, unit: "paluch", bakeNote: "200°C, 15 min" },
    // RHEO_ENRICHED_BRIOCHE_FRIED
    { id: "chalka",      name: "Chałka",                rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.6, yeastDry: 1.5, fat: 12, sugar: 12, eggs: 20, unitWeight: 600, defaultCount: 1, unit: "chałka", bakeNote: "180°C, 35 min", sweet: true },
    { id: "babka",       name: "Babka drożdżowa",       rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.4, yeastDry: 1.5, fat: 18, sugar: 16, eggs: 25, unitWeight: 750, defaultCount: 1, unit: "babka", bakeNote: "175°C, 50 min", sweet: true },
    { id: "drozdzowki",  name: "Drożdżówki",            rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.6, yeastDry: 1.5, fat: 15, sugar: 14, eggs: 20, unitWeight: 90, defaultCount: 7, unit: "drożdżówka", bakeNote: "180°C, 20 min", sweet: true },
    { id: "cynamonki",   name: "Cynamonki",             rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.6, yeastDry: 1.5, fat: 15, sugar: 13, eggs: 20, unitWeight: 95, defaultCount: 7, unit: "cynamonka", bakeNote: "180°C, 22 min", sweet: true },
    { id: "buleczki_maslane", name: "Bułeczki maślane", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.5, yeastDry: 1.5, fat: 12, sugar: 10, eggs: 15, unitWeight: 70, defaultCount: 9, unit: "bułka", bakeNote: "190°C, 18 min", sweet: true },
    { id: "paczki",      name: "Pączki",                rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.8, yeastDry: 1.5, fat: 14, sugar: 14, eggs: 22, unitWeight: 70, defaultCount: 8, unit: "pączek", bakeNote: "smażenie w 170°C", sweet: true },
    { id: "langosz",     name: "Langosz",               rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 2.0, yeastDry: 1.45, fat: 6, sugar: 2, eggs: 3, unitWeight: 120, defaultCount: 5, unit: "placek", bakeNote: "smażenie w 175°C" }
  ];

  // ---------- Model pieczenia (temperatura i czas dla ciast bezglutenowych) ----------
  // Bazowe parametry jak dla pieczywa pszennego: [°C, min od, min do, tryb]. Tryby: steam = z parą,
  // twoStage = start gorący, potem niżej, stone = kamień/max, pan = patelnia, fry = smażenie, boil = gotowanie + piekarnik, filled = z nadzieniem.
  const OVEN_BASE = {
    focaccia: [230, 20, 25], pizza_blacha: [230, 18, 22], pizza_patelnia: [220, 13, 15], chleb_tostowy: [190, 40, 45],
    ciabatta: [230, 25, 30, "steam"], chleb_jasny: [220, 45, 55, "twoStage"], chleb_gryczany: [220, 50, 60, "twoStage"], bagietka: [240, 22, 25, "steam"],
    pizza_neapol: [300, 6, 8, "stone"], pita: [260, 4, 5, "stone"], naan: [0, 2, 2, "pan"],
    hamburger: [200, 16, 18], subway: [200, 18, 20], kajzerki: [220, 18, 20, "steam"],
    calzone: [240, 12, 15, "filled"], paszteciki: [200, 14, 17, "filled"] /* kalibracja 11.11: 200°C/16 min = wierzch gotowy, środek o chwilę za krótko → 180°C, 20–24 min */, pierogi_drozdzowe: [190, 18, 20, "filled"],
    bajgle: [210, 18, 20, "boil"], precle: [210, 13, 15, "boil"], grissini: [200, 13, 15],
    chalka: [180, 30, 35], babka: [175, 45, 50], drozdzowki: [180, 18, 20], cynamonki: [180, 20, 22], buleczki_maslane: [190, 16, 18],
    paczki: [170, 0, 0, "fry"], langosz: [175, 0, 0, "fry"]
  };
  const GF_TIME_FACTOR = 1.2;     // żel psyllium + skrobi potrzebuje dłużej, żeby się upiec w środku
  const MIN_OVEN_TEMP = 160;
  const round5 = x => Math.round(x / 5) * 5;

  /** Ile stopni obniżyć, bo cukier, jajka i tłuszcz przyspieszają rumienienie (reakcja Maillarda, karmelizacja). @param {Bake} b */
  function browningDrop(b) {
    const score = b.sugar + 0.4 * b.eggs + 0.3 * b.fat;
    return score < 5 ? 0 : score < 15 ? 10 : score < 25 ? 15 : 20;
  }

  /** Wylicza temperaturę, czas i sposób sprawdzenia dla wypieku bezglutenowego. @param {Bake} b */
  /** @param {Bake} b @param {{temp?:number, time?:number}} [calib] korekty użytkownika: °C i % czasu */
  function ovenPlan(b, calib = {}) {
    const base = OVEN_BASE[b.id];
    if (!base) return null;
    const [t0, m0, m1, mode] = base;
    const cT = calib.temp || 0, cK = 1 + (calib.time || 0) / 100;
    if (mode === "fry") return { note: `smażenie w ${t0}°C, 2–3 min z każdej strony`, doneness: "Gotowe, gdy są złote z obu stron, a wbity patyczek wychodzi suchy. Jeśli z zewnątrz ciemnieją za szybko, obniż temperaturę oleju o 5–10°C." };
    if (mode === "pan") return { note: "sucha, mocno rozgrzana patelnia, ok. 2 min na stronę", doneness: "Gotowe, gdy placek jest nadmuchany i ma brązowe plamki z obu stron." };
    if (mode === "stone") return { note: `jak najwyższa temperatura piekarnika (${t0 >= 300 ? "250–300" : t0}°C), najlepiej na rozgrzanym kamieniu lub odwróconej blasze, ${m0}–${m1} min`, doneness: "Gotowe, gdy brzegi są wyrośnięte i lekko przypieczone, a spód twardy i rumiany." };
    const drop = browningDrop(b) + (mode === "filled" ? 10 : 0);
    const t = Math.max(MIN_OVEN_TEMP - 10, round5(t0 - drop + cT));
    const realDrop = Math.max(0, t0 - t - cT);
    const k = GF_TIME_FACTOR * (1 + 0.05 * (realDrop / 5)) * cK; // dłużej o ok. 5% na każde 5°C mniej, plus korekta użytkownika
    const a = Math.round(m0 * k), z = Math.round(m1 * k);
    let note = `${t}°C, góra–dół bez termoobiegu, środkowa półka, ${a}–${z} min`;
    if (mode === "twoStage") note = `${t}°C przez 15 min, potem ${t - 20}°C, razem ${a}–${z} min, z parą na początku`;
    if (mode === "steam") note += ", z parą przez pierwsze 10 min (naczynie z wrzątkiem na dnie piekarnika)";
    if (mode === "boil") note = `obgotuj 1 min z każdej strony, potem ${t}°C, ${a}–${z} min`;
    const big = b.unitWeight >= 300;
    const doneness = [
      big ? "Gotowe, gdy w środku jest 96–98°C (termometr kuchenny) albo spód stukany palcem brzmi głucho."
          : mode === "filled" ? "Gotowe, gdy spód jest złoty, a nie blady. Przełam jedną sztukę: ciasto przy nadzieniu ma być suche, nie kleiste."
          : "Gotowe, gdy spód jest rumiany i stukany brzmi głucho. Przełam jedną sztukę: miąższ ma być sprężysty, nie kleisty.",
      "Jeśli wierzch rumieni się za szybko, przykryj wypiek luźno folią aluminiową i piecz dalej.",
      b.eggs || b.sugar >= 3 ? "Do smarowania lepiej mleko albo samo białko niż całe jajko z cukrem, bo mniej przypala." : ""
    ].filter(Boolean).join(" ");
    return { note, doneness, temp: t, minutes: [a, z] };
  }
  for (const b of BAKES) { const p = ovenPlan(b); if (p) { b.bakeNote = p.note; b.doneness = p.doneness; b.oven = p; } }

  // ---------- Stałe modelu ----------
  const WAC_REF = 0.96;
  const EGG_WATER = 0.75;
  const XANTHAN_PER_PSYLLIUM = 0.6;    // zamiennik, gdy brak psyllium
  const STARCH_BLOCK_MIX_SHARE = 0.6;
  const TAPIOCA_EXCEPTION_CLASSES = new Set(["RHEO_TENSILE_SHAPED", "RHEO_LAMINATED_ROLLED_STUFFED", "RHEO_ENRICHED_BRIOCHE_FRIED"]);
  const TAPIOCA_EXCEPTION_SHARES = [0.05];  // siatka 5%; spec dopuszcza 5–8%
  const SWEET_ALLOWED = new Set(["jag", "ows", "ryz", "ryzb", "mig", "sor", "kasztan", "ryzklei"]);
  const STEP = 0.05;
  const MIN_FUNCTIONAL_G = 4.5;

  const mid = (/** @type {[number,number]} */ r) => (r[0] + r[1]) / 2;
  const round05 = (/** @type {number} */ x) => Math.round(x * 2) / 2;
  const round1 = (/** @type {number} */ x) => Math.round(x);
  const isMicro = (/** @type {number} */ g) => g < 10;

  /** Udział frakcji skrobiowej składnika (0–1). @param {Ingredient} i */
  function starchFraction(i) {
    if (i.role === "pure_starch") return 1;
    if (i.isCommercialMix) return i.starchBase ?? 0.5;
    return i.starchLike ?? 0;
  }

  /** @typedef {[Ingredient, number][]} Blend  pary [składnik, udział 0–1] */

  /** @param {Blend} blend */
  function profileOf(blend) {
    let protein = 0, fiber = 0, starch = 0, wac = 0;
    for (const [ing, x] of blend) {
      protein += x * ing.macros.protein;
      fiber += x * ing.macros.fiber;
      starch += x * starchFraction(ing) * 100;
      wac += x * ing.wac_cold;
    }
    return { protein, fiber, starch, wac };
  }

  /** Funkcja kosztu solvera. @param {Blend} blend @param {RheologyClass} cls */
  function blendCost(blend, cls) {
    const p = profileOf(blend), t = cls.target;
    const pDiv = cls.proteinPriority ? 0.5 / cls.proteinPriority : 0.5;
    let c = ((p.protein - mid(t.protein)) / pDiv) ** 2
          + ((p.starch - mid(t.starch)) / 2) ** 2
          + ((p.fiber - mid(t.fiber)) / 0.5) ** 2;
    for (const [ing, x] of blend) {
      if (x <= 1e-9) continue;
      c += 0.15; // prostota: każda kolejna mąka kosztuje
      if (ing.maxShare && x > ing.maxShare + 1e-9) c += (x - ing.maxShare) * 200;
    }
    return c;
  }

  /** Czy składnik może wejść do danego wypieku (filtr smaku). @param {Ingredient} i @param {Bake} b */
  function flavorAllowed(i, b) {
    if (i.leavened || i.batterOnly) return false; // spulchniacz chemiczny nie pasuje do ciasta drożdżowego
    if (i.savoryOnly && b.sweet) return false;
    if (!b.sweet || i.role === "pure_starch" || i.isCommercialMix) return true;
    if (i.custom) return i.flavorProfile === "neutral" || i.flavorProfile === "mild_sweet";
    return SWEET_ALLOWED.has(i.id);
  }

  /**
   * Solver mieszanki mąk ze spiżarni.
   * A) jest gotowa mieszanka → baza (Mix B > Mix It! > Mix C) 65–100% + 1–2 mąki strukturalne (20–35%),
   *    czyste skrobie zablokowane; wyjątek: tapioka 5% w klasach formowanych/wałkowanych/bogatych.
   * B) brak mieszanki → wspinaczka po siatce 5% po wszystkich dozwolonych mąkach i skrobiach.
   * @param {Ingredient[]} pantryFlours  @param {Bake} bake  @returns {{blend:Blend, cost:number, mode:'commercial_base'|'free'}}
   */
  const solveCache = new Map();
  function solveFlourBlend(pantryFlours, bake) {
    const key = bake.id + "|" + pantryFlours.map(i => i.id + ":" + i.macros.protein + ":" + i.macros.fiber).join(",");
    if (!solveCache.has(key)) solveCache.set(key, solveFlourBlendRaw(pantryFlours, bake));
    return solveCache.get(key);
  }
  function solveFlourBlendRaw(pantryFlours, bake) {
    const cls = RHEOLOGY_CLASSES[bake.rheologyClass];
    const cands = pantryFlours.filter(i => i.role !== "hydrocolloid" && flavorAllowed(i, bake));
    if (!cands.length) return { blend: [], cost: Infinity, mode: "free" };

    const mixes = cands.filter(i => i.isCommercialMix).sort((a, b) => (b.mixPriority ?? 1.5) - (a.mixPriority ?? 1.5));
    if (mixes.length) {
      const base = mixes[0];
      const comp = cands.filter(i => !i.isCommercialMix && i.role !== "pure_starch");
      const tapioca = TAPIOCA_EXCEPTION_CLASSES.has(bake.rheologyClass) ? cands.find(i => i.id === "tap") : undefined;
      /** @type {Blend} */ let best = [[base, 1]];
      let bestCost = blendCost(best, cls);
      const consider = (/** @type {Blend} */ bl) => { const c = blendCost(bl, cls); if (c < bestCost - 1e-9) { bestCost = c; best = bl; } };
      for (const ms of [0.8, 0.75, 0.7, 0.65]) {
        const rest = +(1 - ms).toFixed(2);
        for (const tap of tapioca ? [0, ...TAPIOCA_EXCEPTION_SHARES] : [0]) {
          const r = +(rest - tap).toFixed(2);
          /** @type {Blend} */ const head = [[base, ms]];
          if (tap && tapioca) head.push([tapioca, tap]);
          for (let i = 0; i < comp.length; i++) {
            consider([...head, [comp[i], r]]);
            for (let j = i + 1; j < comp.length; j++)
              for (let a = STEP; a <= r - STEP + 1e-9; a += STEP) consider([...head, [comp[i], +a.toFixed(2)], [comp[j], +(r - a).toFixed(2)]]);
          }
        }
      }
      return { blend: best, cost: bestCost, mode: "commercial_base" };
    }

    // B) bez gotowej mieszanki
    const n = cands.length, starts = [];
    for (let i = 0; i < n; i++) {
      const w = Array(n).fill(0); w[i] = 1; starts.push(w);
      for (let j = i + 1; j < n; j++) { const v = Array(n).fill(0); v[i] = v[j] = 0.5; starts.push(v); }
    }
    const toBlend = (/** @type {number[]} */ w) => /** @type {Blend} */ (cands.map((c, i) => [c, w[i]]).filter(p => p[1] > 1e-9));
    let bestW = starts[0], bestCost = Infinity;
    for (const w of starts) {
      let cur = blendCost(toBlend(w), cls);
      for (let it = 0; it < 60; it++) {
        let move = null, mc = cur;
        for (let i = 0; i < n; i++) {
          if (w[i] < STEP - 1e-9) continue;
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            w[i] -= STEP; w[j] += STEP;
            const c = blendCost(toBlend(w), cls);
            if (c < mc - 1e-9) { mc = c; move = [i, j]; }
            w[i] += STEP; w[j] -= STEP;
          }
        }
        if (!move) break;
        w[move[0]] -= STEP; w[move[1]] += STEP; cur = mc;
      }
      if (cur < bestCost) { bestCost = cur; bestW = w.map(x => Math.round(x * 100) / 100); }
    }
    return { blend: toBlend(bestW), cost: bestCost, mode: "free" };
  }

  /**
   * @typedef {Object} FormulationLine
   * @property {string} key
   * @property {string} label
   * @property {number} grams     zaokrąglone do wyświetlenia
   * @property {number} pct       % od masy mąk
   * @property {boolean} [sub]    wiersz składowy mąk
   */
  /**
   * Pełny przepis laboratoryjny.
   * @param {{bakeId:string, pantryIds:string[], doughWeight:number, extraIngredients?:Ingredient[]}} input
   */
  function calculateLaboratoryFormulation({ bakeId, pantryIds, doughWeight, extraIngredients = [], calib = {} }) {
    const bake = BAKES.find(b => b.id === bakeId);
    if (!bake) throw new Error("Nieznany wypiek: " + bakeId);
    const cls = RHEOLOGY_CLASSES[bake.rheologyClass];
    const all = INGREDIENT_MATRIX.concat(extraIngredients);
    const pantry = all.filter(i => pantryIds.includes(i.id));
    const pantryFlours = pantry.filter(i => i.role !== "hydrocolloid");
    /** @type {string[]} */ const warnings = [];

    const sol = solveFlourBlend(pantryFlours, bake);
    if (!sol.blend.length) {
      return { bake, cls, empty: true, warnings: ["Zaznacz w spiżarni przynajmniej jedną mąkę lub mieszankę, pasującą do tego wypieku."] };
    }
    const prof = profileOf(sol.blend);
    const mixShare = sol.blend.filter(([i]) => i.isCommercialMix).reduce((s, [, x]) => s + x, 0);
    const hpmcShare = sol.blend.filter(([i]) => i.hasHPMC).reduce((s, [, x]) => s + x, 0);

    // A. Korekta WAC (wynik wzoru ×100 = punkty procentowe hydratacji)
    const dWAC = (prof.wac - WAC_REF) * 0.65 * 100;
    // B. Shortening
    const dFat = -Math.max(0, bake.fat - 5) * 0.40;
    // C. Cukier: hydratacja i drożdże
    const dSugar = -Math.max(0, bake.sugar - 6) * 0.25;
    const hBase = bake.hydration ?? mid(cls.hydration);
    const dUser = calib.water || 0; // korekta z ocen „Jak wyszło?”
    const hEff = hBase + dWAC + dFat + dSugar + dUser;
    const yeastEff = bake.yeastDry * (1 + Math.max(0, bake.sugar - 6) * 0.035 + Math.max(0, bake.fat - 8) * 0.015) * (1 + (calib.yeast || 0) / 100);

    // Hydrokoloid
    let psy = bake.psyllium ?? mid(cls.psyllium); // zakresy klas już zakładają obecność HPMC w bazach komercyjnych
    let xan = 0;
    if (!pantryIds.includes("psy")) {
      if (pantryIds.includes("xan")) { xan = psy * XANTHAN_PER_PSYLLIUM; warnings.push("Brak psyllium: używam gumy ksantanowej. Ciasto będzie mniej elastyczne."); }
      else if (hpmcShare < 0.6) warnings.push("Brak psyllium i gumy ksantanowej: ciasto nie utrzyma gazu. Dokup łuskę babki jajowatej (psyllium).");
      psy = 0;
    }

    // D. Bilans wody: jajka to 75% wody
    const E = bake.eggs / 100;
    let wAddFrac = hEff / 100 - E * EGG_WATER;
    if (wAddFrac < 0) { warnings.push("Jajka wnoszą więcej wody niż potrzeba: zmniejsz ilość jajek."); wAddFrac = 0; }
    const FRESH_PER_DRY = 3;
    const mixSalt = sol.blend.reduce((t, [i, x]) => t + (i.saltPct || 0) * x, 0);
    const frac = { psy: psy / 100, xan: xan / 100, salt: Math.max(0, bake.salt - mixSalt) / 100, yeast: yeastEff * FRESH_PER_DRY / 100 /* drożdże świeże (priorytet) */, fat: bake.fat / 100, sugar: bake.sugar / 100 };
    const sumFrac = 1 + wAddFrac + E + frac.psy + frac.xan + frac.salt + frac.yeast + frac.fat + frac.sugar;
    const flour = doughWeight / sumFrac;

    // Zaokrąglenia: mikroskładniki < 10 g do 0,5 g, reszta do 1 g; woda domyka bilans masy
    const rg = (/** @type {number} */ g) => (isMicro(g) ? round05(g) : round1(g));
    /** @type {FormulationLine[]} */ const lines = [];
    const flourLines = sol.blend.map(([ing, x]) => ({ key: ing.id, label: ing.name, grams: rg(flour * x), pct: x * 100, sub: true }));
    const flourTotal = flourLines.reduce((s, l) => s + l.grams, 0);
    lines.push({ key: "flour", label: "Mąki razem", grams: flourTotal, pct: 100 }, ...flourLines);
    const add = (/** @type {string} */ key, /** @type {string} */ label, /** @type {number} */ f) => { if (f > 0) lines.push({ key, label, grams: rg(flour * f), pct: f * 100 }); };
    add("eggs", "Jajka (roztrzepane)", E);
    add("psy", "Psyllium", frac.psy);
    add("xan", "Guma ksantanowa", frac.xan);
    add("salt", "Sól", frac.salt);
    add("yeast", "Drożdże świeże", frac.yeast);
    add("fat", bake.sweet ? "Masło" : "Oliwa / masło", frac.fat);
    add("sugar", "Cukier", frac.sugar);
    const others = lines.filter(l => !l.sub && l.key !== "flour").reduce((s, l) => s + l.grams, 0) + flourTotal;
    const water = Math.max(0, round1(doughWeight - others));
    lines.splice(1 + flourLines.length, 0, { key: "water", label: "Woda do dolania", grams: water, pct: (water / flour) * 100 });

    // Ostrzeżenia technologiczne
    if (!pantryFlours.some(i => i.role === "pure_starch" || i.isCommercialMix)) warnings.push("W spiżarni brak skrobi i gotowej mieszanki: ciasto będzie zbite. Dokup skrobię ziemniaczaną lub tapiokę.");
    if (pantryFlours.length && pantryFlours.every(i => i.role === "pure_starch")) warnings.push("W spiżarni są same skrobie: ciasto będzie gumowate. Dodaj np. mąkę ryżową lub z sorgo.");
    if (sol.blend.some(([i]) => i.id === "mixc")) warnings.push("Schär Mix C jest do ciast na proszku do pieczenia. Do drożdżowego lepszy Mix B lub Mix It!.");
    for (const l of lines) if (["psy", "salt", "yeast"].includes(l.key) && l.grams < MIN_FUNCTIONAL_G) warnings.push(`${l.label}: ${l.grams} g to mniej niż ${MIN_FUNCTIONAL_G} g. Zwiększ ilość ciasta, bo kuchenna waga może przekłamać.`);

    const used = new Set(sol.blend.map(([i]) => i.id));
    return {
      bake, cls, empty: false, mode: sol.mode,
      blend: sol.blend.map(([ingredient, share]) => ({ ingredient, share })),
      profile: { protein: prof.protein, fiber: prof.fiber, starch: prof.starch, wacMix: prof.wac, target: cls.target },
      hydration: { base: hBase, deltaWAC: dWAC, deltaFat: dFat, deltaSugar: dSugar, deltaUser: dUser, effective: hEff },
      yeast: { dryEffective: yeastEff, freshPct: yeastEff * FRESH_PER_DRY, dryGrams: rg(flour * yeastEff / 100) },
      mixShare, flourExact: flour, lines,
      total: lines.filter(l => !l.sub).reduce((s, l) => s + l.grams, 0),
      unused: pantryFlours.filter(i => !used.has(i.id)),
      warnings
    };
  }

  /** Domyślna masa ciasta wypieku. @param {Bake} b */
  const defaultDough = b => b.unitWeight * b.defaultCount;

  /**
   * Kontrola jakości danych: domyślne porcje 500–750 g i mikroskładniki ≥ 4,5 g.
   * @param {string[]} pantryIds @returns {string[]} lista naruszeń
   */
  function validateDefaultBatches(pantryIds) {
    const out = [];
    for (const b of BAKES) {
      const d = defaultDough(b);
      if (d < 500 || d > 750) out.push(`${b.name}: domyślnie ${d} g (poza 500–750 g)`);
      const r = calculateLaboratoryFormulation({ bakeId: b.id, pantryIds, doughWeight: d });
      if (r.empty || !r.lines) continue;
      for (const l of r.lines) if (["psy", "salt", "yeast"].includes(l.key) && l.grams < MIN_FUNCTIONAL_G) out.push(`${b.name}: ${l.label} ${l.grams} g`);
    }
    return out;
  }

  const GFEngine = { ovenPlan, INGREDIENT_MATRIX, RHEOLOGY_CLASSES, BAKES, solveFlourBlend, calculateLaboratoryFormulation, validateDefaultBatches, defaultDough, profileOf };
  if (typeof module !== "undefined" && module.exports) module.exports = GFEngine;
  global.GFEngine = GFEngine;
})(typeof window !== "undefined" ? window : globalThis);
