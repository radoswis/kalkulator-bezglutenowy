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
    rawPotatoes:   { label: "Surowe ziemniaki (starte i mocno odciśnięte)" },
    darkChocolate: { label: "Czekolada gorzka 64–70%" },
    chocolateChips:{ label: "Czekolada posiekana lub kropelki" },
    banana:        { label: "Dojrzałe banany (rozgniecione)" },
    carrot:        { label: "Marchewka (drobno starta)" },
    cheese:        { label: "Ser żółty lub parmezan (starty)" }
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
    // Biscoff (speculoos) – proporcje wg typowych receptur domowych speculoos: masło ~50%, cukier brązowy ~65%, cynamon ~2,5% od mąki, soda.
    { id: "biscoff", masked: true, name: "Ciastka karmelowe w stylu Biscoff (speculoos)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["softButter", 50], ["brownSugar", 65], ["milk", 12], ["cinnamon", 2.5], ["bakingSoda", 1.0], ["salt", 0.6]],
      unitWeight: 8, defaultCount: 70, unit: "ciastko", bakeNote: "175°C, 12–14 min", sweet: true,
      steps: c => [
        `Miękkie masło (${c.g("softButter")}) utrzyj z cukrem (${c.g("brownSugar")}) przez 2–3 minuty. Im ciemniejszy cukier (np. muscovado), tym bardziej karmelowy smak jak w oryginale. Możesz też zamienić 1 łyżkę cukru na ciemny syrop lub melasę.`,
        `Dodaj mleko (${c.g("milk")}) i wymieszaj.`,
        `Mąki (${c.flour}) wymieszaj z cynamonem (${c.g("cinnamon")}), sodą i solą. Wsyp do masy i zagnieć gładkie ciasto.`,
        "Owiń folią i schłódź w lodówce co najmniej 1 godzinę. Po nocy w lodówce smak jest pełniejszy.",
        `Rozwałkuj między dwoma arkuszami papieru na grubość ok. 3 mm. Wykrawaj prostokąty ok. 4 × 6 cm (wyjdzie ok. ${c.pcs} sztuk) i ułóż na blasze z papierem. Ponakłuwaj widelcem albo odciśnij wzór.`,
        "Piecz w 175°C 12–14 minut, aż brzegi będą ciemnozłote. Studź na kratce. Chrupiące stają się dopiero po ostygnięciu. Przechowuj w szczelnej puszce.",
        "Krem jak Biscoff Creamy (słoik ok. 400 g, skład jak w oryginale: ok. 58% ciastek, olej, cukier): 230 g ostudzonych ciastek zmiel w blenderze na pył. Dodaj 120 g oleju rzepakowego, 50 g cukru pudru i szczyptę soli. Blenduj 5–8 minut z przerwami, aż masa będzie gładka i błyszcząca. Przełóż do wyparzonego słoika. Bez nabiału, więc postoi w szafce 2–3 tygodnie. Gęstnieje po schłodzeniu, a gdy jest za gęsty, dodaj łyżkę oleju."
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
    // Pyzy (kartacze bez farszu lub z mięsem): surowe + gotowane ziemniaki, skrobia. Źródło: tradycyjna receptura (ok. 2:1 surowe:gotowane, 1–2 łyżki skrobi na 1 kg).
    { id: "pyzy", name: "Pyzy ziemniaczane (też z mięsem)", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 10, components: [["rawPotatoes", 56], ["potatoes", 30], ["eggs", 3], ["salt", 1]], target: { starch: [95, 100], protein: [0, 1], fiber: [0, 1] }, prefer: { szi: 1 },
      unitWeight: 200, defaultCount: 4, unit: "porcja", bakeNote: "gotowanie 15–20 min na małym ogniu",
      steps: c => [
        `Ugotuj część ziemniaków, przeciśnij przez praskę i wystudź. Potrzebujesz ${c.g("potatoes")}.`,
        `Surowe ziemniaki zetrzyj na najdrobniejszych oczkach i mocno odciśnij w gazie lub ściereczce. Potrzebujesz ${c.g("rawPotatoes")}. Odciśnięty sok zostaw na 5 minut, wylej wodę, a białą skrobię z dna dodaj do ciasta.`,
        `Połącz oba rodzaje ziemniaków, skrobię (${c.flour}), jajko (${c.g("eggs")}) i sól. Wyrób gładkie ciasto.`,
        `Mokrymi dłońmi formuj kulki wielkości śliwki. W wersji z mięsem spłaszcz kulkę, nałóż łyżeczkę mięsnego farszu i zlep. Wyjdzie ok. ${Math.round(c.pcs * 200 / 55)} pyz.`,
        "Wkładaj do osolonego wrzątku, delikatnie zamieszaj, żeby nie przywarły. Gotuj na małym ogniu 15–20 minut od wypłynięcia. Podawaj ze skwarkami lub sosem."
      ] },
    // Kluski lane do rosołu. Źródło: tradycyjna receptura (2 jajka : 3–4 łyżki mąki).
    { id: "kluski_lane", name: "Kluski lane (do zupy)", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["eggs", 160], ["milkOrWater", 25], ["salt", 1.5]],
      unitWeight: 60, defaultCount: 4, unit: "porcja", bakeNote: "gotowanie 1–2 min w zupie",
      steps: c => [
        `Jajka (${c.g("eggs")}) roztrzep widelcem z solą i mlekiem lub wodą.`,
        `Wsyp mąki (${c.flour}) i mieszaj, aż ciasto będzie gładkie i gęste jak gęsta śmietana. Odstaw na 5 minut.`,
        "Doprowadź zupę lub osoloną wodę do wrzenia.",
        "Wlewaj ciasto cienką strużką z łyżki lub z kubka, przesuwając nad całym garnkiem. Nie mieszaj od razu, poczekaj aż się zetnie.",
        "Gotuj 1–2 minuty, aż kluski wypłyną. Podawaj od razu."
      ] },
    // Tarta wytrawna (quiche). Spód kruchy bez cukru + masa jajeczno-śmietankowa. Źródło: klasyczna quiche lorraine (pâte brisée, 3 jajka : 250 ml śmietanki).
    { id: "quiche", name: "Tarta wytrawna (quiche)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 52], ["eggs", 16], ["coldWater", 12], ["salt", 1.5]],
      unitWeight: 520, defaultCount: 1, unit: "forma 26 cm", bakeNote: "190°C 15 min z obciążeniem + 5 min, potem z nadzieniem 175°C 30–35 min",
      steps: c => [
        `Wymieszaj mąki (${c.flour}) i sól. Dodaj zimne masło (${c.g("coldButter")}) w kostce i posiekaj nożem na kruszonkę.`,
        `Dodaj jajko (${c.g("eggs")}) i zimną wodę. Szybko zagnieć, owiń folią i schłódź 30 minut.`,
        "Rozwałkuj na 3–4 mm między dwoma arkuszami papieru i wyłóż formę 26 cm. Nakłuj spód widelcem i schłódź 15 minut.",
        "Wyłóż spód papierem, obciąż suchą fasolą lub ryżem i piecz w 190°C 15 minut. Zdejmij obciążenie i piecz jeszcze 5 minut.",
        "Nadzienie: 3 jajka roztrzep z 250 ml śmietanki 30%, solą, pieprzem i gałką. Na spód połóż 150 g podsmażonego boczku lub szpinaku i 100 g startego sera, zalej masą jajeczną.",
        "Piecz w 175°C 30–35 minut, aż masa w środku przestanie się trząść. Odczekaj 10 minut przed krojeniem."
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
        "Churros: zamiast pieczenia wyciskaj paski prosto do oleju rozgrzanego do 180°C i smaż na złoto, ok. 2–3 minuty."
      ] },

    // ===== Nowe przepisy bez drożdży (v2.15, 19.11.2026). Proporcje wg typowych receptur polskich i klasycznych, w % od mąk lub od masy ciasta. =====
    { id: "uszka", name: "Uszka do barszczu", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["hotWater", 78], ["butterOrOil", 5], ["eggs", 5], ["psy", 1.0], ["salt", 1.8]],
      unitWeight: 8, defaultCount: 70, unit: "uszko", bakeNote: "gotowanie 2 min od wypłynięcia", prefer: { tap: 0.12 },
      steps: c => [
        `W misce wymieszaj mąki (${c.flour}), sól i psyllium.`,
        `Wlej gorącą wodę (${c.g("hotWater")}) z tłuszczem, wymieszaj łyżką, a gdy przestygnie, dodaj jajko i zagnieć gładkie ciasto. Przykryj i odstaw na 15 minut.`,
        "Farsz: 30 g suszonych grzybów namocz i ugotuj, posiekaj drobno z 1 podsmażoną cebulą, dopraw solą i pieprzem. Możesz dodać 100 g kapusty kiszonej.",
        "Rozwałkuj cienko (ok. 1,5 mm) porcjami, resztę trzymaj pod miską. Wykrawaj kwadraty 4 × 4 cm.",
        `Na każdy kwadrat nałóż odrobinę farszu, złóż w trójkąt, zlep i połącz rogi. Wyjdzie ok. ${c.pcs} uszek.`,
        "Gotuj partiami we wrzątku z solą, 2 minuty od wypłynięcia. Wyjmuj łyżką cedzakową."
      ] },
    { id: "placki_ziemniaczane", name: "Placki ziemniaczane", category: "Naleśniki, gofry i panierki", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 8, components: [["rawPotatoes", 82], ["eggs", 8], ["salt", 1.0]], target: { starch: [70, 100], protein: [0, 4], fiber: [0, 3] }, prefer: { szi: 0.5 },
      unitWeight: 70, defaultCount: 10, unit: "placek", bakeNote: "smażenie na oleju, 3–4 min z każdej strony",
      steps: c => [
        `Zetrzyj surowe ziemniaki na drobnych oczkach razem z 1 małą cebulą i mocno odciśnij przez ściereczkę. Potrzebujesz ${c.g("rawPotatoes")}. Odlany sok odstaw na chwilę i zlej wodę, a osiadłą na dnie skrobię dodaj z powrotem do ziemniaków.`,
        `Dodaj jajka (${c.g("eggs")}), mąki (${c.flour}) i sól. Wymieszaj.`,
        `Smaż na rozgrzanym oleju, nakładając po ok. ${c.pw} g i rozpłaszczając łyżką, 3–4 minuty z każdej strony, aż będą złote i chrupiące.`,
        "Odsącz na ręczniku papierowym. Podawaj ze śmietaną, cukrem albo gulaszem."
      ] },
    { id: "knedle", name: "Knedle ze śliwkami", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 30, components: [["potatoes", 62], ["eggs", 7], ["salt", 0.8]], target: { starch: [55, 75] }, prefer: { szi: 0.3 },
      unitWeight: 70, defaultCount: 10, unit: "knedel", bakeNote: "gotowanie 5–6 min od wypłynięcia", sweet: true,
      steps: c => [
        `Ugotuj ziemniaki, przeciśnij przez praskę i wystudź. Potrzebujesz ${c.g("potatoes")}.`,
        `Dodaj jajka (${c.g("eggs")}), mąki (${c.flour}) i sól. Szybko zagnieć gładkie ciasto.`,
        `Podziel na ${c.pcs} części po ok. ${c.pw} g. Każdą rozpłaszcz na dłoni, włóż śliwkę (bez pestki, w środek możesz dać kostkę cukru) i zlep, tocząc kulkę.`,
        "Gotuj partiami w osolonym wrzątku na małym ogniu, 5–6 minut od wypłynięcia.",
        "Podawaj polane masłem zrumienionym z bułką tartą bezglutenową i cukrem, ze śmietaną."
      ] },
    { id: "kluski_kladzione", name: "Kluski kładzione", category: "Pierogi, kluski i makarony (bez drożdży)", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["eggs", 60], ["milkOrWater", 55], ["salt", 1.5]],
      unitWeight: 150, defaultCount: 4, unit: "porcja", bakeNote: "gotowanie 3–4 min od wypłynięcia",
      steps: c => [
        `Jajka (${c.g("eggs")}) roztrzep z mlekiem lub wodą (${c.g("milkOrWater")}) i solą.`,
        `Wsyp mąki (${c.flour}) i wymieszaj na gęste ciasto, które ledwo spływa z łyżki. Odstaw na 10 minut.`,
        "Zagotuj osoloną wodę. Łyżką maczaną we wrzątku nabieraj ciasto i kładź je partiami do garnka.",
        "Gotuj partiami 3–4 minuty od wypłynięcia. Podawaj z sosem, skwarkami lub do gulaszu."
      ] },
    { id: "bliny", name: "Bliny gryczane (małe placuszki)", category: "Naleśniki, gofry i panierki", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["milk", 140], ["eggs", 50], ["meltedButter", 10], ["bakingPowder", 2.0], ["salt", 1.0]], prefer: { gry: 0.5 },
      unitWeight: 35, defaultCount: 18, unit: "blin", bakeNote: "patelnia, 1–2 min z każdej strony",
      steps: c => [
        `Wymieszaj mąki (${c.flour}) z proszkiem i solą.`,
        `Dodaj mleko (${c.g("milk")}), jajka (${c.g("eggs")}) i roztopione masło. Wymieszaj na gładkie, gęste ciasto. Odstaw na 15 minut.`,
        `Smaż na lekko natłuszczonej patelni małe placuszki po ok. ${c.pw} g, 1–2 minuty z każdej strony.`,
        "Podawaj ze śmietaną, wędzonym łososiem albo z miodem."
      ] },
    { id: "placki_twarogowe", name: "Placki twarogowe (serniczki z patelni)", category: "Naleśniki, gofry i panierki", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 16, components: [["quark", 68], ["eggs", 11], ["sugar", 5], ["bakingPowder", 0.6]], target: { starch: [40, 60] },
      unitWeight: 60, defaultCount: 10, unit: "placek", bakeNote: "patelnia, 3 min z każdej strony", sweet: true,
      steps: c => [
        `Twaróg (${c.g("quark")}) zmiel lub rozgnieć widelcem. Dodaj jajka (${c.g("eggs")}), cukier i szczyptę soli.`,
        `Wsyp mąki (${c.flour}) z proszkiem i wymieszaj. Ciasto ma się dać formować mokrymi dłońmi.`,
        `Uformuj ${c.pcs} placków po ok. ${c.pw} g, grubości 1,5 cm.`,
        "Smaż na maśle lub oleju, na średnim ogniu, ok. 3 minuty z każdej strony, aż się zezłocą.",
        "Podawaj ze śmietaną, owocami lub dżemem."
      ] },
    { id: "podplomyki", name: "Szybkie placki na jogurcie (bez drożdży, do gyrosa)", category: "Pizza i płaskie", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["milkOrYogurt", 80], ["oil", 6], ["psy", 1.0], ["bakingPowder", 2.5], ["salt", 1.5]],
      unitWeight: 90, defaultCount: 6, unit: "placek", bakeNote: "sucha patelnia, 1–2 min z każdej strony",
      steps: c => [
        `Wymieszaj mąki (${c.flour}), psyllium, proszek i sól.`,
        `Dodaj jogurt (${c.g("milkOrYogurt")}) i olej. Zagnieć gładkie ciasto i odstaw pod przykryciem na 10 minut.`,
        `Podziel na ${c.pcs} kulek po ok. ${c.pw} g. Każdą rozwałkuj między dwoma arkuszami papieru do pieczenia na placek grubości 3–4 mm.`,
        "Piecz na suchej, mocno rozgrzanej patelni, 1–2 minuty z każdej strony, aż pojawią się brązowe plamki.",
        "Trzymaj pod ściereczką, wtedy zostaną miękkie. Zawijaj na ciepło."
      ] },
    { id: "mazurek", name: "Mazurek (kruchy spód)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 60], ["powderedSugar", 25], ["yolks", 20], ["salt", 0.5]],
      unitWeight: 550, defaultCount: 1, unit: "blacha 24 × 30 cm", bakeNote: "180°C, 20–25 min", sweet: true,
      steps: c => [
        `Mąki (${c.flour}) wymieszaj z cukrem pudrem i solą. Dodaj zimne masło (${c.g("coldButter")}) w kostce i posiekaj nożem lub rozetrzyj palcami na kruszonkę.`,
        `Dodaj żółtka (${c.g("yolks")}) i szybko zagnieć. Owiń folią i schłódź 30 minut.`,
        "Rozwałkuj między arkuszami papieru na grubość 5 mm i przełóż do formy. Z resztek zrób wałeczek na brzeg. Nakłuj widelcem.",
        "Piecz w 180°C 20–25 minut, aż będzie złoty. Wystudź w formie.",
        "Posmaruj masą kajmakową, kremem czekoladowym lub dżemem i udekoruj bakaliami."
      ] },
    { id: "tartaletki", name: "Kruche babeczki / tartaletki", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 55], ["powderedSugar", 25], ["eggs", 16], ["salt", 0.5]],
      unitWeight: 30, defaultCount: 20, unit: "babeczka", bakeNote: "180°C, 12–15 min", sweet: true,
      steps: c => [
        `Mąki (${c.flour}), cukier puder i sól wymieszaj z zimnym masłem (${c.g("coldButter")}) na kruszonkę.`,
        `Dodaj jajka (${c.g("eggs")}) i szybko zagnieć. Owiń folią i schłódź 30 minut.`,
        `Podziel na ${c.pcs} kulek po ok. ${c.pw} g i wciśnij palcami w foremki do babeczek (cienko, ok. 3 mm). Nakłuj widelcem.`,
        "Piecz w 180°C 12–15 minut. Wystudź w foremkach, dopiero potem wyjmij – ciepłe łatwo pękają.",
        "Napełnij budyniem, kremem i owocami albo farszem wytrawnym."
      ] },
    // Rogaliki serowe – klasyczna proporcja 1 : 1 : 1 (mąka, twaróg, masło).
    { id: "rogaliki_serowe", name: "Rogaliki twarogowe (kruche)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["quark", 100], ["coldButter", 100], ["bakingPowder", 2.0], ["salt", 0.5]],
      unitWeight: 30, defaultCount: 20, unit: "rogalik", bakeNote: "190°C, 15–18 min", sweet: true,
      steps: c => [
        `Mąki (${c.flour}) wymieszaj z proszkiem i solą. Dodaj zimne masło (${c.g("coldButter")}) i twaróg (${c.g("quark")}) i szybko zagnieć ciasto.`,
        "Owiń folią i schłódź co najmniej 1 godzinę (może być na noc).",
        `Rozwałkuj porcjami na papierze oprószonym mąką ryżową na grubość 3 mm, wykrawaj trójkąty. Na szerszy koniec połóż odrobinę dżemu i zwiń rogalik. Wyjdzie ok. ${c.pcs} sztuk.`,
        "Piecz w 190°C 15–18 minut, aż lekko się zezłocą. Ciepłe posyp cukrem pudrem."
      ] },
    { id: "krakersy", name: "Krakersy wytrawne (z ziołami)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["water", 42], ["oil", 25], ["bakingPowder", 1.0], ["salt", 2.0]],
      unitWeight: 10, defaultCount: 55, unit: "krakers", bakeNote: "180°C, 15–18 min",
      steps: c => [
        `Wymieszaj mąki (${c.flour}), sól, proszek i 1 łyżeczkę ziół (oregano, tymianek) lub sezamu.`,
        `Dodaj wodę (${c.g("water")}) i olej, zagnieć gładkie ciasto.`,
        "Rozwałkuj między arkuszami papieru do pieczenia bardzo cienko (2 mm). Zdejmij górny papier, potnij nożem lub radełkiem na kwadraty i nakłuj widelcem.",
        "Posyp gruboziarnistą solą i piecz w 180°C 15–18 minut, aż brzegi się zezłocą. Studź na kratce – chrupią po wystygnięciu."
      ] },
    { id: "murzynek", masked: true, name: "Murzynek (ciasto kakaowe)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["meltedButter", 70], ["sugar", 85], ["milk", 60], ["eggs", 70], ["cocoa", 18], ["bakingPowder", 3.0], ["bakingSoda", 0.5]],
      unitWeight: 750, defaultCount: 1, unit: "keksówka 30 cm", bakeNote: "175°C, 40–45 min", sweet: true,
      steps: c => [
        `W garnku podgrzej masło (${c.g("meltedButter")}), cukier, mleko (${c.g("milk")}) i kakao, aż cukier się rozpuści. Odlej 4 łyżki na polewę. Resztę wystudź.`,
        `Do przestudzonej masy dodaj jajka (${c.g("eggs")}) i wymieszaj.`,
        `Wsyp mąki (${c.flour}) z proszkiem i sodą. Wymieszaj tylko do połączenia.`,
        "Przelej do keksówki wyłożonej papierem. Piecz w 175°C 40–45 minut, aż patyczek będzie suchy.",
        "Wystudź i polej odłożoną masą."
      ] },
    { id: "piernik", masked: true, name: "Piernik na miodzie (szybki)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["honey", 60], ["softButter", 35], ["brownSugar", 30], ["eggs", 50], ["milk", 50], ["spice", 4], ["cocoa", 6], ["bakingSoda", 2.0]],
      unitWeight: 750, defaultCount: 1, unit: "keksówka 30 cm", bakeNote: "165°C, 50–60 min", sweet: true,
      steps: c => [
        `Miód (${c.g("honey")}), masło (${c.g("softButter")}) i cukier podgrzej w garnku, aż się połączą. Wystudź.`,
        `Dodaj jajka (${c.g("eggs")}) i mleko (${c.g("milk")}), wymieszaj.`,
        `Wsyp mąki (${c.flour}) z przyprawą do piernika, kakao i sodą. Wymieszaj na gładko. Możesz dodać garść bakalii.`,
        "Przelej do keksówki wyłożonej papierem. Piecz w 165°C 50–60 minut, aż patyczek będzie suchy.",
        "Najlepszy po 1–2 dniach, owinięty w folię. Możesz przekroić i przełożyć powidłami."
      ] },
    { id: "rolada", name: "Rolada biszkoptowa", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_FOAM_EMULSION_CAKE",
      basis: "flour", components: [["eggs", 220], ["sugar", 100], ["bakingPowder", 1.0]], target: { starch: [45, 55] }, prefer: { szi: 0.45 },
      unitWeight: 520, defaultCount: 1, unit: "blacha 30 × 40 cm", bakeNote: "180°C, 10–12 min", sweet: true,
      steps: c => [
        `Białka z jajek (${c.g("eggs")}) ubij ze szczyptą soli na sztywno, dodając stopniowo cukier. Wmiksuj po jednym żółtku.`,
        `Wsyp przesiane mąki (${c.flour}) z proszkiem i delikatnie wymieszaj łopatką.`,
        "Wylej na blachę wyłożoną papierem i wyrównaj. Piecz w 180°C 10–12 minut, aż będzie sprężysty.",
        "Od razu zwiń ciepły biszkopt razem z papierem lub w ściereczkę oprószoną cukrem pudrem i zostaw do wystygnięcia.",
        "Rozwiń, posmaruj dżemem lub kremem i zwiń z powrotem. Schłódź przed krojeniem."
      ] },
    { id: "ciasto_jogurtowe", name: "Ciasto jogurtowe ze śliwkami lub owocami", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["milkOrYogurt", 90], ["oil", 45], ["sugar", 70], ["eggs", 60], ["bakingPowder", 3.0], ["salt", 0.4]],
      unitWeight: 750, defaultCount: 1, unit: "blacha 24 × 30 cm", bakeNote: "175°C, 40–45 min", sweet: true,
      steps: c => [
        `Jajka (${c.g("eggs")}) ubij z cukrem na puszystą masę, ok. 4 minuty.`,
        `Dodaj jogurt (${c.g("milkOrYogurt")}) i olej, krótko wymieszaj.`,
        `Wsyp mąki (${c.flour}) z proszkiem i solą. Wymieszaj tylko do połączenia.`,
        "Przelej do formy wyłożonej papierem. Ułóż owoce (śliwki, jabłka, rabarbar, jagody), lekko wciskając.",
        "Piecz w 175°C 40–45 minut, aż patyczek będzie suchy. Posyp cukrem pudrem."
      ] },
    { id: "biszkopty_tiramisu", name: "Biszkopty podłużne (do tiramisu, kocie języczki)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_FOAM_EMULSION_CAKE",
      basis: "flour", components: [["eggs", 200], ["sugar", 80]], target: { starch: [45, 55] }, prefer: { szi: 0.45 },
      unitWeight: 10, defaultCount: 50, unit: "biszkopt", bakeNote: "180°C, 10–12 min", sweet: true,
      steps: c => [
        `Oddziel białka od żółtek (jajka razem ${c.g("eggs")}). Białka ubij na sztywno, dodając stopniowo połowę cukru.`,
        "Żółtka utrzyj z resztą cukru na jasną masę i delikatnie połącz z pianą.",
        `Wsyp przesiane mąki (${c.flour}) i wymieszaj łopatką, tylko do połączenia.`,
        `Szprycuj rękawem paski długości 8–10 cm na blachę z papierem (ok. ${c.pcs} sztuk). Posyp cukrem pudrem.`,
        "Piecz w 180°C 10–12 minut, aż będą lekko złote. Studź na papierze."
      ] },
    { id: "paczki_serowe", name: "Pączki serowe (kuleczki z twarogu)", category: "Ciastka, pierniczki i kruche", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 38, components: [["quark", 42], ["eggs", 11], ["sugar", 7], ["bakingSoda", 0.8], ["vinegarOrSpirit", 1.2]],
      target: { starch: [35, 45] }, unitWeight: 30, defaultCount: 20, unit: "pączek", bakeNote: "smażenie w 170°C, 4–5 min", sweet: true,
      steps: c => [
        `Twaróg (${c.g("quark")}) zmiel na gładko. Wymieszaj z jajkami (${c.g("eggs")}), cukrem i octem lub spirytusem.`,
        `Wsyp mąki (${c.flour}) z sodą i zagnieć miękkie ciasto. Odstaw na 10 minut.`,
        `Mokrymi dłońmi formuj ${c.pcs} kulek po ok. ${c.pw} g.`,
        "Smaż partiami w oleju rozgrzanym do 170°C, 4–5 minut, obracając, aż będą złote. Nie za gorący olej – środek musi się dosmażyć.",
        "Odsącz na ręczniku papierowym i obtocz w cukrze pudrze."
      ] },
    { id: "clafoutis", name: "Clafoutis (zapiekany placek z wiśniami)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["milk", 200], ["eggs", 120], ["sugar", 45], ["meltedButter", 12], ["salt", 0.4]],
      unitWeight: 600, defaultCount: 1, unit: "forma 24 cm", bakeNote: "180°C, 35–40 min", sweet: true,
      steps: c => [
        "Formę wysmaruj masłem i posyp cukrem. Ułóż 400–500 g wiśni lub czereśni (mogą być z pestkami – tak jest tradycyjnie, ale uważaj przy jedzeniu).",
        `Jajka (${c.g("eggs")}) roztrzep z cukrem i solą. Dodaj mąki (${c.flour}), wymieszaj na gładko.`,
        `Wlej mleko (${c.g("milk")}) i roztopione masło, wymieszaj. Ciasto będzie rzadkie jak na naleśniki.`,
        "Zalej owoce i piecz w 180°C 35–40 minut, aż wierzch się zezłoci, a środek przestanie się trząść.",
        "Podawaj lekko ciepłe, posypane cukrem pudrem."
      ] },
    { id: "crumble", name: "Crumble owocowe (kruszonka na owocach)", category: "Ciasta, biszkopty i desery", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 65], ["brownSugar", 65], ["cinnamon", 1.0], ["salt", 0.4]],
      unitWeight: 500, defaultCount: 1, unit: "naczynie 20 × 25 cm", bakeNote: "180°C, 35–40 min", sweet: true,
      steps: c => [
        "Pokrój ok. 1 kg owoców (jabłka, śliwki, rabarbar, jagody), wymieszaj z 2 łyżkami cukru i 1 łyżką skrobi ziemniaczanej i przełóż do naczynia żaroodpornego.",
        `Mąki (${c.flour}), cukier, cynamon i sól rozetrzyj palcami z zimnym masłem (${c.g("coldButter")}) na grube grudki. Możesz dodać garść płatków owsianych bezglutenowych lub posiekanych orzechów.`,
        "Posyp kruszonką owoce.",
        "Piecz w 180°C 35–40 minut, aż owoce zaczną bulgotać, a kruszonka się zezłoci. Podawaj na ciepło, z lodami lub jogurtem."
      ] },

    // ===== v2.16 (19.11.2026): kuchnia włoska, kuchnie świata, francuskie, w kuchni, święta, przekąski, śniadania, bez piekarnika =====
    { id: "piadina", name: "Piadina (włoski placek z patelni)", category: "Pizza, placki i chlebki płaskie", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["hotWater", 60], ["oil", 12], ["psy", 1.2], ["bakingPowder", 1.0], ["salt", 1.8]], prefer: { tap: 0.12 },
      unitWeight: 120, defaultCount: 5, unit: "piadina", bakeNote: "sucha patelnia, 1–2 min z każdej strony",
      steps: c => [
        `Wymieszaj mąki (${c.flour}), psyllium, proszek i sól.`,
        `Wlej gorącą wodę (${c.g("hotWater")}) i olej (tradycyjnie smalec), wymieszaj łyżką, potem zagnieć gładkie ciasto. Odstaw pod przykryciem na 15 minut.`,
        `Podziel na ${c.pcs} kulek po ok. ${c.pw} g i rozwałkuj między papierem na placki grubości 3 mm (średnica ok. 22 cm).`,
        "Piecz na suchej, mocno rozgrzanej patelni 1–2 minuty z każdej strony, aż pojawią się brązowe plamki.",
        "Na ciepło nałóż szynkę parmeńską, rukolę i miękki ser (np. stracchino), złóż na pół."
      ] },
    { id: "taralli", name: "Taralli (chrupiące obwarzanki z oliwą)", category: "Przekąski i wytrawne", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["water", 30], ["oil", 28], ["salt", 1.8], ["bakingPowder", 0.6]],
      unitWeight: 12, defaultCount: 45, unit: "tarallo", bakeNote: "obgotowanie 1 min, potem 190°C 25–30 min",
      steps: c => [
        `Wymieszaj mąki (${c.flour}), sól, proszek i 1 łyżeczkę kopru włoskiego lub czarnego pieprzu.`,
        `Dodaj wodę (${c.g("water")}) – tradycyjnie pół na pół z białym winem – i oliwę. Zagnieć gładkie ciasto.`,
        `Podziel na ${c.pcs} kawałków po ok. ${c.pw} g, rozwałkuj wałeczki długości 10 cm i zlep w kółka.`,
        "Wrzucaj partiami do wrzątku na 1 minutę, aż wypłyną. Odsącz na ściereczce.",
        "Piecz w 190°C 25–30 minut, aż będą złote i suche. Chrupią po wystygnięciu."
      ] },
    { id: "cantucci", name: "Cantucci (włoskie biscotti z migdałami)", category: "Ciastka i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["sugar", 70], ["eggs", 55], ["softButter", 10], ["bakingPowder", 1.5], ["salt", 0.4]], prefer: { mig: 0.25 },
      unitWeight: 15, defaultCount: 40, unit: "ciastko", bakeNote: "180°C 25 min, potem 160°C 10–15 min", sweet: true,
      steps: c => [
        `Jajka (${c.g("eggs")}) wymieszaj z cukrem, miękkim masłem i skórką z cytryny lub pomarańczy.`,
        `Wsyp mąki (${c.flour}) z proszkiem i solą, dodaj 150 g całych migdałów. Zagnieć klejące ciasto.`,
        "Mokrymi dłońmi uformuj 2 wałki szerokości 5 cm na blasze z papierem.",
        "Piecz w 180°C 25 minut. Wyjmij, odczekaj 10 minut i pokrój ukośnie na kromki 1,5 cm.",
        `Ułóż kromki płasko i susz w 160°C 10–15 minut, aż będą chrupiące. Wyjdzie ok. ${c.pcs} sztuk.`
      ] },
    { id: "crostata", name: "Crostata (włoska tarta z dżemem i kratką)", category: "Ciasta, torty i desery", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 50], ["sugar", 40], ["eggs", 30], ["bakingPowder", 1.0], ["salt", 0.4]],
      unitWeight: 550, defaultCount: 1, unit: "forma 24 cm", bakeNote: "180°C, 30–35 min", sweet: true,
      steps: c => [
        `Mąki (${c.flour}), cukier, proszek, sól i skórkę z cytryny rozetrzyj z zimnym masłem (${c.g("coldButter")}) na kruszonkę.`,
        `Dodaj jajka (${c.g("eggs")}) i szybko zagnieć. Owiń folią i schłódź 30 minut.`,
        "2/3 ciasta rozwałkuj między papierem i wyłóż formę z brzegiem 2 cm. Nałóż 350 g gęstego dżemu (morelowy, wiśniowy).",
        "Z reszty ciasta wytnij paski i ułóż z nich kratkę na dżemie.",
        "Piecz w 180°C 30–35 minut, aż kratka się zezłoci. Wystudź w formie – na ciepło łatwo pęka."
      ] },
    { id: "torta_caprese", masked: true, name: "Torta caprese (czekoladowe z migdałami)", category: "Ciasta, torty i desery", rheologyClass: "RHEO_FOAM_EMULSION_CAKE",
      basis: "flour", components: [["darkChocolate", 100], ["softButter", 90], ["sugar", 75], ["eggs", 125], ["cocoa", 5]], prefer: { mig: 0.6 },
      unitWeight: 700, defaultCount: 1, unit: "tortownica 22 cm", bakeNote: "170°C, 35–40 min", sweet: true,
      steps: c => [
        `Czekoladę (${c.g("darkChocolate")}) roztop z masłem (${c.g("softButter")}). Wystudź.`,
        `Oddziel białka od żółtek (jajka razem ${c.g("eggs")}). Żółtka utrzyj z połową cukru, połącz z czekoladą.`,
        `Wsyp mąki (${c.flour}) – najlepiej głównie migdałowej – z kakao i wymieszaj.`,
        "Białka ubij z resztą cukru na sztywno i delikatnie wmieszaj w 3 porcjach.",
        "Piecz w 170°C 35–40 minut. Środek ma zostać wilgotny. Wystudź w formie i posyp cukrem pudrem."
      ] },
    { id: "ravioli", name: "Ravioli z ricottą i szpinakiem", category: "Pierogi, kluski i makarony", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["eggs", 55], ["yolks", 15], ["oil", 5], ["psy", 1.2], ["salt", 1.5]], prefer: { tap: 0.15 },
      unitWeight: 15, defaultCount: 40, unit: "raviolo", bakeNote: "gotowanie 3–4 min",
      steps: c => [
        `Mąki (${c.flour}), psyllium i sól wymieszaj z jajkami (${c.g("eggs")}), żółtkami i oliwą. Zagnieć gładkie ciasto, owiń folią i odstaw na 20 minut.`,
        "Farsz: 250 g ricotty, 150 g sparzonego i mocno odciśniętego szpinaku, 40 g startego parmezanu, sól, pieprz, gałka muszkatołowa.",
        "Rozwałkuj cienko (1,5 mm) porcjami między papierem. Na pas ciasta nakładaj łyżeczki farszu co 4 cm, przykryj drugim pasem, dociśnij wokół farszu i wykrój kwadraty.",
        `Gotuj partiami w osolonym wrzątku 3–4 minuty. Wyjdzie ok. ${c.pcs} sztuk.`,
        "Podawaj z masłem szałwiowym albo sosem pomidorowym."
      ] },
    { id: "lasagne", name: "Płaty do lasagne (bez gotowania)", category: "Pierogi, kluski i makarony", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["eggs", 55], ["yolks", 15], ["oil", 5], ["psy", 1.2], ["salt", 1.5]], prefer: { tap: 0.15 },
      unitWeight: 550, defaultCount: 1, unit: "naczynie 20 × 30 cm", bakeNote: "w lasagne: 180°C, 40 min",
      steps: c => [
        `Mąki (${c.flour}), psyllium i sól wymieszaj z jajkami (${c.g("eggs")}), żółtkami i oliwą. Zagnieć gładkie ciasto i odstaw pod folią na 20 minut.`,
        "Podziel na 4 części. Każdą rozwałkuj między papierem na płat grubości 1,5 mm wielkości naczynia.",
        "Płatów nie trzeba gotować – układaj je od razu warstwami z sosem bolońskim i beszamelem (sosy muszą być dość rzadkie, ciasto wchłonie płyn).",
        "Ostatnią warstwę pokryj beszamelem i serem. Przykryj folią aluminiową.",
        "Piecz w 180°C 30 minut pod folią i 10 minut bez, aż ser się zrumieni. Odczekaj 15 minut przed krojeniem."
      ] },
    { id: "gyoza", name: "Gyoza (japońskie pierożki smażone)", category: "Pierogi, kluski i makarony", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["hotWater", 80], ["oil", 3], ["psy", 1.2], ["salt", 1.0]], prefer: { tap: 0.2 },
      unitWeight: 12, defaultCount: 45, unit: "pierożek", bakeNote: "patelnia: smażenie 2 min, potem para 5 min",
      steps: c => [
        `Mąki (${c.flour}), psyllium i sól zalej gorącą wodą (${c.g("hotWater")}), dodaj olej. Wymieszaj łyżką, a gdy przestygnie, zagnieć gładkie ciasto. Odstaw pod folią na 15 minut.`,
        "Farsz: 300 g mielonej wieprzowiny, 150 g drobno posiekanej kapusty pekińskiej (posolonej i odciśniętej), 2 dymki, ząbek czosnku, łyżeczka startego imbiru, 2 łyżki sosu sojowego bezglutenowego (tamari).",
        `Rozwałkuj cienko porcjami i wykrawaj krążki 8 cm. Nałóż łyżeczkę farszu i zlep, robiąc z jednej strony zakładki. Wyjdzie ok. ${c.pcs} sztuk.`,
        "Smaż na patelni z olejem płaską stroną w dół 2 minuty, aż spód się zrumieni. Wlej 1/3 szklanki wody, przykryj i gotuj na parze 5 minut, aż woda odparuje.",
        "Podawaj z sosem: tamari, ocet ryżowy i odrobina oleju chili."
      ] },
    { id: "czapati", name: "Czapati / roti (indyjskie placki)", category: "Pizza, placki i chlebki płaskie", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["hotWater", 75], ["oil", 6], ["psy", 1.2], ["salt", 1.5]], prefer: { tap: 0.1, sor: 0.2 },
      unitWeight: 60, defaultCount: 10, unit: "placek", bakeNote: "sucha patelnia, 1 min z każdej strony",
      steps: c => [
        `Mąki (${c.flour}), psyllium i sól zalej gorącą wodą (${c.g("hotWater")}), dodaj olej lub ghee. Wymieszaj, potem zagnieć gładkie ciasto. Odstaw na 15 minut.`,
        `Podziel na ${c.pcs} kulek po ok. ${c.pw} g. Rozwałkuj między papierem na cienkie placki (2 mm).`,
        "Piecz na suchej, mocno rozgrzanej patelni ok. 1 minutę z każdej strony, aż pojawią się brązowe plamki.",
        "Dla nadmuchanych roti: dociśnij placek ściereczką na patelni albo przytrzymaj chwilę nad płomieniem.",
        "Posmaruj ghee lub masłem, trzymaj pod ściereczką. Podawaj do curry i dal."
      ] },
    { id: "placki_dymka", name: "Placki z dymką (chińskie, listkowane)", category: "Pizza, placki i chlebki płaskie", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["hotWater", 78], ["oil", 10], ["psy", 1.2], ["salt", 1.5]], prefer: { tap: 0.15 },
      unitWeight: 125, defaultCount: 4, unit: "placek", bakeNote: "patelnia z olejem, 3 min z każdej strony",
      steps: c => [
        `Mąki (${c.flour}), psyllium i sól zalej gorącą wodą (${c.g("hotWater")}), wymieszaj, potem zagnieć z połową oleju gładkie ciasto. Odstaw na 15 minut.`,
        `Podziel na ${c.pcs} części. Każdą rozwałkuj cienko między papierem, posmaruj olejem, posyp solą i posiekaną dymką (razem ok. 4 dymki).`,
        "Zwiń ciasno w rulon, potem rulon zwiń w ślimaka. Spłaszcz dłonią i rozwałkuj delikatnie na placek grubości 5 mm.",
        "Smaż na patelni z olejem na średnim ogniu, ok. 3 minuty z każdej strony, aż będzie złoty i chrupiący.",
        "Pokrój na trójkąty. Podawaj z sosem sojowym bezglutenowym."
      ] },
    { id: "gozleme", name: "Gözleme (tureckie placki nadziewane z patelni)", category: "Pizza, placki i chlebki płaskie", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["milkOrYogurt", 75], ["oil", 8], ["psy", 1.2], ["bakingPowder", 1.0], ["salt", 1.5]], prefer: { tap: 0.12 },
      unitWeight: 150, defaultCount: 4, unit: "placek", bakeNote: "patelnia, 3 min z każdej strony",
      steps: c => [
        `Wymieszaj mąki (${c.flour}), psyllium, proszek i sól. Dodaj jogurt (${c.g("milkOrYogurt")}) i olej, zagnieć gładkie ciasto. Odstaw na 15 minut.`,
        "Farsz: 200 g sparzonego, odciśniętego szpinaku, 200 g pokruszonej fety, 1 posiekana cebulka, pieprz.",
        `Podziel na ${c.pcs} części. Każdą rozwałkuj między papierem na prostokąt grubości 2 mm, na połowie rozłóż farsz, przykryj drugą połową i dociśnij brzegi.`,
        "Smaż na patelni z odrobiną masła ok. 3 minuty z każdej strony, aż będzie złoty.",
        "Pokrój w kwadraty, podawaj z jogurtem czosnkowym."
      ] },
    { id: "francuskie", name: "Ciasto francuskie szybkie (do paluchów, krokietów, tart)", category: "Ciasto francuskie i rogale", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 90], ["iceWater", 45], ["psy", 1.5], ["salt", 1.2]],
      unitWeight: 600, defaultCount: 1, unit: "porcja (2 arkusze)", bakeNote: "200°C, 20–25 min",
      steps: c => [
        `Wymieszaj mąki (${c.flour}), psyllium i sól. Zimne masło (${c.g("coldButter")}) pokrój w kostkę 1 cm i wymieszaj z mąką – kawałki masła mają zostać widoczne.`,
        `Wlej lodowatą wodę (${c.g("iceWater")}) i zbierz ciasto rękami, bez wyrabiania. Owiń folią i schłódź 30 minut.`,
        "Rozwałkuj na papierze oprószonym mąką ryżową na prostokąt, złóż na trzy jak list, obróć o 90° i znowu rozwałkuj. Złóż na trzy i schłódź 30 minut.",
        "Powtórz wałkowanie i składanie jeszcze 2 razy (razem 4 złożenia), za każdym razem chłodząc.",
        "Rozwałkuj na 3–4 mm i użyj do paluchów, tart, krokietów. Piecz w 200°C 20–25 minut, aż będzie złote. Ciasto musi być zimne, gdy trafia do piekarnika."
      ] },
    { id: "paluchy_francuskie", name: "Paluchy francuskie z serem", category: "Ciasto francuskie i rogale", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 90], ["iceWater", 45], ["cheese", 40], ["psy", 1.5], ["salt", 1.2]],
      unitWeight: 25, defaultCount: 24, unit: "paluch", bakeNote: "200°C, 15–18 min",
      steps: c => [
        `Zrób szybkie ciasto francuskie: mąki (${c.flour}) z psyllium i solą wymieszaj z zimnym masłem (${c.g("coldButter")}) w kostce, wlej lodowatą wodę (${c.g("iceWater")}) i zbierz bez wyrabiania. Schłódź 30 minut.`,
        "Rozwałkuj i złóż na trzy, schłódź 30 minut. Powtórz 3 razy.",
        `Rozwałkuj na prostokąt grubości 4 mm, posmaruj jajkiem i posyp tartym serem (${c.g("cheese")}), papryką i kminkiem. Lekko wciśnij wałkiem.`,
        `Pokrój na ${c.pcs} pasków szerokości 1,5 cm i skręć każdy w spiralę. Ułóż na blasze z papierem i schłódź 15 minut.`,
        "Piecz w 200°C 15–18 minut, aż będą złote."
      ] },
    { id: "panierka", name: "Panierka do schabowego i kotletów", category: "W kuchni: panierki, sosy, dodatki", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["eggs", 120], ["milkOrWater", 15], ["salt", 1.0]],
      unitWeight: 600, defaultCount: 1, unit: "porcja na 6–8 kotletów (bez bułki tartej)", bakeNote: "smażenie na oleju, 3–4 min z każdej strony",
      steps: c => [
        `Przygotuj trzy talerze: na pierwszym mąki (${c.flour}) z solą i pieprzem, na drugim jajka (${c.g("eggs")}) roztrzepane z mlekiem lub wodą, na trzecim ok. 200 g bezglutenowej bułki tartej (przepis „Chleb na bułkę tartą”) albo pokruszonych płatków kukurydzianych.`,
        "Rozbite i doprawione kotlety obtocz kolejno w mące (strzepnij nadmiar), w jajku i w bułce tartej. Dociśnij dłonią.",
        "Odłóż na 5 minut – panierka lepiej się trzyma.",
        "Smaż na rozgrzanym oleju (warstwa ok. 1 cm) na średnim ogniu, 3–4 minuty z każdej strony, aż będą złote.",
        "Odsącz na ręczniku papierowym. Mąka ryżowa i skrobia dają bardziej chrupiącą panierkę niż pszenna."
      ] },
    { id: "beszamel", name: "Sos beszamelowy (i zasmażka do sosów)", category: "W kuchni: panierki, sosy, dodatki", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["milk", 1000], ["butter", 100], ["salt", 6]], target: { starch: [80, 100], protein: [0, 8], fiber: [0, 3] }, prefer: { ryz: 0.5 },
      unitWeight: 600, defaultCount: 1, unit: "porcja (do lasagne lub zapiekanki)", bakeNote: "rondel, 5–8 min mieszania",
      steps: c => [
        `W rondlu roztop masło (${c.g("butter")}). Wsyp mąki (${c.flour}) i mieszaj na małym ogniu 1–2 minuty – to zasmażka. Do zup i sosów możesz skończyć na tym kroku.`,
        `Stopniowo wlewaj zimne mleko (${c.g("milk")}), cały czas mieszając trzepaczką, żeby nie było grudek.`,
        "Gotuj na małym ogniu 5–8 minut, mieszając, aż sos zgęstnieje.",
        "Dopraw solą, pieprzem i szczyptą gałki muszkatołowej. Mąka ryżowa i skrobia gęstnieją szybciej niż pszenna – jeśli sos jest za gęsty, dolej mleka.",
        "Do lasagne: sos ma być rzadszy niż zwykle, bo surowe płaty wchłoną płyn."
      ] },
    { id: "lamance", name: "Łamańce z makiem (wigilijne)", category: "Ciastka i kruche", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["water", 40], ["oil", 15], ["sugar", 8], ["bakingPowder", 1.0], ["salt", 0.5]],
      unitWeight: 8, defaultCount: 65, unit: "łamaniec", bakeNote: "190°C, 12–15 min", sweet: true,
      steps: c => [
        `Wymieszaj mąki (${c.flour}), cukier, proszek i sól. Dodaj wodę (${c.g("water")}) i olej, zagnieć gładkie ciasto.`,
        "Rozwałkuj między papierem bardzo cienko (2 mm), pokrój na kwadraty lub romby 3 cm i nakłuj widelcem.",
        "Piecz w 190°C 12–15 minut, aż będą twarde i lekko złote.",
        "Do podania: 200 g maku sparz, zmiel, wymieszaj z 3 łyżkami miodu, bakaliami i ciepłym mlekiem (ok. 150 ml).",
        "Łamańce zalej makiem tuż przed podaniem albo podawaj osobno do maczania."
      ] },
    { id: "baranek", name: "Baranek wielkanocny (z formy, ucierany)", category: "Ciasta, torty i desery", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["softButter", 65], ["sugar", 60], ["eggs", 65], ["lemonMilk", 15], ["bakingPowder", 2.5]], target: { starch: [35, 45] },
      unitWeight: 600, defaultCount: 1, unit: "forma baranek", bakeNote: "170°C, 40–45 min", sweet: true,
      steps: c => [
        "Formę bardzo dokładnie wysmaruj masłem (każde zagłębienie) i oprósz mąką ryżową.",
        `Miękkie masło (${c.g("softButter")}) utrzyj z cukrem na puszystą masę. Dodawaj po jednym jajku (razem ${c.g("eggs")}), ucierając.`,
        `Wsyp mąki (${c.flour}) z proszkiem, dodaj mleko lub sok z cytryny i wymieszaj na gładko.`,
        "Napełnij formę, stuknij nią o blat. Piecz w 170°C 40–45 minut (jeśli forma stoi pionowo, postaw ją na blasze). Patyczek ma być suchy.",
        "Wystudź 15 minut w formie, potem ostrożnie wyjmij. Posyp cukrem pudrem, zawiąż wstążkę."
      ] },
    { id: "roze_karnawalowe", name: "Róże karnawałowe (z konfiturą)", category: "Pączki i słodkie smażone", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["yolks", 28], ["sourCream", 38], ["meltedButter", 8], ["powderedSugar", 5], ["vinegarOrSpirit", 4], ["bakingPowder", 0.5], ["salt", 0.5]],
      unitWeight: 30, defaultCount: 18, unit: "róża", bakeNote: "smażenie w 175°C, 1–2 min", sweet: true,
      steps: c => [
        `Mąki (${c.flour}) wymieszaj z cukrem pudrem, proszkiem i solą. Dodaj żółtka (${c.g("yolks")}), śmietanę, roztopione masło i spirytus lub ocet. Zagnieć gładkie ciasto i odstaw pod folią na 20 minut.`,
        "Rozwałkuj między papierem bardzo cienko (1–2 mm). Wykrawaj krążki w 3 rozmiarach (8, 6 i 4 cm), nacinaj każdy brzeg 5 razy w stronę środka.",
        `Złóż po jednym krążku z każdego rozmiaru (od największego), sklejając środek kroplą białka i mocno dociskając palcem. Wyjdzie ok. ${c.pcs} róż.`,
        "Smaż w oleju rozgrzanym do 175°C, najpierw stroną z płatkami w dół, 1–2 minuty, aż płatki się rozchylą i zezłocą. Obróć na chwilę.",
        "Odsącz, posyp cukrem pudrem, na środek nałóż konfiturę różaną lub żurawinę."
      ] },
    { id: "biszkopt_kakaowy", masked: true, name: "Biszkopt kakaowy (na tort urodzinowy)", category: "Ciasta, torty i desery", rheologyClass: "RHEO_FOAM_EMULSION_CAKE",
      basis: "flour", components: [["eggs", 200], ["sugar", 95], ["cocoa", 15], ["bakingPowder", 1.5]], target: { starch: [45, 55] }, prefer: { szi: 0.4 },
      unitWeight: 650, defaultCount: 1, unit: "tortownica 24 cm", bakeNote: "170°C, 30–35 min", sweet: true,
      steps: c => [
        `Jajka (${c.g("eggs")}) w temperaturze pokojowej. Białka ubij ze szczyptą soli na sztywno, dodając stopniowo cukier. Wmiksuj po jednym żółtku.`,
        `Mąki (${c.flour}) przesiej z kakao i proszkiem. Wmieszaj delikatnie łopatką w 3 porcjach.`,
        "Przelej do tortownicy wyłożonej papierem tylko na dnie (boki nie smarowane). Piecz w 170°C 30–35 minut.",
        "Po upieczeniu upuść formę z wysokości 30 cm na blat (biszkopt mniej opadnie) i wystudź do góry dnem.",
        "Dla większej tortownicy (26 cm) zwiększ ilość o 20%. Przekrój na 3 blaty dopiero następnego dnia, nasącz i przełóż kremem."
      ] },
    { id: "paluszki_serowe", name: "Paluszki serowe (kruche, do pudełka)", category: "Przekąski i wytrawne", rheologyClass: "RHEO_SHORTCRUST_COOKIE_CRISP",
      basis: "flour", components: [["coldButter", 60], ["cheese", 70], ["eggs", 20], ["salt", 1.0], ["bakingPowder", 0.8]],
      unitWeight: 15, defaultCount: 40, unit: "paluszek", bakeNote: "190°C, 15 min",
      steps: c => [
        `Mąki (${c.flour}), sól, proszek i szczyptę papryki rozetrzyj z zimnym masłem (${c.g("coldButter")}) na kruszonkę.`,
        `Dodaj starty ser (${c.g("cheese")}) i jajko, zagnieć ciasto. Schłódź 20 minut.`,
        `Rozwałkuj między papierem na 5 mm i pokrój na ${c.pcs} pasków 1 × 10 cm. Posmaruj jajkiem, posyp sezamem lub kminkiem.`,
        "Piecz w 190°C ok. 15 minut, aż będą złote. Studź na blasze."
      ] },
    { id: "muffinki_wytrawne", name: "Muffinki wytrawne (ser, warzywa, szynka)", category: "Przekąski i wytrawne", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["milkOrYogurt", 80], ["oil", 35], ["eggs", 45], ["cheese", 45], ["bakingPowder", 3.0], ["salt", 1.2]],
      unitWeight: 65, defaultCount: 12, unit: "muffinka", bakeNote: "190°C, 20–22 min",
      steps: c => [
        `Wymieszaj mąki (${c.flour}), proszek, sól, pieprz i zioła.`,
        `W drugiej misce roztrzep jajka (${c.g("eggs")}), mleko lub jogurt (${c.g("milkOrYogurt")}) i olej.`,
        `Połącz krótko łyżką. Dodaj starty ser (${c.g("cheese")}) i ok. 200 g dodatków pokrojonych w kostkę: szynka, papryka, kukurydza, suszone pomidory, szpinak.`,
        `Nakładaj do papilotek po ok. ${c.pw} g. Piecz w 190°C 20–22 minuty, aż patyczek będzie suchy.`,
        "Dobre na zimno do pracy i szkoły; można mrozić."
      ] },
    { id: "gougeres", name: "Ptysie serowe (gougères, przekąska)", category: "Przekąski i wytrawne", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["milkOrWater", 155], ["butter", 65], ["eggs", 160], ["cheese", 70], ["salt", 1.5]],
      unitWeight: 20, defaultCount: 30, unit: "ptyś", bakeNote: "200°C 15 min, potem 180°C 10 min",
      steps: c => [
        `W garnku zagotuj wodę lub mleko (${c.g("milkOrWater")}) z masłem i solą. Zdejmij z ognia i wsyp od razu mąki (${c.flour}), energicznie mieszając.`,
        "Postaw z powrotem na małym ogniu i mieszaj 1–2 minuty, aż ciasto odejdzie od ścianek. Studź 5–10 minut.",
        `Wbijaj jajka po jednym (razem do ${c.g("eggs")}), miksując. Wmieszaj starty ser (${c.g("cheese")}) – najlepiej gruyère lub dojrzały żółty – i szczyptę pieprzu.`,
        `Nakładaj łyżeczką lub rękawem ${c.pcs} kulek na blachę z papierem. Posyp odrobiną sera.`,
        "Piecz w 200°C 15 minut, potem 180°C 10 minut. Nie otwieraj piekarnika przez pierwsze 15 minut."
      ] },
    { id: "placuszki_bananowe", name: "Placuszki bananowe (śniadaniowe)", category: "Naleśniki, placki i gofry", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["banana", 110], ["milk", 70], ["eggs", 50], ["bakingPowder", 2.5], ["salt", 0.3]], prefer: { ows: 0.4 },
      unitWeight: 45, defaultCount: 13, unit: "placuszek", bakeNote: "patelnia, 2 min z każdej strony", sweet: true,
      steps: c => [
        `Rozgnieć banany (${c.g("banana")}) widelcem na gładko. Dodaj jajka (${c.g("eggs")}) i mleko, wymieszaj.`,
        `Wsyp mąki (${c.flour}) – najlepiej owsianej – z proszkiem i solą. Wymieszaj na gęste ciasto. Cukier nie jest potrzebny.`,
        `Smaż na lekko natłuszczonej patelni na średnim ogniu, po ok. ${c.pw} g, 2 minuty z każdej strony.`,
        "Podawaj z jogurtem, owocami i masłem orzechowym."
      ] },
    { id: "gofry_bialkowe", name: "Gofry białkowe (z twarogiem lub skyrem)", category: "Naleśniki, placki i gofry", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["quark", 110], ["milk", 60], ["eggs", 70], ["oil", 10], ["bakingPowder", 2.5], ["salt", 0.4]], prefer: { ows: 0.3, cie: 0.1 },
      unitWeight: 90, defaultCount: 7, unit: "gofr", bakeNote: "gofrownica, 4–5 min",
      steps: c => [
        `Twaróg lub skyr (${c.g("quark")}) zmiksuj z jajkami (${c.g("eggs")}), mlekiem i olejem na gładko.`,
        `Dodaj mąki (${c.flour}) z proszkiem i solą. Zmiksuj krótko. Możesz dodać łyżkę ksylitolu lub erytrytolu.`,
        `Nakładaj po ok. ${c.pw} g do nagrzanej, natłuszczonej gofrownicy i piecz 4–5 minut.`,
        "Podawaj z owocami i jogurtem. Wytrawna wersja: bez słodzika, z ziołami i serem."
      ] },
    { id: "scones", name: "Scones (bułeczki śniadaniowe bez drożdży)", category: "Bułki i bułeczki", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["coldButter", 30], ["milkOrYogurt", 55], ["eggs", 18], ["sugar", 12], ["bakingPowder", 4.0], ["salt", 0.8]],
      unitWeight: 65, defaultCount: 9, unit: "bułeczka", bakeNote: "210°C, 14–16 min", sweet: true,
      steps: c => [
        `Mąki (${c.flour}), cukier, proszek i sól rozetrzyj z zimnym masłem (${c.g("coldButter")}) na drobną kruszonkę.`,
        `Wlej jajko (${c.g("eggs")}) roztrzepane z mlekiem lub jogurtem i zbierz ciasto widelcem, bez wyrabiania. Możesz dodać rodzynki lub żurawinę.`,
        `Spłaszcz na grubość 2,5 cm i wykrawaj szklanką ${c.pcs} bułeczek (nie przekręcaj szklanki – rosną wyżej).`,
        "Posmaruj mlekiem i piecz w 210°C 14–16 minut, aż będą złote.",
        "Podawaj ciepłe z masłem, dżemem i bitą śmietaną."
      ] },
    { id: "gofry_ziemniaczane", name: "Gofry ziemniaczane (z gofrownicy)", category: "Naleśniki, placki i gofry", rheologyClass: "RHEO_CURD_POTATO_DUMPLINGS",
      basis: "total", flourPct: 15, components: [["potatoes", 65], ["eggs", 12], ["meltedButter", 6], ["salt", 1.0], ["bakingPowder", 1.0]], target: { starch: [55, 80] },
      unitWeight: 90, defaultCount: 7, unit: "gofr", bakeNote: "gofrownica, 6–8 min",
      steps: c => [
        `Ugotuj ziemniaki, przeciśnij przez praskę i wystudź. Potrzebujesz ${c.g("potatoes")}.`,
        `Dodaj jajka (${c.g("eggs")}), roztopione masło, mąki (${c.flour}), proszek, sól i pieprz. Możesz dodać szczypiorek i starty ser.`,
        `Nakładaj po ok. ${c.pw} g do mocno nagrzanej, natłuszczonej gofrownicy.`,
        "Piecz 6–8 minut, aż będą złote i chrupiące – nie otwieraj wcześniej, bo się rozerwą.",
        "Podawaj z jajkiem sadzonym, łososiem lub kwaśną śmietaną."
      ] },
    { id: "gofry_pizzowe", name: "Pizza z gofrownicy (gofry pizzowe)", category: "Pizza, placki i chlebki płaskie", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["milk", 90], ["eggs", 60], ["cheese", 60], ["oil", 15], ["bakingPowder", 3.0], ["salt", 1.0]],
      unitWeight: 95, defaultCount: 6, unit: "gofr", bakeNote: "gofrownica, 5–6 min",
      steps: c => [
        `Wymieszaj mąki (${c.flour}), proszek, sól i 1 łyżeczkę oregano.`,
        `Dodaj mleko (${c.g("milk")}), jajka (${c.g("eggs")}) i olej, wymieszaj na gęste ciasto. Wmieszaj starty ser (${c.g("cheese")}) i drobno pokrojone salami lub szynkę.`,
        `Nakładaj po ok. ${c.pw} g do nagrzanej, natłuszczonej gofrownicy i piecz 5–6 minut.`,
        "Podawaj z sosem pomidorowym do maczania."
      ] },

    // ===== v2.20: przepisy dedykowane urządzeniom. Frytkownica Tefal Uno M – temperatury i czasy z tabeli produktów w instrukcji (jabłka 170°C 7–8 min po 4 szt., krążki/kalmary 180°C 4–5 min, pieczarki 150°C 6–8 min po 8 szt.) =====
    { id: "jablka_w_ciescie", device: "fry", name: "Jabłka w cieście (plastry, z frytkownicy)", category: "Pączki i słodkie smażone", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["milk", 110], ["eggs", 50], ["sugar", 10], ["bakingPowder", 2.5], ["salt", 0.4]],
      unitWeight: 500, defaultCount: 1, unit: "porcja na 4 jabłka", bakeNote: "frytkownica olejowa, 170°C, 7–8 min, po 4 plastry", sweet: true,
      steps: c => [
        `Wymieszaj mąki (${c.flour}) z proszkiem, cukrem i solą. Dodaj mleko (${c.g("milk")}) i jajka (${c.g("eggs")}), wymieszaj na gęste, gładkie ciasto. Odstaw na 10 minut.`,
        "Rozgrzej olej we frytkownicy do 170°C (zgaśnie kontrolka grzania). 4 jabłka obierz, wydrąż gniazda nasienne i pokrój w plastry grubości 1 cm.",
        "Plastry osusz, obtocz w odrobinie mąki, zanurz w cieście i strzep nadmiar.",
        "Smaż po 4 plastry, 7–8 minut, w połowie obróć szczypcami, aż będą złote.",
        "Odsącz na podniesionym koszu i na ręczniku papierowym. Posyp cukrem pudrem z cynamonem."
      ] },
    { id: "krazki_cebulowe", device: "fry", name: "Krążki cebulowe w cieście (lub kalmary)", category: "Przekąski i wytrawne", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["iceWater", 115], ["eggs", 15], ["oil", 5], ["bakingPowder", 2.5], ["salt", 2.0]], prefer: { kuk: 0.15 },
      unitWeight: 450, defaultCount: 1, unit: "porcja na ok. 500 g cebuli", bakeNote: "frytkownica olejowa, 180°C, 4–5 min",
      steps: c => [
        `Wymieszaj mąki (${c.flour}) z proszkiem i solą. Wlej lodowatą wodę (${c.g("iceWater")}) – może być piwo bezglutenowe – jajko i olej. Wymieszaj krótko, grudki mogą zostać.`,
        "Rozgrzej olej we frytkownicy do 180°C. 2–3 duże cebule pokrój w plastry 1 cm i rozdziel na krążki (albo 500 g kalmarów w krążki, osuszonych).",
        "Krążki obtocz w odrobinie mąki, zanurz w cieście, strzep nadmiar.",
        "Smaż partiami 4–5 minut, aż będą złote i chrupiące. Nie przepełniaj kosza.",
        "Odsącz, posól od razu. Podawaj z sosem czosnkowym lub ketchupem."
      ] },
    { id: "pieczarki_w_ciescie", device: "fry", name: "Pieczarki w cieście", category: "Przekąski i wytrawne", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["iceWater", 110], ["eggs", 20], ["bakingPowder", 2.5], ["salt", 2.0]], prefer: { kuk: 0.15 },
      unitWeight: 400, defaultCount: 1, unit: "porcja na ok. 24 pieczarki", bakeNote: "frytkownica olejowa, 150°C, 6–8 min, po 8 sztuk",
      steps: c => [
        `Wymieszaj mąki (${c.flour}) z proszkiem i solą, wlej lodowatą wodę (${c.g("iceWater")}) i jajko. Wymieszaj na gęste ciasto.`,
        "Rozgrzej olej we frytkownicy do 150°C – niższa temperatura, żeby pieczarki zdążyły się upiec w środku.",
        "Małe, całe pieczarki oczyść na sucho, obtocz w mące i zanurz w cieście.",
        "Smaż po 8 sztuk, 6–8 minut, obracając, aż będą złote.",
        "Odsącz i posól. Podawaj z sosem czosnkowym lub tatarskim."
      ] },
    // Air fryer Xiaomi 3,5 l: tryb ręczny (40–200°C); program „Ciasto” nie przypomina o potrząsaniu – w trybie ręcznym zignoruj komunikat.
    { id: "donuty_air", device: "air", name: "Donuty pieczone (z air fryera, w foremkach)", category: "Pączki i słodkie smażone", rheologyClass: "RHEO_CHEM_LEAVENED_MUFFIN_CHOUX",
      basis: "flour", components: [["milkOrYogurt", 75], ["eggs", 45], ["oil", 22], ["sugar", 40], ["bakingPowder", 3.0], ["salt", 0.4]],
      unitWeight: 45, defaultCount: 12, unit: "donut", bakeNote: "frytkownica beztłuszczowa, tryb ręczny 160°C, 9–10 min, partiami", sweet: true,
      steps: c => [
        `Wymieszaj mąki (${c.flour}) z proszkiem i solą. W drugiej misce roztrzep jajka (${c.g("eggs")}) z cukrem, jogurtem lub mlekiem (${c.g("milkOrYogurt")}) i olejem.`,
        "Połącz krótko łyżką. Przełóż do rękawa lub woreczka z odciętym rogiem.",
        `Wyciśnij ciasto do silikonowych foremek na donuty (do 3/4 wysokości), po ok. ${c.pw} g. Foremki muszą się zmieścić w koszu z odstępem od grzałki.`,
        "Rozgrzej frytkownicę 3 min w trybie ręcznym 160°C. Piecz partiami 9–10 minut – komunikat „Potrząśnij” zignoruj. Patyczek ma być suchy.",
        "Wystudź 5 minut w foremkach, wyjmij. Zanurz wierzch w polewie czekoladowej lub lukrze i posyp posypką."
      ] },
    // OptiGrill Elite: tryb ręczny (wyświetlacz pokazuje temperaturę), płyty do gofrów i płyty grillowe.
    { id: "gofry_czekoladowe", device: "opti", optiAcc: "waffle", masked: true, name: "Gofry czekoladowe (z OptiGrilla)", category: "Naleśniki, placki i gofry", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["milk", 120], ["eggs", 50], ["oil", 25], ["sugar", 30], ["cocoa", 12], ["bakingPowder", 2.5], ["salt", 0.4]],
      unitWeight: 85, defaultCount: 7, unit: "gofr", bakeNote: "OptiGrill, płyty do gofrów, tryb ręczny 200°C, 5–6 min", sweet: true,
      steps: c => [
        `Wymieszaj mąki (${c.flour}) z kakao, proszkiem i solą.`,
        `Dodaj mleko (${c.g("milk")}), jajka (${c.g("eggs")}), olej i cukier. Wymieszaj na gładkie, gęste ciasto. Odstaw na 10 minut.`,
        "Załóż płyty do gofrów, zamknij OptiGrill, wybierz tryb ręczny i ustaw 200°C. Poczekaj na sygnał końca nagrzewania.",
        `Wlej ok. ${c.pw} g ciasta (do połowy wysokości wgłębień), zamknij i piecz 5–6 minut, nie otwierając przez pierwsze 4.`,
        "Podawaj z owocami, bitą śmietaną albo lodami."
      ] },
    { id: "gofry_kukurydziane", device: "opti", optiAcc: "waffle", name: "Gofry kukurydziane z serem (wytrawne)", category: "Naleśniki, placki i gofry", rheologyClass: "RHEO_BATTER_COATING_SUSPENSION",
      basis: "flour", components: [["milk", 110], ["eggs", 50], ["oil", 25], ["cheese", 40], ["bakingPowder", 3.0], ["salt", 1.0]], prefer: { kuk: 0.5 },
      unitWeight: 85, defaultCount: 7, unit: "gofr", bakeNote: "OptiGrill, płyty do gofrów, tryb ręczny 200°C, 6–7 min",
      steps: c => [
        `Wymieszaj mąki (${c.flour}) – najlepiej z mąką kukurydzianą – z proszkiem i solą.`,
        `Dodaj mleko (${c.g("milk")}), jajka (${c.g("eggs")}) i olej, wymieszaj. Wmieszaj starty ser (${c.g("cheese")}), szczypiorek i 2 łyżki kukurydzy z puszki.`,
        "Załóż płyty do gofrów, w trybie ręcznym ustaw 200°C i poczekaj na sygnał nagrzania.",
        `Nakładaj po ok. ${c.pw} g i piecz 6–7 minut, aż będą złote.`,
        "Podawaj do chili, gulaszu albo z jajkiem sadzonym i awokado."
      ] },
    { id: "arepy", device: "opti", optiAcc: "plate", name: "Arepy (placki kukurydziane do nadziewania)", category: "Pizza, placki i chlebki płaskie", rheologyClass: "RHEO_SCALDED_BOILED_DOUGH",
      basis: "flour", components: [["hotWater", 95], ["oil", 5], ["psy", 0.8], ["salt", 1.5]], prefer: { kuk: 0.7 },
      unitWeight: 90, defaultCount: 6, unit: "arepa", bakeNote: "OptiGrill, płyty grillowe, tryb ręczny 200°C, 8–10 min",
      steps: c => [
        `Mąki (${c.flour}) – głównie kukurydzianą – wymieszaj z psyllium i solą. Zalej gorącą wodą (${c.g("hotWater")}), dodaj olej, wymieszaj i odstaw na 10 minut.`,
        `Zagnieć gładkie ciasto (jeśli pęka, dodaj łyżkę wody). Podziel na ${c.pcs} kulek po ok. ${c.pw} g i spłaszcz na placki grubości 1,5 cm.`,
        "Na płytach grillowych w trybie ręcznym ustaw 200°C i poczekaj na sygnał nagrzania. Posmaruj płyty odrobiną oleju.",
        "Połóż arepy, zamknij grill i piecz 8–10 minut, aż będą złote z obu stron, a postukane brzmią głucho.",
        "Natnij z boku jak bułkę i nadziej: ser, awokado, fasola, szarpana wieprzowina."
      ] }



  ];

  // ---------- Kategorie i drzewo wyboru ----------
  // Stare kategorie (indeksy w YEAST_CATEGORY i pola `category` starszych przepisów) – przemapowane niżej na nowy układ.
  const OLD_CATEGORIES = [
    "Pizza i płaskie", "Chleby", "Bułki i precle", "Nadziewane i słodkie drożdżowe",
    "Pierogi, kluski i makarony (bez drożdży)", "Naleśniki, gofry i panierki",
    "Ciastka, pierniczki i kruche", "Ciasta, biszkopty i desery"
  ];
  // Układ kategorii v2.16 – wg rodzaju wypieku (kolejność = kolejność kafelków w aplikacji).
  const CATEGORIES = [
    "Chleby", "Bułki i bułeczki", "Pizza, placki i chlebki płaskie", "Słodkie drożdżowe", "Ciasto francuskie i rogale",
    "Pierogi, kluski i makarony", "Naleśniki, placki i gofry", "Pączki i słodkie smażone", "Ciastka i kruche",
    "Ciasta, torty i desery", "Przekąski i wytrawne", "W kuchni: panierki, sosy, dodatki"
  ];
  const CAT_FROM_OLD = { "Pizza i płaskie": 2, "Chleby": 0, "Bułki i precle": 1, "Nadziewane i słodkie drożdżowe": 3,
    "Pierogi, kluski i makarony (bez drożdży)": 5, "Naleśniki, gofry i panierki": 6, "Ciastka, pierniczki i kruche": 8, "Ciasta, biszkopty i desery": 9 };
  const CAT_BY_ID = { calzone: 2, langosz: 2, paszteciki: 10, pierogi_drozdzowe: 5, grissini: 10, precle: 10, bajgle: 1,
    paczki: 7, oponki: 7, faworki: 7, paczki_serowe: 7, bomboloni: 7, quiche: 10, tarta: 9, szarlotka: 9, tempura: 11, bulka_tarta: 11,
    croissant: 4, rogale_marcinskie: 4, bao: 1, pampuchy: 5, pinsa: 2, panzerotti: 2, paska: 3, pizzerinki: 10, chleb_proteinowy: 0,
    bulki_czosnkowe: 1, biszkopty_tiramisu: 8, cebularze: 1, tortilla: 2, krakersy: 10, paczki_air: 7 };
  /** Kategorie wypieków drożdżowych */
  const YEAST_CATEGORY = {
    pizza_neapol: 0, pizza_blacha: 0, pizza_patelnia: 0, focaccia: 0, pita: 0, naan: 0, langosz: 0,
    chleb_jasny: 1, chleb_gryczany: 1, chleb_tostowy: 1, ciabatta: 1, bagietka: 1,
    hamburger: 2, subway: 2, kajzerki: 2, english_muffin: 2, brioche: 2, bajgle: 2, precle: 2, grissini: 2,
    calzone: 3, paszteciki: 3, pierogi_drozdzowe: 3, chalka: 3, babka: 3, drozdzowki: 3, cynamonki: 3, buleczki_maslane: 3, paczki: 3, placek_kruszonka: 3,
    chleb_ziarnisty: 1, chleb_owsiany: 1, bulki_ziarniste: 2, cebularze: 2, pide: 2, bulki_czosnkowe: 2, szneki: 3, jagodzianki: 3, strucla_makowa: 3, rogaliki_drozdzowe: 3, pampuchy: 3
  };
  for (const b of BAKES) { b.category = OLD_CATEGORIES[YEAST_CATEGORY[b.id] ?? 3]; b.family = "yeast"; }
  for (const b of PASTRY_BAKES) b.family = "pastry";
  const ALL_BAKES = BAKES.concat(PASTRY_BAKES);
  for (const b of ALL_BAKES) {
    const i = CAT_BY_ID[b.id] ?? CAT_FROM_OLD[b.category];
    if (i !== undefined) b.category = CATEGORIES[i];
    else if (!CATEGORIES.includes(b.category)) b.category = CATEGORIES[3];
  }

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
    c += G.textureCost(blend, b);
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
    const key = b.id + "|" + tasteW + "|" + JSON.stringify(G.texAdjOf ? G.texAdjOf(b.id) : 0) + "|" + pantryFlours.map(i => i.id + ":" + i.macros.protein + ":" + i.macros.fiber).join(",");
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
  function calculatePastryFormulation({ bake, pantryIds, doughWeight, extraIngredients = [], calib = {}, taste = "wheat", psyForm = "husk" }) {
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
    // Proszek psyllium = 85% wagi łuski (The Loopy Whisk)
    if (psyForm === "powder") comps = comps.map(([k, p]) => (k === "psy" ? [k, p * G.PSY_POWDER] : [k, p]));
    // Guma ksantanowa w ciastach z mąk bez spoiwa: ok. ¼ łyżeczki na 120 g mieszanki ≈ 0,4–0,5% (The Loopy Whisk);
    // kruche mniej, muffinki/ptysie więcej. Tylko gdy masz ksantan, a mieszanka nie ma własnego spoiwa.
    const XAN_CLASS = { RHEO_SHORTCRUST_COOKIE_CRISP: 0.3, RHEO_FOAM_EMULSION_CAKE: 0.4, RHEO_CHEM_LEAVENED_MUFFIN_CHOUX: 0.5 };
    const xanPct = (XAN_CLASS[bake.rheologyClass] || 0) * (1 - G.binderShareOf(blend));
    if (xanPct >= 0.1 && pantryIds.includes("xan") && !comps.some(([k]) => k === "psy" || k === "xan")) {
      comps.push(["xan", xanPct]);
      warnings.push("Dodaję trochę gumy ksantanowej, bo mąki nie mają spoiwa: wymieszaj ją dokładnie z mąkami, wtedy ciasto mniej się kruszy.");
    }
    // Psyllium i sól z ocen „Jak wyszło?” (procent zmiany)
    if (calib.psy) comps = comps.map(([k, p]) => (k === "psy" ? [k, p * (1 + calib.psy / 100)] : [k, p]));
    if (calib.salt) comps = comps.map(([k, p]) => (k === "salt" ? [k, p * (1 + calib.salt / 100)] : [k, p]));
    // Korekta płynu z ocen „Jak wyszło?” (punkty procentowe od masy mąk) – na głównym płynie przepisu
    if (calib.water) {
      const liq = comps.filter(([k]) => LIQUIDS.includes(k)).sort((a, z) => z[1] - a[1])[0];
      if (liq) comps = comps.map(([k, p]) => (k === liq[0] ? [k, Math.max(0, p + calib.water)] : [k, p]));
    }
    const psyC = comps.find(([k]) => k === "psy"), liqSum = comps.filter(([k]) => LIQUIDS.includes(k)).reduce((a, [, p]) => a + p, 0);
    if (psyC && liqSum < psyC[1] * 10) warnings.push("Mało płynu na psyllium (potrzeba ok. 10 g płynu na 1 g łuski): ciasto może pękać.");
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
      blend: blend.map(([ingredient, share]) => ({ ingredient, share })), textureMatch: G.textureMatch(blend, bake),
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
