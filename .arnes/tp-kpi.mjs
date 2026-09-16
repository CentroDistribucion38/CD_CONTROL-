/* =====================================================================
   LA TARJETA DE ADHERENCIA DEL CELULAR, EN LOS SIETE TEMAS

   QUÉ SE ESTÁ COMPROBANDO. Esta tarjeta junta en una sola pieza lo que
   en el escritorio son tres bloques, y lo hace con los tokens del tema:
   el acento del módulo para la cinta, la banda oscura para el pie. Nada
   garantiza que esos dos tokens contrasten entre sí —ya pasó en este
   módulo: el acento sobre la banda daba 1,7 en oficial y 6,9 en negro—
   así que hay que medirlo tema por tema, no mirarlo una vez.

   Y LOS DOS TRAMOS DE LA CINTA TIENEN QUE DISTINGUIRSE. El de
   adicionales es el mismo acento mezclado con negro; si la mezcla queda
   muy cerca del acento, la cinta muestra un solo bloque y el número de
   adicionales no tiene dónde verse.

   TAMBIÉN SE MIDE QUE QUEPA: la tarjeta existe para evitar rodar tres
   veces, así que si ella sola pasa de una pantalla de celular no
   resolvió nada.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const tp   = readFileSync(new URL("../src/app/(app)/traspasos/traspasos.css", import.meta.url), "utf8");
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];

const ARMAZON = `
<div class="tp"><section class="tk">
  <div class="tk-cab">
    <div class="tk-r">ADHERENCIA AL PLAN · TURNO B</div>
    <div class="tk-fila">
      <div class="tk-pct">63%</div>
      <div class="tk-frac"><b>22 / 35</b><span>VIAJES DEL PLAN</span></div>
    </div>
  </div>
  <div class="tk-barra"><i class="c" style="width:63%"></i><i class="a" style="width:8.5%"></i></div>
  <div class="tk-ley">
    <span><i class="c"></i> 22 cumplidos</span>
    <span><i class="a"></i> 3 adicionales</span>
    <span><i class="f"></i> 13 faltan</span>
  </div>
  <div class="tk-rejilla">
    <div><b>35</b><span>PLANEADOS</span></div>
    <div><b>22</b><span>CUMPLIDOS</span></div>
    <div class="ac"><b>3</b><span>ADICIONALES</span></div>
    <div class="mal"><b>13</b><span>FALTAN</span></div>
    <div class="apag"><b>0</b><span>VACÍOS</span></div>
    <div><b>71%</b><span>CUMPLIMIENTO</span></div>
  </div>
  <div class="tk-pie"><span>FALTAN POR MOVER ANTES DE CERRAR</span><b>13</b></div>
</section></div>`;

/* Chromium contesta el color de dos maneras: `rgb(r, g, b)` en 0–255 y
   `color(srgb 0.86 …)` en 0–1, esta última para todo lo que salga de un
   color-mix() —y aquí casi todo sale de uno—. Leer la segunda como la
   primera da contrastes inventados; ya hizo mentir a otro arnés. */
const canales = (c) => {
  const n = (c.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
  return c.startsWith("color(") ? n.map((v) => v * 255) : n;
};
const lum = (c) => {
  const [r, g, b] = canales(c).map((v) => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const razon = (a, b) => {
  const L1 = lum(a), L2 = lum(b);
  return +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2);
};
const lejos = (a, b) => {
  const [r1, g1, b1] = canales(a), [r2, g2, b2] = canales(b);
  const rm = (r1 + r2) / 2;
  return +Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 +
                    (2 + (255 - rm) / 256) * (b1 - b2) ** 2).toFixed(0);
};

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fallas = [];

console.log("tema      rótulo  cifras  pie-txt  pie-núm  cinta  alto");
for (const t of TEMAS) {
  /* 390×844 es el celular de referencia del proyecto; la tarjeta se
     mide con el ancho real que tendría dentro del <main>. */
  const pag = await navegador.newPage({ viewport: { width: 390, height: 844 } });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}${tp}
    html,body{margin:0;background:#EEF1F5}
    main{padding:16px}</style></head>
    <body><div class="sh"${t ? ` data-tema="${t}"` : ""}><main>${ARMAZON}</main></div></body></html>`);

  const m = await pag.evaluate(() => {
    const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
    const caja = document.querySelector(".tk").getBoundingClientRect();
    return {
      papel: g(".tk", "background-color"),
      rotulo: g(".tk-r", "color"),
      pct: g(".tk-pct", "color"),
      cifra: g(".tk-rejilla span", "color"),
      cifraAc: g(".tk-rejilla .ac b", "color"),
      cifraMal: g(".tk-rejilla .mal b", "color"),
      pieFondo: g(".tk-pie", "background-color"),
      pieTxt: g(".tk-pie span", "color"),
      pieNum: g(".tk-pie b", "color"),
      cintaC: g(".tk-barra .c", "background-color"),
      cintaA: g(".tk-barra .a", "background-color"),
      alto: Math.round(caja.height),
      ancho: Math.round(caja.width),
      /* Que no se salga por los lados: el bug clásico de una rejilla de
         tres columnas con rótulos largos. */
      salen: [...document.querySelectorAll(".tk *")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
      }).map((e) => e.className || e.tagName.toLowerCase()),
    };
  });
  await pag.close();

  /* El texto del pie lleva opacity .95 sobre la banda, así que se mide
     el blanco ya rebajado y no el #fff nominal. */
  const pieTxtReal = (() => {
    const [r, g, b] = canales(m.pieTxt), [R, G, B] = canales(m.pieFondo);
    const a = 0.95;
    return `rgb(${r * a + R * (1 - a)}, ${g * a + G * (1 - a)}, ${b * a + B * (1 - a)})`;
  })();

  const c = {
    rotulo: razon(m.rotulo, m.papel),
    cifras: razon(m.cifra, m.papel),
    pieTxt: razon(pieTxtReal, m.pieFondo),
    pieNum: razon(m.pieNum, m.pieFondo),
  };
  const cinta = lejos(m.cintaC, m.cintaA);
  const nombre = t ?? "oficial";
  console.log(`${nombre.padEnd(9)} ${String(c.rotulo).padStart(5)}  ${String(c.cifras).padStart(6)}  ` +
              `${String(c.pieTxt).padStart(7)}  ${String(c.pieNum).padStart(7)}  ` +
              `${String(cinta).padStart(5)}  ${m.alto} px`);

  for (const [k, v] of Object.entries(c))
    if (v < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo 4.5, es letra chica)`);
  /* Los dos tramos de la cinta: por debajo de 60 se leen como un solo
     bloque y el tramo de adicionales deja de decir nada. */
  if (cinta < 60)
    fallas.push(`tema ${nombre}: los dos tramos de la cinta se distinguen ${cinta} (mínimo 60)`);
  /* Que las cifras de color también se lean sobre el papel. */
  for (const [k, v] of [["adicionales", m.cifraAc], ["faltan", m.cifraMal]]) {
    const r = razon(v, m.papel);
    if (r < 4.5) fallas.push(`tema ${nombre}: la cifra de ${k} contrasta ${r} (mínimo 4.5)`);
  }
  if (m.salen.length)
    fallas.push(`tema ${nombre}: se sale de la tarjeta: ${[...new Set(m.salen)].join(", ")}`);
  /* Y QUE QUEPA. La tarjeta existe para no tener que rodar tres veces;
     si ella sola pasa de la pantalla, no resolvió nada. Se le deja
     sitio a la barra de la app (70) y al relleno (32). */
  if (m.alto > 844 - 70 - 32)
    fallas.push(`tema ${nombre}: la tarjeta mide ${m.alto} px y no cabe en una pantalla de 844`);
}

await navegador.close();
if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\nListo: la tarjeta se lee y cabe en una sola pantalla en los siete temas.");
