/* Cuánto negro hay que mezclarle al acento de cada tema para que la
   barra se separe de su pista. Se calcula, no se tantea. */
import { chromium } from "playwright";
import fs from "node:fs";
const glob = fs.readFileSync("src/app/globals.css","utf8");
const TEMAS = ["oficial","tinta","pizarra","ambar","negro","gris","halo"];
const MEZCLAS = [100, 85, 78, 70, 62, 55];
const html = (t, m) => `<!doctype html><meta charset="utf-8"><style>${glob}
.p{background:var(--c-eef1f5,#EEF1F5)}
${MEZCLAS.map(x=>`.m${x}{color:color-mix(in srgb,var(--c-marca) ${x}%,#140c00)}`).join("")}
</style><div class="sh"${t==="oficial"?"":` data-tema="${t}"`}>
<div class="p" id="pista"></div>
<div id="papel" style="background:#fff"></div>
${MEZCLAS.map(x=>`<span class="m${x}" id="m${x}">x</span>`).join("")}</div>`;
const lum=c=>{const[r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});
  return .2126*r+.7152*g+.0722*b};
const leer=s=>{const m=s.match(/[\d.]+/g).slice(0,3).map(Number);
  return s.startsWith("color(")?m.map(v=>v*255):m};
const raz=(a,b)=>{const L1=lum(leer(a)),L2=lum(leer(b));
  return (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)};
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await nav.newPage();
console.log("mezcla".padEnd(8) + TEMAS.map(t=>t.slice(0,7).padStart(8)).join(""));
const res = {};
for (const m of MEZCLAS) res[m] = [];
for (const t of TEMAS) {
  await p.setContent(html(t, 0), { waitUntil:"load" });
  const c = await p.evaluate((ms) => {
    const g=(id,pr)=>getComputedStyle(document.getElementById(id))[pr];
    const o = { pista: g("pista","backgroundColor"), papel: g("papel","backgroundColor") };
    for (const m of ms) o["m"+m] = g("m"+m,"color");
    return o;
  }, MEZCLAS);
  for (const m of MEZCLAS) res[m].push([raz(c["m"+m], c.pista), raz(c["m"+m], c.papel)]);
}
for (const m of MEZCLAS) {
  const peorPista = Math.min(...res[m].map(x=>x[0]));
  const peorPapel = Math.min(...res[m].map(x=>x[1]));
  console.log(`${String(m).padEnd(8)}` + res[m].map(x=>x[0].toFixed(1).padStart(8)).join("") +
    `   peor pista ${peorPista.toFixed(1)} · peor papel ${peorPapel.toFixed(1)}` +
    (peorPista >= 3 && peorPapel >= 4.5 ? "  ← sirve" : ""));
}
await nav.close();
