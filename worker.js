/**
 * Worker kalkulatora: serwuje aplikację i małe API.
 *  GET  /api/state       – wspólne dane domu (spiżarnia, własne mąki, kalibracje)
 *  PUT  /api/state       – zapis wspólnych danych (JSON, do 100 KB)
 *  GET  /api/off?q=…     – wyszukiwanie mąki w Open Food Facts (nazwa lub kod kreskowy)
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/state") return await handleState(req, env);
      if (url.pathname === "/api/off") return await handleOff(url);
      if (url.pathname.startsWith("/api/")) return json({ error: "Nie ma takiego adresu." }, 404);
    } catch (e) {
      return json({ error: "Błąd serwera: " + (e && e.message ? e.message : String(e)) }, 500);
    }
    return env.ASSETS.fetch(req);
  }
};
