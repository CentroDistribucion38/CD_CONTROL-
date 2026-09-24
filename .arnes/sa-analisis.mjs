/* =====================================================================
   ANÁLISIS DE SALIDA — TRES CIFRAS Y LA LISTA, medidas.

   «Esto de aquí cambiémoslo por esto para que se vea mejor.»

   QUÉ SE COMPRUEBA Y POR QUÉ:

   1. QUE LAS TRES CIFRAS ALINEEN SU PIE. Es lo que se lee de un
      barrido; desalineadas hay que buscarlas de una en una. En la
      portada de Quiebra esto lo cazó el arnés y no el ojo.

   2. QUE LOS CHIPS FILTREN LA LISTA Y NO LAS CIFRAS. Si cambiaran,
      «Despachado 1.167 kg» diría 0 al pararse en «Esperando VH» y
      parecería que se perdió el mes.

   3. QUE LOS CHIPS SEAN ENLACES CON EL FILTRO EN LA DIRECCIÓN, y que
      NO se coman los otros filtros al cambiar de pestaña: pararse en
      «Despachadas» y perder el rango de fechas es cómo alguien lee el
      año entero creyendo que lee el mes.

   4. QUE EL COLOR NUNCA SEA LA ÚNICA SEÑAL. Ni en la barra apilada ni
      en la columna de la tabla: no se lee en gris, ni impreso, ni por
      quien no distingue el ámbar del green.

   5. QUE LA CIFRA NEGRA SE LEA. El par de colores va fijo porque con
      los tokens salía roja sobre negro en el tema oficial — es la
      tercera vez que `--rt-oro` muerde en este proyecto.

   6. CONTRASTE EN LOS SIETE TEMAS Y NADA SE SALE a 1440/820/390/360.

     node .arnes/sa-analisis.mjs
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const U = (p) => new URL(p, import.meta.url);
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE: sin esto, una excepción a
   mitad de camino deja la consola en blanco y parece que pasó. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

const css = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const pagina = readFileSync(R("src/app/(app)/roturas/salida/analisis/page.tsx"), "utf8");

/* =====================================================================
   LO QUE NO SE VE PERO DECIDE — se lee del archivo, no se adivina
   ===================================================================== */

/* 2. LOS CHIPS FILTRAN `enLista` Y NADA MÁS. Que `kg`, `completas` o
      `porSalir` salieran de `enLista` es exactamente el error que haría
      decir 0 al pararse en una pestaña. */
{
  const limpio = pagina.replace(/\/\*[\s\S]*?\*\//g, "");
  const bloque = (limpio.match(/const enLista = [\s\S]*?;\n/) ?? [""])[0];
  ok(/estadoF === "desp"/.test(bloque) && /estadoF === "vh"/.test(bloque),
     "los chips no filtran la lista");
  for (const [v, d] of [["const kg =", "el neto"], ["const completas =", "las despachadas"],
                        ["const porSalir =", "las que esperan Vh"]]) {
    const linea = (limpio.match(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*")) ?? [""])[0];
    ok(!/enLista/.test(linea),
       `${d} sale de enLista: al pararse en una pestaña la cifra grande diría otra cosa ` +
       "y parecería que se perdió el mes");
  }
}

/* 3. EL CHIP ARRASTRA LOS OTROS FILTROS. Pararse en «Despachadas» y
      perder el rango de fechas es cómo alguien lee el año entero
      creyendo que lee el mes. */
{
  const bloque = (pagina.match(/const u = new URLSearchParams\(\);[\s\S]*?u\.toString\(\)/) ?? [""])[0];
  for (const k of ["desde", "hasta", "placa", "color", "tolva"])
    ok(new RegExp(`u\\.set\\("${k}"`).test(bloque),
       `el chip se come el filtro «${k}»: se cambia de pestaña y se lee otro período`);
}

/* =====================================================================
   Y AHORA, PINTADA
   ===================================================================== */
const TONO = { "Ámbar": "#B87F00", "Flint": "#C9C9C3", "Green": "#16A75A" };
const COLS = [["Ámbar", 1167], ["Flint", 0], ["Green", 0]];
const total = COLS.reduce((t, c) => t + c[1], 0);

/* LOS PIES DE LAS TRES TARJETAS, DE LARGOS DISTINTOS A PROPÓSITO: con
   tres pies cortos, «los tres números alinean» pasaría sin probar
   nada. */
const html = `
<section class="sa-tarjetas">
  <div class="sa-t">
    <div class="sa-h"><b>Despachado</b><span>septiembre de 2026 · kg netos</span></div>
    <div class="sa-n">1.167<em>kg</em></div>
    <div class="sa-p">3 salidas despachadas<em class="sa-resta">1.500 bruto − 333 de tara</em></div>
  </div>
  <div class="sa-t">
    <div class="sa-h"><b>Por color</b><span>kg netos despachados</span></div>
    <div class="sa-barra" role="img" aria-label="Kilos por color: Ámbar 1167, Flint 0, Green 0">
      ${COLS.filter((c) => c[1] > 0).map((c) =>
        `<i style="width:${(c[1] / total) * 100}%;background:${TONO[c[0]]}"></i>`).join("")}
    </div>
    <div class="sa-ley">${COLS.map((c) =>
      `<span><i style="background:${TONO[c[0]]}"></i>${c[0]}<b>${c[1] || "—"}</b></span>`).join("")}</div>
  </div>
  <div class="sa-t sa-negra">
    <div class="sa-h"><b>Esperando visto bueno</b><span>kg netos</span></div>
    <div class="sa-n">4.204,8<em>kg</em></div>
    <div class="sa-p">8 salidas sin firmar · la más vieja del 11/09</div>
  </div>
</section>

<section class="caja sa-caja">
  <div class="sa-cab">
    <h2>Las salidas</h2>
    <div class="sa-chips">
      <a class="btn sa-chip on" href="#">Todas <em>11</em></a>
      <a class="btn sa-chip" href="#">Esperando VH <em>8</em></a>
      <a class="btn sa-chip" href="#">Despachadas <em>3</em></a>
    </div>
  </div>
  <div class="an-tabla sa-tabla"><table>
    <thead><tr><th>Salida</th><th>Fecha</th><th>Placa</th><th>Color</th>
      <th class="num">Bruto</th><th class="num">Tara</th><th class="num">Neto</th>
      <th>Tara / neto</th><th>Estado</th></tr></thead>
    <tbody>
      <tr><td class="cod">SR-0011</td><td>24/09 <span class="an-hora">12:30</span></td>
        <td class="cod">FSV898</td>
        <td><i class="sa-swatch" style="background:${TONO["Ámbar"]}"></i>Ámbar</td>
        <td class="num">600</td><td class="num">111</td><td class="num an-nt">489</td>
        <td><span class="an-minibar"><i style="width:18%;background:var(--rt-linea)"></i><i style="width:82%;background:var(--rt-tinta)"></i></span></td>
        <td><span class="an-chip an-ok">DESPACHADA</span></td></tr>
      <tr><td class="cod">SR-0001</td><td>11/09 <span class="an-hora">11:34</span></td>
        <td class="cod sa-sin">Sin placa</td>
        <td><i class="sa-swatch" style="background:${TONO["Flint"]}"></i>Flint</td>
        <td class="num">300</td><td class="num">111</td><td class="num an-nt">189</td>
        <td><span class="an-minibar"><i style="width:37%;background:var(--rt-linea)"></i><i style="width:63%;background:var(--rt-tinta)"></i></span></td>
        <td><span class="an-chip an-esp">ESPERANDO VH</span></td></tr>
    </tbody>
  </table></div>
</section>`;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ancho = 1440, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}>
    <head><meta charset="utf-8"><style>${glob}${shell}${css} html,body{margin:0}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt">${html}</div></main></div></div></body></html>`);
  await pg.waitForSelector(".rt .sa-t");
};

await monta();

/* 1. LOS TRES PIES A LA MISMA ALTURA ---------------------------------- */
{
  /* LO QUE TIENE QUE ALINEAR ES **LA CIFRA**, no el pie.
     Medí el pie primero y salió a 17 px de diferencia — y no era un
     error: el pie de la primera tarjeta lleva un renglón más (la
     resta), así que empieza más arriba. Su BASE sí coincide, que es lo
     que hace `margin-top: auto`. La cifra es lo que se lee de un
     barrido; desalineada hay que buscarla de una en una. */
  const cifras = await pg.$$eval(".rt .sa-tarjetas .sa-n",
    (e) => e.map((x) => Math.round(x.getBoundingClientRect().top)));
  const d = Math.max(...cifras) - Math.min(...cifras);
  ok(d <= 2, `las cifras están a ${d} px de altura distinta: es lo que se lee de un ` +
             "barrido, y desalineadas hay que buscarlas de una en una");

  /* LA BASE DE LOS PIES **Y DE LA LEYENDA**: la tarjeta del medio no
     tiene pie, y sin meterla aquí pintaba la barra arriba y dejaba un
     hueco de 60 px debajo sin que nada se pusiera rojo. */
  const pies = await pg.$$eval(".rt .sa-tarjetas .sa-p, .rt .sa-tarjetas .sa-ley",
    (e) => e.map((x) => Math.round(x.getBoundingClientRect().bottom)));
  ok(pies.length === 3, `se midieron ${pies.length} pies y las tarjetas son tres`);
  ok(Math.max(...pies) - Math.min(...pies) <= 4,
     `los pies terminan a ${Math.max(...pies) - Math.min(...pies)} px de distancia: la ` +
     "tarjeta que no tiene nada pegado abajo se ve a medio llenar");

  /* Y LAS TRES TARJETAS DEL MISMO ALTO: una más corta que las otras se
     lee como si tuviera menos que decir. */
  const altos = await pg.$$eval(".rt .sa-t", (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)));
  ok(Math.max(...altos) - Math.min(...altos) <= 2,
     `las tarjetas miden ${altos.join("/")} px de alto`);
  console.log(`\ncifras: ${cifras.join(" / ")} px   ·   pies (base): ${pies.join(" / ")} px   ·   altos: ${altos.join(" / ")} px`);
}

/* 4. EL COLOR NUNCA ES LA ÚNICA SEÑAL --------------------------------- */
{
  const ley = await pg.$$eval(".rt .sa-ley span", (e) => e.map((x) => x.textContent.trim()));
  ok(ley.length === 3, `la leyenda trae ${ley.length} colores y deben ser los tres`);
  ok(ley.every((t) => /[A-Za-zÁ]/.test(t)),
     `algún color de la leyenda no lleva su nombre: ${JSON.stringify(ley)}`);
  /* LOS TRES SIEMPRE, aunque estén en cero: un color que desaparece se
     lee como «no hay», y lo que dice es «este mes no salió ni un kilo
     de flint». */
  ok(ley.some((t) => /—/.test(t)), "un color en cero desapareció de la leyenda");

  const conNombre = await pg.$$eval(".rt .sa-tabla tbody tr td:nth-child(4)",
    (e) => e.map((x) => x.textContent.trim()));
  ok(conNombre.every((t) => t.length > 2),
     `en la tabla el color se dice SOLO con el cuadrito: ${JSON.stringify(conNombre)}`);
}

/* 5. LA CIFRA NEGRA SE LEE, Y LOS 7 TEMAS ------------------------------ */
const PARES = [
  ["título", ".rt .sa-t .sa-h b", null],
  ["unidad", ".rt .sa-t .sa-h span", null],
  ["cifra", ".rt .sa-t .sa-n", null],
  ["pie", ".rt .sa-t .sa-p", null],
  ["la resta", ".rt .sa-resta", null],
  ["leyenda", ".rt .sa-ley span", null],
  ["cifra negra", ".rt .sa-negra .sa-n", null],
  ["pie negro", ".rt .sa-negra .sa-p", null],
  ["título negro", ".rt .sa-negra .sa-h b", null],
  ["chip puesto", ".rt .sa-chip.on", null],
  ["chip suelto", ".rt .sa-chip:not(.on)", null],
  ["sin placa", ".rt .sa-sin", null],
];
console.log("\ntema     " + PARES.map((p) => p[0].padStart(14)).join(""));
for (const tema of ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, tema);
  const r = await pg.evaluate((pares) => {
    /* `color(srgb 0.98 …)` VIENE EN 0–1 Y NO EN 0–255: así devuelve
       este Chromium un `color-mix()` ya resuelto. Leerlo como 0–255 da
       un color casi negro y el arnés reporta 1.3 donde hay 13 — una
       medida que miente en rojo cuesta más que una que miente en verde:
       se va media hora arreglando un color que estaba bien. */
    const rgb = (s) => {
      const c = String(s).match(/^color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (c) return [1, 2, 3].map((i) => Number(c[i]) * 255);
      return (String(s).match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    };
    const lum = (p) => {
      const [r, g, b] = p.map((v) => {
        const s = v / 255; return s <= .03928 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
      });
      return .2126 * r + .7152 * g + .0722 * b;
    };
    const fondo = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return rgb(c);
      }
      return [255, 255, 255];
    };
    return pares.map(([, s]) => {
      const el = document.querySelector(s);
      /* 0 Y NO UN NÚMERO ALTO CUANDO NO ESTÁ: en rt-cadena la tabla
         salió «99 99 99 99» en los siete temas, toda en verde, porque
         los selectores viejos murieron a la vez y «no existe» devolvía
         un contraste altísimo. */
      if (!el) return 0;
      const a = lum(rgb(getComputedStyle(el).color)), b = lum(fondo(el));
      return Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 100) / 100;
    });
  }, PARES);
  console.log((tema || "oficial").padEnd(9) + r.map((v) => String(v).padStart(14)).join(""));
  r.forEach((v, i) => {
    if (v === 0) fallas.push(`falta «${PARES[i][0]}» (${PARES[i][1]}) en el tema ${tema || "oficial"}`);
    else if (v < 4.5) fallas.push(`«${PARES[i][0]}» contrasta ${v} en el tema ${tema || "oficial"}`);
  });
}

/* 6. NADA SE SALE, Y EL DEDO ALCANZA ---------------------------------- */
console.log("\nancho    se sale    tarjetas por fila   chips");
for (const ancho of [1440, 820, 390, 360]) {
  await monta(ancho);
  const m = await pg.evaluate((a) => {
    const recortado = (e) => {
      for (let p = e.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible") return true;
      }
      return false;
    };
    const fuera = [...document.querySelectorAll(".rt *")]
      .filter((e) => e.getBoundingClientRect().width > 0
                     && e.getBoundingClientRect().right > a + .5 && !recortado(e))
      .map((e) => e.className || e.tagName);
    const tops = [...document.querySelectorAll(".rt .sa-t")].map((e) => Math.round(e.getBoundingClientRect().top));
    const chips = [...document.querySelectorAll(".rt .sa-chip")]
      .map((e) => Math.round(e.getBoundingClientRect().height));
    return { fuera: [...new Set(fuera)].slice(0, 3),
             lado: document.documentElement.scrollWidth > a + 1,
             porFila: tops.filter((t) => t === tops[0]).length,
             chip: Math.min(...chips) };
  }, ancho);
  console.log(`${String(ancho).padEnd(8)} ${(m.lado || m.fuera.length ? m.fuera.join(", ") || "sí" : "nada").padEnd(10)} ` +
              `${String(m.porFila).padStart(17)}   ${m.chip} px`);
  if (m.lado || m.fuera.length)
    fallas.push(`a ${ancho} px se sale: ${m.fuera.join(", ") || "la página entera"}`);
  if (m.chip < 44) fallas.push(`a ${ancho} px los chips miden ${m.chip} px y con guante hacen falta 44`);
  /* EN EL CELULAR, UNA DEBAJO DE OTRA: tres tarjetas de 120 px de ancho
     con una cifra de 40 px dentro no se leen. */
  if (ancho <= 390 && m.porFila !== 1)
    fallas.push(`a ${ancho} px van ${m.porFila} tarjetas en la misma fila`);
}

await monta(1440);
await pg.screenshot({ path: R(".arnes/_sa-analisis.png"), fullPage: true });
await monta(390);
await pg.screenshot({ path: R(".arnes/_sa-analisis-celular.png"), fullPage: true });
await nav.close();

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log("✓ Análisis de salida: los tres pies alinean, los chips filtran la LISTA y no las " +
            "cifras y arrastran los demás filtros, el color nunca va solo, la cifra negra se " +
            "lee en los 7 temas y a 390 px las tarjetas van una debajo de otra.");
