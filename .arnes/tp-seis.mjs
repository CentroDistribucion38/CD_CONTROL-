import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const C = [["VIAJES PLANEADOS","28","lo que el plan publicado prometió mover",""],
 ["VIAJES CUMPLIDOS","0","registrados con carga · nadie escribe esta cifra",""],
 ["ADICIONALES","0","se movieron por encima del plan o sin planear","ojo"],
 ["VIAJES VACÍOS","0","aparte: <b>no entran en el cálculo</b>","aparte"],
 ["% ADHERENCIA","0%","de lo planeado, cuánto salió · tope 100%","mal"],
 ["% CUMPLIMIENTO","0%","todo lo movido contra el plan · adicionales incluidos","mal"]];
const HTML = `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;background:var(--c-eef1f5,#EEF1F5)}
.marco{padding:18px}${css}</style><div class="marco"><div class="tp">
<section class="cifras seis">${C.map(([r,n,u,k])=>
`<div class="cifra ${k}"><div class="rot">${r}</div><div class="n">${n}</div><div class="u">${u}</div></div>`).join("")}
</section></div></div>`;
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malas = 0;
for (const [w,nom] of [[1440,"pc"],[820,"tab"],[390,"cel"],[360,"360"]]) {
  const pg = await nav.newPage({ viewport:{width:w,height:700}, deviceScaleFactor:2 });
  await pg.setContent(HTML,{waitUntil:"load"});
  const r = await pg.evaluate(() => {
    const d = document.documentElement, mal = [];
    for (const el of document.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.width>0 && b.right > d.clientWidth+0.5) mal.push(el.className||el.tagName);
    }
    return { ancho:d.clientWidth, scroll:d.scrollWidth, mal:mal.slice(0,4),
      cols:getComputedStyle(document.querySelector(".cifras")).gridTemplateColumns };
  });
  const bad = r.scroll > r.ancho+0.5 || r.mal.length; if (bad) malas++;
  console.log(`${nom.padEnd(4)} ${w}px scroll=${r.scroll} ${bad?"MAL "+r.mal.join(","):"bien"}  cols=${r.cols}`);
  await pg.screenshot({ path:`.arnes/tps-${nom}.png`, fullPage:true });
  await pg.close();
}
await nav.close();
console.log(malas ? `${malas} con problemas` : "limpio");
