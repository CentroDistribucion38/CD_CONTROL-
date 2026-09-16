/* =====================================================================
   LA ETIQUETA «REGISTRADO DESPUÉS»

   Se mide, no se mira. Dos cosas:

   1. QUE QUEPA. Es la etiqueta más larga de la fila —«REGISTRADO
      DESPUÉS · 12 días» son 25 caracteres contra los 9 de
      «CORREGIDO»— y va en una línea de meta que ya lleva tipo, turno,
      hora, nombre y código. En el celular, o cabe envolviendo o se
      sale de la tarjeta: la diferencia no se ve escribiéndola.

   2. QUE SE LEA. El texto sobre su propio fondo, en los siete temas.
      La etiqueta lleva colores fijos —como CORREGIDO— y por eso hay
      que comprobar que el fondo del tema no se los coma.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../src/app/(app)/traspasos/traspasos.css", import.meta.url), "utf8");

/* Los siete temas, por el atributo que pone la app en <html>. */
const TEMAS = ["", "gris", "gris-ambar", "negro", "azul", "verde", "arena"];
const ANCHOS = [1440, 820, 390, 360];

const PAGINA = (tema) => `<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}>
<head><meta charset="utf-8"><style>
  body { margin: 0; font: 14px system-ui }
  ${CSS}
  .tp .fila { max-width: 100% }
</style></head>
<body><div class="tp"><div class="lista">
  <div class="fila"><div class="izq"></div><div class="med">
    <div class="ruta">AG01 <span class="fl">→</span> PLANTA</div>
    <div class="meta">
      <span>Casco vidrio</span><span>Turno C</span><span>22:00</span>
      <span>Genesis Visbal</span><span>TR-0184</span>
      <span class="eti corregido" id="corr">CORREGIDO</span>
      <span class="eti tarde" id="tarde">REGISTRADO DESPUÉS · 12 días</span>
    </div>
  </div><div class="der"></div></div>
</div></div></body></html>`;

/* Contraste WCAG entre dos colores rgb(). */
const lum = (c) => {
  const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((n) => {
    const v = n / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fallas = [];

for (const tema of TEMAS) {
  const pagina = await navegador.newPage();
  await pagina.setContent(PAGINA(tema));

  for (const ancho of ANCHOS) {
    await pagina.setViewportSize({ width: ancho, height: 500 });
    const r = await pagina.evaluate(() => {
      const t = document.getElementById("tarde");
      const meta = t.parentElement;
      const fila = t.closest(".fila");
      const et = t.getBoundingClientRect(), fr = fila.getBoundingClientRect();
      const e = getComputedStyle(t);
      return {
        /* ¿Se sale de la tarjeta por la derecha o por la izquierda? */
        derrame: Math.round(Math.max(et.right - fr.right, fr.left - et.left)),
        /* ¿La quebraron en dos líneas? (white-space: nowrap lo impide;
           si alguien lo quita, esto lo dice). */
        alto: Math.round(et.height),
        /* ¿Se le encimó a algo? */
        metaAlto: Math.round(meta.getBoundingClientRect().height),
        fondo: e.backgroundColor, tinta: e.color,
      };
    });

    const donde = `${tema || "claro"} @${ancho}`;
    if (r.derrame > 0) fallas.push(`${donde}: se sale ${r.derrame}px de la fila`);
    if (r.alto > 26) fallas.push(`${donde}: la etiqueta se partió (alto ${r.alto})`);
    const c = contraste(r.tinta, r.fondo);
    if (c < 4.5) fallas.push(`${donde}: contraste ${c.toFixed(2)} (mínimo 4.5)`);
    if (ancho === 1440) console.log(`${tema || "claro"}: contraste ${c.toFixed(2)}  ${r.fondo} / ${r.tinta}`);
  }
  await pagina.close();
}

/* Y que las dos etiquetas NO se parezcan: si comparten color hay que
   leerlas para distinguirlas, y entonces el color no está haciendo
   nada. Se mide la distancia entre los dos fondos. */
const pagina = await navegador.newPage();
await pagina.setContent(PAGINA(""));
const dos = await pagina.evaluate(() => ({
  a: getComputedStyle(document.getElementById("corr")).backgroundColor,
  b: getComputedStyle(document.getElementById("tarde")).backgroundColor,
}));
const dif = Math.abs(lum(dos.a) - lum(dos.b));
const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
const [ra, ga, ba] = rgb(dos.a), [rb, gb, bb] = rgb(dos.b);
const dist = Math.hypot(ra - rb, ga - gb, ba - bb);
console.log(`corregido ${dos.a} vs tarde ${dos.b} · distancia ${dist.toFixed(0)}`);
if (dist < 25) fallas.push(`las dos etiquetas casi no se distinguen (distancia ${dist.toFixed(0)})`);
await navegador.close();

if (fallas.length) { console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n")); process.exit(1); }
console.log(`\nListo: ${TEMAS.length * ANCHOS.length} combinaciones, sin derrames y todas legibles.`);
