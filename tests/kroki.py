"""Audyt kroków trybu gotowania: każdy przepis × urządzenie × MUM5.
Uruchom z katalogu repo: python3 tests/kroki.py   (wymaga: pip install playwright + Chrome/Chromium)
Kod wyjścia 1 = naruszenie reguł kolejności."""
import json,re,os,sys,subprocess,time,collections
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));PORT=8799
srv=subprocess.Popen([sys.executable,"-m","http.server",str(PORT)],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
CH=next((p for p in ["/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"] if os.path.exists(p)),None)
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=CH) if CH else p.chromium.launch();pg=b.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
  pg.goto(f"http://localhost:{PORT}/");pg.wait_for_timeout(800)
  V=pg.evaluate('''async()=>{const res=[];for(const d of DEV_ORDER)for(const m of [false,true]){setDev(d);useMum=m;for(const b of BAKES){const s=document.getElementById("bake");s.value=b.id;s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,0));
   res.push({d,m,id:b.id,fit:["uni","stove","gorenje"].includes(d)?"yes":devFit(b,d).ok,view:cookView(cur)})}}setDev("uni");useMum=false;return res}''')
  b.close()
finally: srv.terminate()
MIX=re.compile(r"wyrabiaj|zagnieć|zagniataj|ubij|utrzyj|zmiksuj|wymieszaj|^MUM5:",re.I)
BAKE=re.compile(r"^(?!Uwaga)(?!.*(nagrzej|rozgrzej|włącz|przygotuj)).*(\bpiecz(?!eni)|\bsmaż|^na koniec|wstaw do piekarnika|gotuj partiami|odsmaż)",re.I)
AFTER=re.compile(r"lukier|polew|krem|nadzieni|farsz|glazur|sos|syrop|posyp|lukrem|po upieczeniu|kajmak|bit[ąa] śmietan|do podania|podawaj",re.I)
DEVN={"air":"Air fryer","opti":"OptiGrill","fry":"Frytkownica","gorenje":"Gorenje"}
F=collections.defaultdict(list)
for v in V:
  s=v["view"];d=v["d"];key=(v["id"],d,v["m"])
  bi=[i for i,x in enumerate(s) if BAKE.search(x) and not x.startswith(tuple(DEVN.values()))]
  if bi and any(i>bi[0] and MIX.search(x) and not AFTER.search(x) for i,x in enumerate(s)):F["mieszanie po pieczeniu"].append(key)
  mi=[i for i,x in enumerate(s) if x.startswith("MUM5")]
  if mi and bi and max(mi)>bi[0]:F["MUM5 po pieczeniu"].append(key)
  if d in DEVN and v["fit"]!="no":
    ds=[i for i,x in enumerate(s) if x.startswith(DEVN[d]+" – przygotuj")]
    if not ds and d!="gorenje":F["brak kroku urządzenia"].append(key)
    if ds and bi and ds[0]>bi[0] and not s[bi[0]].startswith("Gotuj"):F["urządzenie po pierwszym pieczeniu"].append(key)
    if d!="gorenje" and any(re.search("piekarnik",x,re.I) and not x.startswith(DEVN[d]) for x in s):F["„piekarnik” w innym urządzeniu"].append(key)
  if d in DEVN and v["fit"]=="no" and not s[0].startswith("Uwaga"):F["brak ostrzeżenia"].append(key)
  if len(set(s))<len(s):F["duplikat kroku"].append(key)
  if any(re.search(r"NaN|undefined|\b0 g\b|ok\. 0 ",x) for x in s):F["pusta wartość"].append(key)
  if v["m"] and any(re.search(r"mikserem",x) for x in s):F["mikser przy MUM5"].append(key)
print(f"Kroki: {len(V)} kombinacji, błędy JS: {len(errs)}")
for k,L in F.items():print(f" - {k}: {len(L)} np. {L[:3]}")
sys.exit(1 if F or errs else 0)
