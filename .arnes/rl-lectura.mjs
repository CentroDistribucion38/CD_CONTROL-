/* =====================================================================
   EL BLOQUE DE LECTURA DEL PARETO, EN LOS SIETE TEMAS

   QUÉ ES. Lo que antes era un párrafo de seis renglones ahora es la
   cabecera de un informe: titular con el hallazgo —con media frase
   marcada—, la recomendación aparte en negro, y la interpretación en
   tres puntos numerados.

   POR QUÉ HAY QUE MEDIRLO. Tres piezas nuevas descansan en pares de
   tokens que nadie emparejó a propósito:

     · el marcado del titular pinta --rl-ojo con --rl-sobre encima;
     · el recuadro de la recomendación pinta blanco sobre --rl-grupo;
     · los tres puntos van en gris sobre --rl-fondo.

   Ninguno de esos pares está garantizado por el tema, y el acento cambia
   con las preferencias de cada quien. Ya pasó en este proyecto: el
   acento sobre la banda daba 1,7 en un tema y 6,9 en otro.

   Y SE MIDE QUE LOS TRES PUNTOS SEAN TRES COLUMNAS en escritorio —si
   caen a una sola, el bloque vuelve a ser el párrafo largo que se venía
   a reemplazar— y que nada se salga de la tarjeta.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const rot  = readFileSync(new URL("../src/app/(app)/quiebra/rotura/rotura.css", import.meta.url), "utf8");
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];

const PUNTOS = [
  ["Las máquinas están parejas.",
   "Las 3 de mayor incidencia suman el 29.6 %, muy lejos del 80 % que describiría un proceso con un punto crítico. Cubrir el 80 % exigiría tocar 10 de 13."],
  ["Ese resultado es de agregación, no de operación.",
   "Las 13 estaciones existen en las cuatro líneas, así que cada barra promedia la misma estación de la línea 1, la 2, la 4 y la 6, y el promedio borra la dispersión."],
  ["Por envase sí hay dónde apretar.",
   "4 de 12 explican el 80 % y el Envase Costeñita 175R solo aporta 36.5 %. La intervención debe dirigirse por esa dimensión."],
];

const ARMAZON = `
<div class="rl"><div class="rl-lect no">
  <div class="rl-lect-cab">
    <div class="rl-lect-titu">
      <p class="rl-lect-ojo">Dónde se concentra la rotura</p>
      <h3>Por máquina no se concentra. <mark>Por envase sí.</mark></h3>
      <p class="rl-lect-meta">1 de sept a 30 de sept · 559.360 unidades rotas · 13 máquinas y 12 envases</p>
    </div>
    <aside class="rl-lect-rec">
      <span>Recomendación</span>
      <b>Intervenir por envase</b>
      <i>4 de 12 envases explican el 80 % de la rotura</i>
    </aside>
  </div>
  <div class="rl-lect-cuerpo">
    <p class="rl-lect-ojo">Interpretación</p>
    <ol class="rl-lect-puntos">
      ${PUNTOS.map(([t, c]) => `<li><b>${t}</b> ${c}</li>`).join("")}
    </ol>
  </div>
  <ol class="rl-8020-lista">
    <li><span>SALIDA DE LAVADORA</span><b>10.9 %</b></li>
    <li><span>DESEMPACADORA - LAVADORA</span><b>9.6 %</b></li>
    <li><span>PASTEURIZADORA</span><b>9.1 %</b></li>
  </ol>
</div></div>`;

const canales = (c) => {
  const n = (c.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
  return c.startsWith("color(") ? n.map((v) => v * 255) : n;
};
const razon = (a, b) => {
  const lum = (c) => {
    const [r, g, bl] = canales(c).map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const L1 = lum(a), L2 = lum(b);
  return +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2);
};

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fallas = [];

console.log("tema      marcado  recom.  sub-rec  puntos  columnas  se sale");
for (const t of TEMAS) {
  const pag = await navegador.newPage({ viewport: { width: 1440, height: 1000 } });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}${rot}
    html,body{margin:0;background:#EEF1F5}main{padding:20px;max-width:1180px}</style></head>
    <body><div class="sh"${t ? ` data-tema="${t}"` : ""}><main>${ARMAZON}</main></div></body></html>`);

  const m = await pag.evaluate(() => {
    const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
    const caja = document.querySelector(".rl-lect").getBoundingClientRect();
    /* Cuántas columnas hacen los tres puntos: se agrupan por la
       coordenada de arriba. Tres tops distintos = tres filas = una sola
       columna, que es volver al párrafo largo. */
    const tops = [...document.querySelectorAll(".rl-lect-puntos li")]
      .map((e) => Math.round(e.getBoundingClientRect().top));
    const columnas = tops.length / new Set(tops).size;
    return {
      marcaTxt: g(".rl-lect h3 mark", "color"),
      marcaFondo: g(".rl-lect h3 mark", "background-color"),
      recTxt: g(".rl-lect-rec b", "color"),
      recFondo: g(".rl-lect-rec", "background-color"),
      subRec: g(".rl-lect-rec i", "color"),
      puntoTxt: g(".rl-lect-puntos li", "color"),
      cuerpoFondo: g(".rl-lect-cuerpo", "background-color"),
      columnas,
      salen: [...document.querySelectorAll(".rl-lect *")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
      }).map((e) => e.className || e.tagName.toLowerCase()),
    };
  });
  await pag.close();

  /* El subtítulo de la recomendación va con opacity .92 sobre la banda,
     así que se mide el color ya rebajado y no el nominal. */
  const mezcla = (frente, fondo, a) => {
    const [r, g, b] = canales(frente), [R, G, B] = canales(fondo);
    return `rgb(${r * a + R * (1 - a)}, ${g * a + G * (1 - a)}, ${b * a + B * (1 - a)})`;
  };

  const c = {
    marcado: razon(m.marcaTxt, m.marcaFondo),
    recom: razon(m.recTxt, m.recFondo),
    subRec: razon(mezcla(m.subRec, m.recFondo, 0.92), m.recFondo),
    puntos: razon(m.puntoTxt, m.cuerpoFondo),
  };
  const nombre = t ?? "oficial";
  console.log(`${nombre.padEnd(9)} ${String(c.marcado).padStart(7)} ${String(c.recom).padStart(7)} ` +
              `${String(c.subRec).padStart(8)} ${String(c.puntos).padStart(7)} ` +
              `${String(m.columnas).padStart(9)}   ${m.salen.length ? m.salen.join(", ") : "nada"}`);

  for (const [k, v] of Object.entries(c)) {
    /* 4.5 para todo menos el titular marcado, que es letra de 27 px en
       peso 900: ahí la norma admite 3.0, y exigir 4.5 obligaría a
       oscurecer el acento de la marca en pantalla. */
    const minimo = k === "marcado" ? 3 : 4.5;
    if (v < minimo)
      fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo ${minimo})`);
  }
  if (m.columnas < 2.5)
    fallas.push(`tema ${nombre}: los tres puntos caen en ${(3 / m.columnas).toFixed(0)} fila(s): ` +
                "el bloque vuelve a ser el párrafo largo que vino a reemplazar");
  if (m.salen.length)
    fallas.push(`tema ${nombre}: se sale de la tarjeta: ${[...new Set(m.salen)].join(", ")}`);
}

await navegador.close();
if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\nListo: se lee en los siete temas y la interpretación va en tres columnas.");
