/**
 * Worker kalkulatora: serwuje aplikację i małe API.
 *  GET  /api/state       – wspólne dane domu (spiżarnia, własne mąki, kalibracje)
 *  PUT  /api/state       – zapis wspólnych danych (JSON, do 100 KB); nagłówek x-base-version → 409 przy nowszej wersji
 *  GET  /api/state/backups, POST /api/state/restore {at} – kopie zapasowe (najwyżej 1 na godzinę, 60 dni)
 *  Opcjonalny sekret HOME_CODE → wymagany nagłówek x-home-code (stan i etykiety)
 *  GET  /api/off?q=…     – wyszukiwanie mąki w Open Food Facts (nazwa lub kod kreskowy)
 *  POST /api/label       – zdjęcie etykiety → Workers AI odczytuje skład i wartości odżywcze (brakujące szacuje)
 * Wszystko w darmowym limicie Cloudflare (KV: 1000 zapisów/dzień, zapisy w aplikacji są grupowane).
 */
const STATE_KEY = "state:v1";
const BACKUP_PREFIX = "state:bak:";
const BACKUP_TTL = 60 * 24 * 3600; // kopie zapasowe trzymane 60 dni
const MAX_BODY = 100_000;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// Kod domowy (opcjonalny): gdy ustawiony sekret HOME_CODE (npx wrangler secret put HOME_CODE),
// zapis i odczyt danych domu oraz odczyt etykiet wymagają nagłówka x-home-code. Bez sekretu – jak dotąd, bez kodu.
const codeOk = (req, env) => !env.HOME_CODE || req.headers.get("x-home-code") === env.HOME_CODE;
const needCode = () => json({ error: "Podaj kod domowy, żeby korzystać ze wspólnych danych.", needCode: true }, 401);

// Ten sam warunek co GFSync.validState w sync.js
const validState = s => !!s && typeof s === "object" && !Array.isArray(s) && Array.isArray(s.pantry) && s.pantry.every(x => typeof x === "string")
  && (s.custom === undefined || Array.isArray(s.custom)) && (s.calib === undefined || (typeof s.calib === "object" && !Array.isArray(s.calib)))
  && (s.prefs === undefined || (typeof s.prefs === "object" && !Array.isArray(s.prefs)));

/** Kopia poprzedniego stanu: najwyżej jedna na godzinę (oszczędza darmowy limit 1000 zapisów KV na dzień). */
async function backup(env, currentText) {
  if (!currentText) return;
  const key = BACKUP_PREFIX + new Date().toISOString().slice(0, 13); // np. state:bak:2026-11-20T14
  if (await env.DATA.get(key)) return;
  await env.DATA.put(key, currentText, { expirationTtl: BACKUP_TTL });
}

async function handleState(req, env, url) {
  if (!codeOk(req, env)) return needCode();
  const sub = url.pathname.slice("/api/state".length);
  if (sub === "/backups" && req.method === "GET") {
    const list = await env.DATA.list({ prefix: BACKUP_PREFIX });
    return json({ backups: list.keys.map(k => k.name.slice(BACKUP_PREFIX.length)).sort().reverse() });
  }
  if (sub === "/restore" && req.method === "POST") {
    let at;
    try { at = (await req.json()).at; } catch { return json({ error: "Nieprawidłowe dane." }, 400); }
    const text = typeof at === "string" ? await env.DATA.get(BACKUP_PREFIX + at) : null;
    if (!text) return json({ error: "Nie ma takiej kopii zapasowej." }, 404);
    const data = JSON.parse(text);
    await backup(env, await env.DATA.get(STATE_KEY));
    data.updatedAt = new Date().toISOString();
    data.restoredFrom = at;
    await env.DATA.put(STATE_KEY, JSON.stringify(data));
    return json({ ok: true, state: data });
  }
  if (sub) return json({ error: "Nie ma takiego adresu." }, 404);
  if (req.method === "GET") {
    const v = await env.DATA.get(STATE_KEY);
    return json(v ? JSON.parse(v) : {});
  }
  if (req.method === "PUT") {
    const body = await req.text();
    if (body.length > MAX_BODY) return json({ error: "Za dużo danych do zapisania (limit 100 KB)." }, 413);
    let data;
    try { data = JSON.parse(body); } catch { return json({ error: "Nieprawidłowe dane (to nie jest JSON)." }, 400); }
    if (!validState(data)) return json({ error: "Nieprawidłowy format danych." }, 400);
    const currentText = await env.DATA.get(STATE_KEY);
    const current = currentText ? JSON.parse(currentText) : null;
    // Kontrola wersji: telefon podaje, na której wersji pracował. Jeśli na serwerze jest NOWSZA – zwracamy ją do scalenia.
    // (Starsza wersja z odczytu oznacza tylko opóźnienie KV, wtedy zapisujemy.) Stare wersje aplikacji nie wysyłają nagłówka.
    const base = req.headers.get("x-base-version");
    if (base !== null && current && current.updatedAt && current.updatedAt > base) return json({ conflict: true, state: current }, 409);
    await backup(env, currentText);
    delete data.restoredFrom;
    data.updatedAt = new Date().toISOString();
    if (current && current.updatedAt && data.updatedAt <= current.updatedAt) data.updatedAt = new Date(Date.parse(current.updatedAt) + 1).toISOString();
    await env.DATA.put(STATE_KEY, JSON.stringify(data));
    return json({ ok: true, updatedAt: data.updatedAt });
  }
  return json({ error: "Metoda niedozwolona." }, 405);
}

// Słowa, po których rozpoznajemy mąkę, skrobię lub mieszankę mąk (nazwa lub kategoria)
const FLOUR_RE = /m[aą]k|mieszank|skrobi|mix|flour|farin|mehl|starch|amido|tapiok|psyllium|babk|otr[eę]b|kasza manna/i;
const NOT_FLOUR_RE = /chleb (krojony|tostowy)|bu[lł]k|pain |bread slice|ciastk|herbatnik|makaron|pieczywo|wafl/i;

const UA = { "User-Agent": "KalkulatorBezglutenowy/2.2 (prywatna aplikacja domowa)" };

// Nowa wyszukiwarka OFF (Search-a-licious) – szybsza i rzadziej przeciążona
async function salSearch(q, filter, fields) {
  const url = "https://search.openfoodfacts.org/search?" + new URLSearchParams({ q: filter ? `${q} ${filter}` : q, page_size: "24", langs: "pl", fields });
  const r = await fetch(url, { headers: UA, cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error(`kod ${r.status}`);
  return (await r.json()).hits || [];
}
// Stara wyszukiwarka OFF – zapasowa
async function cgiSearch(params) {
  const r = await fetch("https://world.openfoodfacts.org/cgi/search.pl?" + new URLSearchParams(params), { headers: UA, cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error(`kod ${r.status}`);
  return (await r.json()).products || [];
}

async function handleOff(url) {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "Podaj nazwę lub kod kreskowy." }, 400);
  const fields = "code,product_name,product_name_pl,brands,nutriments,ingredients_text_pl,ingredients_text,countries_tags,categories_tags";
  const isCode = /^\d{8,14}$/.test(q);
  let products = [];
  if (isCode) {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${fields}`, { headers: { "User-Agent": "KalkulatorBezglutenowy/2.1" } });
    const d = r.ok ? await r.json() : {};
    products = d.product ? [d.product] : [];
  } else {
    // Kolejne próby: Polska + mąki, Polska, świat (stara wyszukiwarka). Błąd jednej próby nie przerywa wyszukiwania.
    const base = { search_terms: q, json: "1", page_size: "24", fields, sort_by: "unique_scans_n" };
    const tries = [
      () => salSearch(q, 'countries_tags:"en:poland" categories_tags:"en:flours"', fields),
      () => salSearch(q, 'countries_tags:"en:poland"', fields),
      () => cgiSearch({ ...base, tagtype_0: "countries", tag_contains_0: "contains", tag_0: "poland" }),
      () => cgiSearch({ ...base, tagtype_0: "categories", tag_contains_0: "contains", tag_0: "flours" })
    ];
    const seen = new Set(), errors = [];
    for (const run of tries) {
      let found = [];
      try { found = await run(); } catch (e) { errors.push(e.message); continue; }
      for (const p of found) {
        const name = p.product_name_pl || p.product_name || "";
        const cats = [].concat(p.categories_tags || []).join(" ");
        if (!name || seen.has(p.code)) continue;
        if (!(FLOUR_RE.test(name) || /flour|starch/.test(cats)) || NOT_FLOUR_RE.test(name)) continue;
        seen.add(p.code); products.push(p);
      }
      if (products.length >= 8) break;
    }
    if (!products.length && errors.length === tries.length)
      return json({ error: "Baza Open Food Facts jest chwilowo przeciążona. Spróbuj za kilka minut albo wpisz dane z etykiety." }, 502);
  }
  const list = products.slice(0, 8).map(p => ({
    code: p.code,
    name: p.product_name_pl || p.product_name || "",
    brands: p.brands || "",
    poland: [].concat(p.countries_tags || []).includes("en:poland"),
    protein: p.nutriments?.proteins_100g ?? null,
    fiber: p.nutriments?.fiber_100g ?? null,
    carbs: p.nutriments?.carbohydrates_100g ?? null,
    fat: p.nutriments?.fat_100g ?? null,
    composition: p.ingredients_text_pl || p.ingredients_text || ""
  })).filter(p => p.name)
    .sort((a, b) => Number(b.poland) - Number(a.poland));
  return json({ results: list });
}

// Odczyt etykiety przez Workers AI (darmowy limit dzienny). Modele z licencją Apache 2.0 (Llama 3.2 Vision ma ograniczenia w UE).
const LABEL_MODELS = ["@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/google/gemma-3-12b-it"];
const LABEL_PROMPT = `Na zdjęciu jest etykieta mąki, skrobi albo bezglutenowej mieszanki mąk (zwykle po polsku).
Zwróć WYŁĄCZNIE obiekt JSON, bez komentarzy:
{"name": nazwa produktu po polsku, "brands": marka lub null,
 "type": "pelna" (mąka z białkiem/błonnikiem) | "skrobia" (czysta skrobia, np. ziemniaczana, kukurydziana, tapioka) | "mix" (mieszanka z zagęstnikiem: HPMC/E464, guma ksantanowa/E415, guma guar/E412, psyllium, błonnik bambusowy),
 "protein": g/100 g, "fiber": g/100 g, "carbs": g/100 g, "fat": g/100 g,
 "composition": skład dosłownie z etykiety albo null,
 "wheatStarch": true jeśli w składzie jest skrobia pszenna,
 "glutenFree": true jeśli widać oznaczenie bez glutenu / przekreślony kłos, false jeśli wyraźnie go brak, null jeśli nie wiadomo,
 "estimated": lista pól, których NIE było na zdjęciu i które oszacowałeś}
Liczby przepisuj z tabeli wartości odżywczych (na 100 g). Jeśli wartości nie widać, oszacuj typową wartość dla tego rodzaju mąki i dopisz nazwę pola do "estimated". Liczby jako liczby (kropka dziesiętna).`;

function pickJson(out) {
  if (out && typeof out === "object" && !Array.isArray(out) && ("protein" in out || "name" in out)) return out;
  const t = typeof out === "string" ? out : JSON.stringify(out ?? "");
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
const num = v => { if (v == null || v === "") return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : null; };

async function handleLabel(req, env) {
  if (req.method !== "POST") return json({ error: "Metoda niedozwolona." }, 405);
  if (!env.AI) return json({ error: "Odczyt etykiet nie jest jeszcze włączony na serwerze (brak Workers AI)." }, 503);
  const body = await req.text();
  if (body.length > 2_500_000) return json({ error: "Zdjęcie jest za duże." }, 413);
  let image;
  try { image = JSON.parse(body).image; } catch { return json({ error: "Nieprawidłowe dane." }, 400); }
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) return json({ error: "Brak zdjęcia." }, 400);
  const messages = [{ role: "user", content: [{ type: "text", text: LABEL_PROMPT }, { type: "image_url", image_url: { url: image } }] }];
  let data = null; const errors = [];
  for (const model of LABEL_MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 900, temperature: 0.1 });
      data = pickJson(out && out.response !== undefined ? out.response : out);
      if (data) break;
      errors.push(model + ": brak JSON");
    } catch (e) { errors.push(model + ": " + (e && e.message ? e.message : e)); }
  }
  if (!data) return json({ error: "AI nie odczytała etykiety. Zrób wyraźniejsze zdjęcie składu i tabelki wartości odżywczych.", detail: errors.join(" | ") }, 502);
  const type = ["pelna", "skrobia", "mix"].includes(data.type) ? data.type : "pelna";
  return json({
    name: typeof data.name === "string" ? data.name.slice(0, 120) : "",
    brands: typeof data.brands === "string" ? data.brands.slice(0, 80) : "",
    type,
    protein: num(data.protein), fiber: num(data.fiber), carbs: num(data.carbs), fat: num(data.fat),
    composition: typeof data.composition === "string" ? data.composition.slice(0, 1500) : "",
    wheatStarch: data.wheatStarch === true || /skrobi[aę] pszenn/i.test(String(data.composition || "")),
    glutenFree: typeof data.glutenFree === "boolean" ? data.glutenFree : null,
    estimated: Array.isArray(data.estimated) ? data.estimated.filter(x => typeof x === "string").slice(0, 8) : []
  });
}

// ===== Minutniki przy zamkniętej aplikacji: Web Push (VAPID, bez treści) =====
// Telefon zapisuje swoje minutniki (PUT /api/timers). Cron co minutę bierze te, które kończą się w tej minucie,
// czeka do sekundy końca i wysyła push; service worker telefonu pokazuje powiadomienie z opisem.
// Konfiguracja: vars.VAPID_PUBLIC (wrangler.jsonc) + sekret VAPID_PRIVATE_JWK. Bez sekretu funkcja jest wyłączona.
// KV: "push:index" = lista urządzeń (zmienia się rzadko), "push:dev:<id>" = {endpoint, timers:[{id,end}]}.
// Cron czyta tylko te klucze (bez list), więc mieści się w darmowych limitach.
const PUSH_INDEX = "push:index", PUSH_DEV = "push:dev:";
const MAX_TIMERS = 20, MISSED_MS = 10 * 60_000;
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const devId = async endpoint => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)))].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
const pushReady = env => !!(env.VAPID_PUBLIC && env.VAPID_PRIVATE_JWK);

async function handleTimers(req, env, url) {
  if (!codeOk(req, env)) return needCode();
  if (url.pathname === "/api/timers/key") return pushReady(env) ? json({ key: env.VAPID_PUBLIC }) : json({ error: "Powiadomienia nie są włączone na serwerze." }, 503);
  if (url.pathname !== "/api/timers") return json({ error: "Nie ma takiego adresu." }, 404);
  if (req.method !== "PUT") return json({ error: "Metoda niedozwolona." }, 405);
  if (!pushReady(env)) return json({ error: "Powiadomienia nie są włączone na serwerze." }, 503);
  let body;
  try { body = JSON.parse(await req.text()); } catch { return json({ error: "Nieprawidłowe dane." }, 400); }
  const endpoint = body && body.sub && body.sub.endpoint;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) return json({ error: "Brak subskrypcji powiadomień." }, 400);
  const now = Date.now();
  const timers = (Array.isArray(body.timers) ? body.timers : []).slice(0, MAX_TIMERS)
    .filter(t => t && typeof t.id === "string" && t.id.length <= 40 && Number.isFinite(t.end) && t.end > now && t.end < now + 2 * 864e5)
    .map(t => ({ id: t.id, end: Math.round(t.end) }));
  const id = await devId(endpoint), key = PUSH_DEV + id;
  if (timers.length) {
    await env.DATA.put(key, JSON.stringify({ endpoint, timers }), { expirationTtl: 3 * 86400 });
    const idx = JSON.parse((await env.DATA.get(PUSH_INDEX)) || "[]");
    if (!idx.includes(id)) await env.DATA.put(PUSH_INDEX, JSON.stringify(idx.concat(id).slice(-50)));
  } else if (await env.DATA.get(key)) await env.DATA.delete(key);
  return json({ ok: true, scheduled: timers.length });
}

let vapidKey = null;
async function vapidJwt(env, aud) {
  vapidKey = vapidKey || await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const data = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://github.com/radoswis/kalkulator-bezglutenowy" });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapidKey, new TextEncoder().encode(data));
  return data + "." + b64u(sig);
}
/** Pusty push (bez treści) – wystarczy, żeby obudzić service worker telefonu. @returns {Promise<number>} kod HTTP */
async function sendPush(env, endpoint) {
  const jwt = await vapidJwt(env, new URL(endpoint).origin);
  const r = await fetch(endpoint, { method: "POST", headers: { Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`, TTL: "600", Urgency: "high", "Content-Length": "0" } });
  return r.status;
}

/** Cron co minutę. Okno tej minuty: [T, T+60 s); spóźnione (z poprzednich okien, do 10 min) – od razu. */
async function runPush(env, T) {
  if (!pushReady(env)) return;
  const idx = JSON.parse((await env.DATA.get(PUSH_INDEX)) || "[]");
  if (!idx.length) return;
  const inWindow = t => t.end < T + 60_000 && (t.end >= T || (t.end < T - 60_000 && t.end > T - MISSED_MS));
  const live = [];
  const jobs = idx.map(async id => {
    const raw = await env.DATA.get(PUSH_DEV + id);
    if (!raw) return;
    live.push(id);
    const dev = JSON.parse(raw);
    const due = dev.timers.filter(inWindow).sort((a, b) => a.end - b.end);
    if (!due.length) return;
    for (const t of due) {
      const wait = t.end - Date.now();
      if (wait > 0) await sleep(wait);
      // telefon mógł w międzyczasie anulować minutnik
      const cur = JSON.parse((await env.DATA.get(PUSH_DEV + id)) || "null");
      if (!cur || !cur.timers.some(x => x.id === t.id && x.end === t.end)) continue;
      const status = await sendPush(env, dev.endpoint).catch(() => 0);
      if (status === 404 || status === 410) { await env.DATA.delete(PUSH_DEV + id); live.splice(live.indexOf(id), 1); return; } // subskrypcja wygasła
      const left = cur.timers.filter(x => !(x.id === t.id && x.end === t.end));
      if (left.length) await env.DATA.put(PUSH_DEV + id, JSON.stringify({ ...cur, timers: left }), { expirationTtl: 3 * 86400 });
      else await env.DATA.delete(PUSH_DEV + id);
    }
  });
  await Promise.all(jobs);
  if (live.length === idx.length) return;
  // przed usunięciem z listy sprawdź jeszcze raz – telefon mógł właśnie ustawić nowy minutnik
  const dead = [];
  for (const id of idx) if (!live.includes(id) && !(await env.DATA.get(PUSH_DEV + id))) dead.push(id);
  const now = JSON.parse((await env.DATA.get(PUSH_INDEX)) || "[]");
  if (dead.length) await env.DATA.put(PUSH_INDEX, JSON.stringify(now.filter(i => !dead.includes(i))));
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPush(env, event.scheduledTime));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/state" || url.pathname.startsWith("/api/state/")) return await handleState(req, env, url);
      if (url.pathname === "/api/timers" || url.pathname.startsWith("/api/timers/")) return await handleTimers(req, env, url);
      if (url.pathname === "/api/off") return await handleOff(url);
      if (url.pathname === "/api/label") return codeOk(req, env) ? await handleLabel(req, env) : needCode();
      if (url.pathname.startsWith("/api/")) return json({ error: "Nie ma takiego adresu." }, 404);
    } catch (e) {
      return json({ error: "Błąd serwera: " + (e && e.message ? e.message : String(e)) }, 500);
    }
    return env.ASSETS.fetch(req);
  }
};
