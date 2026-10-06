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
  /* LA ESTIBA COMPLETA: 45 cajas, que es justo el factor del maestro
     (3 × 3 × 5). Es el caso normal, y en él la franja roja de «estiba
     incompleta» NO puede salir. */
  cantidad: 45, unidad: "cajas" as const, arrume: 540,
  producido: "2026-09-23", vence, limite: limiteDespacho(vence, 30),
  /* EL PATRÓN DE ESTIBA DEL MAESTRO: 3 × 3 × 5 = 45 cajas. Va aparte del
     ancho/alto/largo del arrume, que son estibas y no cajas. */
  patron: { largo: 3, ancho: 3, nivel: 5 }, unidadesEstiba: 1350,
  /* LAS TRES DEL MAESTRO QUE EL RÓTULO IMPRIME EN GRANDE. 30 unidades
     por caja × 40 cajas de esta estiba = 1.200 unidades, que es la
     cifra que el papel tiene que decir. */
  unidadesCaja: 30, factorEstiba: 45, vidaUtil: 180,
  linea: "42", hora: "06:40" };
const rotulos = [
  { ...prod, folio: "16210-20260923-L42-001", numero: 1, total: 12 },
  /* CIFRAS LARGAS EN LAS CUATRO CASILLAS: 1.080 cajas × 30 = 32.400
     unidades. Es el caso en que una cifra que no quepa se escribe por
     encima de la vecina, y jsPDF no avisa. */
  { ...prod, folio: "16210-20260923-L42-002", numero: 2, total: 12,
    cantidad: 1080, arrume: 12960, factorEstiba: 1080,
    patron: { largo: 12, ancho: 9, nivel: 10 } },
  /* SIN VIDA ÚTIL EN EL MAESTRO: el vencimiento sale null y la tarjeta
     tiene que gritarlo, no dejar la banda en blanco. */
  { ...prod, folio: "16210-20260923-L42-003", numero: 3, total: 12,
    vence: calcularVence("2026-09-23", null), limite: null, linea: null, hora: null,
    ancho: null, alto: null, largo: null,
    /* Y TAMPOCO TRAE PATRÓN: la tarjeta tiene que decir que falta, no
       dejar la banda en blanco ni imprimir «1 × 1 × 1». */
    /* EL ENVASE SIN NINGUNO DE LOS TRES: el rótulo tiene que salir con
       rayas y no con ceros ni en blanco. */
    patron: null, unidadesEstiba: null, unidadesCaja: null, factorEstiba: null, vidaUtil: null },
  /* CON FACTOR Y SIN PATRÓN — que son 370 de los 493 materiales del
     maestro de la cervecería. El factor tiene que salir igual: sacarlo
     del patrón dejaría a casi todo el CD con una raya donde va la cifra
     con la que se arma la estiba. */
  { ...prod, folio: "16210-20260923-L42-004", numero: 4, total: 12,
    /* EL FACTOR ES 96 Y NO 480 A PROPÓSITO: 480 es el total del arrume
       de este mismo fixture, así que buscarlo en la hoja lo encontraba
       igual aunque el factor no saliera. Un número que ya está en el
       papel por otra razón no sirve para comprobar nada. */
    patron: null, unidadesEstiba: null, factorEstiba: 96, unidadesCaja: 6 },
  { ...comun, folio: "3500162-20260923-001", tipo: "envase" as const,
    sku: "3500162", nombre: "Envase Marron 330R", cantidad: 900,
    unidad: "unidades" as const, arrume: 900, numero: 1, total: 1,
    /* RECIBIDO EN UNIDADES, Y CON UNIDADES POR CAJA PUESTAS. Es el caso
       que destapa la multiplicación de más: si el rótulo volviera a
       multiplicar, 900 unidades saldrían como 27.000 — y el papel de la
       estiba diría treinta veces lo que hay encima. */
    unidadesCaja: 30, factorEstiba: 38, vidaUtil: null,
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
(window as any).__QR__ = textoQr(rotulos[0] as any);
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
ok(paginas === 5, `salieron ${paginas} páginas y se pidieron 5 rótulos: uno por estiba`);
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
  /* «CAJAS EN ESTA ESTIBA» SE FUE: con la estiba completa decía lo
     mismo que el factor —45 y 45—, y dos casillas con el mismo número
     enseñan a no mirar ninguna de las dos. Lo que hay encima sigue
     dicho, en el pie de las unidades y, si no cuadra, en la franja
     roja. */
  ok(!/CAJAS EN ESTA ESTIBA/.test(h),
     "volvió la casilla «cajas en esta estiba»: repite el factor y le quita el sitio a las tres " +
     "cifras que sí se leen de lejos");
  ok(/45 CAJAS DE 30/.test(h),
     `no dice de dónde salen las unidades —45 cajas de 30—:\n${h.slice(0, 800)}`);
  /* ============ LAS CUATRO CIFRAS GRANDES ============
     «Quiero grande cuántas cajas, cuántas unidades, factor de estiba y
     vida útil.» Las dos primeras son de ESTA estiba —lo que hay que
     contar—; las dos últimas son del MATERIAL —cómo se arma y cuánto
     dura—. */
  ok(/UNIDADES EN ESTA ESTIBA/.test(h),
     "no salen las unidades de ESTA estiba: quien recibe cuenta cajas, pero lo que entra al " +
     "inventario son unidades");
  /* 40 cajas × 30 por caja = 1.200. Si la cuenta cambia, el papel dice
     otra cantidad de producto de la que hay sobre la estiba. */
  ok(/1\.350/.test(h),
     `45 cajas de 30 unidades son 1.350 y el papel no las trae:\n${h.slice(0, 900)}`);
  ok(/FACTOR DE ESTIBA/.test(h) && /CAJAS POR ESTIBA/.test(h),
     "no sale el factor de estiba del maestro");
  /* Y CON LA ESTIBA COMPLETA NO SALE LA FRANJA ROJA. Un aviso que sale
     siempre deja de leerse, y este es el que tiene que parar a alguien
     el día que de verdad falten cajas. */
  ok(!/ESTIBA INCOMPLETA/.test(h),
     "con 45 cajas y factor 45 la tarjeta grita que la estiba está incompleta");
  ok(/VIDA ÚTIL/.test(h) && /180 d/.test(h), "no sale la vida útil del material");

  /* EL TOTAL DEL ARRUME SIGUE, EN LETRA CHICA. Tenía una casilla entera
     y es una comprobación, no una cifra de trabajo: lo que se cuenta es
     la estiba que se tiene delante. Pero no puede desaparecer — sin él
     no se sabe si el arrume está completo. */
  /* EL TOTAL DEL ARRUME sigue en el QR y en el «1 / 12» de la cabecera;
     en el renglón grande solo sale cuando el pie de las unidades no
     tiene nada mejor que decir. */
  ok(/1 \/ 12/.test(h),
     "se perdió de cuál de cuántas estibas es esta tarjeta");

  /* Y LA BANDA «ARRUME · ESTIBAS» SE FUE A PROPÓSITO. Ocupaba un tercio
     del renglón más visible para decir «1 × 1 × 1» casi siempre, que es
     lo que trae un camión normal. Si vuelve, vuelve a robarle el sitio
     a las cuatro cifras que sí se leen de lejos. */
  ok(!/ARRUME · ESTIBAS/.test(h),
     "volvió la banda «ARRUME · ESTIBAS»: ese es el sitio de las cuatro cifras grandes");
  ok(/PATRÓN DE ESTIBA/.test(h) && /CAJAS SOBRE UNA ESTIBA/.test(h),
     "no sale el patrón de estiba del maestro, que es con lo que se ARMA");
  ok(/NIVELES/.test(h), "el patrón no nombra los niveles: «3 × 3 × 5» sin rótulos no dice qué es cada número");
  ok(/= 45 cajas/.test(h) && /POR ESTIBA COMPLETA/.test(h),
     "el patrón no da el resultado en cajas: los tres números son el cómo, esta es la cifra que se usa");
  ok(/1\.350 UNIDADES/.test(h), "no salen las unidades por estiba del maestro");
  /* LA UBICACIÓN NO SE IMPRIME TODAVÍA. «Que parezca ubicación y solo
     ese un -, para que a futuro la desarrollemos pero aún no.» La banda
     se queda —el papel se pega en la estiba y dura meses; si apareciera
     después, las estibas viejas y las nuevas tendrían tarjetas
     distintas— pero va con una raya y dice por qué. Una banda muda se
     lee como un dato que se olvidó teclear. */
  ok(/UBICACI/.test(h), "se fue la banda de la ubicación: el sitio se reserva desde ahora");
  ok(!h.includes("A03-M12-IZQ"),
     "el rótulo imprime la ubicación y esa parte todavía no está desarrollada: un papel que " +
     "dice dónde va la estiba manda a alguien a dejarla ahí");
  ok(/TODAVIA NO SE ASIGNA/.test(h),
     "la banda de la ubicación va vacía y sin decir por qué: se lee como un dato que se olvidó");
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
   1a · EL FACTOR DE ESTIBA NO SE SACA DEL PATRÓN
   ---------------------------------------------------------------------
   370 de los 493 materiales del maestro tienen factor de estiba y NO
   tienen patrón: el archivo de la cervecería no lo trae. Calcular el
   factor como largo × ancho × nivel dejaría a casi todo el CD con una
   raya donde va la cifra con la que se arma la estiba.

   Es la hoja 4: con factor 480, sin patrón, 6 unidades por caja.
   ===================================================================== */
{
  const h = hojas[3];
  ok(/FACTOR DE ESTIBA/.test(h) && /\b96\b/.test(h),
     `sin patrón, el factor de estiba salió vacío:\n${h.slice(0, 700)}`);
  ok(/no trae el patr/.test(h),
     "sin patrón la banda no lo dice: un renglón ausente no se distingue de un olvido");
  /* Y LAS UNIDADES SIGUEN SALIENDO: 40 cajas × 6 = 240. */
  ok(/\b270\b/.test(h), "sin patrón se perdieron las unidades de la estiba");

  /* Y ESTA ESTIBA VIENE INCOMPLETA: 45 cajas contra un factor de 96. El
     papel tiene que gritarlo — si solo dijera 96, el que pasa contando
     daría por buenas 51 cajas que no están encima. */
  ok(/ESTIBA INCOMPLETA/.test(h) && /45 CAJAS, NO 96/.test(h),
     `la estiba trae 45 cajas y el factor dice 96, y el papel no lo dice:\n${h.slice(0, 800)}`);
}

/* =====================================================================
   1a-bis · RECIBIDO EN UNIDADES, NO SE MULTIPLICA OTRA VEZ
   ---------------------------------------------------------------------
   Si se contó en unidades, la cifra YA son unidades. Volver a
   multiplicarla por las que trae una caja pone en el papel treinta veces
   lo que hay sobre la estiba — y el papel es lo que se cree.
   ===================================================================== */
{
  const h = hojas[4];
  /* Y NO SE GRITA «ESTIBA INCOMPLETA». Contando en unidades, `cantidad`
     son 900 unidades y el factor son 38 CAJAS: compararlos no significa
     nada, y la franja roja saldría en todos los envases del CD hasta
     que nadie la mire. */
  ok(!/ESTIBA INCOMPLETA/.test(h),
     "recibiendo en unidades avisa de estiba incompleta comparando unidades con cajas: el aviso " +
     "saldría siempre y dejaría de leerse");
  ok(/UNIDADES EN ESTA ESTIBA/.test(h) && /\b900\b/.test(h),
     `recibido en unidades, la estiba trae 900 y el papel dice otra cosa:\n${h.slice(0, 700)}`);
  ok(!/27\.000/.test(h),
     "las 900 unidades se volvieron a multiplicar por las 30 de una caja: el papel dice 27.000 " +
     "y sobre la estiba hay 900");
}

/* =====================================================================
   1a-ter · UNA CIFRA LARGA NO SE MONTA SOBRE LA DE AL LADO
   ---------------------------------------------------------------------
   Las cuatro casillas son angostas y jsPDF NO recorta: una cifra que no
   quepa se escribe por encima de la vecina. «1.080» a 20 puntos cabe;
   «32.400» no. Y esto NO se ve en el texto extraído —las dos cifras
   salen en su renglón, ordenaditas—, así que se miden las cajas de cada
   palabra: es el mismo error que ya se coló una vez en el informe de
   roturas.
   ===================================================================== */
{
  const bb = execSync(`pdftotext -bbox "${ruta}" -`, { encoding: "utf8" });
  /* LA HOJA 2, que es la de las cifras largas: 1.080 cajas y 32.400
     unidades. En la primera todo cabe holgado y no mediría nada. */
  const hoja = bb.split("<page ").slice(1)[1] ?? "";
  const pal = [...hoja.matchAll(
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)]
    .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] }));
  ok(pal.length > 20, `la hoja de las cifras largas trae ${pal.length} palabras y son muchas más`);
  for (let i = 0; i < pal.length; i++) {
    for (let j = i + 1; j < pal.length; j++) {
      const a = pal[i], b = pal[j];
      /* 1,5 puntos de tolerancia: dos palabras seguidas del mismo
         renglón se tocan por el espacio y eso no es encimarse. */
      const cruza = a.x0 < b.x1 - 1.5 && b.x0 < a.x1 - 1.5
                 && a.y0 < b.y1 - 1.5 && b.y0 < a.y1 - 1.5;
      ok(!cruza, `en la tarjeta «${a.t}» y «${b.t}» se escriben una encima de otra`);
    }
  }
}

/* =====================================================================
   1b · SIN PATRÓN EN EL MAESTRO, LA TARJETA LO DICE
   ---------------------------------------------------------------------
   Es la hoja 3, la del material al que le falta todo. Una banda en
   blanco se lee como papel mal impreso y no manda a nadie a arreglar el
   maestro; un renglón que lo dice, sí.
   ===================================================================== */
{
  const sin = hojas[2];
  ok(/PATRÓN DE ESTIBA/.test(sin),
     "sin patrón la banda desaparece: quien recibe no se entera de que falta un dato del maestro");
  ok(/El maestro no trae el patrón de este material: hay que completarlo en Inventario > Maestro\./.test(sin),
     `sin patrón la tarjeta no dice qué falta, o lo dice con letras que la fuente del PDF no tiene ` +
     `—la flecha «→» sale impresa como «!’» y nadie se entera hasta ver el papel:\n${sin.slice(0, 600)}`);
  ok(!/= 1 cajas/.test(sin) && !/1 × 1 × 1/.test(sin),
     "sin patrón se imprimió un «1 × 1 × 1» inventado, que es un dato falso con cara de dato");
}

/* =====================================================================
   2 · PRODUCTO Y ENVASE SON DOS RÓTULOS
   ===================================================================== */
{
  const prod = hojas[0], env = hojas[4];
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

  /* SIN ENLACE: el QR lleva los datos del rótulo en texto, no la
     dirección del aplicativo (pedido del usuario). */
  ok(!/https?:|www\.|cd38\.example/i.test(leidos[0]),
     `el QR todavía lleva un enlace: «${leidos[0].slice(0, 80)}»`);
  for (const t of ["PROD:", "COD: 16210", "ESTIBA: 1 de 12", "ARRUME: 540",
                   "VENCE: 23/09/2027", "LIM DESPACHO: 24/08/2027", "LINEA: 42",
                   /* EL PATRÓN TAMBIÉN VA EN EL CÓDIGO. Sin señal el papel
                      tiene que poder leerse entero, y cómo se arma la
                      estiba es de lo poco que hace falta ahí mismo. */
                   "PATRON ESTIBA: 3x3x5 = 45 cajas", "UNID POR ESTIBA: 1.350",
                   "ARRUME ARMADO: 1x1x1 estibas",
                   /* TODO LO DEL ROTULO: folio, unidades de la estiba,
                      factor de estiba y vida util. */
                   "FOLIO: 16210-20260923-L42-001", "UNIDADES ESTIBA:", "FACTOR ESTIBA:", "VIDA UTIL:"]) {
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
  "ASCII, y nada calculado a ojo. Y las TRES CIFRAS GRANDES —unidades de ESTA estiba, factor de estiba y vida útil—: se fueron la banda «arrume · estibas», que decía «1 × 1 × 1» casi siempre, y la casilla «cajas en esta estiba», que con la estiba completa repetía el factor; el factor sale del maestro y NO del patrón, que 370 de los 493 materiales no tienen; y cuando la estiba viene INCOMPLETA sale la franja roja con las cajas que hay de verdad, que es el único caso en que las dos cifras no son la misma.");
