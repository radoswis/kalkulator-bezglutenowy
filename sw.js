/* Service worker: aplikacja działa bez internetu. Pliki z pamięci, w tle pobierana nowa wersja. API zawsze z sieci.
   Nazwa pamięci = wersja z version.js, więc każde wydanie (nowy numer) wymienia pliki na telefonie. */
importScripts("/version.js");
const CACHE = "bezglutenowo-" + self.APP_VERSION;
const TIMER_CACHE = "gf-timers"; // lista minutników do treści powiadomień – przetrwa aktualizację
const FILES = ["/", "/index.html", "/version.js", "/engine.js", "/pastry.js", "/nutrition.js", "/sync.js", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable.png", "/gorenje/gd.png", "/gorenje/pizza.png", "/gorenje/gp.png", "/gorenje/dw.png", "/gorenje/grill.png"];
// cache:"reload" – przy instalacji nowej wersji pliki zawsze prosto z serwera, nie z pamięci przeglądarki
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))); });
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== TIMER_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// ===== Minutniki przy zamkniętej aplikacji =====
// Aplikacja przysyła listę minutników {id, end, label}. Serwer o czasie końca wysyła pusty push (bez treści),
// a tutaj dobieramy opis z listy i pokazujemy powiadomienie – działa też, gdy aplikacja jest zamknięta.
async function readTimers() { const r = await (await caches.open(TIMER_CACHE)).match("/__timers"); return r ? r.json() : []; }
async function writeTimers(l) { await (await caches.open(TIMER_CACHE)).put("/__timers", new Response(JSON.stringify(l), { headers: { "content-type": "application/json" } })); }
self.addEventListener("message", e => {
  if (!e.data || !Array.isArray(e.data.timers)) return;
  e.waitUntil(readTimers().then(old => writeTimers(e.data.timers.map(t => ({ ...t, shown: old.some(o => o.id === t.id && o.end === t.end && o.shown) })))));
});
self.addEventListener("push", e => e.waitUntil((async () => {
  const now = Date.now(), list = await readTimers().catch(() => []);
  const due = list.filter(t => !t.shown && t.end <= now + 5000);
  const show = due.length ? due : [{ id: "x", label: "Sprawdź minutnik w aplikacji." }];
  for (const t of show)
    await self.registration.showNotification("Czas minął", { body: t.label, tag: "timer-" + t.id, renotify: true, requireInteraction: true,
      vibrate: [400, 200, 400, 200, 400], icon: "/icon-192.png", badge: "/icon-192.png", data: { id: t.id } });
  due.forEach(t => { t.shown = true; });
  await writeTimers(list);
})()));
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow("/")));
});
