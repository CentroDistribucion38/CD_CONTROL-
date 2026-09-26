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
import { rotulosPdf, calcularVence, limiteDespacho, textoQr } from "../src/modulos/inventario/rotulo";

const comun = { ubicacion: "A03-M12-IZQ", placa: "JGY577", recibido: "2026-09-23",
  ancho: 1, alto: 1, largo: 1 };
const vence = calcularVence("2026-09-23", 365);
const prod = { ...comun, tipo: "producto" as const,
  sku: "16210", nombre: "Pony Malta Lta 330Cc X6 Nuevo",
  cantidad: 40, unidad: "cajas" as const, arrume: 480,
  producido: "2026-09-23", vence, limite: limiteDespacho(vence, 30),
  linea: "42", hora: "06:40" };
const rotulos = [
  { ...prod, folio: "16210-20260923-L42-001", numero: 1, total: 12 },
  { ...prod, folio: "16210-20260923-L42-002", numero: 2, total: 12 },
  /* SIN VIDA ÚTIL EN EL MAESTRO: el vencimiento sale null y la tarjeta
     tiene que gritarlo, no dejar la banda en blanco. */
  { ...prod, folio: "16210-20260923-L42-003", numero: 3, total: 12,
    vence: calcularVence("2026-09-23", null), limite: null, linea: null, hora: null,
    ancho: null, alto: null, largo: null },
  { ...comun, folio: "3500162-20260923-001", tipo: "envase" as const,
    sku: "3500162", nombre: "Envase Marron 330R", cantidad: 900,
    unidad: "unidades" as const, arrume: 900, numero: 1, total: 1,
    color: "Ámbar", origen: "CD Unión Apartado" },
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

/* LO QUE NO SE PUEDE CALCULAR, NO SE CALCULA. Se mide aquí y no en node
   porque es el mismo código que corre en el navegador. */
(window as any).__VENCE__ = {
  bien: calcularVence("2026-09-20", 180),
  sinVida: calcularVence("2026-09-20", null),
  sinFecha: calcularVence(null, 180),
  vidaCero: calcularVence("2026-09-20", 0),
  basura: calcularVence("no-es-fecha", 180),
  limite: limiteDespacho("2027-09-23", 30),
  limiteSinVence: limiteDespacho(null, 30),
  limiteSinDias: limiteDespacho("2027-09-23", null),
};
(window as any).__QR__ = textoQr(rotulos[0] as any, "https://cd38.example");
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

  /* EL LÍMITE DE DESPACHO ES UNA RESTA, y tampoco se inventa. */
  ok(v.limite === "2027-08-24",
     `30 días antes del 23/09/2027 dan ${v.limite} y deben dar 2027-08-24`);
  ok(v.limiteSinVence === null, `sin vencimiento se calculó un límite: ${v.limiteSinVence}`);
  ok(v.limiteSinDias === null, `sin días mínimos se calculó un límite: ${v.limiteSinDias}`);
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
for (const n of ["1 / 12", "2 / 12", "3 / 12", "1 / 1"]) {
  ok(texto.includes(n),
     `falta «${n}»: doce papeles iguales en la mano no se pueden repartir entre doce estibas`);
}

/* =====================================================================
   1 · LO QUE TIENE QUE ESTAR
   ===================================================================== */
{
  const h = hojas[0];
  ok(h.includes("16210"), `la primera hoja no trae el código del material:\n${h.slice(0, 400)}`);
  ok(/PONY MALTA LTA 330CC X6 NUEVO/i.test(h), "la primera hoja no trae el nombre del producto");
  ok(/BARRANQUILLA/.test(h) && /TARJETA DE ARRUME/.test(h),
     "la cabecera no dice qué tarjeta es ni de dónde");
  ok(/CAJAS EN ESTA ESTIBA/.test(h) && /\b40\b/.test(h),
     "no salen las cajas de ESTA estiba");
  ok(/TOTAL DEL ARRUME/.test(h) && /480/.test(h),
     "no sale el total del arrume: sin él no se sabe si el arrume está completo");
  ok(/DIMENSIONES/.test(h) && /ANCHO/.test(h) && /LARGO/.test(h),
     "no salen las dimensiones del arrume");
  ok(h.includes("A03-M12-IZQ"), "no sale la ubicación: es lo que contesta «¿dónde la pongo?»");
  ok(h.includes("16210-20260923-L42-001"), "no sale el folio, que es lo que identifica la estiba");
  ok(/RESPONSABLE DE LA MARCACI/.test(h) && /VERIFIC/.test(h), "faltan las dos firmas");

  /* Y EL FOLIO NO SE MONTA SOBRE LAS FIRMAS. Pasó: con el código
     midiéndose por el alto libre a secas, la cinta negra del folio caía
     ENCIMA de «RESPONSABLE DE LA MARCACIÓN» y las dos cosas quedaban
     ilegibles. `pdftotext -layout` conserva los renglones, así que si
     los dos textos salen en la MISMA línea es que están a la misma
     altura en el papel. */
  const renglon = h.split("\n").find((l) => l.includes("16210-20260923-L42-001")) ?? "";
  ok(!/RESPONSABLE|VERIFIC/.test(renglon),
     `el folio se monta sobre la línea de las firmas: «${renglon.trim()}»`);
  ok(/Toda la estiba est/.test(h), "falta la explicación del código");
}

/* =====================================================================
   2 · PRODUCTO Y ENVASE SON DOS RÓTULOS
   ===================================================================== */
{
  const prod = hojas[0], env = hojas[3];
  ok(/FECHA DE VENCIMIENTO/.test(prod),
     "la tarjeta de producto no lleva el vencimiento, que es lo que manda en el FEFO");
  /* LA BANDA VA EN TRES CASILLAS: día, mes y año corto. 23/09/2027. */
  ok(/\b23\b/.test(prod) && /\b27\b/.test(prod),
     `el vencimiento no sale en la banda de tres casillas:\n${prod.slice(0, 500)}`);
  ok(/PRODUCCI/.test(prod) && /23\/09\/2026/.test(prod), "no sale la fecha de producción");
  /* LÍM. DESPACHO = vence menos los días mínimos del maestro. 30 días
     antes del 23/09/2027 es el 24/08/2027 — la misma cuenta de la
     tarjeta que sirvió de modelo. */
  ok(/DESPACHO/.test(prod) && /24\/08\/2027/.test(prod),
     `el límite de despacho no sale o está mal calculado:\n${prod.slice(0, 500)}`);
  ok(/L\u00cdNEA|LINEA/.test(prod) && /42/.test(prod), "no sale la línea de producción");
  ok(/06:40/.test(prod), "no sale la hora");

  /* EL ENVASE NO VENCE: una banda «FECHA DE VENCIMIENTO» vacía enseña
     que ahí falta un dato que no existe, y manda a alguien a buscarlo. */
  ok(!/FECHA DE VENCIMIENTO/.test(env),
     `la tarjeta de envase lleva la banda del vencimiento:\n${env.slice(0, 400)}`);
  ok(!/DESPACHO/.test(env), "la tarjeta de envase lleva el límite de despacho");
  ok(/COLOR DEL VIDRIO/.test(env) && /mbar/.test(env),
     "la tarjeta de envase no lleva el color del vidrio, que es lo suyo");
  ok(/VIENE DE/.test(env) && /Apartado/.test(env), "la tarjeta de envase no dice de dónde vino");
  ok(/UNIDADES EN ESTA ESTIBA/.test(env),
     "el envase se cuenta en unidades y la tarjeta no lo dice");
  /* Y SIGUE SIENDO LA MISMA TARJETA: mismo encabezado, mismas firmas.
     Se reconocen desde lejos como lo mismo. */
  ok(/TARJETA DE ARRUME/.test(env) && /VERIFIC/.test(env),
     "la tarjeta de envase perdió el encabezado o las firmas: ya no es la misma tarjeta");
}

/* =====================================================================
   5 · LO QUE FALTA SE DICE, NO SE DEJA EN BLANCO
   ===================================================================== */
{
  const sin = hojas[2];
  ok(/SIN FECHA DE VENCIMIENTO/i.test(sin) && /FEFO/i.test(sin),
     `la estiba sin vencimiento no lo grita:\n${sin.slice(0, 500)}`);
  /* Y LAS DIMENSIONES VACÍAS SALEN CON RAYA, no en blanco: un hueco
     parece papel mal impreso; la raya dice que el dato no estaba. */
  ok(/—/.test(sin), "los datos que faltan salen en blanco en vez de decirlo con una raya");
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
  ok(leidos[0].includes("16210-20260923-L42-001"),
     `el QR de la primera hoja no lleva su folio: «${leidos[0]}»`);

  /* EL QR SE LEE CON EL LOGO ENCIMA, y esto es lo que de verdad hay que
     sostener: el logo tapa el centro del código. Que los cuatro se
     decodifiquen —ya comprobado arriba— es la prueba de que el nivel de
     corrección aguanta ese tapón. Con el nivel medio no aguantaría, y
     no habría ningún error: simplemente el teléfono no leería nada, y
     nadie se enteraría hasta intentarlo en el muelle. */

  /* Y LLEVA EL ENLACE **Y** LOS DATOS, que es lo que promete la
     tarjeta: «con señal abre la estiba en CONTROL; sin señal se lee
     igual como texto». */
  ok(leidos[0].startsWith("https://cd38.example/a/"),
     `el QR no arranca con la dirección que abre la estiba: «${leidos[0].slice(0, 60)}»`);
  for (const t of ["PROD:", "COD: 16210", "ESTIBA: 1 de 12", "ARRUME: 480",
                   "VENCE: 23/09/2027", "LIM DESPACHO: 24/08/2027", "LINEA: 42"]) {
    ok(leidos[0].includes(t),
     `al QR le falta «${t}»: sin señal el papel tiene que poder leerse entero`);
  }
  /* TODO EN ASCII: los acentos obligan al código a crecer, y en la
     tarjeta que sirvió de modelo el «·» ya había salido convertido en
     basura dentro del propio QR. */
  ok(!/[^\x00-\x7F]/.test(leidos[0]),
     `el QR lleva caracteres fuera de ASCII y se van a leer mal: «${
       (leidos[0].match(/[^\x00-\x7F]/g) ?? []).join("")}»`);
}

console.log("");
if (fallas.length) {
  console.log("FALLAS:");
  fallas.forEach((f) => console.log(" · " + f));
  process.exit(1);
}
console.log("✓ La tarjeta de arrume: una por estiba y numerada N/M, cajas de la estiba y total del " +
  "arrume, el vencimiento en su banda y el límite de despacho calculado, el envase sin fechas " +
  "pero con la misma tarjeta, el QR se LEE con el logo encima y lleva el enlace y los datos en " +
  "ASCII, y nada calculado a ojo.");
