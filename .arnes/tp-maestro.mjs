import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const marco = (cuerpo) => `<!doctype html><meta charset="utf-8"><style>
${glob}
*{box-sizing:border-box} body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{min-height:100vh;padding:18px}
${css}
</style><div class="marco"><div class="tp">${cuerpo}</div></div>`;

const asa = `<button class="asa"><svg viewBox="0 0 24 24"><path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/></svg></button>`;
const sw  = (on) => `<label class="sw"><input type="checkbox" ${on?"checked":""}><i></i></label>`;
const mas = `<div class="mas"><button>⋯</button></div>`;
const item = (n,s,v,on) => `<div class="item${on?"":" apagado"}">${asa}
<div class="nom"><b>${n}</b><span>${s}</span></div>
<span class="uso">${v} viajes</span>${sw(on)}${mas}</div>`;

const PUNTOS = [["Ag01","Bodega propia",142,1],["Planta Barranquilla","Planta",98,1],
  ["CD Galapa","Centro de distribución",61,1],["CD Turbaco","Centro de distribución",34,1],
  ["Patio de estibas","Zona interna",12,1],["CD Santa Marta","Centro de distribución",0,0]];
const TIPOS = [["Casco vidrio","usado este mes",142,1],["Envase","usado este mes",96,1],
  ["Estibas","usado este mes",44,1],["Plástico","usado este mes",21,1],
  ["PET","usado este mes",63,1],["Lavado","usado este mes",18,1],
  ["PT Expo","usado este mes",12,1],["Material","usado este mes",9,1],
  ["Averías/Isotanque","sin uso",0,0]];

const HTML = marco(`
<section class="cabeza"><div>
<p class="ojo">TRASPASOS · MAESTRO · CD38 AG01</p><h1>Maestro</h1>
<p class="sub">Los puntos y los tipos de viaje son datos de este centro, no código: el día que abran una bodega nueva nadie debería esperar un despliegue. Lo que alguien escribe a mano en el registro aparece aquí para agregarlo de un toque.</p></div>
<div class="panel-ojo"><div class="corte"></div>
<div class="rot">SITIOS DETECTADOS SIN AGREGAR</div><div class="num">3</div>
<div class="pie">escritos a mano <b>19 veces</b> esta semana</div></div></section>

<section class="maestro">
<div class="caja-m">
<div class="cab-m"><h2>Puntos <em>6</em></h2><p>De dónde sale y a dónde llega un viaje.</p></div>
<div class="sugerido"><div class="rot">ESCRITOS A MANO EN EL REGISTRO</div>
<p>Todavía no están en el maestro. Agrégalos y dejan de escribirse distinto cada vez.</p>
<div class="sug-chips">
<div class="sug"><b>Bodega de averías</b><span>· 9 veces</span><button>Agregar</button></div>
<div class="sug"><b>Muelle 2</b><span>· 7 veces</span><button>Agregar</button></div>
<div class="sug"><b>Patio norte</b><span>· 3 veces</span><button>Agregar</button></div>
<div class="sug"><b>BodegaDeAveriasDelPatioNorteMuyLarga</b><span>· 2 veces</span><button>Agregar</button></div>
</div></div>
<form class="agregar-m"><input placeholder="Nombre del punto — Ag01, Planta, Patio…"><button>Agregar</button></form>
${PUNTOS.map(p=>item(...p)).join("")}
</div>

<div class="caja-m">
<div class="cab-m"><h2>Tipos de viaje <em>9</em></h2><p>Qué se mueve. Un tipo apagado no se borra: las planeaciones viejas lo siguen nombrando, solo deja de poderse escoger.</p></div>
<form class="agregar-m"><input placeholder="Nombre del tipo"><button>Agregar</button></form>
${TIPOS.map(t=>item(...t)).join("")}
</div>
</section>

<section class="duplicados"><h3>Posibles duplicados</h3>
<p>Mismo sitio escrito de dos formas. Si se dejan así, el informe por punto parte el mismo lugar en dos y ninguno cuadra. Unir no borra nada: los viajes que decían la forma de la izquierda pasan a contar en la de la derecha.</p>
<div class="par-dup"><span class="tx">AG-01</span><span class="cuantos">4 viajes</span>
<span class="fl">→</span><span class="tx gana">Ag01</span><span class="cuantos">142 viajes</span>
<button class="unir">Unir en Ag01</button></div>
<div class="par-dup"><span class="tx">Planta Bquilla</span><span class="cuantos">6 viajes</span>
<span class="fl">→</span><span class="tx gana">Planta Barranquilla</span><span class="cuantos">98 viajes</span>
<button class="unir">Unir en Planta Barranquilla</button></div>
</section>
`);

const ANCHOS = [[1440,"pc"],[820,"tab"],[390,"cel"],[360,"360"]];
const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malas = 0;
for (const [w, nom] of ANCHOS) {
  const pg = await navegador.newPage({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
  await pg.setContent(HTML, { waitUntil: "load" });
  const r = await pg.evaluate(() => {
    const doc = document.documentElement;
    /* Un hijo recortado por un overflow:hidden no empuja nada: la cuña
       del panel dorado se sale del recuadro a propósito y se corta.
       Contarla sería contar un adorno como si fuera un desborde. */
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
        desborda.push((el.className || el.tagName) + " r=" + Math.round(b.right) + " l=" + Math.round(b.left));
      }
    }
    const toque = [];
    for (const el of document.querySelectorAll("button, input")) {
      const b = el.getBoundingClientRect();
      if (b.height > 0 && b.height < 30) toque.push((el.className||el.tagName) + " h=" + Math.round(b.height));
    }
    return {
      ancho: doc.clientWidth, scroll: doc.scrollWidth,
      desborda: desborda.slice(0, 6), toque: toque.slice(0, 6),
      cols: getComputedStyle(document.querySelector(".maestro")).gridTemplateColumns,
      alto: document.body.scrollHeight,
    };
  });
  const mal = r.scroll > r.ancho + 0.5 || r.desborda.length || r.toque.length;
  if (mal) malas++;
  console.log(`${nom.padEnd(4)} ${String(w).padStart(5)}px  scroll=${r.scroll}  alto=${r.alto}  ${mal ? "MAL" : "bien"}`);
  console.log(`      columnas: ${r.cols}`);
  if (r.desborda.length) console.log("      DESBORDA:", r.desborda.join(" | "));
  if (r.toque.length)    console.log("      CHICOS:", r.toque.join(" | "));
  await pg.screenshot({ path: `.arnes/tpm-${nom}.png`, fullPage: true });
  await pg.close();
}
await navegador.close();
console.log(malas ? `\n${malas} ancho(s) con problemas` : "\nlos cuatro anchos, limpios");
