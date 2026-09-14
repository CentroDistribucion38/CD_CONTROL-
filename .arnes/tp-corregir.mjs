import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const TEMAS = ["oficial","tinta","pizarra","ambar","negro","gris","halo"];

const campo = (r, dentro) => `<div class="campo"><label>${r}</label>${dentro}</div>`;
const inp = (v) => `<input value="${v}">`;
const desple = (v, n) => `<div class="desple"><button class="disparo">
<span class="puesto">${v}${n?`<i>${n}</i>`:""}</span>
<svg class="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></div>`;

const FILA = (der) => `<div class="fila">
<div class="placa">BHG156</div>
<div><div class="ruta">Ag01 <span class="fl">→</span> Planta Barranquilla</div>
<div class="meta"><span>Casco vidrio</span><span>Turno A</span><span>11:32</span>
<span>Cristian P.</span><span>TR-0184</span>
<span class="eti corregido">CORREGIDO</span></div></div>
<div class="der">${der}</div></div>`;

const CUERPO = `<section class="caja">
<div class="cab"><div><h2>4 viajes hoy</h2>
<p>Lo último arriba. Los anulados siguen a la vista, con su motivo.</p></div></div>

${FILA(`<button class="btn chico">Cancelar</button><button class="btn chico">Anular</button>`)}

<div class="pie-accion corregir">
<p class="guia">Corriges el viaje <b>TR-0184</b>. Se guarda cómo quedó y también cómo estaba:
la corrección no borra lo que decía antes.</p>
<div class="rejilla-corregir">
${campo("Día", `<input type="date" value="2026-09-14">`)}
${campo("Turno", `<div class="seg turno"><button class="on">A</button><button>B</button><button>C</button></div>`)}
${campo("¿Qué es?", `<div class="seg"><button class="on">Con carga</button><button>Vacío</button></div>`)}
${campo("¿Cuántos viajes?", `<input type="number" value="1">`)}
${campo("Tipo de viaje", desple("Casco vidrio"))}
${campo("Placa", desple("BHG156","Turbo propio"))}
${campo("Sale de", desple("Ag01","Bodega propia"))}
${campo("Llega a", desple("Planta Barranquilla","Planta"))}
${campo("Cantidad (opcional)", inp(""))}
${campo("Unidad", inp("canastas"))}
<div class="campo ancho"><label>Observación</label>${inp("")}</div>
<div class="campo ancho"><label>¿Por qué se corrige? (opcional)</label>${inp("")}</div>
</div>
<div class="fila-btn"><button class="btn si">Guardar la corrección</button>
<button class="btn">Dejar así</button></div>
</div>

${FILA(`<button class="btn chico">Corregir</button><button class="btn chico">Anular</button>`)}
</section>`;

const marco = (t) => `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box} body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{min-height:100vh;padding:18px}
${css}</style><div class="sh"${t==="oficial"?"":` data-tema="${t}"`}><div class="marco"><div class="tp">${CUERPO}</div></div></div>`;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malas = 0;
for (const [w, nom] of [[1440,"pc"],[820,"tab"],[390,"cel"],[360,"360"]]) {
  const p = await nav.newPage({ viewport:{width:w,height:1200}, deviceScaleFactor:2 });
  await p.setContent(marco("gris"), { waitUntil:"load" });
  const r = await p.evaluate(() => {
    const a = document.documentElement.clientWidth;
    const fuera = [], chicos = [];
    for (const el of document.querySelectorAll(".tp *")) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.right > a + .5 || b.left < -.5)) fuera.push(el.className||el.tagName);
      if ((el.tagName === "INPUT" || el.tagName === "BUTTON") && b.height > 0 && b.height < 30)
        chicos.push((el.className||el.tagName) + " h=" + Math.round(b.height));
    }
    return { scroll: document.documentElement.scrollWidth, ancho: a,
             cols: getComputedStyle(document.querySelector(".rejilla-corregir")).gridTemplateColumns,
             fuera: [...new Set(fuera)].slice(0,5), chicos: [...new Set(chicos)].slice(0,5) };
  });
  const mal = r.scroll > r.ancho + .5 || r.fuera.length || r.chicos.length;
  if (mal) malas++;
  console.log(`${nom.padEnd(4)} ${String(w).padStart(5)}px  ${mal?"MAL":"bien"}   columnas: ${r.cols}`);
  if (r.fuera.length)  console.log("      DESBORDA:", r.fuera.join(" | "));
  if (r.chicos.length) console.log("      CHICOS:", r.chicos.join(" | "));
  await p.screenshot({ path:`.arnes/tpcor-${nom}.png`, fullPage:true });
  await p.close();
}

/* LA ETIQUETA "CORREGIDO" TIENE QUE LEERSE EN LOS SIETE TEMAS. Es
   ámbar sobre ámbar clarito, y el ámbar cambia de tema en tema. */
const lum = (c) => { const [r,g,b] = c.map(v => { v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4) });
  return .2126*r + .7152*g + .0722*b };
const leer = (s) => { const m = s.match(/[\d.]+/g).slice(0,3).map(Number);
  return s.startsWith("color(") ? m.map(v => v*255) : m };
const p2 = await nav.newPage({ viewport:{width:1200,height:900} });
for (const t of TEMAS) {
  await p2.setContent(marco(t), { waitUntil:"load" });
  const c = await p2.evaluate(() => {
    const e = document.querySelector(".eti.corregido"); const s = getComputedStyle(e);
    return [s.color, s.backgroundColor];
  });
  const [a, b] = c.map(leer);
  const L1 = lum(a), L2 = lum(b);
  const ratio = (Math.max(L1,L2)+.05) / (Math.min(L1,L2)+.05);
  const ok = ratio >= 4.5;
  if (!ok) malas++;
  console.log(`CORREGIDO en ${t.padEnd(8)} contraste ${ratio.toFixed(2)}  ${ok?"bien":"MAL"}`);
}
await p2.close();
await nav.close();
console.log(malas ? `\n${malas} problema(s)` : "\ntodo limpio");
