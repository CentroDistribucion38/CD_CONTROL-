/* =====================================================================
   CUÁNTO ALTO LE QUEDA A LA LISTA DE TRÁNSITO

   EL PROBLEMA, dicho por Cristian: «el scroll muy cortico». La lista de
   vehículos vive debajo de la cabeza, la cinta de asuntos y la fila de
   filtros, y todo eso junto le venía comiendo más de cuatrocientos
   píxeles a lo único que importa de la pantalla.

   ESTE ARNÉS YA MINTIÓ DOS VECES, y las dos por lo mismo: el armazón de
   prueba llevaba clases que no existen. Primero `.tr-cabeza` y `.tr-kpi`
   (las de verdad son `.cabeza` y `.kpi`); después `.filtros` con un
   `.arriba` adentro, que sí existe —en globals.css, para otras
   pantallas— y por eso la comprobación de huérfanas lo dejó pasar: midió
   un panel con fondo y relleno de 114 px donde la pantalla real tiene
   una fila de 60. Una medición sobre un armazón falso es peor que no
   medir, porque se cree.

   ASÍ QUE AHORA EL ARMAZÓN SE COMPRUEBA CONTRA EL COMPONENTE, no contra
   la hoja de estilos: cada clase que este archivo escribe tiene que
   aparecer en `Transito.tsx` o en su `page.tsx`. Si alguien renombra una
   clase allá, esto falla acá antes de dar un número bonito.

   Y SE MIDE EN VARIAS ALTURAS DE PANTALLA, porque el portátil de bodega
   tiene 768 px de alto y el monitor de la oficina 1080: lo que sobra en
   uno no dice nada del otro.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const css  = readFileSync(new URL("../src/app/(app)/sider/sider.css", import.meta.url), "utf8");
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const tsx  = readFileSync(new URL("../src/app/(app)/sider/transito/Transito.tsx", import.meta.url), "utf8")
           + readFileSync(new URL("../src/app/(app)/sider/transito/page.tsx", import.meta.url), "utf8");

/* Alturas de pantalla reales: el portátil de bodega, un monitor de
   escritorio, y el kiosco vertical del muelle. */
const PANTALLAS = [
  { w: 1440, h: 900,  nombre: "portátil" },
  { w: 1920, h: 1080, nombre: "monitor" },
  { w: 1280, h: 768,  nombre: "portátil chico" },
  { w: 1125, h: 1125, nombre: "kiosco" },
];

/* EL ARMAZÓN, copiado de Transito.tsx elemento por elemento. Lo que
   cambia respecto al componente es solo el contenido: doce grupos de
   mentira en vez de los que traiga la base. */
const ARMAZON = `
<div class="sd tr-pantalla">
  <section class="cabeza">
    <div>
      <h1>En tránsito</h1>
      <p class="sub">Qué viene en camino hacia Barranquilla: placa, de dónde sale, qué trae y
        hace cuánto salió. Cuando uno llegue, se certifica la llegada desde su tarjeta.</p>
    </div>
    <div class="kpi"><div class="corte"></div><div class="rot">VEHÍCULOS EN CAMINO</div>
      <div class="num">12</div><div class="pie"><span>3,06 sider en tránsito</span>
      <a class="chip">Certificar salida</a></div></div>
  </section>

  <section class="tr-cinta">
    <span class="tr-rot">REQUIERE ATENCIÓN</span>
    <button class="tr-chip"><b>2</b><span>salieron sin las tres fotos · no se pueden cerrar</span><i>→</i></button>
    <button class="tr-chip amb"><b>2</b><span>más de 24 h sin llegar</span><i>→</i></button>
  </section>

  <div class="tr-cuerpo">
    <button class="tr-abrir">Filtrar<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="tr-filtros">
      <label class="tr-placa"><span>Placa</span><input placeholder="Parte de la placa"></label>
      <label><span>CD origen</span><select><option>Todos los orígenes</option></select></label>
      <label><span>Salió desde</span><input type="date"></label>
      <label><span>Hasta</span><input type="date"></label>
      <button class="btn plano">Limpiar</button>
    </div>
    <div class="tr-grupos" id="lista">
      ${Array.from({ length: 12 }, (_, i) => `
      <section class="tr-grupo">
        <h2 class="tr-grupo-cab">CD Origen ${i + 1} <span>1 vehículo · 140 HL</span></h2>
        <div class="tr-rejilla"><article class="tr-vh">
          <header><b class="placa">ABC${i}23</b></header>
          <div class="tr-ruta"><b>CD Origen</b><b>Barranquilla</b></div>
          <p class="tr-mat">BOTELLA FLINT 1000R<em>3500887 · EER</em></p>
          <dl class="tr-cifras"><div><dt>Estibas</dt><dd>30</dd></div><div><dt>Sider</dt><dd>0,83</dd></div>
            <div><dt>Cajas</dt><dd>1.080</dd></div><div><dt>HL</dt><dd>140,4</dd></div></dl>
          <footer><div class="tr-salio">Salió 10 de sept<em>arenosa · 3/3 fotos</em></div>
            <div class="tr-botones"><button class="btn">Certificar llegada</button></div></footer>
        </article></div>
      </section>`).join("")}
    </div>
  </div>
</div>`;

const fallas = [];

/* ===== QUE EL ARMAZÓN SEA EL DE LA PANTALLA =====
   Se compara contra el COMPONENTE, no contra la hoja: una clase puede
   existir en el CSS y aun así no ser la que usa esta pantalla —fue
   exactamente el error que dejó pasar `.filtros`—. */
/* Y SE COMPARA POR PALABRA COMPLETA, no por «lo contiene». Un
   `tsx.includes("filtros")` da verdadero porque en el componente está
   escrito `tr-filtros`, así que el `.filtros` inventado —que es
   justamente el que hizo mentir a este arnés— pasaba el control. Se
   sacan las clases de los `className` del componente y se comparan como
   conjuntos. */
/* SE MIRAN TODAS LAS CADENAS DEL ARCHIVO, no solo las que están pegadas
   a un `className=`. La primera versión miraba solo esas y se equivocó
   al revés: la tarjeta pasó a armar su clase en una variable
   —`const cls = "tr-vh" + (…)`— y el arnés cantó que `tr-vh` no existía
   cuando está ahí mismo. Un arnés que grita por un cambio correcto se
   termina apagando.

   Sigue sirviendo para lo que se hizo, porque la comparación es por
   PALABRA COMPLETA: `.filtros` —la clase inventada que lo hizo mentir—
   no aparece como palabra suelta en ningún sitio del componente, solo
   dentro de `tr-filtros`, que es otra palabra. */
const clasesComponente = new Set(
  [...tsx.matchAll(/["'`]([^"'`\n]*)["'`]/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter(Boolean));

const clasesArmazon = new Set(
  [...ARMAZON.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
const inventadas = [...clasesArmazon].filter((c) => !clasesComponente.has(c));
if (inventadas.length)
  fallas.push(`el armazón usa clases que Transito.tsx no tiene: ${inventadas.join(", ")}`);

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage();

console.log("pantalla          arranca en   alto lista   %  de la pantalla   filas");
for (const p of PANTALLAS) {
  await pag.setViewportSize({ width: p.w, height: p.h });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    ${glob}${css}
    body{margin:0;background:#EEF1F5;font:14px system-ui}
    /* La barra de la app, que en la pantalla de verdad va encima. */
    .app-barra{height:70px;background:#12263A}
    main{padding:26px 30px 40px;display:flex;flex-direction:column;gap:16px;min-width:0}
  </style></head><body><div class="app-barra"></div><main>${ARMAZON}</main></body></html>`);

  const r = await pag.evaluate(() => {
    const alto = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().height : 0 };
    const caja = document.getElementById("lista").getBoundingClientRect();
    return {
      arranca: Math.round(caja.top),
      alto: Math.round(caja.height),
      /* LO QUE SE APILA HACIA ABAJO NO ES LA TARJETA, ES LA FILA: las
         tarjetas van en rejilla y a 1280 px caben tres al lado. Lo que
         obliga a rodar es el grupo —su encabezado más una fila— así que
         eso es lo que hay que contar. */
      fila: Math.round(alto(".tr-grupo-cab") + alto(".tr-vh") + 10),
    };
  });

  const filas = r.fila > 0 ? (r.alto / (r.fila + 14)).toFixed(1) : "?";
  const pct = ((r.alto / p.h) * 100).toFixed(0);
  console.log(
    `${p.nombre.padEnd(16)} ${String(r.arranca).padStart(6)} px ${String(r.alto).padStart(9)} px ` +
    `${pct.padStart(12)} %   ${filas} filas`);

  /* LA LISTA TIENE QUE SER LO MÁS ALTO DE LA PANTALLA. Si el armazón se
     come más de la mitad, la pantalla está hablando de sí misma en vez
     de mostrar camiones. */
  if (r.alto < p.h * 0.45)
    fallas.push(`${p.nombre}: la lista ocupa el ${pct} % de la pantalla (mínimo 45 %)`);
  /* Y no puede pasarse: si la lista termina por debajo del borde, la
     página entera rueda además de la lista, y entonces hay dos scrolls
     peleando, que es lo peor que le puede pasar a una tabla. */
  if (r.arranca + r.alto > p.h + 2)
    fallas.push(`${p.nombre}: la lista termina ${r.arranca + r.alto - p.h} px por debajo del borde: dos scrolls peleando`);
  /* Y tiene que verse una fila entera más el asomo de la siguiente: con
     una sola fila justa, rodar es adivinar si hay algo más. */
  if (Number(filas) < 1.5)
    fallas.push(`${p.nombre}: solo caben ${filas} filas de vehículos`);
}

await navegador.close();
if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\nListo: la lista es lo más alto de la pantalla en las cuatro, sin dos scrolls peleando.");
