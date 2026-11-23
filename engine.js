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
  // Liczebnik + rzeczownik po polsku: pl(3, "kawałek", "kawałki", "kawałków") → "3 kawałki"
  const pl = (n, a, b, c) => `${n} ${n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c}`;

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
    // Domowa mieszanka uniwersalna 5:3:2 (drobna mąka ryżowa : skrobia ziemniaczana : mąka kukurydziana) – wg The Loopy Whisk; makro = średnia ważona składników
    { id: "mixdom", name: "Domowa mieszanka uniwersalna (zrób sam)", role: "commercial_base", flavorProfile: "neutral", macros: M(5, 2.6, 78.5, 1.5, 0.6), wac_cold: 0.74, wac_hot: 4.6, isCommercialMix: true, hasHPMC: false, starchBase: 0.3, mixPriority: 4, idealExclude: true,
      composition: "zrób sam: 500 g drobno mielonej (pudrowej) mąki ryżowej + 300 g skrobi ziemniaczanej + 200 g mąki kukurydzianej (nie skrobi); wymieszaj, przechowuj w szczelnym słoju; bez spoiwa" },
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
    { id: "chleb_gryczany", boldByDesign: true, preferFlour: { gry: 0.3 }, name: "Chleb gryczany / ciemny", rheologyClass: "RHEO_FREE_STANDING_LOAF", salt: 2.0, yeastDry: 1.45, fat: 2, sugar: 1, eggs: 0, unitWeight: 700, defaultCount: 1, unit: "bochenek", bakeNote: "220°C 15 min, potem 200°C 45 min" },
    { id: "bagietka",    name: "Bagietka",              rheologyClass: "RHEO_FREE_STANDING_LOAF", salt: 2.0, yeastDry: 1.45, fat: 2, sugar: 0, eggs: 0, unitWeight: 300, defaultCount: 2, unit: "bagietka", bakeNote: "240°C, 25 min z parą" },
    // RHEO_TENSILE_SHAPED
    { id: "pizza_neapol", name: "Pizza neapolitańska",  rheologyClass: "RHEO_TENSILE_SHAPED", salt: 2.2, yeastDry: 1.45, fat: 4, sugar: 0, eggs: 0, unitWeight: 220, defaultCount: 3, unit: "pizza", bakeNote: "250–300°C, 6–8 min, najlepiej na kamieniu" },
    { id: "pita",        name: "Pita",                  rheologyClass: "RHEO_TENSILE_SHAPED", salt: 2.0, yeastDry: 1.45, fat: 4, sugar: 1, eggs: 0, unitWeight: 90, defaultCount: 8, unit: "placek", bakeNote: "260°C, 4–5 min" },
    { id: "naan",        name: "Naan",                  rheologyClass: "RHEO_TENSILE_SHAPED", salt: 1.8, yeastDry: 1.45, fat: 6, sugar: 3, eggs: 0, unitWeight: 100, defaultCount: 6, unit: "placek", bakeNote: "sucha patelnia, ok. 2 min na stronę" },
    { id: "hamburger",   name: "Bułki hamburgerowe",    rheologyClass: "RHEO_TENSILE_SHAPED", salt: 1.8, yeastDry: 1.45, fat: 7, sugar: 5, eggs: 8, unitWeight: 90, defaultCount: 8, unit: "bułka", bakeNote: "200°C, 18 min" },
    { id: "subway",      name: "Bułki subway / hot dog", rheologyClass: "RHEO_TENSILE_SHAPED", salt: 1.8, yeastDry: 1.45, fat: 6, sugar: 4, eggs: 5, unitWeight: 110, defaultCount: 6, unit: "bułka", bakeNote: "200°C, 20 min" },
    { id: "kajzerki",    name: "Kajzerki",              rheologyClass: "RHEO_TENSILE_SHAPED", salt: 2.0, yeastDry: 1.45, fat: 4, sugar: 2, eggs: 0, unitWeight: 80, defaultCount: 8, unit: "bułka", bakeNote: "220°C, 20 min z parą" },
    // English muffin (bułeczki do McMuffina): wilgotne ciasto mleczne, pieczone na patelni. Źródło: klasyczne receptury (P. Reinhart, King Arthur), hydratacja podniesiona – ciasto miękkie.
    { id: "english_muffin", name: "English muffin (bułeczki do McMuffina)", rheologyClass: "RHEO_TENSILE_SHAPED", hydration: 86, salt: 1.8, yeastDry: 1.45, fat: 5, sugar: 3, eggs: 0, unitWeight: 80, defaultCount: 8, unit: "bułeczka", bakeNote: "patelnia",
      shapeStep: c => `Od razu, bez wyrastania w misce, podziel ciasto na ${pl(c.pcs, "kawałek", "kawałki", "kawałków")} po około ${c.pw} g. Mokrymi dłońmi zrób kulki i spłaszcz je na placki grubości ok. 2 cm (średnica 8–9 cm). Każdy obtocz z obu stron w kaszce kukurydzianej lub mące kukurydzianej i ułóż na blasze z papierem, z odstępami.`,
      preBake: "Rozgrzej suchą patelnię (najlepiej żeliwną) na MAŁYM ogniu. Przekładaj bułeczki ostrożnie łopatką, nie ugniataj." },
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
    { id: "langosz",     name: "Langosz",               rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 2.0, yeastDry: 1.45, fat: 6, sugar: 2, eggs: 3, unitWeight: 120, defaultCount: 5, unit: "placek", bakeNote: "smażenie w 175°C" },
    // Brioche: bardzo bogate ciasto (masło ok. 18–20%, jajka ok. 25%). Źródło: klasyczna brioche (proporcje piekarskie), dostosowane do klasy 6.
    { id: "brioche", name: "Bułki brioche (np. do burgerów)", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.6, yeastDry: 1.5, fat: 18, sugar: 10, eggs: 25, unitWeight: 80, defaultCount: 8, unit: "bułka", bakeNote: "190°C, 15–18 min", sweet: true,
      preBake: "Przed pieczeniem posmaruj bułki mlekiem lub samym białkiem. Do burgerów możesz posypać sezamem." },
    // Placek drożdżowy z kruszonką (blachowy). Źródło: tradycyjna receptura polska, proporcje jak drożdżówki, ciasto rozprowadzane w formie.
    { id: "placek_kruszonka", name: "Placek drożdżowy z kruszonką", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.5, yeastDry: 1.5, fat: 14, sugar: 13, eggs: 20, unitWeight: 700, defaultCount: 1, unit: "blacha 24 × 30 cm", bakeNote: "180°C, 35 min", sweet: true,
      shapeStep: () => "Od razu, bez wyrastania w misce, przełóż ciasto do formy 24 × 30 cm wyłożonej papierem i rozprowadź równo mokrymi dłońmi lub mokrą łyżką. Jeśli chcesz, ułóż na wierzchu owoce (śliwki, jabłka, jagody), lekko wciskając.",
      preBake: "Kruszonka: 60 g zimnego masła, 60 g cukru i 90 g mąki (np. Mix C, ryżowej lub skrobi z mąką ryżową) rozetrzyj palcami na grudki. Posyp wyrośnięte ciasto tuż przed pieczeniem." },
    // ===== Nowe przepisy drożdżowe (v2.15, 19.11.2026). Proporcje piekarskie wg typowych receptur polskich i klasycznych (tłuszcz, cukier, jajka w % od mąki), dopasowane do klas reologicznych. =====
    { id: "chleb_ziarnisty", name: "Chleb z ziarnami (słonecznik, dynia, siemię)", rheologyClass: "RHEO_FREE_STANDING_LOAF", salt: 2.0, yeastDry: 1.45, fat: 3, sugar: 1, eggs: 0, unitWeight: 750, defaultCount: 1, unit: "bochenek", bakeNote: "220°C 15 min, potem 200°C 45 min",
      shapeStep: () => "Wmieszaj w ciasto 100 g ziaren (słonecznik, pestki dyni, siemię lniane – siemię najlepiej namoczone wcześniej w 50 g wody). Bez wyrastania w misce uformuj mokrymi dłońmi bochenek albo przełóż ciasto do keksówki wyłożonej papierem. Wierzch zwilż wodą i posyp ziarnami." },
    { id: "chleb_owsiany", name: "Chleb owsiany na miodzie (z formy)", preferFlour: { ows: 0.3 }, rheologyClass: "RHEO_POURABLE_HIGH_HYDRATION", salt: 1.8, yeastDry: 1.45, fat: 3, sugar: 3, eggs: 0, unitWeight: 750, defaultCount: 1, unit: "forma", bakeNote: "200°C, 50 min",
      preBake: "Cukier w tym chlebie zastąp miodem (taka sama waga). Wierzch posmaruj wodą i posyp płatkami owsianymi bezglutenowymi." },
    { id: "bulki_ziarniste", name: "Bułki ziarniste", rheologyClass: "RHEO_TENSILE_SHAPED", salt: 2.0, yeastDry: 1.45, fat: 3, sugar: 1, eggs: 0, unitWeight: 90, defaultCount: 8, unit: "bułka", bakeNote: "220°C, 20 min z parą",
      preBake: "Przed pieczeniem zwilż bułki wodą i obtocz wierzch w ziarnach (słonecznik, sezam, siemię, pestki dyni)." },
    // Cebularz lubelski: płaski placek z cebulą i makiem. Źródło: receptura tradycyjna (Produkt Regionalny – cebularz lubelski).
    { id: "cebularze", name: "Cebularze lubelskie", rheologyClass: "RHEO_TENSILE_SHAPED", salt: 1.8, yeastDry: 1.45, fat: 5, sugar: 3, eggs: 5, unitWeight: 90, defaultCount: 8, unit: "cebularz", bakeNote: "230°C, 12–15 min",
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "kawałek", "kawałki", "kawałków")} po około ${c.pw} g. Mokrymi dłońmi zrób kulki i rozpłaszcz je na blasze z papierem na placki o średnicy ok. 12 cm, z grubszym brzegiem.`,
      preBake: "Farsz: 2 duże cebule pokrój w drobną kostkę, wymieszaj z 1 łyżką oleju, 1 łyżeczką maku i szczyptą soli. Wyrośnięte placki posmaruj roztrzepanym jajkiem, wciśnij środek palcami i rozłóż cebulę, zostawiając brzeg." },
    { id: "pide", name: "Bułki do kebaba (pide)", rheologyClass: "RHEO_TENSILE_SHAPED", salt: 1.8, yeastDry: 1.45, fat: 5, sugar: 2, eggs: 0, unitWeight: 150, defaultCount: 4, unit: "bułka", bakeNote: "230°C, 12–14 min",
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "kawałek", "kawałki", "kawałków")} po około ${c.pw} g. Mokrymi dłońmi uformuj owalne placki grubości ok. 2 cm i ułóż na blasze z papierem.`,
      preBake: "Posmaruj placki mlekiem lub jajkiem, mocno dociśnij palcami wzór kratki i posyp sezamem lub czarnuszką." },
    { id: "bulki_czosnkowe", name: "Odrywane bułeczki czosnkowe (do grilla)", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.8, yeastDry: 1.45, fat: 10, sugar: 3, eggs: 10, unitWeight: 50, defaultCount: 12, unit: "kulka", bakeNote: "190°C, 25 min",
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "kulkę", "kulki", "kulek")} po około ${c.pw} g (mokre dłonie). Ułóż je ciasno, jedna przy drugiej, w okrągłej formie wyłożonej papierem.`,
      preBake: "Masło czosnkowe: 50 g miękkiego masła, 3 przeciśnięte ząbki czosnku, natka pietruszki, szczypta soli. Połowę rozsmaruj na kulkach przed pieczeniem, resztę zaraz po wyjęciu z piekarnika." },
    // Szneki z glancem – ślimaki drożdżowe z lukrem (Pomorze, Kujawy). Proporcje jak drożdżówki.
    { id: "szneki", name: "Szneki z glancem", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.5, yeastDry: 1.5, fat: 14, sugar: 14, eggs: 18, unitWeight: 90, defaultCount: 8, unit: "szneka", bakeNote: "180°C, 20 min", sweet: true,
      shapeStep: c => `Bez wyrastania w misce rozwałkuj ciasto na papierze oprószonym mąką ryżową na prostokąt grubości ok. 1 cm. Posmaruj roztopionym masłem i posyp cukrem z cynamonem. Zwiń ciasno wzdłuż dłuższego boku (pomagaj sobie papierem) i pokrój na ${pl(c.pcs, "plaster", "plastry", "plastrów")}. Ułóż je na blasze z papierem.`,
      preBake: "Glanc (lukier) zrób po upieczeniu: 150 g cukru pudru utrzyj z 2–3 łyżkami gorącej wody i polej jeszcze ciepłe szneki." },
    { id: "jagodzianki", name: "Jagodzianki", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.5, yeastDry: 1.5, fat: 14, sugar: 14, eggs: 20, unitWeight: 90, defaultCount: 8, unit: "jagodzianka", bakeNote: "180°C, 20 min", sweet: true,
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "kawałek", "kawałki", "kawałków")} po około ${c.pw} g. Każdy rozpłaszcz na dłoni (mokrej lub oprószonej mąką ryżową), nałóż 1 łyżkę jagód wymieszanych z cukrem i łyżeczką skrobi ziemniaczanej, zlep brzegi i ułóż złączeniem w dół na blasze z papierem.`,
      preBake: "Posmaruj roztrzepanym jajkiem i posyp kruszonką (30 g masła, 30 g cukru, 45 g mąki, rozetrzyj palcami)." },
    { id: "strucla_makowa", name: "Strucla z makiem (makowiec drożdżowy)", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.6, yeastDry: 1.5, fat: 15, sugar: 14, eggs: 22, unitWeight: 750, defaultCount: 1, unit: "strucla", bakeNote: "175°C, 40 min", sweet: true,
      shapeStep: () => "Bez wyrastania w misce rozwałkuj ciasto na papierze oprószonym mąką ryżową na prostokąt ok. 30 × 35 cm. Rozsmaruj gotową masę makową (ok. 500 g), zostawiając 2 cm brzegu. Zwiń ciasno, pomagając sobie papierem, i przełóż razem z papierem do keksówki albo na blachę, złączeniem w dół.",
      preBake: "Posmaruj roztrzepanym jajkiem. Jeśli wierzch za szybko się rumieni, po 25 minutach przykryj go folią aluminiową." },
    { id: "rogaliki_drozdzowe", name: "Rogaliki drożdżowe z dżemem", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.5, yeastDry: 1.5, fat: 16, sugar: 10, eggs: 18, unitWeight: 40, defaultCount: 16, unit: "rogalik", bakeNote: "180°C, 15 min", sweet: true,
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na 2 części. Każdą rozwałkuj na papierze oprószonym mąką ryżową na koło o średnicy ok. 30 cm i pokrój jak tort na 8 trójkątów (razem ${c.pcs}). Na szerszym końcu połóż łyżeczkę gęstego dżemu lub powideł i zwiń w rogalik. Ułóż na blasze z papierem.`,
      preBake: "Posmaruj roztrzepanym jajkiem. Po upieczeniu i wystudzeniu posyp cukrem pudrem." },
    // Pampuchy (kluski na parze / buchty): ciasto drożdżowe z mlekiem, gotowane na parze, bez piekarnika.
    { id: "pampuchy", name: "Pampuchy (kluski drożdżowe na parze)", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.5, yeastDry: 1.5, fat: 6, sugar: 5, eggs: 10, unitWeight: 70, defaultCount: 10, unit: "pampuch", bakeNote: "na parze, pod przykryciem, 15–18 min",
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "kulkę", "kulki", "kulek")} po około ${c.pw} g (mokre dłonie). Ułóż je na kwadratach papieru do pieczenia, z odstępami.`,
      preBake: "Zagotuj wodę w szerokim garnku i nałóż na niego sitko lub parowar (woda nie może dotykać klusek). Wkładaj pampuchy razem z papierem, przykryj i gotuj na parze 15–18 minut, nie podnosząc pokrywki. Podawaj od razu, z sosem, jagodami albo masłem z cukrem." },
    // ===== v2.16 (19.11.2026): kuchnie świata, kuchnia włoska, ciasta laminowane, święta, przekąski, śniadania. Proporcje piekarskie wg typowych receptur. =====
    // Laminowane: `laminate` = masło do przekładania jako ułamek masy ciasta (dopisywane w UI jako osobna pozycja). Technika wg The Loopy Whisk (GF croissants): ciasto bogate z psyllium, zimne, 3 złożenia pojedyncze.
    { id: "croissant", name: "Croissanty (rogaliki francuskie, listkowane)", laminate: 0.35, rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.8, yeastDry: 1.5, fat: 8, sugar: 10, eggs: 10, unitWeight: 75, defaultCount: 8, unit: "croissant", bakeNote: "200°C, 20 min", sweet: true,
      shapeStep: c => `To ciasto laminowane – potrzebuje czasu i zimna. Owiń ciasto folią, rozpłaszcz na prostokąt i schłódź w lodówce 1 godzinę (bez wyrastania w cieple). Zimne masło do przekładania rozbij wałkiem między papierem na płaski prostokąt ok. 15 × 20 cm i też schłódź. Rozwałkuj ciasto na papierze oprószonym mąką ryżową na prostokąt dwa razy dłuższy niż masło, połóż masło na połowie, przykryj drugą połową i dociśnij brzegi. Rozwałkuj na długi pas, złóż na trzy jak list i schłódź 30 minut. Powtórz wałkowanie i składanie jeszcze 2 razy (razem 3 złożenia, za każdym razem 30 minut w lodówce). Na koniec rozwałkuj na grubość 5 mm, pokrój na ${pl(c.pcs, "wysoki trójkąt", "wysokie trójkąty", "wysokich trójkątów")} i zwiń luźno od szerszego boku. Ułóż na blasze z papierem.`,
      preBake: "Posmaruj roztrzepanym jajkiem (ostrożnie, nie zalewaj warstw na bokach). Piecz od razu po wyrośnięciu, zanim masło zacznie się topić – wyrastanie w temperaturze pokojowej, nie w ciepłym miejscu." },
    { id: "rogale_marcinskie", name: "Rogale świętomarcińskie (z białym makiem)", laminate: 0.3, rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.6, yeastDry: 1.5, fat: 8, sugar: 10, eggs: 12, unitWeight: 150, defaultCount: 4, unit: "rogal", bakeNote: "180°C, 25 min", sweet: true,
      shapeStep: c => `Ciasto laminowane: owiń folią, rozpłaszcz i schłódź 1 godzinę. Zimne masło do przekładania rozbij między papierem na prostokąt ok. 15 × 20 cm. Zawiń masło w ciasto, rozwałkuj na pas, złóż na trzy i schłódź 30 minut – powtórz 3 razy. Masa: 250 g gotowej masy z białym makiem wymieszaj z 2 łyżkami pokruszonych bezglutenowych biszkoptów i bakaliami. Rozwałkuj ciasto na 5 mm, pokrój na ${pl(c.pcs, "trójkąt", "trójkąty", "trójkątów")}, nałóż masę na szerszy brzeg i zwiń w rogale.`,
      preBake: "Posmaruj jajkiem. Po upieczeniu polej lukrem (cukier puder z gorącą wodą) i posyp posiekanymi orzechami." },
    { id: "bao", name: "Bułeczki bao (na parze, do nadziewania)", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.6, yeastDry: 1.5, fat: 6, sugar: 8, eggs: 0, unitWeight: 50, defaultCount: 12, unit: "bułeczka", bakeNote: "na parze, pod przykryciem, 12–14 min",
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "kulkę", "kulki", "kulek")} po około ${c.pw} g. Każdą rozwałkuj na owal grubości 5 mm, posmaruj odrobiną oleju i złóż na pół (zostanie kieszonka do nadziewania). Ułóż na kwadratach papieru do pieczenia.`,
      preBake: "Gotuj na parze (woda nie może dotykać bułeczek), pod przykryciem, 12–14 minut. Nie podnoś pokrywki przez pierwsze 10 minut. Nadziewaj pieczonym boczkiem, kurczakiem w sosie, ogórkiem i kolendrą." },
    { id: "pinsa", name: "Pinsa rzymska", rheologyClass: "RHEO_TENSILE_SHAPED", hydration: 85, salt: 2.2, yeastDry: 1.2, fat: 3, sugar: 0, eggs: 0, unitWeight: 300, defaultCount: 2, unit: "pinsa", bakeNote: "250°C, 10–12 min",
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "część", "części", "części")} po około ${c.pw} g. Na papierze do pieczenia, mokrymi dłońmi, rozciągnij każdą w owal ok. 30 × 20 cm, z grubszym brzegiem. Pinsa najlepiej wychodzi z wyrastania w lodówce przez noc.`,
      preBake: "Piecz na rozgrzanej blasze lub kamieniu: najpierw 6 minut z samą oliwą, potem dodaj sos, mozzarellę i dodatki i piecz jeszcze 4–6 minut." },
    { id: "panzerotti", name: "Panzerotti (smażone pierożki z pomidorem i mozzarellą)", rheologyClass: "RHEO_LAMINATED_ROLLED_STUFFED", salt: 2.0, yeastDry: 1.45, fat: 6, sugar: 2, eggs: 0, unitWeight: 75, defaultCount: 8, unit: "panzerotto", bakeNote: "smażenie w 175°C",
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "kulkę", "kulki", "kulek")} po około ${c.pw} g. Każdą rozwałkuj na papierze na koło o średnicy ok. 14 cm. Na połowę nałóż łyżkę gęstej passaty i kawałki odsączonej mozzarelli, złóż na pół i bardzo dokładnie zlep brzegi widelcem.` },
    { id: "bomboloni", name: "Bomboloni (włoskie pączki z kremem)", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.6, yeastDry: 1.5, fat: 12, sugar: 12, eggs: 22, unitWeight: 60, defaultCount: 10, unit: "bombolone", bakeNote: "smażenie w 170°C", sweet: true,
      preBake: "Smaż w oleju rozgrzanym do 170°C po 2–3 minuty z każdej strony. Obtocz w cukrze i jeszcze ciepłe nadziej rękawem kremem budyniowym (crema pasticcera), nutellą lub dżemem." },
    { id: "paska", name: "Paska wielkanocna (słodki chleb z bakaliami)", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.4, yeastDry: 1.5, fat: 20, sugar: 18, eggs: 30, unitWeight: 750, defaultCount: 1, unit: "forma", bakeNote: "170°C, 45–50 min", sweet: true,
      shapeStep: () => "Wmieszaj w ciasto 100 g rodzynek i kandyzowanej skórki pomarańczowej oraz skórkę z 1 cytryny. Bez wyrastania w misce przełóż do wysokiej formy (np. puszki po panettone lub tortownicy 18 cm) wyłożonej papierem, wypełniając do połowy.",
      preBake: "Posmaruj jajkiem. Gdy wierzch się zrumieni (ok. 25 min), przykryj folią aluminiową. Po upieczeniu polej lukrem i posyp kolorową posypką." },
    { id: "pizzerinki", name: "Pizzerinki (małe pizze do pudełka)", rheologyClass: "RHEO_TENSILE_SHAPED", salt: 2.0, yeastDry: 1.45, fat: 5, sugar: 1, eggs: 0, unitWeight: 40, defaultCount: 15, unit: "pizzerinka", bakeNote: "220°C, 12–14 min",
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "kulkę", "kulki", "kulek")} po około ${c.pw} g. Rozpłaszcz mokrymi dłońmi na krążki o średnicy 8 cm i ułóż na blasze z papierem.`,
      preBake: "Na wyrośnięte krążki nałóż łyżeczkę sosu pomidorowego, starty ser i dodatki (szynka, salami, oregano)." },
    { id: "chleb_proteinowy", name: "Chleb proteinowy (ciecierzyca, amarantus, ziarna)", boldByDesign: true, preferFlour: { cie: 0.25, ama: 0.1 }, rheologyClass: "RHEO_FREE_STANDING_LOAF", salt: 2.0, yeastDry: 1.45, fat: 3, sugar: 1, eggs: 0, unitWeight: 750, defaultCount: 1, unit: "bochenek", bakeNote: "220°C 15 min, potem 200°C 45 min",
      shapeStep: () => "Wmieszaj w ciasto 80 g ziaren (słonecznik, pestki dyni, siemię). Bez wyrastania w misce przełóż do keksówki wyłożonej papierem i wyrównaj mokrą łyżką. Posyp ziarnami." },
    { id: "bulka_tarta", name: "Chleb na bułkę tartą (domowa bułka tarta)", rheologyClass: "RHEO_FREE_STANDING_LOAF", salt: 2.0, yeastDry: 1.45, fat: 2, sugar: 1, eggs: 0, unitWeight: 700, defaultCount: 1, unit: "bochenek", bakeNote: "220°C 15 min, potem 200°C 40 min",
      preBake: "Po upieczeniu: wystudź (najlepiej zostaw do następnego dnia), pokrój w kostkę 1 cm i susz w piekarniku w 120°C przez 40–60 minut, mieszając co 15 minut, aż będzie zupełnie sucha. Wystudź i zmiel w blenderze. Z bochenka wychodzi ok. 400 g bułki tartej; przechowuj w słoiku do 2 miesięcy." },
    // ===== v2.20: przepisy dedykowane urządzeniom (pole `device`) =====
    { id: "paczki_air", device: "air", name: "Pączki z air fryera (pieczone, z nadzieniem)", rheologyClass: "RHEO_ENRICHED_BRIOCHE_FRIED", salt: 1.5, yeastDry: 1.5, fat: 12, sugar: 12, eggs: 20, unitWeight: 50, defaultCount: 12, unit: "pączek", sweet: true,
      bakeNote: "frytkownica beztłuszczowa, tryb ręczny 170°C, 9–11 min, partiami po 5–6 sztuk",
      shapeStep: c => `Bez wyrastania w misce podziel ciasto na ${pl(c.pcs, "kulkę", "kulki", "kulek")} po około ${c.pw} g (mokre dłonie) i ułóż każdą na kwadraciku papieru do pieczenia – łatwiej je potem przenieść do kosza.`,
      preBake: "Posmaruj kulki roztopionym masłem. Rozgrzej frytkownicę przez 3 minuty w trybie ręcznym i włóż partię razem z papierkami (z odstępami, jedna warstwa). Komunikat „Potrząśnij” zignoruj. Gorące pączki posmaruj masłem, obtocz w cukrze i nadziej rękawem konfiturą lub budyniem." }



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
    paczki: [170, 0, 0, "fry"], langosz: [175, 0, 0, "fry"],
    english_muffin: [0, 7, 9, "griddle"], brioche: [190, 15, 18], placek_kruszonka: [180, 30, 35],
    chleb_ziarnisty: [220, 50, 55, "twoStage"], chleb_owsiany: [200, 45, 50], bulki_ziarniste: [220, 18, 20, "steam"], cebularze: [230, 12, 14], pide: [230, 12, 14],
    bulki_czosnkowe: [190, 22, 25], szneki: [180, 18, 20], jagodzianki: [180, 18, 20], strucla_makowa: [175, 35, 40], rogaliki_drozdzowe: [180, 13, 15],
    croissant: [200, 18, 20], rogale_marcinskie: [180, 22, 25], pinsa: [250, 10, 12], panzerotti: [175, 0, 0, "fry"], bomboloni: [170, 0, 0, "fry"], paska: [170, 45, 50],
    pizzerinki: [220, 12, 14], chleb_proteinowy: [220, 50, 55, "twoStage"], bulka_tarta: [220, 45, 55, "twoStage"]
    // bao: na parze – bez piekarnika
    // pampuchy: na parze – bez piekarnika (ovenPlan zwraca null, używany bakeNote)
  };
  const GF_TIME_FACTOR = 1.2;     // żel psyllium + skrobi potrzebuje dłużej, żeby się upiec w środku
  const MIN_OVEN_TEMP = 150; // najniższa temperatura pieczenia (także drugiego etapu)
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
    if (mode === "griddle") return { note: `sucha patelnia na małym ogniu, pod przykryciem, ${m0}–${m1} min z każdej strony (bezglutenowe potrzebują dłużej niż pszenne)`, doneness: "Gotowe, gdy oba boki są złote, a boki bułeczki sprężyste po naciśnięciu. Najpewniej: w środku 96°C. Jeśli z zewnątrz są gotowe, a w środku wilgotne, dopiecz 8–10 min w piekarniku w 180°C. Przed podaniem rozdziel widelcem na pół i opiecz w tosterze." };
    if (mode === "stone") return { note: `jak najwyższa temperatura piekarnika (${t0 >= 300 ? "250–300" : t0}°C), najlepiej na rozgrzanym kamieniu lub odwróconej blasze, ${m0}–${m1} min`, doneness: "Gotowe, gdy brzegi są wyrośnięte i lekko przypieczone, a spód twardy i rumiany." };
    const drop = browningDrop(b) + (mode === "filled" ? 10 : 0);
    const t = Math.max(MIN_OVEN_TEMP, round5(t0 - drop + cT));
    const realDrop = Math.max(0, t0 - t - cT);
    const k = GF_TIME_FACTOR * (1 + 0.05 * (realDrop / 5)) * cK; // dłużej o ok. 5% na każde 5°C mniej, plus korekta użytkownika
    const a = Math.round(m0 * k), z = Math.round(m1 * k);
    let note = `${t}°C, góra–dół bez termoobiegu, środkowa półka, ${a}–${z} min`;
    if (mode === "twoStage") note = `${t}°C przez 15 min, potem ${Math.max(MIN_OVEN_TEMP, t - 20)}°C, razem ${a}–${z} min, z parą na początku`;
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
  const XANTHAN_PER_PSYLLIUM = 0.6;
  /** Czy mąka/mieszanka ma własne spoiwo (HPMC, guma ksantanowa/guar, błonnik z babki płesznik). */
  const hasBinder = i => !!(i.hasHPMC || /HPMC|guma|guar|płesznik|babki/i.test(i.composition || ""));
  /** Udział mąk ze spoiwem w mieszance (0–1). */
  const binderShareOf = blend => blend.reduce((s, b) => { const [i, x] = Array.isArray(b) ? b : [b.ingredient, b.share]; return s + (hasBinder(i) ? x : 0); }, 0);
  // Psyllium: ilości w klasach zakładają mieszankę ze spoiwem (Schär Mix B). Przy samych mąkach – jak The Loopy Whisk:
  // 5–7 g łuski na 100 g mąk (theloopywhisk.com/2021/10/23/psyllium-husk-101/). Proszek = 85% wagi łuski.
  const PSY_POWDER = 0.85, PSY_WATER_PER_PCT = 8;
  // % łuski przy samych mąkach (bez spoiwa) per klasa; bogate ciasta mniej (jajka i tłuszcz też wiążą)
  const PSY_PURE = { RHEO_POURABLE_HIGH_HYDRATION: 4.5, RHEO_FREE_STANDING_LOAF: 5.5, RHEO_TENSILE_SHAPED: 5.5, RHEO_LAMINATED_ROLLED_STUFFED: 5.5, RHEO_STIFF_EXTRUDED_BOILED: 5, RHEO_ENRICHED_BRIOCHE_FRIED: 4.5 };    // zamiennik, gdy brak psyllium
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

  // ---------- Smak mąk (0 = neutralna jak pszenna, 1 = bardzo wyrazista) ----------
  // Źródło: literatura sensoryczna mąk bezglutenowych i doświadczenie piekarzy; do kalibracji ocenami „Jak wyszło?”.
  const FLAVOR = {
    szi: [0, ""], skk: [0, ""], tap: [0, ""], ryzklei: [0.05, ""],
    mixb: [0.05, ""], mixit: [0.05, ""], mixc: [0.05, ""], bzbread: [0.1, "zbożowa"], bzmulti: [0.05, ""], bzekstra: [0.05, ""],
    bznalesn: [0.05, ""], scharmehl: [0.05, ""], granouni: [0.15, ""],
    ryz: [0.1, ""], sor: [0.1, "łagodna, zbożowa"], ows: [0.2, "zbożowa, owsiana"], ryzb: [0.3, "orzechowa"],
    kuk: [0.45, "kukurydziana, słodkawa"], mig: [0.5, "migdałowa, orzechowa"], jag: [0.6, "jaglana, lekko gorzkawa"],
    tef: [0.6, "słodowa"], kasztan: [0.6, "kasztanowa, słodka"], ama: [0.65, "trawiasta"], ocelio: [0.4, "gryczana"],
    fbaprot: [0.6, "grochowa"], cie: [0.8, "fasolowa (z ciecierzycy)"], kok: [0.8, "kokosowa"], gry: [0.9, "gryczana, ziemista"],
    dynia: [1, "z pestek dyni, mocna"]
  };
  const PROFILE_FLAVOR = { neutral: 0.1, mild_sweet: 0.35, savory: 0.7, earthy: 0.8 };
  /** Intensywność smaku składnika (0–1); w słodkich wypiekach nuty słodkie/orzechowe przeszkadzają mniej. */
  function flavorOf(i, bake) {
    const f = FLAVOR[i.id] ? FLAVOR[i.id][0] : (i.flavor ?? PROFILE_FLAVOR[i.flavorProfile] ?? 0.4);
    return bake && bake.sweet && i.flavorProfile === "mild_sweet" ? f * 0.5 : f;
  }
  /** Opis smaku mieszanki dla użytkownika. @param {Blend} blend */
  function tasteOf(blend, bake) {
    let score = 0, top = null, topV = 0;
    for (const [i, x] of blend) {
      const f = flavorOf(i, bake); score += x * f;
      if (x * f > topV) { topV = x * f; top = i; }
    }
    const note = top && (FLAVOR[top.id] ? FLAVOR[top.id][1] : top.name.toLowerCase());
    const text = score < 0.12 ? "neutralny, zbliżony do pszennego"
      : score < 0.25 ? `łagodny${note ? `, lekka nuta: ${note}` : ""}`
      : score < 0.4 ? `wyczuwalny${note ? `, nuta: ${note}` : ""}`
      : `wyrazisty${note ? `, dominuje nuta: ${note}` : ""}`;
    return { score, text, level: score < 0.12 ? 0 : score < 0.25 ? 1 : score < 0.4 ? 2 : 3 };
  }

  // ---------- Tekstura: co dana mąka/skrobia robi z miąższem (0–1) ----------
  // chew = ciągliwość, „gryz” (tapioka, ryż kleisty); soft = miękkość, puszystość (skrobia ziemniaczana, owsiana);
  // short = kruchość, rozsypywanie (kukurydziana, migdałowa); grit = piasek w zębach (gruba mąka ryżowa, kukurydziana).
  // Źródło: literatura o funkcjonalności skrobi i mąk BG (amyloza/amylopektyna, kleikowanie, granulacja) – SZACUNEK do kalibracji.
  const TEXTURE = {
    tap: [0.9, 0.4, 0.1, 0], szi: [0.3, 0.9, 0.4, 0], skk: [0.1, 0.5, 0.9, 0], ryzklei: [0.9, 0.5, 0.1, 0.1],
    ryz: [0.2, 0.3, 0.6, 0.5], ryzb: [0.2, 0.2, 0.6, 0.6], gry: [0.3, 0.4, 0.4, 0.2], kuk: [0.1, 0.3, 0.8, 0.5],
    jag: [0.2, 0.4, 0.6, 0.3], ows: [0.3, 0.7, 0.4, 0.1], cie: [0.3, 0.5, 0.5, 0.1], ama: [0.3, 0.4, 0.4, 0.2],
    sor: [0.3, 0.5, 0.5, 0.2], tef: [0.4, 0.4, 0.4, 0.2], mig: [0.1, 0.6, 0.9, 0.2], kok: [0.1, 0.5, 0.6, 0.3],
    kasztan: [0.2, 0.6, 0.5, 0.1], dynia: [0.2, 0.3, 0.5, 0.3],
    mixdom: [0.25, 0.6, 0.6, 0.15], mixb: [0.6, 0.7, 0.3, 0], mixit: [0.5, 0.7, 0.4, 0], mixc: [0.2, 0.8, 0.6, 0], scharmehl: [0.5, 0.7, 0.4, 0],
    bzbread: [0.6, 0.6, 0.3, 0.1], bzmulti: [0.4, 0.6, 0.5, 0.1], bzekstra: [0.4, 0.6, 0.5, 0.1], bznalesn: [0.4, 0.6, 0.4, 0.1],
    granouni: [0.4, 0.6, 0.5, 0.2], ocelio: [0.4, 0.5, 0.4, 0.2], fbaprot: [0.3, 0.5, 0.4, 0.2]
  };
  const TEXTURE_ROLE = { commercial_base: [0.4, 0.6, 0.4, 0.1], pure_starch: [0.3, 0.6, 0.5, 0], wholegrain_structure: [0.2, 0.4, 0.5, 0.3], high_protein: [0.3, 0.4, 0.5, 0.2] };
  // Cel = tekstura pszennego odpowiednika [chew, soft, short]; przepis może nadpisać polem `texture`.
  const TEX_TARGET = {
    RHEO_POURABLE_HIGH_HYDRATION: [0.45, 0.7, 0.3], RHEO_FREE_STANDING_LOAF: [0.5, 0.55, 0.3], RHEO_TENSILE_SHAPED: [0.5, 0.6, 0.3],
    RHEO_LAMINATED_ROLLED_STUFFED: [0.5, 0.6, 0.35], RHEO_STIFF_EXTRUDED_BOILED: [0.65, 0.45, 0.3], RHEO_ENRICHED_BRIOCHE_FRIED: [0.4, 0.85, 0.35],
    RHEO_SCALDED_BOILED_DOUGH: [0.7, 0.5, 0.2], RHEO_CURD_POTATO_DUMPLINGS: [0.4, 0.8, 0.3], RHEO_SHORTCRUST_COOKIE_CRISP: [0.15, 0.45, 0.75],
    RHEO_FOAM_EMULSION_CAKE: [0.15, 0.9, 0.5], RHEO_BATTER_COATING_SUSPENSION: [0.35, 0.6, 0.5], RHEO_CHEM_LEAVENED_MUFFIN_CHOUX: [0.2, 0.85, 0.5]
  };
  // Korekty tekstury z ocen „Jak wyszło?” per przepis: {chew, soft, short, grit} (ustawiane z UI przez setTexAdj)
  let TEX_ADJ = {};
  function setTexAdj(map) { TEX_ADJ = map || {}; }
  const texAdjOf = id => TEX_ADJ[id] || 0;
  function texTarget(bake) {
    const T = bake.texture || TEX_TARGET[bake.rheologyClass];
    if (!T) return null;
    const a = TEX_ADJ[bake.id] || {};
    const cl = v => Math.max(0, Math.min(1, v));
    return [cl(T[0] + (a.chew || 0)), cl(T[1] + (a.soft || 0)), cl(T[2] + (a.short || 0)), 1 + (a.grit || 0)];
  }
  const texOf = ing => TEXTURE[ing.id] || TEXTURE_ROLE[ing.role] || [0.3, 0.5, 0.5, 0.2];
  /** Tekstura mieszanki (średnia ważona). @param {Blend} blend */
  function textureOf(blend) {
    const t = [0, 0, 0, 0];
    for (const [ing, x] of blend) texOf(ing).forEach((v, k) => { t[k] += x * v; });
    return { chew: t[0], soft: t[1], short: t[2], grit: t[3] };
  }
  /** Koszt odległości tekstury mieszanki od pszennego wzorca + kara za „piasek”. */
  function textureCost(blend, bake) {
    const T = texTarget(bake);
    if (!T) return 0;
    const m = textureOf(blend);
    // tapioka powyżej 30% mąk = ciasto gumowate (dotyczy każdego przepisu)
    const tap = blend.reduce((a, [i, x]) => a + (i.id === "tap" ? x : 0), 0);
    return Math.max(0, tap - 0.3) * 20 + ((m.chew - T[0]) / 0.15) ** 2 + ((m.soft - T[1]) / 0.2) ** 2 + ((m.short - T[2]) / 0.2) ** 2 + 2 * T[3] * m.grit;
  }
  /** Dopasowanie tekstury 0–100% (100 = jak wzorzec pszenny). */
  function textureMatch(blend, bake) {
    const T = texTarget(bake);
    if (!T) return null;
    const m = textureOf(blend), d = Math.hypot(m.chew - T[0], m.soft - T[1], m.short - T[2]) + 0.5 * m.grit;
    return Math.max(0, Math.round(100 - d * 120));
  }

  /** Funkcja kosztu solvera. @param {Blend} blend @param {RheologyClass} cls */
  function blendCost(blend, cls, tasteW = 0, bake = null, avail = null) {
    const p = profileOf(blend), t = cls.target;
    let c;
    if (tasteW) {
      // Tryb „jak pszenny”: białko i błonnik liczone do zakresu z luzem (strukturę trzyma psyllium), smak ważniejszy
      const d = (x, lo, hi) => (x < lo ? lo - x : x > hi ? x - hi : 0);
      c = (d(p.protein, t.protein[0] - 2.5, t.protein[1]) / 1.1) ** 2
        + ((p.starch - mid(t.starch)) / 2) ** 2
        + (d(p.fiber, t.fiber[0] - 1.5, t.fiber[1] + 1) / 0.9) ** 2
        + 0.05 * ((p.protein - mid(t.protein)) / 1.1) ** 2;
    } else {
      const pDiv = cls.proteinPriority ? 0.5 / cls.proteinPriority : 0.5;
      c = ((p.protein - mid(t.protein)) / pDiv) ** 2
        + ((p.starch - mid(t.starch)) / 2) ** 2
        + ((p.fiber - mid(t.fiber)) / 0.5) ** 2;
    }
    if (bake) c += textureCost(blend, bake);
    for (const [ing, x] of blend) {
      if (x <= 1e-9) continue;
      c += 0.15; // prostota: każda kolejna mąka kosztuje
      if (ing.maxShare && x > ing.maxShare + 1e-9) c += (x - ing.maxShare) * 200;
      if (tasteW) c += tasteW * x * flavorOf(ing, bake); // kara za wyrazisty smak (tryb „jak pszenny”)
    }
    // Wypiek, którego smak wynika z konkretnej mąki (np. chleb gryczany) – preferowany jej udział
    for (const [id, want] of Object.entries((bake && bake.preferFlour) || {})) {
      if (!blend.some(([i]) => i.id === id) && !(avail || new Set()).has(id)) continue;
      const hit = blend.find(([i]) => i.id === id);
      c += (((hit ? hit[1] : 0) - want) / 0.05) ** 2 * 3 + (hit ? 0 : 80); // brak mąki „z nazwy” = poważny błąd
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
  function solveFlourBlend(pantryFlours, bake, tasteW = 0) {
    const key = bake.id + "|" + tasteW + "|" + JSON.stringify(TEX_ADJ[bake.id] || 0) + "|" + pantryFlours.map(i => i.id + ":" + i.macros.protein + ":" + i.macros.fiber).join(",");
    if (!solveCache.has(key)) { if (solveCache.size >= 300) solveCache.clear(); solveCache.set(key, solveFlourBlendRaw(pantryFlours, bake, tasteW)); }
    return solveCache.get(key);
  }
  function solveFlourBlendRaw(pantryFlours, bake, tasteW = 0) {
    const cls = RHEOLOGY_CLASSES[bake.rheologyClass];
    const cands = pantryFlours.filter(i => i.role !== "hydrocolloid" && flavorAllowed(i, bake));
    if (!cands.length) return { blend: [], cost: Infinity, mode: "free" };
    const avail = new Set(cands.map(i => i.id));
    const cost = (/** @type {Blend} */ bl) => blendCost(bl, cls, tasteW, bake, avail);

    const mixes = cands.filter(i => i.isCommercialMix).sort((a, b) => (b.mixPriority ?? 1.5) - (a.mixPriority ?? 1.5));
    if (mixes.length) {
      const base = mixes[0];
      const comp = cands.filter(i => !i.isCommercialMix && i.role !== "pure_starch");
      const tapioca = TAPIOCA_EXCEPTION_CLASSES.has(bake.rheologyClass) ? cands.find(i => i.id === "tap") : undefined;
      /** @type {Blend} */ let best = [[base, 1]];
      let bestCost = cost(best);
      const consider = (/** @type {Blend} */ bl) => { const c = cost(bl); if (c < bestCost - 1e-9) { bestCost = c; best = bl; } };
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
      let cur = cost(toBlend(w));
      for (let it = 0; it < 60; it++) {
        let move = null, mc = cur;
        for (let i = 0; i < n; i++) {
          if (w[i] < STEP - 1e-9) continue;
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            w[i] -= STEP; w[j] += STEP;
            const c = cost(toBlend(w));
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
  /** Waga kary za smak: tryb „jak pszenny” (domyślny) albo „wyrazisty”; ocena „smak nie jak pszenny” wzmacnia. */
  const TASTE_W = 50;
  function tasteWeight(bake, taste = "wheat", calib = {}) {
    if (taste === "bold" || bake.boldByDesign) return 0;
    return TASTE_W * (bake.masked ? 0.3 : 1) * (1 + 0.5 * (calib.taste || 0));
  }
  function calculateLaboratoryFormulation({ bakeId, pantryIds, doughWeight, extraIngredients = [], calib = {}, taste = "wheat", coldProof = false, psyForm = "husk" }) {
    const bake = BAKES.find(b => b.id === bakeId);
    if (!bake) throw new Error("Nieznany wypiek: " + bakeId);
    const cls = RHEOLOGY_CLASSES[bake.rheologyClass];
    const all = INGREDIENT_MATRIX.concat(extraIngredients);
    const pantry = all.filter(i => pantryIds.includes(i.id));
    const pantryFlours = pantry.filter(i => i.role !== "hydrocolloid");
    /** @type {string[]} */ const warnings = [];

    const sol = solveFlourBlend(pantryFlours, bake, tasteWeight(bake, taste, calib));
    if (!sol.blend.length) {
      return { bake, cls, empty: true, warnings: ["Zaznacz w spiżarni przynajmniej jedną mąkę lub mieszankę, pasującą do tego wypieku."] };
    }
    const prof = profileOf(sol.blend);
    const mixShare = sol.blend.filter(([i]) => i.isCommercialMix).reduce((s, [, x]) => s + x, 0);
    const hpmcShare = sol.blend.filter(([i]) => i.hasHPMC).reduce((s, [, x]) => s + x, 0);

    const binderShare = binderShareOf(sol.blend);
    const psyBase = bake.psyllium ?? mid(cls.psyllium); // zakresy klas zakładają obecność spoiwa w mieszance
    const psyPure = Math.max(psyBase, PSY_PURE[bake.rheologyClass] || psyBase * 2);
    const psyHusk = (psyBase + (psyPure - psyBase) * (1 - binderShare)) * (1 + (calib.psy || 0) / 100);
    let psy = psyHusk * (psyForm === "powder" ? PSY_POWDER : 1);
    // więcej psyllium = więcej wody (żel); 8 pkt % hydratacji na każdy dodatkowy 1% łuski
    const dPsy = (psyHusk - psyBase) * PSY_WATER_PER_PCT;
    // A. Korekta WAC (wynik wzoru ×100 = punkty procentowe hydratacji)
    const dWAC = (prof.wac - WAC_REF) * 0.65 * 100;
    // B. Shortening
    const dFat = -Math.max(0, bake.fat - 5) * 0.40;
    // C. Cukier: hydratacja i drożdże
    const dSugar = -Math.max(0, bake.sugar - 6) * 0.25;
    const hBase = bake.hydration ?? mid(cls.hydration);
    const dUser = calib.water || 0; // korekta z ocen „Jak wyszło?”
    const hEff = hBase + dWAC + dFat + dSugar + dUser + (pantryIds.includes("psy") ? dPsy : 0);
    const COLD_YEAST = 0.6; // wyrastanie w lodówce przez noc: mniej drożdży, więcej smaku
    const yeastEff = bake.yeastDry * (1 + Math.max(0, bake.sugar - 6) * 0.035 + Math.max(0, bake.fat - 8) * 0.015) * (1 + (calib.yeast || 0) / 100) * (coldProof ? COLD_YEAST : 1);

    // Hydrokoloid
    let xan = 0;
    if (!pantryIds.includes("psy")) {
      if (pantryIds.includes("xan")) { xan = psyHusk * XANTHAN_PER_PSYLLIUM /* od łuski: forma psyllium nie zmienia ilości ksantanu */; warnings.push("Brak psyllium: używam gumy ksantanowej. Ciasto będzie mniej elastyczne."); }
      else if (hpmcShare < 0.6) warnings.push("Brak psyllium i gumy ksantanowej: ciasto nie utrzyma gazu. Dokup łuskę babki jajowatej (psyllium).");
      psy = 0;
    }

    // D. Bilans wody: jajka to 75% wody
    const E = bake.eggs / 100;
    let wAddFrac = hEff / 100 - E * EGG_WATER;
    if (wAddFrac < 0) { warnings.push("Jajka wnoszą więcej wody niż potrzeba: zmniejsz ilość jajek."); wAddFrac = 0; }
    // Żel psyllium potrzebuje min. 10 części wody na 1 część łuski (The Loopy Whisk)
    if (psy > 0 && (wAddFrac + E * EGG_WATER) * 100 < psy * 10) warnings.push("Mało płynu na psyllium (potrzeba ok. 10 g wody na 1 g łuski): ciasto może być sztywne i pękać. Jeśli tak wyjdzie, zaznacz w „Jak wyszło?” „Pękało”.");
    const FRESH_PER_DRY = 3;
    const mixSalt = sol.blend.reduce((t, [i, x]) => t + (i.saltPct || 0) * x, 0);
    const frac = { psy: psy / 100, xan: xan / 100, salt: Math.max(0, bake.salt * (1 + (calib.salt || 0) / 100) - mixSalt) / 100, yeast: yeastEff * FRESH_PER_DRY / 100 /* drożdże świeże (priorytet) */, fat: bake.fat / 100, sugar: bake.sugar / 100 };
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
      bake, cls, empty: false, mode: sol.mode, binderShare, psyForm, taste: tasteOf(sol.blend, bake), coldProof,
      blend: sol.blend.map(([ingredient, share]) => ({ ingredient, share })), textureMatch: textureMatch(sol.blend, bake),
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

  const GFEngine = { hasBinder, binderShareOf, PSY_POWDER, setTexAdj, texAdjOf, textureOf, textureCost, textureMatch, flavorOf, tasteOf, tasteWeight, ovenPlan, INGREDIENT_MATRIX, RHEOLOGY_CLASSES, BAKES, solveFlourBlend, calculateLaboratoryFormulation, validateDefaultBatches, defaultDough, profileOf };
  if (typeof module !== "undefined" && module.exports) module.exports = GFEngine;
  global.GFEngine = GFEngine;
})(typeof window !== "undefined" ? window : globalThis);
