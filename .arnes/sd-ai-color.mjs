/* =====================================================================
   QUE EL COLOR DE LA REVISIÓN AI SE VEA, Y SE VEA DISTINTO

   LO QUE PEDÍA CRISTIAN: que en la misma lista de tránsito la tarjeta de
   un vehículo con revisión AI se reconozca por el color, sin leer.

   EL PROBLEMA QUE HABÍA. La marca de AI estaba en ORO, que es el color
   que esta pantalla ya usaba para «lleva más de un día en camino». Dos
   estados que no se parecen en nada y se resolvían igual de distinto
   compartían color: barriendo la lista con la vista no se separaban. El
   morado es propio y no lo usa nada más aquí.

   QUÉ SE COMPRUEBA, Y POR QUÉ ESTAS TRES COSAS
     · Que los tres estados —normal, va tarde, AI— sean colores
       DISTINGUIBLES entre sí, no tres tonos que a dos metros son el
       mismo. Se mide la distancia real entre ellos, no «se ven
       distintos».
     · Que el morado se distinga también para quien no ve el rojo o el
       verde: una franja de color que solo separa para el que ve bien no
       separa. Por eso cada estado lleva ADEMÁS su sello con texto.
     · Que todo lo que se lee encima de esos fondos pase el 4.5 de
       contraste, que es letra chica.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const sider = readFileSync(new URL("../src/app/(app)/sider/sider.css", import.meta.url), "utf8");
const glob  = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const tarjeta = (clase, sello, rotulo, ojo) => `
<article class="tr-vh ${clase}">
  <header><b class="placa">JGY577</b>
    ${sello ? `<span class="sello ${sello}"><i></i>${rotulo}</span>` : ""}
  </header>
  <div class="tr-ruta"><b>CD Unión</b><b>Barranquilla</b></div>
  <p class="tr-mat">BOTELLA FLINT 1000R<em>3500887 · EER</em></p>
  <dl class="tr-cifras"><div><dt>Estibas</dt><dd>30</dd></div><div><dt>HL</dt><dd>140,4</dd></div></dl>
  ${ojo ? `<p class="tr-ojo ${ojo}">A este vehículo le toca <b>revisión AI</b>.</p>` : ""}
</article>`;

const ARMAZON = `<div class="sd"><div class="tr-rejilla">
  ${tarjeta("", "transito", "3 h 40 min", "")}
  ${tarjeta("largo", "falta", "2 d 5 h", "")}
  ${tarjeta("ai", "ai", "REVISIÓN AI", "ai")}
  ${tarjeta("ai-falta", "ai falta", "FALTA LA REVISIÓN AI", "ai falta")}
</div></div>`;

/* Chromium contesta el color de dos maneras: `rgb(r, g, b)` en 0–255 y
   `color(srgb 0.86 …)` en 0–1, esta última para lo que salga de un
   color-mix(). Leer la segunda como la primera da números inventados. */
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
/* Distancia entre dos colores en un espacio parecido a como los ve el
   ojo. Sirve para decir «estos dos son el mismo color a dos metros». */
const lejos = (a, b) => {
  const [r1, g1, b1] = canales(a), [r2, g2, b2] = canales(b);
  const rm = (r1 + r2) / 2;
  return +Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 +
                    (2 + (255 - rm) / 256) * (b1 - b2) ** 2).toFixed(0);
};
/* Cómo ve esos mismos colores alguien con deuteranopia —la falta de
   visión del verde, la más común—. Si dos estados se juntan aquí, el
   color solo no basta y tiene que haber texto además. */
const sinVerde = (c) => {
  const [r, g, b] = canales(c);
  return `rgb(${0.625 * r + 0.375 * g}, ${0.7 * r + 0.3 * g}, ${0.3 * g + 0.7 * b})`;
};

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}${sider}
  body{margin:0;background:#EEF1F5;font:14px system-ui;padding:20px}
  .tr-rejilla{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
</style></head><body>${ARMAZON}</body></html>`);

const m = await pag.evaluate(() => {
  const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
  return {
    franjaNormal: g(".tr-vh:not(.largo):not(.ai):not(.ai-falta)", "border-left-color"),
    franjaTarde:  g(".tr-vh.largo", "border-left-color"),
    franjaAi:     g(".tr-vh.ai", "border-left-color"),
    franjaFalta:  g(".tr-vh.ai-falta", "border-left-color"),
    fondoFalta:   g(".tr-vh.ai-falta", "background-color"),
    selloAiTxt:   g(".sello.ai", "color"),
    selloAiFondo: g(".sello.ai", "background-color"),
    faltaTxt:     g(".sello.ai.falta", "color"),
    faltaFondo:   g(".sello.ai.falta", "background-color"),
    ojoTxt:       g(".tr-ojo.ai", "color"),
    ojoFondo:     g(".tr-ojo.ai", "background-color"),
    ojoFTxt:      g(".tr-ojo.ai.falta", "color"),
    ojoFFondo:    g(".tr-ojo.ai.falta", "background-color"),
    /* Que cada estado lleve texto y no solo color. */
    sellosConTexto: [...document.querySelectorAll(".tr-vh")]
      .every((c) => (c.querySelector(".sello")?.textContent ?? "").trim().length > 2),
  };
});
await navegador.close();

const fallas = [];

/* ---- Que los cuatro estados se separen a la vista ---- */
const pares = [
  ["normal", m.franjaNormal, "va tarde", m.franjaTarde],
  ["normal", m.franjaNormal, "AI", m.franjaAi],
  ["va tarde", m.franjaTarde, "AI", m.franjaAi],
];
console.log("franjas del borde — qué tan distintas son");
for (const [a, ca, b, cb] of pares) {
  const d = lejos(ca, cb), dc = lejos(sinVerde(ca), sinVerde(cb));
  console.log(`  ${a.padEnd(9)} vs ${b.padEnd(9)} ${String(d).padStart(4)}   sin ver el verde: ${dc}`);
  /* 100 es la distancia a la que dos colores dejan de confundirse de
     lejos con esta fórmula; el oro contra el turquesa da 250. */
  if (d < 100) fallas.push(`«${a}» y «${b}» son casi el mismo color (${d})`);
}

/* ---- Que lo que se lee, se lea ---- */
const textos = [
  ["sello AI", m.selloAiTxt, m.selloAiFondo],
  ["sello falta", m.faltaTxt, m.faltaFondo],
  ["nota AI", m.ojoTxt, m.ojoFondo],
  ["nota falta", m.ojoFTxt, m.ojoFFondo],
];
console.log("\ntexto sobre su fondo");
for (const [n, t, f] of textos) {
  const c = razon(t, f);
  console.log(`  ${n.padEnd(12)} ${c}`);
  if (c < 4.5) fallas.push(`${n}: contrasta ${c} (mínimo 4.5, es letra chica)`);
}

/* ---- Y que el color no sea LO ÚNICO ---- */
if (!m.sellosConTexto)
  fallas.push("hay una tarjeta cuyo estado se dice solo con color: sin el sello con texto, quien no distingue colores no lo ve");

if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\nListo: los estados se separan por color y además lo dicen por escrito.");
