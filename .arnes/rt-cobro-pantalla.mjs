/* =====================================================================
   ROTURAS · EN SITIO · DE DÓNDE SALE LA PLATA

   Es el bloque que convierte «$ 74.216» en algo que se puede sostener
   frente al OL. Lo que puede salir mal:

   1. QUE LOS PORCENTAJES NO CUADREN CON LA PLATA. Una barra que enseña
      13 % y 87 % al lado de dos cifras que no dan eso es peor que no
      tener barra: se ve bien y miente.

   2. QUE EL REPARTO POR CAUSA NO SUME EL TOTAL. Dos cifras de la misma
      pantalla que no cuadran entre ellas se ven las dos igual de bien.

   3. QUE LAS DOS FORMAS SALGAN EN UN ORDEN FIJO. Lo que hay que ver de
      un golpe es cuál pesa, y eso cambia con los datos.

   4. QUE LA PARTE QUE NADIE ASUME SE ESCONDA detrás de un total. Es la
      que alguien va a discutir.

   5. QUE SE DIVIDA POR CERO cuando no hay nada a cobro.

   6. QUE NO SE LEA: en los cuatro anchos y en los siete temas.

     node .arnes/rt-cobro-pantalla.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

/* `next/link` en un arnés es un <a> y nada más — PERO CON SUS ATRIBUTOS.
   La primera versión solo pasaba `href` y los hijos, y se comía el
   `className`: el enlace salía sin estilo y la comprobación de contraste
   lo saltaba en silencio porque no encontraba el selector. Un doble que
   pierde una propiedad hace que el arnés mida otra pantalla. */
writeFileSync(R(".arnes/_link-co.tsx"), `
export default function Link({ href, children, ...resto }: any) {
  return <a href={href} {...resto}>{children}</a>;
}
`);

/* ---------- LOS DATOS ----------
   El caso de Cristian: 200 rotas del 2182 a $100 el envase = $20.000…
   no: su pantalla decía 100 rotas ($10.000) y las contaminadas
   $64.216. Se usan sus cifras tal cual, que son las que él ve. */
writeFileSync(R(".arnes/_co-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { DeDondeSale } from "../src/app/(app)/roturas/en-sitio/analisis/Cobro";

const cual = new URL(location.href).searchParams.get("c") ?? "suyo";
const casos: Record<string, any> = {
  /* EL SUYO: una sola causa, toda del OL. */
  suyo: { total: 74216, rotas: 10000, contaminadas: 64216, sinPrecio: 0,
          porCausa: [{ nombre: "Estibas en mal estado", grupo: "asumida", valor: 74216 }] },
  /* CON MEZCLA: parte la asume el OL y parte no, más una sin precio. */
  mezcla: { total: 120000, rotas: 80000, contaminadas: 40000, sinPrecio: 2,
            porCausa: [
              { nombre: "Mal apilado", grupo: "asumida", valor: 70000 },
              { nombre: "Falla de la máquina", grupo: "no_asumida", valor: 35000 },
              { nombre: "Condiciones del sitio", grupo: "asumida", valor: 15000 }] },
  /* TODO EN DISPUTA. */
  disputa: { total: 50000, rotas: 50000, contaminadas: 0, sinPrecio: 0,
             porCausa: [{ nombre: "Piso en mal estado", grupo: "no_asumida", valor: 50000 }] },
  /* NADA A COBRO: no puede dividir por cero ni pintar NaN. */
  cero: { total: 0, rotas: 0, contaminadas: 0, sinPrecio: 0, porCausa: [] },
};
createRoot(document.getElementById("r")!).render(<DeDondeSale c={casos[cual]} />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_co-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: { "next/link": R(".arnes/_link-co.tsx"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/roturas/roturas.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

const monta = async (caso = "suyo", ancho = 1440, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <style>${P}${css}</style></head>
      <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">
      <div class="rt" id="r"></div></main></div></div>
      <script>${js}<\/script></body></html>`,
  }));
  await pg.goto(`http://arnes.local/?c=${caso}`);
  await pg.waitForSelector(".rt .rq-cobro");
};

const plata = (t) => Number(String(t).replace(/[^\d]/g, "")) || 0;

await monta();
ok(rotos.length === 0, `el bloque tiró un error: ${rotos[0]}`);

/* =====================================================================
   1 · LOS PORCENTAJES SON LOS DE LA PLATA, Y LA BARRA LOS MISMOS
   ---------------------------------------------------------------------
   Se leen de la escala Y del ancho de la barra por separado: si el
   dibujo y el texto salieran de dos cuentas distintas, un día dirían
   cosas distintas y las dos se verían bien.
   ===================================================================== */
{
  const esc = await pg.$$eval(".rt .rq-escala span", (s) => s.map((x) => x.textContent.trim()));
  ok(/Rotas 13 %/.test(esc[0]) && /Contaminadas 87 %/.test(esc[1]),
     `la escala dice [${esc.join(" | ")}] y son 10.000 de 74.216 = 13 % y 64.216 = 87 %`);

  const anchos = await pg.$$eval(".rt .rq-barra i", (s) => s.map((x) => x.style.width));
  ok(anchos[0] === "13%" && anchos[1] === "87%",
     `la barra mide [${anchos.join(" | ")}] y tiene que medir lo mismo que dice la escala: ` +
     "una barra que no cuadra con su número se ve bien y miente");

  const vals = await pg.$$eval(".rt .rq-forma-v", (s) =>
    s.map((x) => [x.querySelector("b").textContent.trim(), x.querySelector("span").textContent.trim()]));
  ok(plata(vals[0][0]) + plata(vals[1][0]) === 74216,
     `las dos formas suman ${plata(vals[0][0]) + plata(vals[1][0])} y el total es 74.216`);
}

/* =====================================================================
   2 · DE MAYOR A MENOR, Y NO EN UN ORDEN FIJO
   ===================================================================== */
{
  const nom = await pg.$$eval(".rt .rq-forma-q b", (s) => s.map((x) => x.textContent.trim()));
  ok(nom[0] === "Contaminadas",
     `arriba salió «${nom[0]}» y con 64.216 contra 10.000 tiene que ir Contaminadas: lo que hay ` +
     "que ver de un golpe es cuál de las dos pesa");

  await monta("disputa");
  const nom2 = await pg.$$eval(".rt .rq-forma-q b", (s) => s.map((x) => x.textContent.trim()));
  ok(nom2[0] === "Rotas",
     `con 50.000 en rotas y 0 en contaminadas arriba salió «${nom2[0]}»: el orden es el de la ` +
     "plata, no uno fijo");
}

/* =====================================================================
   3 · LA FÓRMULA VA ESCRITA
   ---------------------------------------------------------------------
   Es la diferencia entre una cifra que se discute y una que se cree o no
   se cree. Y son DOS fórmulas distintas, que es el punto entero.
   ===================================================================== */
{
  await monta();
  const fs = await pg.$$eval(".rt .rq-forma-q code", (s) => s.map((x) => x.textContent.trim()));
  ok(fs.length === 2 && fs[0] !== fs[1],
     `las fórmulas salieron [${fs.join(" | ")}] y tienen que ser dos y distintas`);
  ok(fs.some((f) => /precio del envase \+ precio del producto/.test(f)),
     "no dice que la contaminada cobra el envase MÁS el producto, que es la regla entera");
  ok(fs.some((f) => /^unidades × precio del envase$/.test(f)),
     "no dice que la rota cobra solo el envase");
}

/* =====================================================================
   4 · EL REPARTO POR CAUSA SUMA EL TOTAL, Y EL TOTAL ESTÁ ESCRITO
   ===================================================================== */
{
  await monta("mezcla");
  const filas = await pg.$$eval(".rt .rq-porcausa tbody tr", (ts) =>
    ts.map((t) => [...t.querySelectorAll("td")].map((d) => d.textContent.trim())));
  const suma = filas.reduce((s, f) => s + (Number(f[2].replace(/[^\d]/g, "")) || 0), 0);
  const pie = await pg.$eval(".rt .rq-porcausa tfoot .der", (e) => e.textContent.trim());
  ok(suma === plata(pie),
     `las causas suman ${suma} y el total del pie dice ${plata(pie)}: dos cifras de la misma ` +
     "pantalla que no cuadran entre ellas");
  ok(plata(pie) === 120000, `el total del pie dice ${plata(pie)} y son 120.000`);
}

/* =====================================================================
   5 · LO QUE NADIE ASUME SE VE SIN LEER
   ---------------------------------------------------------------------
   Es la plata que alguien va a discutir. Va con su punto rojo en la
   tabla, y si TODO está en disputa lo dice la caja de arriba.
   ===================================================================== */
{
  const rojas = await pg.$$eval(".rt .rq-porcausa .rq-pun.no", (s) => s.map((x) => x.textContent.trim()));
  ok(rojas.length === 1 && rojas[0] === "No asumida",
     `de tres causas, una no la asume el OL y salieron ${rojas.length} marcadas`);
  const color = await pg.$eval(".rt .rq-porcausa .rq-pun.no", (e) => getComputedStyle(e).color);
  const gris = await pg.$eval(".rt .rq-porcausa .rq-pun:not(.no)", (e) => getComputedStyle(e).color);
  ok(color !== gris, "la que nadie asume se pinta igual que las demás: no se ve sin leer");
  const quien = await pg.$eval(".rt .rq-cobro-quien b", (e) => e.textContent.trim());
  ok(quien === "El OL y otras",
     `con mezcla la caja dice «${quien}»: decir solo «El OL» esconde la parte que se va a discutir`);

  await monta("disputa");
  const q2 = await pg.$eval(".rt .rq-cobro-quien b", (e) => e.textContent.trim());
  ok(q2 === "No asumida", `con todo en disputa la caja dice «${q2}»`);
  const marcada = await pg.$$eval(".rt .rq-cobro-quien.no", (s) => s.length);
  ok(marcada === 1, "con todo en disputa la caja de arriba no queda marcada");

  await monta("suyo");
  const q3 = await pg.$eval(".rt .rq-cobro-quien b", (e) => e.textContent.trim());
  ok(q3 === "El OL", `con una sola causa del OL la caja dice «${q3}»`);
  const sub = await pg.$eval(".rt .rq-cobro-quien span", (e) => e.textContent.trim());
  ok(sub === "Causa: Estibas en mal estado", `con una causa dice «${sub}» y tiene que nombrarla`);
}

/* =====================================================================
   6 · SIN NADA A COBRO NO SE DIVIDE POR CERO
   ===================================================================== */
{
  await monta("cero");
  const txt = await pg.$eval(".rt .rq-cobro", (e) => e.textContent);
  ok(!/NaN|Infinity|undefined/.test(txt), `salió basura con el total en cero: ${txt.slice(0, 120)}`);
  const esc = await pg.$$eval(".rt .rq-escala span", (s) => s.map((x) => x.textContent.trim()));
  ok(esc.every((t) => /0 %/.test(t)), `con cero a cobro la escala dice [${esc.join(" | ")}]`);
}

/* =====================================================================
   7 · LA NOTA DE LO QUE FALTA EN EL MAESTRO
   ===================================================================== */
{
  await monta("mezcla");
  const nota = await pg.$eval(".rt .rq-cobro .rq-mas", (e) => e.textContent.trim());
  ok(/2 roturas a cobro sin precio/.test(nota),
     `con 2 sin precio la nota dice «${nota.slice(0, 80)}»`);
  await monta("suyo");
  ok((await pg.$$(".rt .rq-cobro .rq-mas")).length === 0,
     "sin roturas sin precio no puede salir la nota: un aviso que sale siempre deja de leerse");
}

/* =====================================================================
   7-bis · EL ENLACE ES UN BOTÓN, NO UN ENLACE SUBRAYADO
   ---------------------------------------------------------------------
   Va al final de un bloque de plata, no dentro de un párrafo: subrayado
   y en azul de navegador se lee como una nota al pie y nadie lo toca.
   ===================================================================== */
{
  await monta("suyo");
  const v = await pg.$eval(".rt .rq-vervlas", (e) => {
    const s = getComputedStyle(e);
    return { deco: s.textDecorationLine, borde: parseFloat(s.borderTopWidth),
             alto: parseFloat(s.height), color: s.color };
  });
  ok(v.deco === "none", `el enlace sale subrayado (${v.deco}): aquí es un botón`);
  ok(v.borde >= 1, `el enlace no tiene borde (${v.borde}px): no se ve que se pueda tocar`);
  ok(v.alto >= 38,
     `el enlace mide ${v.alto}px de alto y con el dedo hacen falta 40: se toca en el muelle, ` +
     "con guantes");
}

/* =====================================================================
   8 · SE LEE EN LOS CUATRO ANCHOS Y EN LOS SIETE TEMAS
   ===================================================================== */
const TEMAS = ["", "oficial", "ambar", "negro", "gris", "verde", "azul"];
for (const ancho of [1440, 1024, 768, 390]) {
  await monta("mezcla", ancho);
  const desborde = await pg.evaluate(() => {
    const c = document.querySelector(".rt .rq-cobro");
    return [...c.querySelectorAll("*")].some((e) => e.getBoundingClientRect().right > innerWidth + 1);
  });
  ok(!desborde, `a ${ancho} px algo del bloque se sale por la derecha`);

  /* A 390 EL CHIP SE VA Y LA FÓRMULA SE QUEDA: el chip repite en dos
     palabras lo que la fórmula dice exacto. */
  if (ancho === 390) {
    const chips = await pg.$$eval(".rt .rq-chip", (s) =>
      s.filter((x) => getComputedStyle(x).display !== "none").length);
    const forms = await pg.$$eval(".rt .rq-forma-q code", (s) =>
      s.filter((x) => getComputedStyle(x).display !== "none").length);
    ok(chips === 0 && forms === 2,
       `en celular quedaron ${chips} chips y ${forms} fórmulas: se va el chip, no la fórmula`);

    /* Y LO QUE AVISA NO SE VA CON LA COLUMNA. En celular la columna de
       «quién la asume» no cabe, pero borrarla sin más quita de la
       pantalla lo único que dice que esa plata se va a discutir. */
    const visto = await pg.evaluate(() =>
      [...document.querySelectorAll(".rt .rq-porcausa tbody tr")]
        .map((t) => t.innerText).join(" | "));
    ok(/No asumida/.test(visto),
       `en celular la tabla por causa dice «${visto}» y una de las tres NO la asume el OL: eso ` +
       "no puede desaparecer con la columna");

    /* Y EL TOTAL SIGUE DICIENDO DE QUÉ ES. Estaba en la columna que se
       esconde: quedaba un número suelto al pie. */
    const pie = await pg.$eval(".rt .rq-porcausa tfoot", (e) => e.innerText.trim());
    ok(/Total a cobrar/.test(pie),
       `en celular el pie de la tabla dice «${pie}»: un número suelto sin decir de qué es`);
  }
}

const luz = (c) => {
  const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((n) => {
    const v = n / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contra = (a, b) => {
  const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/* =====================================================================
   9 · EL ROJO QUIERE DECIR UNA SOLA COSA, EN TODOS LOS TEMAS
   ---------------------------------------------------------------------
   `--rt-oro` es el acento de la app, y en el tema OFICIAL ESE ACENTO ES
   EL ROJO. Con él, la barra de «rotas» y el punto de «no asumida»
   salían del mismo color: dos cosas distintas pintadas igual, y el
   bloque perdía lo único que venía a avisar —que esa plata alguien la
   va a discutir—. Por eso el dorado de la barra es fijo.

   Y NO BASTA CON QUE LOS NÚMEROS RGB SEAN DISTINTOS: dos rojos que se
   diferencian en tres puntos son el mismo color para quien mira. Se
   exige distancia de verdad — la misma vara del diagrama del recorrido,
   donde el oro y el rojo están a 203 de distancia.
   ===================================================================== */
const lejos = (a, b) => {
  const [x, y] = [a, b].map((c) => c.match(/\d+/g).slice(0, 3).map(Number));
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
for (const tema of TEMAS) {
  await monta("mezcla", 1440, tema);
  const swRota = await pg.$eval(".rt .rq-forma .sw.rotas", (e) => getComputedStyle(e).backgroundColor);
  const puntoNo = await pg.$eval(".rt .rq-pun.no",
    (e) => getComputedStyle(e, "::before").backgroundColor);
  const d = lejos(swRota, puntoNo);
  ok(d >= 100,
     `tema «${tema || "por defecto"}»: «rotas» se pinta ${swRota} y «no asumida» ${puntoNo}, a ` +
     `${Math.round(d)} de distancia. Son el mismo color para quien mira, y el aviso de la plata ` +
     "en disputa se pierde");
}

for (const tema of TEMAS) {
  await monta("mezcla", 1440, tema);
  const pares = await pg.evaluate(() => {
    const fondo = (e) => {
      for (let x = e; x; x = x.parentElement) {
        const c = getComputedStyle(x).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return "rgb(255,255,255)";
    };
    return [".rq-cobro-tot", ".rq-cobro-quien b", ".rq-cobro-quien span", ".rq-forma-q b",
            ".rq-forma-q code", ".rq-escala span", ".rq-chip", ".rq-porcausa th",
            ".rq-pun.no", ".rq-porcausa tfoot td", ".rq-vervlas"]
      .map((sel) => {
        const e = document.querySelector(".rt " + sel);
        /* SI NO ESTÁ, SE DICE. Saltarse el que falta convierte esta
           comprobación en una que aprueba lo que no existe — pasó con
           el enlace del pie. */
        return e ? [sel, getComputedStyle(e).color, fondo(e)] : [sel, null, null];
      });
  });
  for (const [sel, col, fon] of pares) {
    if (!col) { ok(false, `tema «${tema || "por defecto"}»: no existe ${sel} en la pantalla`); continue }
    const c = contra(col, fon);
    /* 4,5 es el mínimo de la norma para texto normal; los rótulos
       grandes pasan con 3, pero aquí casi todo es texto chico. */
    const min = [".rq-cobro-tot", ".rq-cobro-quien b", ".rq-forma-v b"].includes(sel) ? 3 : 4.5;
    ok(c >= min,
       `tema «${tema || "por defecto"}»: ${sel} queda en ${c.toFixed(1)} de contraste y el ` +
       `mínimo es ${min}`);
  }
}

await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ De dónde sale la plata: la barra mide lo mismo que dice su escala y las dos salen " +
            "de la misma cuenta, las dos formas de cobrar van de mayor a menor con su fórmula " +
            "escrita —la rota solo el envase, la contaminada envase y producto—, el reparto por " +
            "causa suma el total que dice el pie, lo que nadie asume se ve sin leer arriba y en " +
            "la tabla, con cero a cobro no se divide por cero, y se lee en los cuatro anchos y " +
            "los siete temas.");
