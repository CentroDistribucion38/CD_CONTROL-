import { chromium } from "playwright";
import fs from "node:fs";

const css = fs.readFileSync("src/app/(app)/acciones/acciones.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8")
  .split("\n").filter(l => /^\s*--c-|^:root|^}/.test(l)).join("\n");

const fila = (cod,tit,cls="") => `
<div class="fila ${cls}"><div class="cod">${cod}</div>
<div><div class="tit">${tit}</div>
<div class="meta"><span class="eti alta">ALTA</span><span>Almacenamiento</span><span>·</span><b>Pasillo 3 · Picking</b><span>·</span><span class="eti alta">3ª VEZ AQUÍ</span></div></div>
<div class="der"><span class="plazo mal">vencida hace 9 días</span>
<div class="par"><button class="btn bien">Fue efectiva</button><button class="btn mal">No fue efectiva</button></div></div></div>`;

const html = `<!doctype html><meta charset="utf-8"><style>
${glob}
*{box-sizing:border-box} body{margin:0;background:#F4F6F9;font:14px system-ui}
.marco{min-height:100vh;display:flex;flex-direction:column;padding:16px}
${css}
</style><div class="marco"><div class="ac">
<section class="cabeza"><div><p class="ojo">ACCIONES CORRECTIVAS · CD38 AG01</p>
<h1>Por verificar</h1><p class="sub">Acciones cerradas esperando que alguien vaya a mirar si de verdad sirvió.</p></div></section>
<section class="cifras">
<div class="cifra mal"><div class="rot">VENCIDAS</div><div class="n">6</div><div class="u">se pasaron del plazo</div></div>
<div class="cifra mal"><div class="rot">CRÍTICAS ABIERTAS</div><div class="n">4</div><div class="u">prioridad alta sin cerrar</div></div>
<div class="cifra ojo"><div class="rot">SIN RESPONSABLE</div><div class="n">7</div><div class="u">nadie las está haciendo</div></div>
<div class="cifra ojo"><div class="rot">POR VERIFICAR</div><div class="n">3</div><div class="u">falta ir a mirar</div></div></section>
<div class="filtros"><select><option>Abiertas y reabiertas</option></select><select><option>Toda la bodega</option></select><input placeholder="Buscar código, título o zona"></div>
<section class="caja"><div class="cab"><div><h2>12 acciones</h2><p>Ordenadas por lo que vence primero.</p></div></div>
<div class="rueda">${[1,2,3,4,5,6,7,8,9,10].map(i=>fila("AC-01"+(40+i),"Estibas mal apiladas en el pasillo de picking 3", i%3?"":"vencida")).join("")}</div></section>
</div></div>`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [w,h,n] of [[1440,900,"acc-pc"],[820,1180,"acc-tab"],[390,844,"acc-cel"],[360,640,"acc-360"]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.setContent(html);
  await p.waitForTimeout(150);
  const m = await p.evaluate(() => {
    const de = document.documentElement;
    const rects = [...document.querySelectorAll(".ac *")];
    const fuera = rects.filter(e => e.getBoundingClientRect().right > de.clientWidth + .6).length;
    const btns = [...document.querySelectorAll(".btn, .filtros select, .filtros input")];
    const chicos = btns.filter(e => e.getBoundingClientRect().height < 36)
                       .map(e => e.className + " " + Math.round(e.getBoundingClientRect().height));
    const caja = document.querySelector(".caja").getBoundingClientRect();
    return {
      scrollHorizontal: de.scrollWidth > de.clientWidth + 1,
      elementosFuera: fuera,
      botonesChicos: chicos,
      cajaAlto: Math.round(caja.height),
      ruedaCorta: document.querySelector(".rueda").scrollHeight > document.querySelector(".rueda").clientHeight + 1,
    };
  });
  console.log(n.padEnd(9), JSON.stringify(m));
  await p.screenshot({ path: `.arnes/${n}.png` });
  await p.close();
}
await b.close();

// diagnóstico: qué se sale
const b2 = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p2 = await b2.newPage({ viewport: { width: 390, height: 844 } });
await p2.setContent(html);
await p2.waitForTimeout(150);
console.log(await p2.evaluate(() => {
  const de = document.documentElement;
  const out = { deScroll: de.scrollHeight, deClient: de.clientHeight,
                bodyScroll: document.body.scrollHeight };
  const marco = document.querySelector(".marco").getBoundingClientRect();
  const ac = document.querySelector(".ac").getBoundingClientRect();
  out.marco = [Math.round(marco.top), Math.round(marco.bottom)];
  out.ac = [Math.round(ac.top), Math.round(ac.bottom)];
  out.hijos = [...document.querySelector(".ac").children].map(e =>
    e.className + ":" + Math.round(e.getBoundingClientRect().bottom));
  return out;
}));
await b2.close();
