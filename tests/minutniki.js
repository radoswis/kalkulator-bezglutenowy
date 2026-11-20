// Test minutników przy zamkniętej aplikacji: API /api/timers i cron (worker.js) z udawanym KV i udawanym serwerem push.
// Uruchom: node tests/minutniki.js
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert"), { webcrypto: wc, generateKeyPairSync } = require("crypto");
let ok = 0; const t = (name, fn) => Promise.resolve().then(fn).then(() => { ok++; }, e => { console.log("BŁĄD:", name, "\n ", e.message); process.exitCode = 1; });

(async () => {
  const tmp = path.join(os.tmpdir(), "gf-worker-t-" + process.pid + ".mjs");
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, "..", "worker.js")));
  const worker = (await import(require("url").pathToFileURL(tmp).href)).default;
  fs.unlinkSync(tmp);

  // klucze testowe (nie produkcyjne)
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");

  const store = new Map(); let writes = 0;
  const KV = { get: async k => store.get(k) ?? null, put: async (k, v) => { writes++; store.set(k, v); }, delete: async k => { writes++; store.delete(k); } };
  const env = { DATA: KV, ASSETS: { fetch: () => new Response("plik") }, VAPID_PUBLIC: pub, VAPID_PRIVATE_JWK: JSON.stringify(jwk) };
  const call = (method, p, body) => worker.fetch(new Request("https://x" + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), env);

  // udawany serwer push: zapisuje wysłane powiadomienia
  const sent = []; const realFetch = global.fetch;
  global.fetch = async (u, o) => { if (String(u).startsWith("https://push.example/")) { sent.push({ u: String(u), at: Date.now(), h: o.headers }); return new Response("", { status: String(u).includes("gone") ? 410 : 201 }); } return realFetch(u, o); };
  const sub = { endpoint: "https://push.example/abc", keys: {} };
  const cron = async at => { const ps = []; await worker.scheduled({ scheduledTime: at }, env, { waitUntil: p => ps.push(p) }); await Promise.all(ps); };

  await t("klucz publiczny dostępny", async () => {
    const j = await (await call("GET", "/api/timers/key")).json(); assert.strictEqual(j.key, pub);
  });
  const T = Math.floor(Date.now() / 60000) * 60000 + 60000; // „następna minuta” jako czas crona
  await t("zapis minutników telefonu", async () => {
    // zapis ze strony telefonu: przyszłe końce (API odrzuca minione)
    const now = Date.now();
    const r = await call("PUT", "/api/timers", { sub, timers: [{ id: "a", end: now + 3 * 60_000 }, { id: "zly", end: now - 1000 }] });
    assert.strictEqual((await r.json()).scheduled, 1);
    assert.deepStrictEqual(JSON.parse(store.get("push:index")), [Object.keys(Object.fromEntries(store)).find(k => k.startsWith("push:dev:")).slice(9)]);
  });
  await t("cron: wysyła o czasie końca, pomija przyszłe i należące do poprzedniej minuty", async () => {
    const key = [...store.keys()].find(k => k.startsWith("push:dev:"));
    const now = Date.now();
    // ręcznie ustawiamy końce względem okna crona T (czas „teraz” przesuwamy, udając, że cron startuje o T)
    const shift = now - T; // ujemne: T jest w przyszłości → przesuwamy końce, żeby test trwał ~1 s
    const at = x => x + shift;
    store.set(key, JSON.stringify({ endpoint: sub.endpoint, timers: [
      { id: "teraz", end: at(T + 800) },          // w tym oknie, za ~0,8 s
      { id: "spoznione", end: at(T - 5 * 60_000) }, // pominięte przez wcześniejsze okna → od razu
      { id: "poprzednie", end: at(T - 30_000) },    // okno poprzedniej minuty → nie tutaj
      { id: "pozniej", end: at(T + 5 * 60_000) }    // przyszłe → zostaje
    ] }));
    const t0 = Date.now();
    await cron(at(T));
    await cron(at(T)); // drugi przebieg tego samego okna nie może wysłać ponownie
    assert.strictEqual(sent.length, 2, "wysłano " + sent.length);
    assert.ok(sent[1].at - t0 >= 700, "powiadomienie „teraz” wysłane za wcześnie");
    const left = JSON.parse(store.get(key)).timers.map(x => x.id).sort();
    assert.deepStrictEqual(left, ["poprzednie", "pozniej"]);
  });
  await t("podpis VAPID poprawny", async () => {
    const auth = sent[0].h.Authorization, jwt = /t=([^,]+)/.exec(auth)[1], [h, p, s] = jwt.split(".");
    const key = await wc.subtle.importKey("raw", Buffer.from(pub, "base64url"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    assert.ok(await wc.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, Buffer.from(s, "base64url"), Buffer.from(h + "." + p)));
    assert.strictEqual(JSON.parse(Buffer.from(p, "base64url")).aud, "https://push.example");
    assert.ok(auth.includes("k=" + pub));
  });
  await t("anulowanie: pusta lista usuwa minutniki telefonu", async () => {
    await call("PUT", "/api/timers", { sub, timers: [] });
    assert.ok(![...store.keys()].some(k => k.startsWith("push:dev:")));
  });
  await t("wygasła subskrypcja (410) jest usuwana", async () => {
    const g = { endpoint: "https://push.example/gone", keys: {} };
    await call("PUT", "/api/timers", { sub: g, timers: [{ id: "x", end: Date.now() + 120_000 }] });
    const key = [...store.keys()].find(k => k.startsWith("push:dev:"));
    store.set(key, JSON.stringify({ endpoint: g.endpoint, timers: [{ id: "x", end: Date.now() + 100 }] }));
    await cron(Date.now());
    assert.ok(!store.has(key)); assert.deepStrictEqual(JSON.parse(store.get("push:index")), []);
  });
  await t("bez sekretu funkcja wyłączona", async () => {
    const e2 = { ...env, VAPID_PRIVATE_JWK: undefined };
    const r = await worker.fetch(new Request("https://x/api/timers/key"), e2); assert.strictEqual(r.status, 503);
  });
  global.fetch = realFetch;
  console.log(`Minutniki: ${ok} testów zaliczonych${process.exitCode ? ", są błędy" : ""} (zapisów KV: ${writes})`);
})();
