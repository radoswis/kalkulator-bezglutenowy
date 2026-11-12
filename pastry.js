/**
 * GF Pastry Engine – rozszerzenie silnika o wyroby bezdrożdżowe (klasy 7–12).
 * Wymaga engine.js (GFEngine). Ładować PO engine.js.
 *
 * Receptury podane w procentach od masy mąk (basis "flour") albo od masy całego ciasta (basis "total",
 * wtedy `flourPct` = udział mąk w cieście). Silnik przelicza wszystko na procenty piekarskie.
 * Wartości z założeń projektu; do kalibracji próbnymi wypiekami.
 */
(function (global) {
  "use strict";
  const G = global.GFEngine;
  if (!G) throw new Error("pastry.js wymaga wcześniej załadowanego engine.js");
  const { INGREDIENT_MATRIX, RHEOLOGY_CLASSES, BAKES } = G;

  // Łagodniejszy limit migdałowej w cukiernictwie (spec: do 15–20%)
  const PASTRY_MAX_SHARE = { mig: 0.2 };

  /**
   * @typedef {'YEAST_HYDROCOLLOID_MODE'|'PASTRY_STARCH_MODE'} SolverMode
   * @typedef {Object} PastryClass
   * @property {string} label
   * @property {SolverMode} solverMode
   * @property {Record<string, number>} mixPriority  premia w koszcie za udział danej mieszanki (ujemna = kara)
   * @property {{starch:[number,number], protein:[number,number], fiber:[number,number]}} target
   */
  /** @type {Record<string, PastryClass & {family:'pastry'}>} */
  const PASTRY_CLASSES = {
    RHEO_SCALDED_BOILED_DOUGH: { family: "pastry", label: "Zaparzane i gotowane, bez drożdży", solverMode: "YEAST_HYDROCOLLOID_MODE",
      mixPriority: { mixb: 3, bznalesn: 2.5, bzbread: 2, mixit: 1.5, scharmehl: 1.5, mixc: -1, fbaprot: -2 }, target: { starch: [38, 46], protein: [5.5, 7.5], fiber: [3, 5] } },
    RHEO_CURD_POTATO_DUMPLINGS: { family: "pastry", label: "Twarogowe i ziemniaczane", solverMode: "PASTRY_STARCH_MODE",
      mixPriority: { mixb: 1.5, mixit: 1.2, mixc: 0.5 }, target: { starch: [40, 60], protein: [4, 7], fiber: [1, 3] } },
    RHEO_SHORTCRUST_COOKIE_CRISP: { family: "pastry", label: "Kruche, pierniczki, faworki", solverMode: "PASTRY_STARCH_MODE",
      mixPriority: { mixc: 2, mixit: 1.2, mixb: 0.5 }, target: { starch: [30, 40], protein: [5, 8], fiber: [2, 4] } },
    RHEO_FOAM_EMULSION_CAKE: { family: "pastry", label: "Biszkopty, sernik, czekoladowe", solverMode: "PASTRY_STARCH_MODE",
      mixPriority: { mixc: 2, mixit: 1, mixb: 0.3 }, target: { starch: [45, 55], protein: [3, 6], fiber: [0, 2] } },
    RHEO_BATTER_COATING_SUSPENSION: { family: "pastry", label: "Ciasta lejące i panierki", solverMode: "PASTRY_STARCH_MODE",
      mixPriority: { bznalesn: 2, mixc: 1.5, fbaprot: 1.5, mixit: 1.2, mixb: 0.5 }, target: { starch: [35, 45], protein: [4, 7], fiber: [1, 3] } },
    RHEO_CHEM_LEAVENED_MUFFIN_CHOUX: { family: "pastry", label: "Ucierane, muffinki, parzone", solverMode: "PASTRY_STARCH_MODE",
      mixPriority: { mixc: 2, mixit: 1.2, mixb: 0.6 }, target: { starch: [30, 40], protein: [5, 8], fiber: [2, 4] } }
  };
  Object.assign(RHEOLOGY_CLASSES, PASTRY_CLASSES);

  // ---------- Składniki receptur bezdrożdżowych ----------
  /** Etykiety i typy pozycji w tabeli. micro = zaokrąglanie do 0,5 g. */
  const COMPONENTS = {
    hotWater:      { label: "Woda gorąca (ok. 90°C)" },
    water:         { label: "Woda" },
    coldWater:     { label: "Zimna woda lub śmietana" },
    iceWater:      { label: "Lodowata woda gazowana" },
    milkWater:     { label: "Mleko i woda (pół na pół)" },
    milk:          { label: "Mleko" },
    milkOrWater:   { label: "Woda lub mleko" },
    milkOrYogurt:  { label: "Mleko lub jogurt naturalny" },
    buttermilk:    { label: "Maślanka lub mleko" },
    kefir:         { label: "Kefir lub jogurt naturalny" },
    lemonMilk:     { label: "Mleko lub sok z cytryny" },
    sourCream:     { label: "Kwaśna śmietana 18%" },
    eggs:          { label: "Jajka (bez skorupek)", egg: 50 },
    yolks:         { label: "Żółtka", egg: 18 },
    butter:        { label: "Masło" },
    softButter:    { label: "Masło miękkie" },
    coldButter:    { label: "Zimne masło" },
    meltedButter:  { label: "Masło roztopione" },
    butterOrOil:   { label: "Masło lub olej" },
    butterOrCream: { label: "Masło lub śmietanka 30%" },
    oil:           { label: "Olej" },
    sugar:         { label: "Cukier" },
    brownSugar:    { label: "Cukier (najlepiej brązowy)" },
    powderedSugar: { label: "Cukier puder" },
    honey:         { label: "Miód" },
    salt:          { label: "Sól", micro: true },
    psy:           { label: "Psyllium", micro: true },
    bakingPowder:  { label: "Proszek do pieczenia (bezglutenowy)", micro: true },
    bakingSoda:    { label: "Soda oczyszczona", micro: true },
    vinegarOrSpirit: { label: "Spirytus lub ocet jabłkowy", micro: true },
    spice:         { label: "Przyprawa korzenna", micro: true },
    cinnamon:      { label: "Cynamon", micro: true },
    cocoa:         { label: "Kakao ciemne", micro: true },
    quark:         { label: "Twaróg (zmielony)" },
    cheesecakeQuark: { label: "Twaróg sernikowy (zmielony)" },
    potatoes:      { label: "Ugotowane ziemniaki (przeciśnięte, zimne)" },
    darkChocolate: { label: "Czekolada gorzka 64–70%" },
    chocolateChips:{ label: "Czekolada posiekana lub kropelki" },
    banana:        { label: "Dojrzałe banany (rozgniecione)" },
    carrot:        { label: "Marchewka (drobno starta)" }
  };

  /**
   * @typedef {Object} StepCtx
   * @property {(key:string)=>string} g    gramatura pozycji z jednostką (jajka z liczbą sztuk)
   * @property {number} pcs  liczba sztuk
   * @property {number} pw   waga sztuki, g
   * @property {string} flour  masa mąk z jednostką
   */
  /**
   * @typedef {Object} PastryBake
   * @property {string} id
   * @property {string} name
   * @property {string} category
   * @property {string} rheologyClass
   * @property {'flour'|'total'} basis
   * @property {number} [flourPct]  dla basis 'total': udział mąk w cieście, %
   * @property {[string, number][]} components  [klucz z COMPONENTS, %]
   * @property {number} unitWeight
   * @property {number} defaultCount
   * @property {string} unit
   * @property {string} bakeNote
   * @property {boolean} [sweet]
   * @property {{starch?:[number,number], protein?:[number,number], fiber?:[number,number]}} [target]  nadpisanie celu klasy
   * @property {Record<string, number>} [prefer]  preferowany udział składnika mąk (0–1), jeśli jest w spiżarni
   * @property {(c: StepCtx) => string[]} steps
   * @property {string} [tip]
   */
  /** @type {PastryBake[]} */
  const PASTRY_BAKES = [
    // ===== KLASA 7: zaparzane, gotowane =====
    { id: "pierogi", name: "Pierogi klasyczne (do gotowania)", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["hotWater", 78], ["butterOrOil", 5], ["eggs", 5], ["psy", 1.0], ["salt", 1.8]],
      unitWeight: 20, defaultCount: 30, unit: "pieróg", bakeNote: "gotowanie 2–3 min od wypłynięcia", prefer: { tap: 0.12 },
      steps: c => [
        `W misce wymieszaj mąki (${c.flour}), sól i psyllium.`,
        `Zagotuj wodę i odmierz ${c.g("hotWater")}. Dodaj do niej masło lub olej i od razu wlej do mąki, mieszając łyżką. Gorąca woda parzy skrobię, dzięki temu ciasto jest elastyczne i nie pęka przy lepieniu.`,
        `Gdy ciasto przestygnie tak, że można go dotknąć, dodaj jajko (${c.g("eggs")}) i wyrabiaj ręką 3–4 minuty na gładką kulę. Przykryj miską i zostaw na 10 minut.`,
        `Wałkuj partiami na grubość 1,5–2 mm, podsypując skrobią lub mąką ryżową. Wykrawaj krążki szklanką, nakładaj farsz i mocno sklejaj brzegi. Wyjdzie ok. ${c.pcs} pierogów.`,
        "Gotuj partiami w dużym garnku osolonej wody na małym wrzeniu. Od wypłynięcia gotuj 2–3 minuty i wyjmuj łyżką cedzakową."
      ] },
    { id: "tortilla", name: "Tortilla / wrapy z patelni", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["hotWater", 72], ["oil", 8], ["psy", 1.2], ["bakingPowder", 1.2], ["salt", 1.8]],
      unitWeight: 75, defaultCount: 8, unit: "placek", bakeNote: "sucha patelnia, 40–60 s na stronę", prefer: { tap: 0.12 },
      steps: c => [
        `W misce wymieszaj mąki (${c.flour}), sól, psyllium i proszek do pieczenia.`,
        `Wlej ${c.g("hotWater")} gorącej wody i olej. Wymieszaj łyżką, a gdy przestygnie, wyrabiaj ręką 2–3 minuty na gładkie ciasto. Przykryj i zostaw na 10 minut.`,
        `Podziel na ${c.pcs} kulek po ok. ${c.pw} g. Każdą rozwałkuj między dwoma arkuszami papieru do pieczenia na placek ok. 20 cm (grubość 1–2 mm).`,
        "Smaż na suchej, mocno rozgrzanej patelni 40–60 sekund z każdej strony, aż pojawią się brązowe plamki.",
        "Gotowe placki od razu przykrywaj ściereczką, wtedy zostaną miękkie i będzie je można zwijać."
      ] },
    { id: "makaron", name: "Domowy makaron bezglutenowy", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["eggs", 55], ["yolks", 15], ["oil", 5], ["psy", 1.2], ["salt", 1.5]],
      unitWeight: 130, defaultCount: 4, unit: "porcja", bakeNote: "gotowanie 2–4 min w osolonym wrzątku", prefer: { tap: 0.15 },
      steps: c => [
        `Na stolnicy lub w misce wymieszaj mąki (${c.flour}), psyllium i sól. Zrób dołek.`,
        `Wbij jajka (${c.g("eggs")}), dodaj żółtka (${c.g("yolks")}) i oliwę.`,
        "Zagniataj 5 minut na gładkie, sprężyste ciasto. Jeśli się kruszy, dodaj łyżeczkę wody. Owiń folią i zostaw na 20 minut.",
        "Rozwałkuj cienko (ok. 1 mm), podsypując skrobią. Pokrój nożem lub maszynką na wstążki.",
        "Gotuj w dużej ilości osolonego wrzątku 2–4 minuty i od razu odcedź."
      ] },

    // ===== KLASA 8: twarogowe i ziemniaczane =====
    { id: "leniwe", name: "Pierogi leniwe (twarogowe)", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 25, components: [["quark", 60], ["eggs", 11], ["meltedButter", 3], ["salt", 0.5], ["sugar", 0.5]],
      unitWeight: 175, defaultCount: 4, unit: "porcja", bakeNote: "gotowanie 2 min od wypłynięcia", sweet: true,
      steps: c => [
        `Twaróg (${c.g("quark")}) zmiel lub dokładnie rozgnieć widelcem na gładko.`,
        `Dodaj jajka (${c.g("eggs")}), roztopione masło, sól i cukier. Wymieszaj.`,
        `Wsyp mąki (${c.flour}) i szybko zagnieć tylko do połączenia. Długie wyrabianie robi ciasto klejące.`,
        "Podziel na 4 części. Na podsypanej skrobią stolnicy uformuj wałki grubości ok. 2,5 cm i pokrój ukośnie na kawałki.",
        "Gotuj partiami w osolonym wrzątku, 2 minuty od wypłynięcia. Podawaj z masłem i cukrem lub bezglutenową bułką tartą."
      ] },
    { id: "kopytka", name: "Kopytka", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 22, components: [["potatoes", 68], ["eggs", 8], ["salt", 1.5]],
      unitWeight: 200, defaultCount: 4, unit: "porcja", bakeNote: "gotowanie 2–3 min od wypłynięcia",
      steps: c => [
        `Ugotuj ziemniaki w osolonej wodzie, przeciśnij przez praskę jeszcze gorące i całkowicie wystudź. Potrzebujesz ${c.g("potatoes")}.`,
        `Dodaj jajko (${c.g("eggs")}), sól i mąki (${c.flour}).`,
        "Szybko zagnieć gładkie ciasto. Nie wyrabiaj długo, bo zrobi się klejące.",
        "Formuj wałki grubości ok. 2 cm, lekko je spłaszcz i pokrój ukośnie w romby.",
        "Gotuj partiami w osolonym wrzątku, 2–3 minuty od wypłynięcia."
      ] },
    { id: "kluski_slaskie", name: "Kluski śląskie", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 20, components: [["potatoes", 75], ["eggs", 4], ["salt", 1]], target: { starch: [95, 100], protein: [0, 1], fiber: [0, 1] }, prefer: { szi: 1 },
      unitWeight: 200, defaultCount: 4, unit: "porcja", bakeNote: "gotowanie 2–3 min od wypłynięcia",
      steps: c => [
        `Ugotuj ziemniaki, przeciśnij przez praskę i całkowicie wystudź. Potrzebujesz ${c.g("potatoes")}.`,
        `Dodaj skrobię (${c.flour}), jajko (${c.g("eggs")}) i sól. Tradycyjna proporcja to 4 części ziemniaków na 1 część skrobi.`,
        "Zagnieć gładkie ciasto.",
        "Formuj kulki wielkości orzecha włoskiego i w każdej zrób kciukiem dołek.",
        "Gotuj partiami w osolonym wrzątku, 2–3 minuty od wypłynięcia. Dołek zbiera sos."
      ] },
    { id: "gnocchi", name: "Gnocchi włoskie", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 22, components: [["potatoes", 70], ["eggs", 7], ["salt", 1]],
      unitWeight: 175, defaultCount: 4, unit: "porcja", bakeNote: "gotowanie do wypłynięcia, 1–2 min",
      steps: c => [
        `Ziemniaki najlepiej upiecz w mundurkach (będą suchsze), obierz i przeciśnij jeszcze gorące. Wystudź. Potrzebujesz ${c.g("potatoes")}.`,
        `Dodaj jajko (${c.g("eggs")}), sól i mąki (${c.flour}). Zagnieć delikatnie.`,
        "Formuj wałki grubości 1,5 cm i tnij na kawałki 2 cm. Każdy przetocz po grzbiecie widelca.",
        "Gotuj w osolonym wrzątku i wyjmuj zaraz po wypłynięciu (1–2 minuty).",
        "Możesz od razu podsmażyć je na maśle z szałwią."
      ] },
    { id: "oponki", name: "Oponki serowe (smażone)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 40, components: [["quark", 42], ["eggs", 8], ["sourCream", 5], ["sugar", 4], ["bakingSoda", 0.8], ["vinegarOrSpirit", 1.5]],
      target: { starch: [35, 45] }, unitWeight: 45, defaultCount: 16, unit: "oponka", bakeNote: "smażenie w 170–175°C, 2–3 min z każdej strony", sweet: true,
      steps: c => [
        `Twaróg (${c.g("quark")}) zmiel na gładko. Wymieszaj z jajkami (${c.g("eggs")}), śmietaną, cukrem i spirytusem lub octem.`,
        `Mąki (${c.flour}) wymieszaj z sodą, wsyp do masy i zagnieć miękkie, gładkie ciasto. Wystarczy 1–2 minuty.`,
        `Rozwałkuj na grubość 1 cm, podsypując skrobią. Wykrawaj szklanką krążki, a w środku kieliszkiem dziurkę. Wyjdzie ok. ${c.pcs} sztuk.`,
        "Rozgrzej olej do 170–175°C. Wrzucony kawałek ciasta powinien od razu wypłynąć i skwierczeć. Smaż po 2–3 minuty z każdej strony na złoto.",
        "Odsącz na ręczniku papierowym i oprósz cukrem pudrem."
      ] },

    // ===== KLASA 9: kruche =====
    { id: "pierniczki", masked: true, name: "Pierniczki świąteczne", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["butter", 25], ["honey", 30], ["powderedSugar", 22], ["eggs", 15], ["milk", 5], ["bakingSoda", 1.5], ["spice", 4], ["cocoa", 3]],
      unitWeight: 18, defaultCount: 40, unit: "pierniczek", bakeNote: "180°C, 8–10 min", sweet: true,
      steps: c => [
        `W garnku podgrzej miód (${c.g("honey")}), masło i cukier puder, aż się rozpuszczą. Nie gotuj. Przestudź do letniego.`,
        `Mąki (${c.flour}) wymieszaj z sodą, przyprawą korzenną i kakao.`,
        `Wlej miodową masę, dodaj jajka (${c.g("eggs")}) i mleko. Zagnieć gładkie ciasto.`,
        "Owiń folią i schłódź w lodówce co najmniej 1 godzinę, najlepiej przez noc.",
        `Rozwałkuj między papierem na 3–4 mm i wykrawaj foremkami (ok. ${c.pcs} sztuk). Piecz w 180°C 8–10 minut.`,
        "Po upieczeniu są twarde. Zmiękną po kilku dniach w puszce, z kawałkiem jabłka."
      ] },
    { id: "kruche_ciastka", name: "Ciasteczka kruche maślane (wykrawane)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 55], ["powderedSugar", 30], ["yolks", 16], ["sourCream", 5], ["bakingPowder", 1.0], ["salt", 0.5]],
      unitWeight: 20, defaultCount: 35, unit: "ciastko", bakeNote: "180°C, 10–12 min", sweet: true, prefer: { mig: 0.15 },
      steps: c => [
        `Wymieszaj mąki (${c.flour}), cukier puder, proszek do pieczenia i sól.`,
        `Dodaj zimne masło (${c.g("coldButter")}) pokrojone w kostkę i posiekaj nożem z mąką na drobną kruszonkę.`,
        `Dodaj żółtka (${c.g("yolks")}) i śmietanę. Szybko zagnieć, bo ciepło rąk topi masło.`,
        "Owiń folią i schłódź 30 minut.",
        `Rozwałkuj na 4 mm i wykrawaj foremkami (ok. ${c.pcs} sztuk). Piecz w 180°C 10–12 minut, aż brzegi lekko się zezłocą.`,
        "Studź na blasze, ciepłe łatwo się łamią."
      ] },
    { id: "cookies", masked: true, name: "Ciastka American Cookies (z czekoladą)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["softButter", 45], ["brownSugar", 55], ["eggs", 20], ["chocolateChips", 55], ["bakingSoda", 1.0], ["salt", 1.0]],
      unitWeight: 60, defaultCount: 12, unit: "ciastko", bakeNote: "180°C, 10–12 min", sweet: true,
      steps: c => [
        `Miękkie masło (${c.g("softButter")}) utrzyj z cukrem przez 2 minuty.`,
        `Dodaj jajka (${c.g("eggs")}) i wymieszaj.`,
        `Wsyp mąki (${c.flour}) z sodą i solą. Wymieszaj krótko, tylko do połączenia. Wmieszaj czekoladę.`,
        "Schłódź ciasto 30 minut, wtedy ciastka mniej się rozpłyną.",
        `Formuj ${c.pcs} kul po ok. ${c.pw} g i układaj co 6 cm na blasze z papierem.`,
        "Piecz w 180°C 10–12 minut. Środek ma zostać miękki, stężeje podczas studzenia."
      ] },
    { id: "faworki", name: "Chruściki (faworki)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["yolks", 28], ["sourCream", 38], ["meltedButter", 8], ["powderedSugar", 5], ["vinegarOrSpirit", 4], ["bakingPowder", 0.5], ["salt", 0.5]],
      unitWeight: 15, defaultCount: 40, unit: "faworek", bakeNote: "smażenie w 175°C, kilka sekund z każdej strony", sweet: true,
      steps: c => [
        `Wymieszaj mąki (${c.flour}), cukier puder, proszek i sól.`,
        `Dodaj żółtka (${c.g("yolks")}), śmietanę, roztopione masło i spirytus. Zagnieć gładkie ciasto.`,
        "Wybijaj ciasto wałkiem przez ok. 10 minut, co chwilę składając je na pół, aż na przekroju pojawią się pęcherzyki powietrza. To one robią bąble przy smażeniu.",
        `Rozwałkuj bardzo cienko (ok. 1 mm). Tnij paski 3 × 10 cm, w środku każdego zrób nacięcie i przewlecz przez nie koniec paska. Wyjdzie ok. ${c.pcs} sztuk.`,
        "Smaż w oleju rozgrzanym do 175°C po kilka sekund z każdej strony, do jasnozłotego koloru.",
        "Odsącz na ręczniku papierowym i obficie oprósz cukrem pudrem."
      ] },
    { id: "tarta", name: "Spód do tarty (kruchy)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 52], ["powderedSugar", 20], ["eggs", 16], ["coldWater", 6], ["salt", 0.8]],
      unitWeight: 550, defaultCount: 1, unit: "forma 26 cm", bakeNote: "190°C, 15 min z obciążeniem + 5–8 min bez", sweet: true,
      steps: c => [
        `Wymieszaj mąki (${c.flour}), cukier puder i sól. Do tarty wytrawnej daj tylko szczyptę cukru.`,
        `Dodaj zimne masło (${c.g("coldButter")}) w kostce i posiekaj nożem na kruszonkę.`,
        `Dodaj jajko (${c.g("eggs")}) i zimną wodę. Szybko zagnieć, owiń folią i schłódź 30 minut.`,
        "Rozwałkuj na 3–4 mm i wyłóż formę 26 cm. Nakłuj spód widelcem i schłódź jeszcze 15 minut.",
        "Wyłóż spód papierem, obciąż suchą fasolą lub ryżem i piecz w 190°C 15 minut. Zdejmij obciążenie i piecz jeszcze 5–8 minut, do lekkiego zezłocenia.",
        "Na upieczony spód nakładaj nadzienie."
      ] },
    { id: "szarlotka", name: "Szarlotka (ciasto kruche pod jabłka)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 50], ["sugar", 28], ["eggs", 18], ["sourCream", 6], ["bakingPowder", 2.0]],
      unitWeight: 900, defaultCount: 1, unit: "blacha 24 × 30 cm", bakeNote: "180°C, 15 min spód + 45–50 min z jabłkami", sweet: true,
      steps: c => [
        `Wymieszaj mąki (${c.flour}), cukier i proszek. Dodaj zimne masło (${c.g("coldButter")}) i posiekaj na kruszonkę.`,
        `Dodaj jajka (${c.g("eggs")}) i śmietanę, szybko zagnieć. Odłóż 1/3 ciasta do zamrażarki na 30 minut.`,
        "Większą część rozłóż na blasze 24 × 30 cm wyłożonej papierem i podpiecz w 180°C 15 minut.",
        "Wyłóż odsączone prażone jabłka z cynamonem (ok. 1,5–2 kg jabłek).",
        "Zamrożone ciasto zetrzyj na tarce na wierzch.",
        "Piecz w 180°C 45–50 minut. Krój dopiero po ostudzeniu."
      ] },

    // ===== KLASA 10: piany i emulsje =====
    { id: "biszkopt", name: "Biszkopt jasny (tortowy)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_FOAM_EMULSION_CAKE",
      basis: "flour", components: [["eggs", 190], ["sugar", 90], ["bakingPowder", 1.5]], target: { starch: [45, 55] }, prefer: { szi: 0.45 },
      unitWeight: 600, defaultCount: 1, unit: "tortownica 24 cm", bakeNote: "170°C, 30–35 min", sweet: true,
      steps: c => [
        `Jajka (${c.g("eggs")}) wyjmij z lodówki wcześniej, mają mieć temperaturę pokojową. Oddziel białka od żółtek.`,
        "Białka ubij na sztywno ze szczyptą soli. Dodawaj cukier po łyżce i ubijaj, aż piana będzie gęsta i lśniąca.",
        "Dodawaj po jednym żółtku, cały czas ubijając.",
        `Mąki (${c.flour}) przesiej z proszkiem i wmieszaj delikatnie szpatułką, w 3 partiach. Nie używaj miksera, bo piana opadnie.`,
        "Przelej do tortownicy 24 cm wyłożonej papierem tylko na dnie. Piecz w 170°C 30–35 minut. Przez pierwsze 20 minut nie otwieraj piekarnika.",
        "Po wyjęciu upuść formę z wysokości ok. 30 cm na blat, wtedy biszkopt mniej opadnie. Studź w formie."
      ] },
    { id: "lava_cake", masked: true, name: "Lava cake (fondant czekoladowy)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_FOAM_EMULSION_CAKE",
      basis: "flour", components: [["darkChocolate", 240], ["butter", 210], ["eggs", 240], ["sugar", 110], ["salt", 0.8]], target: { starch: [0, 40] },
      unitWeight: 150, defaultCount: 4, unit: "kokilka", bakeNote: "220°C, 8–10 min", sweet: true,
      steps: c => [
        "Kokilki wysmaruj masłem i oprósz kakao. Nagrzej piekarnik do 220°C.",
        `Czekoladę (${c.g("darkChocolate")}) rozpuść z masłem w kąpieli wodnej lub w mikrofali. Przestudź.`,
        `Jajka (${c.g("eggs")}) z cukrem i solą ubij 2–3 minuty na jasną, puszystą masę.`,
        `Wlej czekoladę, wsyp mąki (${c.flour}) i krótko wymieszaj.`,
        `Rozlej do ${c.pcs} kokilek (po ok. ${c.pw} g). Piecz w 220°C 8–10 minut: brzegi mają być ścięte, a środek ma drżeć.`,
        "Odczekaj 1 minutę, odwróć kokilkę na talerz i podawaj od razu, dopóki środek jest płynny."
      ] },
    { id: "brownie", masked: true, name: "Brownie czekoladowe", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_FOAM_EMULSION_CAKE",
      basis: "flour", components: [["darkChocolate", 180], ["butter", 150], ["eggs", 160], ["sugar", 140], ["cocoa", 20], ["salt", 1.0]], target: { starch: [0, 45] },
      unitWeight: 850, defaultCount: 1, unit: "forma 20 × 20 cm", bakeNote: "175°C, 25–30 min", sweet: true,
      steps: c => [
        "Nagrzej piekarnik do 175°C. Formę 20 × 20 cm wyłóż papierem.",
        `Czekoladę (${c.g("darkChocolate")}) roztop z masłem i przestudź.`,
        `Jajka (${c.g("eggs")}) ubij z cukrem 3–4 minuty na jasną masę. Dzięki temu brownie będzie miało błyszczącą skórkę.`,
        "Wmieszaj czekoladę.",
        `Wsyp mąki (${c.flour}), kakao i sól. Wymieszaj tylko do połączenia.`,
        "Piecz 25–30 minut. Patyczek ma wyjść wilgotny, z grudkami. Studź w formie co najmniej godzinę."
      ] },
    { id: "sernik", name: "Sernik (masa sernikowa pieczona)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_FOAM_EMULSION_CAKE",
      basis: "total", flourPct: 2.5, components: [["cheesecakeQuark", 70], ["eggs", 14], ["sugar", 10], ["butterOrCream", 4]], target: { starch: [90, 100], protein: [0, 1], fiber: [0, 1] }, prefer: { szi: 1 },
      unitWeight: 1200, defaultCount: 1, unit: "tortownica 24 cm", bakeNote: "160°C, 60–70 min + 1 h w uchylonym piekarniku", sweet: true,
      steps: c => [
        "Twaróg, jajka i masło wyjmij z lodówki 1–2 godziny wcześniej. Wszystko ma mieć temperaturę pokojową.",
        `Twaróg (${c.g("cheesecakeQuark")}) zmiksuj na niskich obrotach z cukrem i masłem.`,
        `Dodawaj po jednym jajku (razem ${c.g("eggs")}), miksując tylko do połączenia.`,
        `Wsyp skrobię (${c.flour}) i krótko wymieszaj. Nie napowietrzaj masy, bo sernik popęka.`,
        "Przelej do tortownicy 24 cm wyłożonej papierem (spód może być z ciasta kruchego). Piecz w 160°C 60–70 minut.",
        "Wyłącz piekarnik, uchyl drzwiczki i zostaw sernik w środku na godzinę. Potem schłódź w lodówce przez noc."
      ] },

    // ===== KLASA 11: ciasta lejące i panierki =====
    { id: "tempura", name: "Kurczak w cieście (tempura, chrupiąca panierka)", category: "Naleśniki, gofry i panierki", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["iceWater", 120], ["eggs", 18], ["oil", 8], ["bakingPowder", 2.5], ["salt", 2.2]], prefer: { kuk: 0.15 },
      unitWeight: 550, defaultCount: 1, unit: "porcja na ok. 800 g kurczaka", bakeNote: "smażenie w 175–180°C, 4–5 min",
      steps: c => [
        "Kurczaka (ok. 800 g) pokrój w kawałki, osusz ręcznikiem, posól i obtocz cienko w samej skrobi.",
        `Wymieszaj mąki (${c.flour}), proszek i sól.`,
        `Jajko (${c.g("eggs")}) roztrzep z lodowatą wodą gazowaną (${c.g("iceWater")}) i olejem. Wlej do suchych składników i wymieszaj pałeczkami bardzo krótko. Grudki mają zostać, dzięki temu panierka będzie lekka.`,
        "Miskę z ciastem postaw w większej misce z lodem. Zimne ciasto w gorącym oleju daje najbardziej chrupiącą skórkę.",
        "Rozgrzej olej do 175–180°C. Zanurzaj kawałki w cieście i smaż partiami 4–5 minut na złoto.",
        "Odsączaj na kratce, nie na papierze, wtedy spód zostanie chrupiący."
      ] },
    { id: "nalesniki", name: "Naleśniki cienkie", category: "Naleśniki, gofry i panierki", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["milkWater", 190], ["eggs", 40], ["meltedButter", 10], ["salt", 1.0]], prefer: { tap: 0.15 },
      unitWeight: 75, defaultCount: 10, unit: "naleśnik", bakeNote: "patelnia, 1–1,5 min + 30 s",
      steps: c => [
        `Roztrzep jajka (${c.g("eggs")}) z mlekiem i wodą (${c.g("milkWater")}).`,
        `Dosypuj mąki (${c.flour}) z solą i miksuj na gładko. Dodaj roztopione masło.`,
        "Odstaw ciasto na 20–30 minut. Skrobia napęcznieje i naleśniki nie będą się rwać.",
        `Rozgrzej lekko natłuszczoną patelnię. Wlewaj po ok. ${c.pw} g ciasta (płaska chochla) i rozprowadzaj, przechylając patelnię.`,
        "Smaż 1–1,5 minuty, przewróć i smaż jeszcze 30 sekund.",
        "Przed każdym nalaniem zamieszaj ciasto, bo skrobia opada na dno."
      ] },
    { id: "pancakes", name: "Pancakes amerykańskie", category: "Naleśniki, gofry i panierki", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["buttermilk", 115], ["eggs", 35], ["meltedButter", 15], ["sugar", 12], ["bakingPowder", 3.0], ["bakingSoda", 0.5], ["salt", 1.0]],
      unitWeight: 55, defaultCount: 12, unit: "placuszek", bakeNote: "patelnia, średni ogień, 2 min + 1 min", sweet: true,
      steps: c => [
        `Wymieszaj mąki (${c.flour}), cukier, proszek, sodę i sól.`,
        `W drugiej misce roztrzep maślankę (${c.g("buttermilk")}), jajka (${c.g("eggs")}) i roztopione masło.`,
        "Połącz obie masy krótko, łyżką. Grudki mają zostać, wtedy placki będą puszyste. Odstaw na 10 minut.",
        `Rozgrzej patelnię na średnim ogniu i lekko natłuść. Nakładaj po ok. ${c.pw} g ciasta.`,
        "Smaż ok. 2 minuty, aż na wierzchu pojawią się pęcherzyki, przewróć i smaż jeszcze minutę."
      ] },
    { id: "gofry", name: "Gofry chrupiące (budkowe)", category: "Naleśniki, gofry i panierki", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["milkOrWater", 125], ["oil", 25], ["eggs", 45], ["sugar", 15], ["bakingPowder", 2.5], ["salt", 0.8]], target: { starch: [38, 45] },
      unitWeight: 85, defaultCount: 8, unit: "gofr", bakeNote: "mocno nagrzana gofrownica, 4–5 min", sweet: true,
      steps: c => [
        `Wymieszaj mąki (${c.flour}), cukier, proszek i sól.`,
        `Jajka (${c.g("eggs")}) rozdziel. Żółtka wymieszaj z mlekiem lub wodą i olejem, wlej do suchych składników i wymieszaj na gładko.`,
        "Białka ubij na sztywno i delikatnie wmieszaj do ciasta. Dzięki temu gofry będą lżejsze i bardziej chrupiące.",
        `Mocno nagrzej gofrownicę i posmaruj olejem. Nakładaj po ok. ${c.pw} g ciasta.`,
        "Piecz 4–5 minut na złoto. Nie otwieraj wcześniej.",
        "Studź na kratce, nie na talerzu, wtedy zostaną chrupiące."
      ] },
    { id: "racuchy", name: "Racuchy z jabłkami (na kefirze)", category: "Naleśniki, gofry i panierki", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["kefir", 110], ["eggs", 30], ["sugar", 10], ["bakingSoda", 1.0], ["bakingPowder", 1.5]],
      unitWeight: 60, defaultCount: 12, unit: "racuch", bakeNote: "olej, średni ogień, 2–3 min z każdej strony", sweet: true,
      steps: c => [
        `Wymieszaj kefir (${c.g("kefir")}), jajka (${c.g("eggs")}) i cukier.`,
        `Wsyp mąki (${c.flour}) z sodą i proszkiem i wymieszaj na gęste ciasto.`,
        "Dodaj 2–3 jabłka obrane i pokrojone w plasterki lub kostkę. Odstaw na 10 minut.",
        `Smaż na rozgrzanym oleju, na średnim ogniu, nakładając po ok. ${c.pw} g ciasta. Po 2–3 minuty z każdej strony.`,
        "Odsącz na ręczniku papierowym i posyp cukrem pudrem."
      ] },

    // ===== KLASA 12: ucierane, muffinki, parzone =====
    { id: "muffinki", name: "Muffinki / babeczki", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["milkOrYogurt", 75], ["oil", 38], ["eggs", 38], ["sugar", 42], ["bakingPowder", 2.8], ["salt", 0.8]],
      unitWeight: 65, defaultCount: 12, unit: "muffinka", bakeNote: "190°C 5 min, potem 175°C 15–18 min", sweet: true,
      steps: c => [
        "Nagrzej piekarnik do 190°C. Formę wyłóż papilotkami.",
        `Wymieszaj mąki (${c.flour}), cukier, proszek i sól.`,
        `W drugiej misce roztrzep mleko lub jogurt (${c.g("milkOrYogurt")}), jajka (${c.g("eggs")}) i olej.`,
        "Połącz obie masy łyżką, tylko do zwilżenia (najwyżej 15 ruchów). Teraz możesz dodać owoce lub czekoladę.",
        `Nakładaj do 3/4 wysokości papilotek (ok. ${c.pw} g). Piecz 5 minut w 190°C, potem zmniejsz do 175°C i piecz 15–18 minut, aż patyczek będzie suchy.`
      ] },
    { id: "babka_piaskowa", name: "Babka piaskowa / cytrynowa (ucierana)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["softButter", 65], ["sugar", 60], ["eggs", 65], ["lemonMilk", 15], ["bakingPowder", 2.5]], target: { starch: [35, 45] },
      unitWeight: 800, defaultCount: 1, unit: "forma (keksówka lub z kominem)", bakeNote: "175°C, 45–55 min", sweet: true,
      steps: c => [
        "Nagrzej piekarnik do 175°C. Formę wysmaruj masłem i oprósz mąką ryżową.",
        `Miękkie masło (${c.g("softButter")}) utrzyj z cukrem na jasną, puszystą masę (ok. 5 minut).`,
        `Dodawaj po jednym jajku (razem ${c.g("eggs")}), za każdym razem ucierając.`,
        `Mąki (${c.flour}) przesiej z proszkiem. Dodawaj na zmianę z mlekiem lub sokiem z cytryny. Możesz dodać startą skórkę z cytryny.`,
        "Piecz 45–55 minut, aż patyczek będzie suchy. Gdy wierzch za mocno się rumieni, przykryj folią."
      ] },
    { id: "banana_bread", masked: true, name: "Chlebek bananowy (banana bread)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["banana", 115], ["meltedButter", 32], ["eggs", 35], ["sugar", 35], ["bakingSoda", 1.2], ["bakingPowder", 1.5], ["cinnamon", 1.5]],
      unitWeight: 850, defaultCount: 1, unit: "keksówka", bakeNote: "175°C, 55–65 min", sweet: true,
      steps: c => [
        "Nagrzej piekarnik do 175°C. Keksówkę wyłóż papierem.",
        `Banany (${c.g("banana")}) rozgnieć widelcem. Najlepsze są dojrzałe, z ciemnymi plamkami.`,
        `Dodaj roztopione masło, jajka (${c.g("eggs")}) i cukier. Wymieszaj.`,
        `Wsyp mąki (${c.flour}) z sodą, proszkiem i cynamonem. Wymieszaj krótko, tylko do połączenia.`,
        "Piecz 55–65 minut. Po 30 minutach przykryj wierzch folią.",
        "Studź 15 minut w formie, potem wyjmij na kratkę."
      ] },
    { id: "marchewkowe", masked: true, name: "Ciasto marchewkowe (carrot cake)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["carrot", 110], ["oil", 50], ["eggs", 55], ["sugar", 55], ["bakingSoda", 1.2], ["bakingPowder", 1.8], ["spice", 2.5]],
      unitWeight: 900, defaultCount: 1, unit: "forma 24 cm", bakeNote: "175°C, 40–50 min", sweet: true, prefer: { mig: 0.15 },
      steps: c => [
        "Nagrzej piekarnik do 175°C. Formę 24 cm wyłóż papierem.",
        `Marchewkę zetrzyj na drobnych oczkach. Potrzebujesz ${c.g("carrot")}.`,
        `Jajka (${c.g("eggs")}) ubij z cukrem 2–3 minuty, potem cienkim strumieniem wlewaj olej.`,
        `Wymieszaj mąki (${c.flour}) z sodą, proszkiem i przyprawą, wsyp do masy. Dodaj marchewkę i ewentualnie posiekane orzechy.`,
        "Piecz 40–50 minut, aż patyczek będzie suchy.",
        "Na krem: serek kremowy, trochę masła i cukier puder. Nakładaj na całkiem wystudzone ciasto."
      ] },
    { id: "parzone", name: "Ciasto parzone (ptysie, eklery, churros)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["milkOrWater", 155], ["butter", 65], ["eggs", 160], ["salt", 1.2], ["sugar", 2.0]],
      unitWeight: 40, defaultCount: 15, unit: "ptyś", bakeNote: "200°C 15 min, potem 180°C 15–20 min", sweet: true,
      steps: c => [
        `W garnku zagotuj wodę lub mleko (${c.g("milkOrWater")}) z masłem, solą i cukrem.`,
        `Zdejmij z ognia, wsyp od razu wszystkie mąki (${c.flour}) i energicznie mieszaj.`,
        "Postaw z powrotem na małym ogniu i mieszaj 1–2 minuty, aż ciasto odejdzie od ścianek, a na dnie zrobi się cienka warstewka.",
        "Przełóż do miski i studź 5–10 minut.",
        `Wbijaj jajka po jednym (razem do ${c.g("eggs")}), miksując po każdym. Ciasto ma być gładkie i lśniące i opadać z łyżki w kształt litery V. Ostatnie jajko może nie być potrzebne.`,
        `Szprycuj rękawem ${c.pcs} ptysi po ok. ${c.pw} g (albo eklery długości 10 cm). Piecz w 200°C 15 minut, potem w 180°C 15–20 minut. Przez pierwsze 20 minut nie otwieraj piekarnika.`,
        "Churros: zamiast pieczenia wyciskaj paski prosto do oleju rozgrzanego do 180°C i smaż na złoto."
      ] }
  ];

  // ---------- Kategorie i drzewo wyboru ----------
  const CATEGORIES = [
    "Pizza i płaskie", "Chleby", "Bułki i precle", "Nadziewane i słodkie drożdżowe",
    "Pierogi, kluski i makarony (bez drożdży)", "Naleśniki, gofry i panierki",
    "Ciastka, pierniczki i kruche", "Ciasta, biszkopty i desery"
  ];
  /** Kategorie wypieków drożdżowych */
  const YEAST_CATEGORY = {
    pizza_neapol: 0, pizza_blacha: 0, pizza_patelnia: 0, focaccia: 0, pita: 0, naan: 0, langosz: 0,
    chleb_jasny: 1, chleb_gryczany: 1, chleb_tostowy: 1, ciabatta: 1, bagietka: 1,
    hamburger: 2, subway: 2, kajzerki: 2, bajgle: 2, precle: 2, grissini: 2,
    calzone: 3, paszteciki: 3, pierogi_drozdzowe: 3, chalka: 3, babka: 3, drozdzowki: 3, cynamonki: 3, buleczki_maslane: 3, paczki: 3
  };
  for (const b of BAKES) { b.category = CATEGORIES[YEAST_CATEGORY[b.id] ?? 3]; b.family = "yeast"; }
  for (const b of PASTRY_BAKES) b.family = "pastry";
  const ALL_BAKES = BAKES.concat(PASTRY_BAKES);

  // ---------- Solver trybu cukierniczego / zaparzanego ----------
  const STEP = 0.05;
  const mid = r => (r[0] + r[1]) / 2;
  const SWEET_ALLOWED = new Set(["jag", "ows", "ryz", "ryzb", "mig", "sor", "kasztan", "ryzklei"]);
  const starchFraction = i => (i.role === "pure_starch" ? 1 : i.isCommercialMix ? (i.starchBase ?? 0.5) : (i.starchLike ?? 0));
  const maxShareOf = i => PASTRY_MAX_SHARE[i.id] ?? i.maxShare;

  function flavorAllowed(i, b) {
    if (i.batterOnly && b.rheologyClass !== "RHEO_BATTER_COATING_SUSPENSION") return false;
    if (i.savoryOnly && b.sweet) return false;
    if (!b.sweet || i.role === "pure_starch" || i.isCommercialMix) return true;
    if (i.custom) return i.flavorProfile === "neutral" || i.flavorProfile === "mild_sweet";
    return SWEET_ALLOWED.has(i.id);
  }

  function pastryCost(blend, b, cls, candIds, tasteW = 0) {
    const t = Object.assign({}, cls.target, b.target || {});
    let P = 0, F = 0, S = 0, c = 0;
    for (const [ing, x] of blend) {
      if (x <= 1e-9) continue;
      P += x * ing.macros.protein; F += x * ing.macros.fiber; S += x * starchFraction(ing) * 100;
      c += 0.15;
      if (tasteW) c += tasteW * x * G.flavorOf(ing, b);
      const cap = maxShareOf(ing);
      if (cap && x > cap + 1e-9) c += (x - cap) * 200;
      if (ing.isCommercialMix && !(b.target && b.target.starch && b.target.starch[0] >= 90)) c -= (cls.mixPriority[ing.id] ?? 1) * x;
      // tapioka daje gumowatość: w cukiernictwie preferuj skrobię ziemniaczaną/kukurydzianą, chyba że przepis chce tapioki
      if (ing.id === "tap" && cls.solverMode === "PASTRY_STARCH_MODE" && !(b.prefer && b.prefer.tap)) c += 0.5 * x;
    }
    // odległość od zakresu celu (0 w środku zakresu) + słabe przyciąganie do środka
    const d = (x, r) => (x < r[0] ? r[0] - x : x > r[1] ? x - r[1] : 0);
    c += (d(P, t.protein) / 1.0) ** 2 + (d(S, t.starch) / 3) ** 2 + (d(F, t.fiber) / 1.0) ** 2
       + 0.02 * (((P - mid(t.protein)) / 1.0) ** 2 + ((S - mid(t.starch)) / 3) ** 2);
    for (const [id, want] of Object.entries(b.prefer || {})) {
      if (!candIds.has(id)) continue; // preferencja tylko, gdy składnik jest w spiżarni
      const hit = blend.find(([i]) => i.id === id);
      c += (((hit ? hit[1] : 0) - want) / 0.05) ** 2 * 0.3;
    }
    return c;
  }

  /** Wspinaczka po siatce 5% (start z każdej mąki i każdej pary). Odporna na pustą lub jednoelementową spiżarnię. */
  const pastryCache = new Map();
  function solvePastryBlend(pantryFlours, b, tasteW = 0) {
    const key = b.id + "|" + tasteW + "|" + pantryFlours.map(i => i.id + ":" + i.macros.protein + ":" + i.macros.fiber).join(",");
    if (!pastryCache.has(key)) pastryCache.set(key, solvePastryBlendRaw(pantryFlours, b, tasteW));
    return pastryCache.get(key);
  }
  function solvePastryBlendRaw(pantryFlours, b, tasteW = 0) {
    const cls = RHEOLOGY_CLASSES[b.rheologyClass];
    let cands = pantryFlours.filter(i => i.role !== "hydrocolloid" && flavorAllowed(i, b));
    // Tryb hydrokoloidowy (pierogi, tortilla, makaron): tylko jedna baza komercyjna, wg priorytetu (Mix B pierwszy)
    if (cls.solverMode === "YEAST_HYDROCOLLOID_MODE") {
      const mixes = cands.filter(i => i.isCommercialMix).sort((a, z) => (cls.mixPriority[z.id] ?? 1) - (cls.mixPriority[a.id] ?? 1));
      if (mixes.length > 1) cands = cands.filter(i => !i.isCommercialMix || i === mixes[0]);
    }
    const n = cands.length;
    if (!n) return [];
    const candIds = new Set(cands.map(i => i.id));
    const toBlend = w => cands.map((c, i) => [c, w[i]]).filter(p => p[1] > 1e-9);
    const starts = [];
    for (let i = 0; i < n; i++) {
      const w = Array(n).fill(0); w[i] = 1; starts.push(w);
      for (let j = i + 1; j < n; j++) { const v = Array(n).fill(0); v[i] = v[j] = 0.5; starts.push(v); }
    }
    let bestW = starts[0], bestCost = Infinity;
    for (const w of starts) {
      let cur = pastryCost(toBlend(w), b, cls, candIds, tasteW);
      for (let it = 0; it < 60; it++) {
        let move = null, mc = cur;
        for (let i = 0; i < n; i++) {
          if (w[i] < STEP - 1e-9) continue;
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            w[i] -= STEP; w[j] += STEP;
            const c = pastryCost(toBlend(w), b, cls, candIds, tasteW);
            if (c < mc - 1e-9) { mc = c; move = [i, j]; }
            w[i] += STEP; w[j] -= STEP;
          }
        }
        if (!move) break;
        w[move[0]] -= STEP; w[move[1]] += STEP; cur = mc;
      }
      if (cur < bestCost) { bestCost = cur; bestW = w.map(x => Math.round(x * 100) / 100); }
    }
    return toBlend(bestW);
  }

  const round05 = x => Math.round(x * 2) / 2;

  /** Receptura bezdrożdżowa. */
  const LIQUIDS = ["hotWater", "water", "coldWater", "iceWater", "milkWater", "milk", "milkOrWater", "milkOrYogurt", "buttermilk", "kefir", "lemonMilk", "sourCream"];
  function calculatePastryFormulation({ bake, pantryIds, doughWeight, extraIngredients = [], calib = {}, taste = "wheat" }) {
    const cls = RHEOLOGY_CLASSES[bake.rheologyClass];
    const all = INGREDIENT_MATRIX.concat(extraIngredients);
    const pantry = all.filter(i => pantryIds.includes(i.id));
    const pantryFlours = pantry.filter(i => i.role !== "hydrocolloid");
    const warnings = [];
    const blend = solvePastryBlend(pantryFlours, bake, G.tasteWeight(bake, taste, calib));
    if (!blend.length) return { bake, cls, empty: true, family: "pastry", warnings: ["Zaznacz w spiżarni przynajmniej jedną mąkę, skrobię lub mieszankę pasującą do tego przepisu."] };

    // Procenty od masy mąk
    const toFlourPct = pct => (bake.basis === "total" ? (pct / bake.flourPct) * 100 : pct);
    /** @type {[string, number][]} */
    let comps = bake.components.map(([k, p]) => [k, toFlourPct(p)]);

    // Hydrokoloid w ciastach zaparzanych
    if (comps.some(([k]) => k === "psy") && !pantryIds.includes("psy")) {
      const psyPct = comps.find(([k]) => k === "psy")[1];
      comps = comps.filter(([k]) => k !== "psy");
      if (pantryIds.includes("xan")) { comps.push(["xan", psyPct * 0.6]); warnings.push("Brak psyllium: używam gumy ksantanowej."); }
      else warnings.push("Brak psyllium: ciasto będzie mniej elastyczne i może pękać przy lepieniu. Wałkuj grubiej.");
    }
    // Korekta płynu z ocen „Jak wyszło?” (punkty procentowe od masy mąk) – na głównym płynie przepisu
    if (calib.water) {
      const liq = comps.filter(([k]) => LIQUIDS.includes(k)).sort((a, z) => z[1] - a[1])[0];
      if (liq) comps = comps.map(([k, p]) => (k === liq[0] ? [k, Math.max(0, p + calib.water)] : [k, p]));
    }
    const mixSalt = blend.reduce((s, [i, x]) => s + (i.saltPct || 0) * x, 0);
    if (mixSalt > 0) comps = comps.map(([k, p]) => (k === "salt" ? [k, Math.max(0, p - mixSalt)] : [k, p]));
    if (blend.some(([i]) => i.wheatStarch)) warnings.push("Wybrana mieszanka zawiera skrobię pszenną bezglutenową (do 20 ppm glutenu). Jeśli jej unikasz, odznacz ją w spiżarni.");
    const sum = comps.reduce((s, [, p]) => s + p, 0);
    const flour = doughWeight / (1 + sum / 100);

    const label = k => (k === "xan" ? "Guma ksantanowa" : COMPONENTS[k].label);
    const isMicro = (k, g) => g < 10;
    const rg = (k, g) => (isMicro(k, g) ? round05(g) : Math.round(g));

    const flourLines = blend.map(([ing, x]) => ({ key: ing.id, label: ing.name, grams: Math.round(flour * x), pct: x * 100, sub: true }));
    const flourTotal = flourLines.reduce((s, l) => s + l.grams, 0);
    const compLines = comps.map(([k, p]) => ({ key: k, label: label(k), grams: rg(k, (flour * p) / 100), pct: p })).filter(l => l.grams > 0);

    // Domknięcie bilansu masy na największym składniku (nie-mikro)
    const total0 = flourTotal + compLines.reduce((s, l) => s + l.grams, 0);
    const diff = doughWeight - total0;
    if (diff && compLines.length) {
      const big = compLines.reduce((a, l) => (l.grams > a.grams ? l : a), compLines[0]);
      big.grams = Math.round(big.grams + diff); // duże pozycje w pełnych gramach (bilans ±0,5 g)
    }

    const lines = [{ key: "flour", label: bake.target && bake.target.starch && bake.target.starch[0] >= 90 ? "Skrobia / mąki razem" : "Mąki razem", grams: flourTotal, pct: 100 }, ...flourLines, ...compLines];
    const total = lines.filter(l => !l.sub).reduce((s, l) => s + l.grams, 0);

    // Kontekst instrukcji
    const byKey = Object.fromEntries(compLines.map(l => [l.key, l]));
    const fmt = g => (Number.isInteger(g) ? String(g) : g.toFixed(1).replace(".", ","));
    const eggWord = (n, yolk) => yolk ? (n === 1 ? "żółtko" : n < 5 ? "żółtka" : "żółtek") : (n === 1 ? "jajko" : n < 5 ? "jajka" : "jajek");
    const g = k => {
      const l = byKey[k]; if (!l) return "0 g";
      const e = COMPONENTS[k] && COMPONENTS[k].egg;
      if (e) { const n = Math.max(1, Math.round(l.grams / e)); return `${fmt(l.grams)} g, ok. ${n} ${eggWord(n, e < 30)}`; }
      return `${fmt(l.grams)} g`;
    };
    const pcs = Math.max(1, Math.round(doughWeight / bake.unitWeight));
    const steps = bake.steps({ g, pcs, pw: Math.round(doughWeight / pcs), flour: `${flourTotal} g` });

    // Ostrzeżenia technologiczne
    const st = blend.reduce((s, [i, x]) => s + x * starchFraction(i), 0) * 100;
    const t = Object.assign({}, cls.target, bake.target || {});
    if (st < t.starch[0] - 10 && !pantryFlours.some(i => i.role === "pure_starch")) warnings.push("W spiżarni brak skrobi: wyrób będzie cięższy i mniej delikatny. Najlepiej dokupić skrobię ziemniaczaną lub kukurydzianą.");
    if (bake.rheologyClass === "RHEO_SCALDED_BOILED_DOUGH" && blend.some(([i]) => i.id === "mixc")) warnings.push("Schär Mix C nie ma zagęstnika: ciasto może rwać się przy gotowaniu. Lepszy Mix B lub Mix It!.");

    const P = blend.reduce((s, [i, x]) => s + x * i.macros.protein, 0), F = blend.reduce((s, [i, x]) => s + x * i.macros.fiber, 0);
    const used = new Set(blend.map(([i]) => i.id));
    return {
      bake, cls, empty: false, family: "pastry", taste: G.tasteOf(blend, bake),
      blend: blend.map(([ingredient, share]) => ({ ingredient, share })),
      profile: { protein: P, fiber: F, starch: st, target: t },
      lines, total, steps, tip: bake.tip,
      unused: pantryFlours.filter(i => !used.has(i.id)),
      warnings
    };
  }

  // ---------- Wspólne API ----------
  const yeastCalc = G.calculateLaboratoryFormulation;
  /** Jedno wejście dla wszystkich przepisów. */
  function calculateRecipe(input) {
    const bake = ALL_BAKES.find(b => b.id === input.bakeId);
    if (!bake) throw new Error("Nieznany przepis: " + input.bakeId);
    if (bake.family === "pastry") return calculatePastryFormulation({ ...input, bake });
    return Object.assign(yeastCalc(input), { family: "yeast" });
  }

  /** Kontrola wszystkich przepisów: bilans masy ±1 g, brak błędów, drożdżowe wg reguł 4,5 g. */
  function validateAllRecipes(pantryIds) {
    const out = G.validateDefaultBatches(pantryIds);
    for (const b of PASTRY_BAKES) {
      const d = b.unitWeight * b.defaultCount;
      const r = calculateRecipe({ bakeId: b.id, pantryIds, doughWeight: d });
      if (r.empty) { out.push(`${b.name}: brak mąk w spiżarni`); continue; }
      if (Math.abs(r.total - d) > 1) out.push(`${b.name}: bilans ${r.total} g zamiast ${d} g`);
      if (!r.steps || r.steps.length < 4) out.push(`${b.name}: za mało kroków`);
    }
    return out;
  }

  /**
   * Najlepszy zestaw mąk do przepisu z całej bazy (bez mieszanek ze skrobią pszenną),
   * porównany ze spiżarnią użytkownika.
   * @param {string} bakeId @param {string[]} pantryIds
   * @returns {{ideal:{ingredient:any, share:number, inPantry:boolean}[], missing:any[], complete:boolean, profile:{protein:number, starch:number, fiber:number}} | null}
   */
  function suggestIdealBlend(bakeId, pantryIds, taste = "wheat") {
    const bake = ALL_BAKES.find(b => b.id === bakeId);
    if (!bake) return null;
    const catalog = INGREDIENT_MATRIX.filter(i => i.role !== "hydrocolloid" && !i.wheatStarch && !i.idealExclude);
    const w = G.tasteWeight(bake, taste);
    const blend = bake.family === "pastry" ? solvePastryBlend(catalog, bake, w) : G.solveFlourBlend(catalog, bake, w).blend;
    if (!blend.length) return null;
    const ideal = blend.map(([ingredient, share]) => ({ ingredient, share, inPantry: pantryIds.includes(ingredient.id) }));
    const missing = ideal.filter(x => !x.inPantry).map(x => x.ingredient);
    const profile = { protein: 0, starch: 0, fiber: 0 };
    for (const [i, x] of blend) { profile.protein += x * i.macros.protein; profile.fiber += x * i.macros.fiber; profile.starch += x * starchFraction(i) * 100; }
    return { ideal, missing, complete: missing.length === 0, profile };
  }

  Object.assign(G, { suggestIdealBlend, PASTRY_BAKES, ALL_BAKES, CATEGORIES, COMPONENTS, calculateRecipe, calculatePastryFormulation, solvePastryBlend, validateAllRecipes });
})(typeof window !== "undefined" ? window : globalThis);
