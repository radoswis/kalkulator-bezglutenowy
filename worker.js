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

async function handleOff(url) {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "Podaj nazwę lub kod kreskowy." }, 400);
  const headers = { "User-Agent": "KalkulatorBezglutenowy/2.0 (prywatna aplikacja domowa)" };
  const fields = "code,product_name,product_name_pl,brands,nutriments,ingredients_text_pl,ingredients_text";
  const isCode = /^\d{8,14}$/.test(q);
  const api = isCode
    ? `https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${fields}`
    : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=6&fields=${fields}`;
  const r = await fetch(api, { headers, cf: { cacheTtl: 3600 } });
  if (!r.ok) return json({ error: `Open Food Facts nie odpowiada (kod ${r.status}). Spróbuj za chwilę.` }, 502);
  const d = await r.json();
  const list = (isCode ? (d.product ? [d.product] : []) : d.products || []).map(p => ({
    code: p.code,
    name: p.product_name_pl || p.product_name || "",
    brands: p.brands || "",
    protein: p.nutriments?.proteins_100g ?? null,
    fiber: p.nutriments?.fiber_100g ?? null,
    carbs: p.nutriments?.carbohydrates_100g ?? null,
    fat: p.nutriments?.fat_100g ?? null,
    composition: p.ingredients_text_pl || p.ingredients_text || ""
  })).filter(p => p.name);
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
