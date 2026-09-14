import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const barra = (hoy, borrador) => `<div class="fecha-nav">
<button aria-label="día anterior"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
<div class="cal-caja"><button class="cal-disparo"><svg viewBox="0 0 24 24">
<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>mar 15 de septiembre</button></div>
<button aria-label="día siguiente"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
<button class="hoy${hoy?" on":""}"${hoy?" disabled":""}>HOY</button>
${borrador?'<span class="estado-plan"><i></i> Borrador · sin publicar</span>':""}
</div>`;
const HTML = (tema) => `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;padding:20px;background:var(--c-eef1f5,#EEF1F5)}${css}</style>
<div ${tema?`data-tema="${tema}"`:""}><div class="tp">
${barra(false,true)}<div style="height:14px"></div>${barra(true,false)}
</div></div>`;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malas = 0;
for (const [w,nom,tema] of [[1440,"pc",""],[820,"tab",""],[390,"cel",""],[360,"360",""],[1440,"negro","negro"]]) {
  const pg = await nav.newPage({ viewport:{width:w,height:300}, deviceScaleFactor:2 });
  await pg.setContent(HTML(tema),{waitUntil:"load"});
  const r = await pg.evaluate(() => {
    const d = document.documentElement, mal = [];
    for (const el of document.querySelectorAll(".fecha-nav, .fecha-nav *")) {
      const b = el.getBoundingClientRect();
      if (b.width>0 && (b.right > d.clientWidth+0.5 || b.left < -0.5)) mal.push(el.className||el.tagName);
    }
    /* Todo lo tocable de la barra, a la misma altura y >= 30 px. */
    const alto = [...document.querySelectorAll(".fecha-nav > button, .fecha-nav .cal-disparo")]
      .map(e => Math.round(e.getBoundingClientRect().height));
    const dis = document.querySelector(".cal-disparo").getBoundingClientRect();
    return { ancho:d.clientWidth, scroll:d.scrollWidth, mal:mal.slice(0,3), alto,
             fecha:`${Math.round(dis.width)}x${Math.round(dis.height)}` };
  });
  const parejo = new Set(r.alto).size === 1;
  const bad = r.scroll > r.ancho+0.5 || r.mal.length || !parejo || Math.min(...r.alto) < 30;
  if (bad) malas++;
  console.log(`${nom.padEnd(6)} ${String(w).padStart(5)}px scroll=${r.scroll} altos=[${r.alto}] fecha=${r.fecha} ${bad?"MAL":"bien"}`);
  if (r.mal.length) console.log("       SE SALE:", r.mal.join(" | "));
  await pg.screenshot({ path:`.arnes/tpbar-${nom}.png`, fullPage:true });
  await pg.close();
}
await nav.close();
console.log(malas ? `\n${malas} con problemas` : "\ntodo parejo y dentro");
