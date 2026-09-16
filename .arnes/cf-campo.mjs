/* =====================================================================
   EL CAMPO NUEVO DEL CUADRO DE CONFIRMAR, EN LOS SIETE TEMAS

   El cuadro `.cf-caja` tiene el fondo BLANCO escrito a mano, no un
   token: es a propósito —es una hoja de papel encima de la pantalla— y
   por eso todo lo que se pinte adentro tiene que leerse sobre blanco en
   los siete temas, aunque el tema sea oscuro. Los botones ya cumplían;
   el campo es nuevo y hay que comprobarlo igual, no suponerlo.

   Y TIENE QUE CABER EN EL CELULAR: el cuadro con campo es más alto que
   el cuadro de sí/no, y en una pantalla de 640 px de alto un cuadro que
   se sale por abajo deja el botón de aceptar fuera de la vista.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];

const CAJA = `
<div class="cf-velo">
  <form class="cf-caja">
    <h2>Revisión AI para JGY577</h2>
    <div class="cf-dice">Al llegar, quien certifique tendrá que sacar la muestra en el
      muelle y contar los defectos <b>antes de descargar</b>.</div>
    <label class="cf-campo">
      <span>¿Por qué se revisa? (opcional)</span>
      <input placeholder="Reclamo del socio, lote sospechoso…">
      <em>Lo ve quien recibe el vehículo, en la tarjeta y en el formulario.</em>
    </label>
    <div class="cf-botones">
      <button type="button" class="cf-btn plano">Cancelar</button>
      <button type="submit" class="cf-btn">Pedir la revisión</button>
    </div>
  </form>
</div>`;

/* Chromium contesta el color de dos formas: `rgb(r, g, b)` en 0–255 y
   `color(srgb 0.86 0.69 0.71)` en 0–1, esta última para todo lo que
   salga de un color-mix(). Leer la segunda como si fuera la primera da
   contrastes inventados —ya pasó en otro arnés—. */
const canales = (c) => {
  const n = c.match(/[\d.]+/g).slice(0, 3).map(Number);
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

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fallas = [];

console.log("tema      rótulo  ayuda  texto  borde   cabe en 360×640");
for (const t of TEMAS) {
  const pag = await navegador.newPage({ viewport: { width: 360, height: 640 } });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}
    html,body{margin:0}</style></head>
    <body><div class="sh"${t ? ` data-tema="${t}"` : ""}>${CAJA}</div></body></html>`);

  const m = await pag.evaluate(() => {
    const g = (s, p) => getComputedStyle(document.querySelector(s)).getPropertyValue(p);
    const caja = document.querySelector(".cf-caja").getBoundingClientRect();
    const fondo = g(".cf-caja", "background-color");
    return {
      fondo,
      rotulo: g(".cf-campo > span", "color"),
      ayuda: g(".cf-campo em", "color"),
      texto: g(".cf-campo input", "color"),
      campoFondo: g(".cf-campo input", "background-color"),
      borde: g(".cf-campo input", "border-top-color"),
      /* Que el cuadro entero quepa: si se sale por abajo, el botón de
         aceptar queda fuera de la vista en el celular. */
      cabe: caja.top >= 0 && caja.bottom <= innerHeight,
      /* Y que el campo no se pase de ancho, que es el bug clásico de un
         input sin `box-sizing: border-box`. */
      anchoCampo: Math.round(document.querySelector(".cf-campo input").getBoundingClientRect().width),
      anchoUtil: Math.round(caja.width - parseFloat(g(".cf-caja", "padding-left")) * 2),
    };
  });
  await pag.close();

  const c = {
    rotulo: razon(m.rotulo, m.fondo),
    ayuda: razon(m.ayuda, m.fondo),
    texto: razon(m.texto, m.campoFondo),
    borde: razon(m.borde, m.fondo),
  };
  const nombre = t ?? "oficial";
  console.log(`${nombre.padEnd(9)} ${String(c.rotulo).padStart(5)}  ${String(c.ayuda).padStart(5)}  ` +
              `${String(c.texto).padStart(5)}  ${String(c.borde).padStart(5)}   ${m.cabe ? "sí" : "NO"}`);

  /* 4.5 para lo que se lee, que es texto chico. El borde del campo no es
     texto: con 3.0 basta para que se vea dónde empieza. */
  for (const [k, v] of Object.entries(c)) {
    const minimo = k === "borde" ? 3 : 4.5;
    if (v < minimo) fallas.push(`tema ${nombre}: ${k} contrasta ${v} (mínimo ${minimo})`);
  }
  if (!m.cabe) fallas.push(`tema ${nombre}: el cuadro no cabe en una pantalla de 640 px de alto`);
  if (m.anchoCampo > m.anchoUtil + 1)
    fallas.push(`tema ${nombre}: el campo se pasa ${m.anchoCampo - m.anchoUtil} px del ancho del cuadro`);
}

await navegador.close();
if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\nListo: el campo se lee y cabe en los siete temas.");
