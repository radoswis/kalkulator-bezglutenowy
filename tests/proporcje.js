// Audyt proporcji: node tests/proporcje.js  (kod wyjścia 1 = błąd)
const path=require("path"),R=path.join(__dirname,"..");global.self=global;
["engine","pastry","nutrition"].forEach(f=>require(path.join(R,f+".js")));const G=GFEngine;
const all=G.INGREDIENT_MATRIX.map(i=>i.id);
const P={pelna:all,schar:["mixb","mixit","mixc","scharmehl","psy"],mini:["ryz","tap","psy"],sam_mixc:["mixc"]};
const err=[],warn=[];
for(const b of G.ALL_BAKES){const D=b.unitWeight*b.defaultCount;
 for(const [pn,ids] of Object.entries(P))for(const f of [1,0.25,3,b.unitWeight/D]){const d=Math.round(D*f),tag=`${b.id} ${pn} ${d}g`;let r;
  try{r=G.calculateRecipe({bakeId:b.id,pantryIds:ids,doughWeight:d})}catch(e){err.push(`${tag}: wyjątek ${e.message}`);continue}
  if(r.empty)continue;const L=r.lines||[];
  if(L.some(l=>!isFinite(l.grams)||l.grams<0))err.push(`${tag}: NaN/ujemne`);
  if(Math.abs(r.total-d)>Math.max(2,d*0.01))err.push(`${tag}: bilans ${r.total}`);
  const fl=L.find(l=>l.key==="flour"),subs=L.filter(l=>l.sub);if(fl&&subs.length){const s=subs.reduce((a,l)=>a+l.grams,0);if(Math.abs(s-fl.grams)>subs.length)err.push(`${tag}: suma mąk ${s}≠${fl.grams}`)}
  const st=(r.steps||[]).join(" ");if(/NaN|undefined|\b0 g\b/.test(st))err.push(`${tag}: pusta wartość w krokach`);
  if(b.family!=="pastry"){const pc=k=>(L.find(x=>x.key===k)||{}).pct;const s=pc("salt"),y=pc("yeast");
   if(s!=null&&(s<1.2||s>2.6))warn.push(`${tag}: sól ${s}%`);if(y!=null&&(y<0.5||y>7.5))warn.push(`${tag}: drożdże ${y}%`)}
  if(b.preferFlour&&pn==="pelna"&&f===1)for(const id of Object.keys(b.preferFlour))if(!subs.some(l=>l.key===id))err.push(`${tag}: brak mąki z nazwy (${id})`);
 }}
console.log(`Proporcje: ${G.ALL_BAKES.length} przepisów, błędy ${err.length}, uwagi ${warn.length}`);[...err,...warn.slice(0,10)].forEach(x=>console.log(" -",x));
process.exit(err.length?1:0);
