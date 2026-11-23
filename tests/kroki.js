// Audyt kroków trybu gotowania: każdy przepis × urządzenie × MUM5 (te same reguły co tests/kroki.py).
// Uruchom z katalogu repo: node tests/kroki.js   (wymaga Playwrighta dla Node: npm i -g playwright albo lokalnie)
// Kod wyjścia 1 = naruszenie reguł kolejności lub błąd JS na stronie.
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css" };

// Prosty serwer plików (bez Pythona); /api/* = 404, jak bez Workera
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, path.normalize(p));
  if (p.startsWith("/api/") || !f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("{}"); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

const CHROME = ["/opt/pw-browsers/chromium", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
async function launch() {
  try { return await chromium.launch(); } catch (e) {
    const exe = CHROME.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!exe) throw e;
    return chromium.launch({ executablePath: exe });
  }
}

const MIX = /wyrabiaj|zagnieć|zagniataj|ubij|utrzyj|zmiksuj|wymieszaj|^MUM5:/i;
const BAKE = /^(?!Uwaga)(?!.*(nagrzej|rozgrzej|włącz|przygotuj)).*(\bpiecz(?!eni)|\bsmaż|^na koniec|wstaw do piekarnika|gotuj partiami|odsmaż)/i;
const AFTER = /lukier|polew|krem|nadzieni|farsz|glazur|sos|syrop|posyp|lukrem|po upieczeniu|kajmak|bit[ąa] śmietan|do podania|podawaj/i;
const DEVN = { air: "Air fryer", opti: "OptiGrill", fry: "Frytkownica", gorenje: "Gorenje" };

(async () => {
  let code = 1;
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  try {
    const b = await launch();
    const pg = await b.newPage();
    const errs = [];
    pg.on("pageerror", e => errs.push(e.message));
    await pg.goto(`http://localhost:${port}/`);
    await pg.waitForTimeout(800);
    const V = await pg.evaluate(async () => {
      const res = [];
      for (const d of DEV_ORDER) for (const m of [false, true]) {
        setDev(d); useMum = m;
        for (const b of BAKES) {
          const s = document.getElementById("bake"); s.value = b.id; s.dispatchEvent(new Event("change"));
          await new Promise(r => setTimeout(r, 0));
          res.push({ d, m, id: b.id, fit: ["uni", "stove", "gorenje"].includes(d) ? "yes" : devFit(b, d).ok, view: cookView(cur) });
        }
      }
      setDev("uni"); useMum = false;
      return res;
    });
    await b.close();

    const F = {};
    const add = (k, v) => (F[k] = F[k] || []).push(v);
    const idx = (s, fn) => s.map((x, i) => (fn(x) ? i : -1)).filter(i => i >= 0);
    for (const v of V) {
      const s = v.view, d = v.d, key = `${v.id}/${d}${v.m ? "/MUM5" : ""}`;
      const bi = idx(s, x => BAKE.test(x) && !Object.values(DEVN).some(n => x.startsWith(n)));
      if (bi.length && s.some((x, i) => i > bi[0] && MIX.test(x) && !AFTER.test(x))) add("mieszanie po pieczeniu", key);
      const mi = idx(s, x => x.startsWith("MUM5"));
      if (mi.length && bi.length && Math.max(...mi) > bi[0]) add("MUM5 po pieczeniu", key);
      if (DEVN[d] && v.fit !== "no") {
        const ds = idx(s, x => x.startsWith(DEVN[d] + " – przygotuj"));
        if (!ds.length && d !== "gorenje") add("brak kroku urządzenia", key);
        if (ds.length && bi.length && ds[0] > bi[0] && !s[bi[0]].startsWith("Gotuj")) add("urządzenie po pierwszym pieczeniu", key);
        if (d !== "gorenje" && s.some(x => /piekarnik/i.test(x) && !x.startsWith(DEVN[d]))) add("„piekarnik” w innym urządzeniu", key);
      }
      if (DEVN[d] && v.fit === "no" && !s[0].startsWith("Uwaga")) add("brak ostrzeżenia", key);
      if (new Set(s).size < s.length) add("duplikat kroku", key);
      if (s.some(x => /NaN|undefined|\b0 g\b|ok\. 0 /.test(x))) add("pusta wartość", key);
      if (v.m && s.some(x => /mikserem/.test(x))) add("mikser przy MUM5", key);
    }
    console.log(`Kroki: ${V.length} kombinacji, błędy JS: ${errs.length}`);
    errs.slice(0, 5).forEach(e => console.log("   JS:", e));
    for (const [k, L] of Object.entries(F)) console.log(` - ${k}: ${L.length} np. ${L.slice(0, 3).join(", ")}`);
    code = Object.keys(F).length || errs.length ? 1 : 0;
  } catch (e) {
    console.error("Błąd testu:", e.message);
  } finally {
    srv.close();
    process.exit(code);
  }
})();
