/* La barra de días, ahora en las TRES pantallas. Se mide que quepa en
   el celular con el aviso de borrador puesto, que es el caso más largo. */
import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const TEMA = process.env.TEMA || "gris";
const cal = `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
const barra = (borrador) => `<div class="fecha-nav">
<button><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
<div class="cal-caja"><button class="cal-disparo">${cal}15 de septiembre</button></div>
<button><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
<button class="hoy">HOY</button>
${borrador?`<span class="estado-plan"><i></i> Borrador · sin publicar</span>`:""}
</div>`;
const HTML = `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{padding:16px}${css}</style>
<div class="sh" data-tema="${TEMA}"><div class="marco"><div class="tp">
${barra(true)}${barra(false)}
</div></div></div>`;
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malas = 0;
for (const [w,nom] of [[1440,"pc"],[820,"tab"],[390,"cel"],[360,"360"]]) {
  const p = await nav.newPage({ viewport:{width:w,height:300}, deviceScaleFactor:2 });
  await p.setContent(HTML,{waitUntil:"load"});
  const r = await p.evaluate(() => {
    const a = document.documentElement.clientWidth, fuera = [], chicos = [];
    for (const el of document.querySelectorAll(".tp *")) {
      const b = el.getBoundingClientRect();
      if (b.width>0 && (b.right>a+.5||b.left<-.5)) fuera.push(el.className||el.tagName);
      if (el.tagName==="BUTTON" && b.height>0 && b.height<34)
        chicos.push((el.className||"btn")+" h="+Math.round(b.height));
    }
    return { scroll: document.documentElement.scrollWidth, ancho: a,
             fuera:[...new Set(fuera)].slice(0,4), chicos:[...new Set(chicos)].slice(0,4) };
  });
  const mal = r.scroll > r.ancho+.5 || r.fuera.length || r.chicos.length;
  if (mal) malas++;
  console.log(`${nom.padEnd(4)} ${String(w).padStart(5)}px  ${mal?"MAL":"bien"}`);
  if (r.fuera.length)  console.log("      DESBORDA:", r.fuera.join(" | "));
  if (r.chicos.length) console.log("      CHICOS:", r.chicos.join(" | "));
  await p.screenshot({ path:`.arnes/tpfe-${nom}.png`, fullPage:true });
  await p.close();
}
await nav.close();
console.log(malas ? `\n${malas} ancho(s) con problemas` : "\nlos cuatro anchos, limpios");
