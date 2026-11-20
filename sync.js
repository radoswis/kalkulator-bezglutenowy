/* Scalanie wspólnego stanu domu (spiżarnia, własne mąki, kalibracje, preferencje).
   Trójstronnie: base = ostatni stan uzgodniony z serwerem, local = ten telefon, server = to, co jest teraz na serwerze.
   Zmiany z telefonu (różnice local względem base) nakładamy na stan serwera, więc nic nie ginie:
   ani zmiany zrobione bez internetu, ani zmiany drugiej osoby. Działa w przeglądarce i w Node (testy). */
(function (global) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const norm = s => ({ pantry: (s && s.pantry) || [], custom: (s && s.custom) || [], calib: (s && s.calib) || {}, prefs: (s && s.prefs) || {} });

  /** @returns {{pantry:string[], custom:object[], calib:object, prefs:object}} */
  function mergeState(base, local, server) {
    const B = norm(base), L = norm(local), S = norm(server);

    // Spiżarnia: dodane i odznaczone na tym telefonie względem base
    const bSet = new Set(B.pantry), lSet = new Set(L.pantry);
    const added = L.pantry.filter(id => !bSet.has(id)), removed = B.pantry.filter(id => !lSet.has(id));
    const pantry = new Set(S.pantry);
    added.forEach(id => pantry.add(id));
    removed.forEach(id => pantry.delete(id));

    // Własne mąki: po id; nowe lub zmienione na telefonie wygrywają, usunięte na telefonie znikają
    const byId = a => new Map(a.map(f => [f.id, f]));
    const bC = byId(B.custom), lC = byId(L.custom), custom = byId(S.custom);
    for (const [id, f] of lC) if (!bC.has(id) || !same(bC.get(id), f)) custom.set(id, f);
    for (const id of bC.keys()) if (!lC.has(id)) custom.delete(id);

    // Kalibracje: osobno dla każdego przepisu; gdy oba telefony oceniły ten sam przepis – ustawienia z telefonu, dziennik ocen połączony
    const calib = Object.assign({}, S.calib);
    const ids = new Set([...Object.keys(B.calib), ...Object.keys(L.calib)]);
    for (const id of ids) {
      const b = B.calib[id], l = L.calib[id], s = S.calib[id];
      if (same(b, l)) continue;                      // telefon nic tu nie zmieniał
      if (l === undefined) { delete calib[id]; continue; } // wyzerowane na telefonie
      if (s && !same(b, s)) {                         // zmienione z obu stron
        const seen = new Set(), log = [];
        for (const e of [...(s.log || []), ...(l.log || [])]) { const k = JSON.stringify(e); if (!seen.has(k)) { seen.add(k); log.push(e); } }
        log.sort((x, y) => String(x.d).localeCompare(String(y.d)));
        calib[id] = Object.assign({}, l, { log: log.slice(-20) });
      } else calib[id] = l;
    }

    // Preferencje: każde pole osobno
    const prefs = Object.assign({}, S.prefs);
    for (const k of new Set([...Object.keys(B.prefs), ...Object.keys(L.prefs)])) if (!same(B.prefs[k], L.prefs[k])) prefs[k] = L.prefs[k];

    return { pantry: [...pantry], custom: [...custom.values()], calib, prefs };
  }

  /** Czy stan ma poprawny kształt (używane też przez serwer). */
  function validState(s) {
    return !!s && typeof s === "object" && !Array.isArray(s) && Array.isArray(s.pantry) && s.pantry.every(x => typeof x === "string")
      && (s.custom === undefined || Array.isArray(s.custom)) && (s.calib === undefined || (typeof s.calib === "object" && !Array.isArray(s.calib)))
      && (s.prefs === undefined || (typeof s.prefs === "object" && !Array.isArray(s.prefs)));
  }

  const GFSync = { mergeState, validState, sameState: (a, b) => same(norm(a), norm(b)) };
  if (typeof module !== "undefined" && module.exports) module.exports = GFSync;
  global.GFSync = GFSync;
})(typeof window !== "undefined" ? window : globalThis);
