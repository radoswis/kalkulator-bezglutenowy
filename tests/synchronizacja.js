// Test synchronizacji stanu domu: scalanie (sync.js) i serwer (worker.js) z udawanym KV. Uruchom: node tests/synchronizacja.js
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert");
const { mergeState, validState } = require("../sync.js");
let ok = 0; const t = (name, fn) => Promise.resolve().then(fn).then(() => { ok++; }, e => { console.log("BŁĄD:", name, "\n ", e.message); process.exitCode = 1; });

const base = { pantry: ["ryz", "szi", "psy"], custom: [{ id: "own1", name: "Moja" }], calib: { chleb_jasny: { water: 2, log: [{ d: "2026-11-01", v: "Suchy" }] } }, prefs: { taste: "wheat", oven: "uni" } };
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  await t("offline: dodana mąka nie ginie, gdy serwer bez zmian", () => {
    const local = clone(base); local.pantry.push("tap");
    assert.deepStrictEqual(mergeState(base, local, base).pantry.sort(), ["psy", "ryz", "szi", "tap"]);
  });
  await t("dwa telefony: odznaczenie na A i ocena na B – zostają obie zmiany", () => {
    const server = clone(base); server.pantry = ["ryz", "psy"];                 // A odznaczył skrobię
    const local = clone(base); local.calib.pizza_blacha = { temp: 10, log: [] }; // B ocenił pizzę
    const m = mergeState(base, local, server);
    assert.deepStrictEqual(m.pantry.sort(), ["psy", "ryz"]);
    assert.ok(m.calib.pizza_blacha && m.calib.chleb_jasny);
  });
  await t("odznaczenie na telefonie usuwa mąkę mimo innych zmian na serwerze", () => {
    const server = clone(base); server.pantry.push("sor");
    const local = clone(base); local.pantry = local.pantry.filter(x => x !== "szi");
    assert.deepStrictEqual(mergeState(base, local, server).pantry.sort(), ["psy", "ryz", "sor"]);
  });
  await t("ten sam przepis oceniony na obu telefonach: dziennik połączony", () => {
    const server = clone(base); server.calib.chleb_jasny = { water: 4, log: [...base.calib.chleb_jasny.log, { d: "2026-11-10", v: "Suchy" }] };
    const local = clone(base); local.calib.chleb_jasny = { water: 1, log: [...base.calib.chleb_jasny.log, { d: "2026-11-12", v: "Kleisty" }] };
    const m = mergeState(base, local, server).calib.chleb_jasny;
    assert.strictEqual(m.water, 1); assert.strictEqual(m.log.length, 3);
  });
  await t("wyzerowanie korekt na telefonie usuwa je", () => {
    const local = clone(base); delete local.calib.chleb_jasny;
    assert.strictEqual(mergeState(base, local, base).calib.chleb_jasny, undefined);
  });
  await t("własne mąki: nowa z telefonu i nowa z serwera – obie", () => {
    const server = clone(base); server.custom.push({ id: "own2", name: "Z serwera" });
    const local = clone(base); local.custom.push({ id: "own3", name: "Z telefonu" });
    assert.deepStrictEqual(mergeState(base, local, server).custom.map(f => f.id).sort(), ["own1", "own2", "own3"]);
  });
  await t("preferencje: każde pole osobno", () => {
    const server = clone(base); server.prefs.oven = "gorenje";
    const local = clone(base); local.prefs.taste = "bold";
    assert.deepStrictEqual(mergeState(base, local, server).prefs, { taste: "bold", oven: "gorenje" });
  });
  await t("telefon bez wspólnej historii (base pusty): suma spiżarni", () => {
    assert.deepStrictEqual(mergeState(null, { pantry: ["tap"] }, base).pantry.sort(), ["psy", "ryz", "szi", "tap"]);
  });
  await t("kontrola kształtu danych", () => {
    assert.ok(validState(base)); assert.ok(!validState({})); assert.ok(!validState({ pantry: "ryz" })); assert.ok(!validState([]));
  });

  // ---- serwer z udawanym KV ----
  const tmp = path.join(os.tmpdir(), "gf-worker-" + process.pid + ".mjs");
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, "..", "worker.js")));
  const worker = (await import(require("url").pathToFileURL(tmp).href)).default;
  fs.unlinkSync(tmp);
  const store = new Map();
  const KV = { get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); }, list: async ({ prefix }) => ({ keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }) };
  const env = { DATA: KV, ASSETS: { fetch: () => new Response("plik") } };
  const call = (method, p, body, headers = {}) => worker.fetch(new Request("https://x" + p, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }), env);

  let ver;
  await t("serwer: zapis i odczyt", async () => {
    const r = await call("PUT", "/api/state", base, { "x-base-version": "" }); assert.strictEqual(r.status, 200); ver = (await r.json()).updatedAt;
    const g = await (await call("GET", "/api/state")).json(); assert.deepStrictEqual(g.pantry, base.pantry);
  });
  await t("serwer: zapis na starej wersji → 409 z aktualnym stanem", async () => {
    const r = await call("PUT", "/api/state", { pantry: [] }, { "x-base-version": "2000-01-01T00:00:00.000Z" });
    assert.strictEqual(r.status, 409); assert.deepStrictEqual((await r.json()).state.pantry, base.pantry);
  });
  await t("serwer: zapis na aktualnej wersji przechodzi, powstaje kopia zapasowa", async () => {
    const r = await call("PUT", "/api/state", { pantry: ["ryz"] }, { "x-base-version": ver }); assert.strictEqual(r.status, 200);
    const b = await (await call("GET", "/api/state/backups")).json(); assert.strictEqual(b.backups.length, 1);
  });
  await t("serwer: przywrócenie kopii", async () => {
    const b = await (await call("GET", "/api/state/backups")).json();
    const r = await call("POST", "/api/state/restore", { at: b.backups[0] }); assert.strictEqual(r.status, 200);
    assert.deepStrictEqual((await (await call("GET", "/api/state")).json()).pantry, base.pantry);
  });
  await t("serwer: odrzuca dane bez spiżarni", async () => {
    assert.strictEqual((await call("PUT", "/api/state", { calib: {} })).status, 400);
  });
  await t("serwer: kod domowy, gdy ustawiony", async () => {
    env.HOME_CODE = "1234";
    assert.strictEqual((await call("GET", "/api/state")).status, 401);
    assert.strictEqual((await call("GET", "/api/state", null, { "x-home-code": "1234" })).status, 200);
    assert.strictEqual((await call("POST", "/api/label", { image: "x" })).status, 401);
    delete env.HOME_CODE;
  });
  console.log(`Synchronizacja: ${ok} testów zaliczonych${process.exitCode ? ", są błędy" : ""}`);
})();
