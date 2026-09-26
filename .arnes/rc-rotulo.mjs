/* =====================================================================
   EL RÓTULO DE LA ESTIBA — el PDF de verdad, medido

   El rótulo se pega en una estiba y lo lee alguien de pie en un
   pasillo, a dos o tres metros. Nada de eso se puede dar por bueno
   leyendo el código: hay que generar el PDF y mirar lo que salió.

   1. LO QUE TIENE QUE ESTAR, ESTÁ: el código, la cantidad, la
      ubicación, el folio y cuál de cuántas es.

   2. PRODUCTO Y ENVASE SON DOS RÓTULOS, NO UNO CON HUECOS. El producto
      lleva vencimiento; el envase no vence y lleva color de vidrio. Un
      envase con un renglón «VENCE» vacío enseña que ahí falta un dato
      que no existe.

   3. EL QR VA DE VERDAD. Es lo más fácil de perder sin que nadie se
      entere: el rótulo sale igualito de bien sin él, y el día que
      alguien quiera escanear no hay nada que escanear.

   4. UN PAPEL POR ESTIBA, NUMERADO. Doce rótulos iguales en la mano no
      se pueden repartir entre doce estibas.

   5. LO QUE FALTA SE DICE. Un vencimiento que no se pudo calcular sale
      escrito como que falta, no en blanco: un renglón vacío parece un
      papel mal impreso.

   6. EL VENCIMIENTO NO SE INVENTA. Sin fecha de producción o sin vida
      útil en el maestro, `calcularVence` tiene que contestar null. Una
      fecha calculada a la brava e impresa en la estiba no la vuelve a
      cuestionar nadie.

     node .arnes/rc-rotulo.mjs
   ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
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

/* ---------------------------------------------------------------------
   LOS DATOS DE PRUEBA. Cada rótulo trae un caso:

   · 1 y 2 de 3 — producto con todo puesto. Dos papeles para comprobar
     que salen numerados y que no son el mismo dos veces.
   · 3 de 3 — producto SIN vencimiento: el material no tiene vida útil
     en el maestro. Es el caso que no se puede ordenar por FEFO y que el
     rótulo tiene que gritar.
   · el envase — sin vencimiento porque no vence, con color y origen.
   --------------------------------------------------------------------- */
writeFileSync(R(".arnes/_rc-entrada.ts"), `
import { rotulosPdf, calcularVence } from "../src/modulos/inventario/rotulo";

const comun = {
  ubicacion: "A03-M12-IZQ", recibido_por: "Genesis Visbal",
  recibido_en: "26/09/2026, 10:30", placa: "JGY577",
};
const rotulos = [
  { ...comun, folio: "20260926-9845-AB12-01", tipo: "producto" as const,
    sku: "9845", nombre: "Aguila Tw 330Cc X 30", cantidad: 1080, unidad: "cajas" as const,
    numero: 1, total: 3, producido: "2026-09-20",
    vence: calcularVence("2026-09-20", 180), lote: "L-4471" },
  { ...comun, folio: "20260926-9845-AB12-02", tipo: "producto" as const,
    sku: "9845", nombre: "Aguila Tw 330Cc X 30", cantidad: 1080, unidad: "cajas" as const,
    numero: 2, total: 3, producido: "2026-09-20",
    vence: calcularVence("2026-09-20", 180), lote: "L-4471" },
  /* SIN VIDA ÚTIL EN EL MAESTRO: el vencimiento sale null y el rótulo
     tiene que decirlo, no dejar el renglón en blanco. */
  { ...comun, folio: "20260926-9845-AB12-03", tipo: "producto" as const,
    sku: "9845", nombre: "Aguila Tw 330Cc X 30", cantidad: 1080, unidad: "cajas" as const,
    numero: 3, total: 3, producido: "2026-09-20",
    vence: calcularVence("2026-09-20", null), lote: null },
  { ...comun, folio: "20260926-3500162-CD34-01", tipo: "envase" as const,
    sku: "3500162", nombre: "Envase Marron 330R", cantidad: 900, unidad: "unidades" as const,
    numero: 1, total: 1, color: "Ámbar", origen: "CD Unión Apartado" },
];

(async () => {
  try {
    const pdf = await rotulosPdf(rotulos as any, { base: "https://cd38.example" });
    (window as any).__PDF__ = pdf.output("datauristring");
    (window as any).__LISTO__ = true;
  } catch (e: any) {
    (window as any).__LISTO__ = false;
    (window as any).__MAL__ = String(e && e.message || e);
  }
})();

/* Y LO QUE NO SE PUEDE CALCULAR, NO SE CALCULA. Se mide aquí y no en
   node porque es el mismo código que corre en el navegador. */
(window as any).__VENCE__ = {
  bien: calcularVence("2026-09-20", 180),
  sinVida: calcularVence("2026-09-20", null),
  sinFecha: calcularVence(null, 180),
  vidaCero: calcularVence("2026-09-20", 0),
  basura: calcularVence("no-es-fecha", 180),
};
`);

const js = buildSync({
  entryPoints: [R(".arnes/_rc-entrada.ts")], bundle: true, write: false,
  format: "iife", alias: { "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

/* LA PÁGINA SE SIRVE DESDE UNA DIRECCIÓN DE VERDAD, no con
   `setContent`. Con `setContent` la página vive en `about:blank` y los
   `fetch("/marca/logo-b.png")` del rótulo no tienen contra qué
   resolverse: caen al `catch` de «sin logo se sigue» y el arnés daría
   verde sin haber visto nunca el logo. Este mismo error ya costó tres
   arneses en este proyecto. */
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <script>${js.replace(/<\/script/g, "\\u003c/script")}</script></body></html>`;
await pg.route("http://arnes.local/", (r) =>
  r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
/* LAS DE LOS LOGOS SE REGISTRAN DESPUÉS: la última que se registra gana. */
const logoB = readFileSync(R("public/marca/logo-b.png"));
const logoP = readFileSync(R("public/marca/logo-bavaria.png"));
await pg.route("**/marca/logo-b.png", (r) =>
  r.fulfill({ status: 200, contentType: "image/png", body: logoB }));
await pg.route("**/marca/logo-bavaria.png", (r) =>
  r.fulfill({ status: 200, contentType: "image/png", body: logoP }));

await pg.goto("http://arnes.local/");
await pg.waitForFunction(() => window.__LISTO__ !== undefined, null, { timeout: 20000 });
ok(rotos.length === 0, `el rótulo tiró un error: ${rotos[0]}`);
const listo = await pg.evaluate(() => window.__LISTO__);
ok(listo === true, `el rótulo no se pudo armar: ${await pg.evaluate(() => window.__MAL__)}`);

/* =====================================================================
   6 · EL VENCIMIENTO NO SE INVENTA
   ===================================================================== */
{
  const v = await pg.evaluate(() => window.__VENCE__);
  ok(v.bien === "2027-03-19",
     `180 días desde el 20/09/2026 dan ${v.bien} y deben dar 2027-03-19`);
  ok(v.sinVida === null,
     `sin vida útil en el maestro se calculó ${v.sinVida}: una fecha inventada impresa en la ` +
     "estiba no la vuelve a cuestionar nadie");
  ok(v.sinFecha === null, `sin fecha de producción se calculó ${v.sinFecha}`);
  ok(v.vidaCero === null, `con vida útil 0 se calculó ${v.vidaCero}`);
  ok(v.basura === null, `con una fecha ilegible se calculó ${v.basura}`);
}

const b64 = await pg.evaluate(() => {
  const d = window.__PDF__;
  if (!d) throw new Error("no se generó ningún PDF");
  return String(d).split(",")[1];
});
await nav.close();

mkdirSync(R(".arnes/_pdf"), { recursive: true });
const ruta = R(".arnes/_pdf/rc-rotulo.pdf");
const bin = Buffer.from(b64, "base64");
writeFileSync(ruta, bin);
console.log(`pdf: ${(bin.length / 1024).toFixed(0)} KB`);

const texto = execSync(`pdftotext -layout "${ruta}" -`, { encoding: "utf8" });
const hojas = texto.split("\f");
const paginas = hojas.filter((h) => h.trim()).length;
console.log(`páginas: ${paginas}`);

/* =====================================================================
   4 · UN PAPEL POR ESTIBA, NUMERADO
   ===================================================================== */
ok(paginas === 4, `salieron ${paginas} páginas y se pidieron 4 rótulos: uno por estiba`);
for (const n of ["1/3", "2/3", "3/3", "1/1"]) {
  ok(texto.includes(n),
     `falta «${n}»: doce papeles iguales en la mano no se pueden repartir entre doce estibas`);
}

/* =====================================================================
   1 · LO QUE TIENE QUE ESTAR
   ===================================================================== */
{
  const h = hojas[0];
  ok(h.includes("9845"), `la primera hoja no trae el código del material:\n${h.slice(0, 300)}`);
  ok(/AGUILA TW 330CC X 30/i.test(h), "la primera hoja no trae el nombre del material");
  ok(h.includes("1.080"), "no sale la cantidad: es el segundo dato que se busca de lejos");
  ok(/cajas/.test(h), "la cantidad sale sin decir si son cajas o unidades");
  ok(h.includes("A03-M12-IZQ"), "no sale la ubicación: es lo que contesta «¿dónde la pongo?»");
  ok(h.includes("20260926-9845-AB12-01"), "no sale el folio, que es lo que identifica la estiba");
  ok(/Genesis Visbal/.test(h), "el pie no dice quién recibió");
  ok(h.includes("CD38"), "no se dice de qué centro es el rótulo");
}

/* =====================================================================
   2 · PRODUCTO Y ENVASE SON DOS RÓTULOS
   ===================================================================== */
{
  const prod = hojas[0], env = hojas[3];
  ok(/PRODUCTO TERMINADO/.test(prod), "el rótulo de producto no dice que es producto terminado");
  ok(/VENCE/.test(prod), "el rótulo de producto no lleva el vencimiento, que es lo que manda en el FEFO");
  ok(/19\/03\/2027/.test(prod),
     `el vencimiento no sale calculado en el papel:\n${prod.slice(0, 400)}`);
  ok(/PRODUCIDO/.test(prod) && /20\/09\/2026/.test(prod), "no sale la fecha de producción");
  ok(/L-4471/.test(prod), "no sale el lote");

  ok(/ENVASE RETORNABLE/.test(env), "el rótulo de envase no dice que es envase retornable");
  /* EL ENVASE NO VENCE: un renglón «VENCE» vacío enseña que ahí falta
     un dato que no existe, y manda a alguien a buscarlo. */
  ok(!/VENCE/.test(env),
     `el rótulo de envase lleva un renglón de vencimiento:\n${env.slice(0, 400)}`);
  ok(/COLOR DEL VIDRIO/.test(env) && /Ámbar/.test(env),
     "el rótulo de envase no lleva el color del vidrio, que es lo suyo");
  ok(/VIENE DE/.test(env) && /Unión Apartado/.test(env), "el rótulo de envase no dice de dónde vino");
  ok(/unidades/.test(env), "el envase se cuenta en unidades y el rótulo no lo dice");
}

/* =====================================================================
   5 · LO QUE FALTA SE DICE, NO SE DEJA EN BLANCO
   ===================================================================== */
{
  const sin = hojas[2];
  ok(/SIN FECHA/i.test(sin) && /FEFO/i.test(sin),
     `la estiba sin vencimiento no lo grita:\n${sin.slice(0, 400)}`);
  ok(/falta/i.test(sin), "el lote vacío sale en blanco en vez de decir que falta");
}

/* =====================================================================
   3 · EL QR VA DE VERDAD, Y EL LOGO TAMBIÉN

   Es lo más fácil de perder sin que nadie se entere: el rótulo sale
   igualito de bien sin ellos.
   ===================================================================== */
{
  const lista = execSync(`pdfimages -list "${ruta}"`, { encoding: "utf8" }).trim().split("\n");
  const imagenes = Math.max(0, lista.length - 2);
  console.log(`imágenes en el PDF: ${imagenes}`);
  ok(imagenes >= 8,
     `el PDF trae ${imagenes} imágenes: con 4 hojas tendrían que ser al menos 8 —QR y marca por ` +
     "hoja—, así que algo se perdió por un catch");

  /* EL QR SE LEE DE VERDAD, Y ESTO REEMPLAZA A CONTAR IMÁGENES.
     Contar no servía: perdiendo el QR quedaban igual 16 imágenes —los
     dos logos llevan máscara de transparencia y cuentan doble—, así que
     la mutación «el QR se pierde por el catch» salía VERDE. Una
     mutación que sale verde es un hueco en la prueba, no un acierto del
     código.
     Se exporta cada hoja a PNG y se decodifica con zbarimg, que es
     exactamente lo que va a hacer el teléfono en la bodega. */
  mkdirSync(R(".arnes/_pdf/qr"), { recursive: true });
  execSync(`pdftoppm -r 150 -png "${ruta}" "${R(".arnes/_pdf/qr/h")}"`);
  const leidos = [];
  for (let p = 1; p <= paginas; p++) {
    let out = "";
    try {
      out = execSync(`zbarimg -q --raw "${R(`.arnes/_pdf/qr/h-${p}.png`)}" 2>/dev/null`,
                     { encoding: "utf8" });
    } catch { out = "" }
    leidos.push(out.trim());
  }
  console.log("QR leídos: " + leidos.map((x) => x || "—").join("  "));

  ok(leidos.every((x) => x.length > 0),
     `hay hojas sin QR que se pueda leer: ${JSON.stringify(leidos)} — el rótulo sale igual de ` +
     "bien sin él, y el día que alguien quiera escanear no hay nada que escanear");

  /* Y EL QR LLEVA LA ESTIBA, NO EL MATERIAL. Las hojas 1 y 2 son del
     MISMO producto y solo se diferencian en el folio: si el QR llevara
     el SKU, escanear cualquiera de las dos abriría lo mismo y el FEFO
     no serviría para nada. */
  ok(leidos[0] !== leidos[1],
     `las dos estibas del mismo producto llevan el MISMO QR (${leidos[0]}): escanear cualquiera ` +
     "de las dos abriría lo mismo y el FEFO no serviría para nada");
  ok(leidos[0].includes("20260926-9845-AB12-01"),
     `el QR de la primera hoja dice «${leidos[0]}» y tiene que llevar su folio`);
  ok(leidos[0].startsWith("https://cd38.example/"),
     `el QR no apunta al dominio desde el que se imprimió: «${leidos[0]}»`);
}

console.log("");
if (fallas.length) {
  console.log("FALLAS:");
  fallas.forEach((f) => console.log(" · " + f));
  process.exit(1);
}
console.log("✓ El rótulo: un papel por estiba y numerado, el código y la cantidad impresos, " +
  "producto con vencimiento calculado y envase sin él, lo que falta escrito en vez de en " +
  "blanco, el QR y la marca de verdad en el PDF, y el vencimiento nunca inventado.");
