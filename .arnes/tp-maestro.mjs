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
/* El menú de los tres puntos, y ABIERTO en algunas filas a propósito:
   vivía recortado por el overflow:hidden de la caja y nadie lo veía
   porque el arnés solo medía menús cerrados. */
const menuHTML = (arriba) => `<div class="menu${arriba?" arriba":""}">
<button type="button">Cambiar nombre y subtítulo</button>
<button type="button">Apagar</button>
<button type="button" class="mal">Borrar</button>
<div class="nota">Los 44 viajes que la nombran no se pierden: queda escrita en cada uno.</div>
</div>`;
const mas = (ab) => `<div class="mas"><button>⋯</button>${ab===undefined?"":menuHTML(ab)}</div>`;
const item = (n,s,v,on,ab) => `<div class="item${on?"":" apagado"}">${asa}
<div class="nom"><b>${n}</b><span>${s}</span></div>
<span class="uso">${v} viajes</span>${sw(on)}${mas(ab)}</div>`;

const PUNTOS = [["Ag01","Bodega propia",142,1],["Planta Barranquilla","Planta",98,1],
  ["CD Galapa","Centro de distribución",61,1],["CD Turbaco","Centro de distribución",34,1],
  ["Patio de estibas","Zona interna",12,1],["CD Santa Marta","Centro de distribución",0,0,true]];
const TIPOS = [["Casco vidrio","usado este mes",142,1],["Envase","usado este mes",96,1],
  ["Estibas","usado este mes",44,1],["Plástico","usado este mes",21,1],
  ["PET","usado este mes",63,1],["Lavado","usado este mes",18,1],
  ["PT Expo","usado este mes",12,1],["Material","usado este mes",9,1],
  ["Averías/Isotanque","sin uso",0,0,true]];

const HTML = marco(`
<section class="cabeza"><div>
<p class="ojo">TRASPASOS · MAESTRO · CD38 AG01</p><h1>Maestro</h1>
<p class="sub">Las bodegas, los tipos y las placas son datos de este centro, no código: el día que abran una bodega nueva o entre un vehículo nuevo, nadie debería esperar un despliegue. Lo que se agrega aquí es lo que se puede escoger al registrar.</p></div>
</section>

<section class="maestro">
<div class="col">
<div class="caja-m">
<div class="cab-m"><h2>Bodegas <em>6</em></h2><p>De dónde sale y a dónde llega un viaje. Una sola lista: la misma bodega es origen unas veces y destino otras.</p></div>
<form class="agregar-m"><input placeholder="Nombre de la bodega — Ag01, Planta, Patio…"><button>Agregar</button></form>
${PUNTOS.map(p=>item(...p)).join("")}
</div>

<div class="caja-m">
<div class="cab-m"><h2>Placas <em>4</em></h2><p>Los vehículos que se pueden escoger al registrar. Se guardan sin espacios ni guiones y en mayúsculas.</p></div>
<form class="agregar-m"><input placeholder="Placa — ABC123"><button>Agregar</button></form>
${[["ABC123","Tractomula de Summar",142,1],["BHG156","Turbo propio",96,1],
   ["UYT569","",44,1],["CGV589","sin uso",0,0,true]].map(p=>item(...p)).join("")}
</div>
</div>

<div class="col">
<div class="caja-m">
<div class="cab-m"><h2>Tipos de viaje <em>9</em></h2><p>Qué se mueve. Un tipo apagado no se borra: las planeaciones viejas lo siguen nombrando, solo deja de poderse escoger.</p></div>
<form class="agregar-m"><input placeholder="Nombre del tipo"><button>Agregar</button></form>
${TIPOS.map(t=>item(...t)).join("")}
</div>
</div>
</section>

<section class="duplicados"><h3>Posibles duplicados</h3>
<p>Mismo sitio escrito de dos formas. Si se dejan así, el informe por punto parte el mismo lugar en dos y ninguno cuadra.</p>
<div class="par-dup"><span class="tx">AG-01</span><span class="cuantos">4 viajes</span>
<span class="fl">→</span><span class="tx gana">Ag01</span><span class="cuantos">142 viajes</span>
<button class="unir">Unir en Ag01</button></div>
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

    /* LOS MENÚS ABIERTOS, ENTEROS.
       No basta con que el menú exista: hay que comprobar que ningún
       antepasado lo corta. Un overflow:hidden más arriba lo rebana sin
       cambiar su rect —el rect sigue diciendo 190×210— así que se compara
       contra la caja de recorte de cada antepasado. */
    const cortados = [];
    for (const m of document.querySelectorAll(".mas .menu")) {
      const b = m.getBoundingClientRect();
      for (let p = m.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX === "visible" && s.overflowY === "visible") continue;
        const c = p.getBoundingClientRect();
        const falta = Math.max(0, c.top - b.top) + Math.max(0, b.bottom - c.bottom)
                    + Math.max(0, c.left - b.left) + Math.max(0, b.right - c.right);
        if (falta > 0.5) {
          cortados.push((p.className || p.tagName) + " corta " + Math.round(falta) + "px");
          break;
        }
      }
    }
    /* Y ADEMÁS, DENTRO DE SU PROPIA TARJETA. No basta con que no lo
       corten: abierto hacia abajo en el último renglón se montaba sobre
       la tarjeta de al lado y se leía como parte de ella. */
    const fuera = [];
    for (const m of document.querySelectorAll(".mas .menu")) {
      const b = m.getBoundingClientRect();
      const c = m.closest(".caja-m").getBoundingClientRect();
      const sale = Math.max(0, c.top - b.top) + Math.max(0, b.bottom - c.bottom);
      if (sale > 0.5) fuera.push("menú se sale " + Math.round(sale) + "px de su caja");
    }
    const menus = document.querySelectorAll(".mas .menu").length;

    return {
      ancho: doc.clientWidth, scroll: doc.scrollWidth, menus, cortados, fuera,
      desborda: desborda.slice(0, 6), toque: toque.slice(0, 6),
      cols: getComputedStyle(document.querySelector(".maestro")).gridTemplateColumns,
      alto: document.body.scrollHeight,
    };
  });
  const mal = r.scroll > r.ancho + 0.5 || r.desborda.length || r.toque.length || r.cortados.length || r.fuera.length;
  if (mal) malas++;
  console.log(`${nom.padEnd(4)} ${String(w).padStart(5)}px  scroll=${r.scroll}  alto=${r.alto}  ${mal ? "MAL" : "bien"}`);
  console.log(`      columnas: ${r.cols}   menús abiertos: ${r.menus}, cortados: ${r.cortados.length}`);
  if (r.desborda.length) console.log("      DESBORDA:", r.desborda.join(" | "));
  if (r.toque.length)    console.log("      CHICOS:", r.toque.join(" | "));
  if (r.cortados.length) console.log("      MENÚ CORTADO:", r.cortados.join(" | "));
  if (r.fuera.length)    console.log("      MENÚ FUERA:", r.fuera.join(" | "));
  await pg.screenshot({ path: `.arnes/tpm-${nom}.png`, fullPage: true });
  await pg.close();
}
await navegador.close();
console.log(malas ? `\n${malas} ancho(s) con problemas` : "\nlos cuatro anchos, limpios");
