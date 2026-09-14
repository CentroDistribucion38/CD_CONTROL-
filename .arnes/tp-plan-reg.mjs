import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const marco = (cuerpo) => `<!doctype html><meta charset="utf-8"><style>
${glob}
*{box-sizing:border-box} body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{min-height:100vh;padding:18px}
${css}
</style><div${process.env.TEMA?` data-tema="${process.env.TEMA}"`:""}><div class="marco"><div class="tp">${cuerpo}</div></div></div>`;

/* El plan del turno A: nombre, planeado, cumplido. Incluye un completo
   y uno pasado del plan, que son los dos casos raros. */
const PLAN = [["Casco vidrio",7,4],["Envase",4,4],["Estibas",2,0],
  ["PET",3,1],["Lavado",1,0],["PT Expo",5,6]];

const chip = ([n,p,c],on) => {
  const f = Math.max(0,p-c), s = Math.max(0,c-p);
  return `<button class="chip-plan${on?" on":""}${f===0?" lleno":""}">
<b>${n}</b><span class="falta">${f>0?`Faltan ${f}`:s>0?`+${s} sobre el plan`:"Completo"}</span>
<span class="prog">${c} / ${p}</span></button>`;
};

const HTML = marco(`
<div class="consola"><section class="tarj-reg">
<div class="cab"><h2>Viaje nuevo</h2><p>Todo cabe en una pantalla. Lo que más se repite ya está de un toque.</p></div>
<div class="cuerpo-f">

<div class="linea-campos">
<div><span class="rot-campo">¿Qué se registra?</span>
<div class="seg"><button class="on">Viaje con carga</button><button>Viaje vacío</button></div></div>
<div><span class="rot-campo">Turno</span>
<div class="seg turno"><button class="on">A</button><button>B</button><button>C</button></div></div>
</div>

<div><span class="rot-campo">Placa</span>
<div class="placa"><div class="desple grande"><button class="disparo" aria-expanded="true">
<span class="puesto">ABC123<i>Tractomula de Summar</i></span>
<svg class="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
<div class="opciones"><div class="filtro"><input placeholder="Buscar…"></div><div class="rollo">
<button class="elegida"><svg class="tic" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg><span>ABC123<i>Tractomula de Summar</i></span></button>
<button class="marcada"><svg class="tic" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg><span>BHG156<i>Turbo propio</i></span></button>
<button><svg class="tic" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg><span>UYT569</span></button>
<button class="mas"><span>＋ Otra placa…</span></button>
</div></div></div></div>
<div class="recientes"><button>ABC123</button><button>XYZ789</button><button>TUV456</button></div></div>

<div><span class="rot-campo">Del plan del turno A</span>
<div class="chips-plan">
${PLAN.map((p,i)=>chip(p,i===0)).join("")}
<button class="chip-mas"><b>+</b><span class="falta">Otro tipo</span><span class="prog">no planeado</span></button>
</div>
<p class="guia adicional">Del plan caben <b>3</b>; los otros <b>2</b> salen como <b>adicionales</b>.</p>
</div>

<div><span class="rot-campo">Ruta</span>
<div class="ruta"><div class="desple"><button class="disparo"><span class="sin">De dónde sale…</span>
<svg class="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></div>
<button class="voltear"><svg viewBox="0 0 24 24"><path d="M7 10h13M7 10l3-3M7 10l3 3"/><path d="M17 14H4M17 14l-3-3M17 14l-3 3"/></svg></button>
<div class="desple"><button class="disparo"><span class="sin">A dónde va…</span>
<svg class="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></div></div>
<div class="rutas-frec"><button>Ag01 → Planta Barranquilla</button><button>Planta Barranquilla → Ag01</button></div></div>

<div class="linea-campos">
<div><span class="rot-campo">Cuántos viajes</span>
<div class="conteo"><span class="cel-step grande"><button>−</button><input value="5"><button>+</button></span>
<span class="nota-conteo">El plan se mide en viajes, no en canastas.</span></div></div>
<div><span class="rot-campo">Carga (opcional)</span><input class="campo-suelto" placeholder="Canastas, estibas…"></div>
</div>

<details class="extra"><summary>Agregar novedad</summary></details>
</div>
<div class="pie-reg"><button class="btn si">Registrar (2 adicionales)</button>
<span class="atajo">o pulsa <kbd>Ctrl</kbd> + <kbd>Enter</kbd></span></div>
</section>

<aside>
<div class="plan-turno"><div class="corte"></div><div class="rot">PLAN DEL TURNO A</div>
<div class="marca"><b>15</b><span>de 22 viajes</span></div>
<div class="huecos">${Array.from({length:22},(_,i)=>`<i class="${i<15?"lleno":""}"></i>`).join("")}</div>
<div class="pie-plan">Cada cuadro es un viaje del plan. Se prende al registrarlo.</div></div>
<div class="hoy"><div class="cab"><h3>Viajes de hoy</h3><span class="cuantos">15 registrados</span></div>
<div class="viaje"><span class="hora">07:12</span><span><span class="pl">ABC123</span>
<span class="det">Casco vidrio · Ag01 → Planta Barranquilla</span></span></div></div>
</aside></div>
`);

const ANCHOS = [[1440,"pc"],[820,"tab"],[390,"cel"],[360,"360"]];
const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malas = 0;
for (const [w, nom] of ANCHOS) {
  const pg = await navegador.newPage({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
  await pg.setContent(HTML, { waitUntil: "load" });
  const r = await pg.evaluate(() => {
    const doc = document.documentElement;
    const recortado = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") return true;
      }
      return false;
    };
    const desborda = [];
    for (const el of document.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.right > doc.clientWidth + 0.5 || b.left < -0.5) && !recortado(el)) {
        desborda.push((el.className || el.tagName) + " r=" + Math.round(b.right));
      }
    }
    const toque = [];
    for (const el of document.querySelectorAll("button, input")) {
      const b = el.getBoundingClientRect();
      if (b.height > 0 && b.height < 30) toque.push((el.className||el.tagName) + " h=" + Math.round(b.height));
    }
    const riel = document.querySelector(".chips-plan");
    const btn = document.querySelector(".pie-reg .btn");
    return {
      ancho: doc.clientWidth, scroll: doc.scrollWidth, alto: document.body.scrollHeight,
      desborda: desborda.slice(0, 6), toque: toque.slice(0, 6),
      /* El riel de chips SÍ se desplaza a lo ancho, dentro de él mismo. */
      rielVisible: Math.round(riel.clientWidth), rielTotal: Math.round(riel.scrollWidth),
      /* Lo que de verdad importa en el celular: ¿el botón de registrar
         queda a menos de dos pantallas? */
      botonY: Math.round(btn.getBoundingClientRect().top),
    };
  });
  const mal = r.scroll > r.ancho + 0.5 || r.desborda.length || r.toque.length;
  if (mal) malas++;
  console.log(`${nom.padEnd(4)} ${String(w).padStart(5)}px  scroll=${r.scroll}  alto=${r.alto}  botón a ${r.botonY}px  ${mal ? "MAL" : "bien"}`);
  console.log(`      riel de chips: se ven ${r.rielVisible} de ${r.rielTotal}px`);
  if (r.desborda.length) console.log("      DESBORDA:", r.desborda.join(" | "));
  if (r.toque.length)    console.log("      CHICOS:", r.toque.join(" | "));
  await pg.screenshot({ path: `.arnes/tpr-${nom}.png`, fullPage: true });
  await pg.close();
}
await navegador.close();
console.log(malas ? `\n${malas} ancho(s) con problemas` : "\nlos cuatro anchos, limpios");
