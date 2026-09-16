/* =====================================================================
   QUE NADA SE SALGA DE LA TARJETA DE UN VEHÍCULO

   LO QUE PASÓ. Cristian mandó una foto de la tarjeta de JGY577 con el
   botón «Certificar llegada» asomado por fuera del borde derecho. No es
   un detalle: una tarjeta con algo colgando por fuera es lo primero que
   alguien nota cuando se enseña la pantalla, y hace dudar del resto.

   POR QUÉ PASA. El pie de la tarjeta es una fila de dos: a la izquierda
   la línea de «salió», a la derecha los botones. Los botones llevan
   `flex: none` para que no se aplasten —un botón aplastado no se toca
   con guante—, pero el contenedor que los agrupa SÍ se deja encoger, y
   cuando la dirección de salida es larga lo encoge por debajo de lo que
   mide el botón. El botón no cabe y sale.

   Y ES INVISIBLE PARA TODO LO DEMÁS: `tsc` y el `build` no saben de
   anchos, y en el escritorio del que programa la dirección casi siempre
   es corta. Se ve en producción, con una dirección de verdad.

   ASÍ QUE SE MIDE con la dirección más larga que hay en la base y en los
   anchos donde la rejilla cambia de columnas: ningún hijo de la tarjeta
   puede terminar más a la derecha que la tarjeta menos su relleno.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const css  = readFileSync(new URL("../src/app/(app)/sider/sider.css", import.meta.url), "utf8");
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/* La dirección es la de la foto que mandó Cristian: es larga de verdad,
   no un caso inventado para que falle. */
const DIRECCION = "Avenida Carrera 38, El Boliche, Perímetro Urbano Barranquilla";

const tarjeta = `
<article class="tr-vh largo">
  <header><b class="placa">JGY577</b><span class="tr-tarde">5 D 23 H</span></header>
  <div class="tr-ruta"><b>CD Unión Apartado</b><b>Barranquilla</b></div>
  <p class="tr-mat">BOTELLA FLINT 1000R<em>3500887 · EER</em></p>
  <dl class="tr-cifras"><div><dt>Estibas</dt><dd>30</dd></div><div><dt>Sider</dt><dd>0,83</dd></div>
    <div><dt>Cajas</dt><dd>1.080</dd></div><div><dt>HL</dt><dd>140,4</dd></div></dl>
  <footer>
    <div class="tr-salio">Salió 10 de sept, 12:41 p. m.<em>arenosa · 3/3 fotos · ${DIRECCION}</em></div>
    <div class="tr-botones">
      <button class="tr-ai">Pedir revisión AI</button>
      <button class="btn">Certificar llegada</button>
    </div>
  </footer>
</article>`;

/* Los anchos donde la rejilla `minmax(330px, 1fr)` cambia de columnas:
   ahí es donde la tarjeta queda más estrecha y aprieta. */
const ANCHOS = [1920, 1440, 1280, 1100, 900, 760, 480, 390, 360];

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage();
const fallas = [];

console.log("ancho    tarjeta   lo que se sale");
for (const w of ANCHOS) {
  await pag.setViewportSize({ width: w, height: 900 });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    ${glob}${css}
    body{margin:0;background:#EEF1F5;font:14px system-ui}
    main{padding:26px 30px 40px}
  </style></head><body><main><div class="sd"><div class="tr-grupos"><section class="tr-grupo">
    <div class="tr-rejilla">${tarjeta}</div></section></div></div></main></body></html>`);

  const r = await pag.evaluate(() => {
    const caja = document.querySelector(".tr-vh");
    const c = caja.getBoundingClientRect();
    const est = getComputedStyle(caja);
    /* El borde DE VERDAD por donde puede llegar el contenido: la caja
       menos su relleno. Medir contra `c.right` deja pasar un botón
       pegado al borde, que también se ve mal. */
    const izq = c.left + parseFloat(est.paddingLeft) + parseFloat(est.borderLeftWidth);
    const der = c.right - parseFloat(est.paddingRight) - parseFloat(est.borderRightWidth);
    const salen = [];
    for (const e of caja.querySelectorAll("*")) {
      const b = e.getBoundingClientRect();
      if (b.width === 0) continue;
      /* Medio píxel de tolerancia: el redondeo del navegador. */
      const fuera = Math.max(der - b.right < -0.5 ? Math.round(b.right - der) : 0,
                             b.left - izq < -0.5 ? Math.round(izq - b.left) : 0);
      if (fuera > 0)
        salen.push(`${e.className || e.tagName.toLowerCase()} (+${fuera} px)`);
    }
    return { ancho: Math.round(c.width), salen };
  });

  console.log(`${String(w).padEnd(8)} ${String(r.ancho).padStart(4)} px   ` +
              (r.salen.length ? r.salen.join(", ") : "nada"));
  if (r.salen.length)
    fallas.push(`a ${w} px de pantalla se sale de la tarjeta: ${r.salen.join(", ")}`);
}

await navegador.close();
if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\nListo: nada se sale de la tarjeta en ninguno de los nueve anchos.");
