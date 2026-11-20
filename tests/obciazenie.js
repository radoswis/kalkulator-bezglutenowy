// Test obciążeniowy (audyt 20.11.2026): każdy przepis × 10 spiżarni × 3 ilości × 6 ustawień. Uruchom: node tests/obciazenie.js
const path=require("path").join(__dirname,"..");global.self=global;require(path+"/engine.js");require(path+"/pastry.js");require(path+"/nutrition.js");
const G=global.GFEngine, M=G.INGREDIENT_MATRIX;
const ids=M.map(i=>i.id);
const pick=f=>M.filter(f).map(i=>i.id);
const P={
 full:ids, mixbOnly:["mixb","psy"], ryzOnly:["ryz","psy"], starchOnly:["szi","tap","psy"], noBinder:["ryz","szi","sor"],
 noPsyXan:["ryz","szi","sor","xan"], gryOnly:["gry"], mixcOnly:["mixc","psy"], wheatStarch:pick(i=>i.wheatStarch).concat(["psy"]),
 sweetBad:["cie","kok","gry","psy"],
};
const issues={};const add=(k,m)=>{(issues[k]=issues[k]||[]).push(m)};
let n=0;
for(const b of G.ALL_BAKES){
 const d=b.unitWeight*b.defaultCount;
 for(const [pn,pantry] of Object.entries(P)) for(const w of [d, 150, 3000]) for(const opt of [{},{psyForm:"powder"},{coldProof:true},{calib:{water:15,psy:30,salt:-30,temp:-20,time:30}},{calib:{water:-15}},{taste:"bold"}]){
  n++;
  let r; try{ r=G.calculateRecipe({bakeId:b.id,pantryIds:pantry,doughWeight:w,...opt}); }catch(e){ add("THROW",`${b.id} ${pn} ${w} ${JSON.stringify(opt)}: ${e.message}`); continue;}
  if(r.empty) { if(pn==="full") add("EMPTY_FULL",b.id); continue; }
  const tag=`${b.id} [${pn}, ${w} g, ${JSON.stringify(opt)}]`;
  for(const l of r.lines){ if(!isFinite(l.grams)||l.grams<0) add("BAD_GRAMS",`${tag} ${l.key}=${l.grams}`); }
  if(Math.abs(r.total-w)>2) add("BALANCE",`${tag} total ${r.total}`);
  const water=r.lines.find(l=>l.key==="water"); if(water&&water.grams===0) add("WATER_ZERO",tag);
  const sumSh=r.blend.reduce((s,x)=>s+x.share,0); if(Math.abs(sumSh-1)>0.011) add("SHARE_SUM",`${tag} ${sumSh}`);
  const steps=(r.steps||[]).join(" ")+(r.bake.bakeNote||""); if(/undefined|NaN|null|\[object/.test(steps)) add("STEP_TEXT",`${tag}: ${steps.match(/.{0,40}(undefined|NaN|null|\[object).{0,20}/)[0]}`);
  if(r.bake.sweet && r.blend.some(x=>["cie","kok","gry"].includes(x.ingredient.id)) && pn==="sweetBad") add("SWEET_FLAVOR",tag);
  if(r.blend.some(x=>x.ingredient.wheatStarch) && !r.warnings.some(w=>/pszenn/.test(w))) add("WHEATSTARCH_NOWARN",tag);
  if(w===d && Object.keys(opt).length===0 && G.nutritionOf){ try{const nu=G.nutritionOf(r, b.defaultCount); const s=JSON.stringify(nu); if(/NaN|null/.test(s)) add("NUTR_NAN",`${b.id} ${pn}`); }catch(e){add("NUTR_THROW",`${b.id} ${pn}: ${e.message}`)} }
 }
}
console.log("runs",n);for(const [k,v] of Object.entries(issues)){console.log(`\n== ${k}: ${v.length}`);[...new Set(v)].slice(0,8).forEach(x=>console.log("  ",x));}
process.exitCode=Object.keys(issues).length?1:0;
