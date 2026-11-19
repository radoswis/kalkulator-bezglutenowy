/**
 * Worker kalkulatora: serwuje aplikację i małe API.
 *  GET  /api/state       – wspólne dane domu (spiżarnia, własne mąki, kalibracje)
 *  PUT  /api/state       – zapis wspólnych danych (JSON, do 100 KB)
 *  GET  /api/off?q=…     – wyszukiwanie mąki w Open Food Facts (nazwa lub kod kreskowy)
 *  POST /api/label       – zdjęcie etykiety → Workers AI odczytuje skład i wartości odżywcze (brakujące szacuje)
 * Wszystko w darmowym limicie Cloudflare (KV: 1000 zapisów/dzień, zapisy w aplikacji są grupowane).
 */
const STATE_KEY = "state:v1";
const MAX_BODY = 100_000;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function handleState(req, env) {
  if (req.method === "GET") {
    const v = await env.DATA.get(STATE_KEY);
    return json(v ? JSON.parse(v) : {});
  }
  if (req.method === "PUT") {
    const body = await req.text();
    if (body.length > MAX_BODY) return json({ error: "Za dużo danych do zapisania (limit 100 KB)." }, 413);
    let data;
    try { data = JSON.parse(body); } catch { return json({ error: "Nieprawidłowe dane (to nie jest JSON)." }, 400); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "Nieprawidłowy format danych." }, 400);
    data.updatedAt = new Date().toISOString();
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/state") return await handleState(req, env);
      if (url.pathname === "/api/off") return await handleOff(url);
      if (url.pathname === "/api/label") return await handleLabel(req, env);
      if (url.pathname.startsWith("/api/")) return json({ error: "Nie ma takiego adresu." }, 404);
    } catch (e) {
      return json({ error: "Błąd serwera: " + (e && e.message ? e.message : String(e)) }, 500);
    }
    return env.ASSETS.fetch(req);
  }
};
