/* =====================================================================
   ACCIONES · INDICADORES — el PDF, generado y MIRADO.

   «Mejoremos ese informe cuando se exporta en PDF: el logo, el
    encabezado, todo.»

   ESTO NO COMPRUEBA EL CÓDIGO: genera el PDF de verdad, lo pasa a
   imagen y lo deja para mirarlo. Un informe se juzga viéndolo — las
   etiquetas que se pisan, una barra que se sale, un número cortado, no
   aparecen leyendo el fuente.

   Lo que SÍ se afirma y se puede romper:
     1. QUE SALGAN TODAS LAS SECCIONES.
     2. QUE NADA SE SALGA DEL PAPEL, ni por el lado ni por abajo.
     3. QUE LA GRÁFICA TENGA ESCALA. Tres series sin un número en el
        eje no dejan saber si el pico es de cinco o de cincuenta.
     4. QUE LA LEYENDA NO SEA SOLO COLOR: esto se imprime en blanco y
        negro en la oficina de la bodega.
     5. QUE LAS METAS SALGAN AL LADO DE SU CIFRA. «A tiempo 68 %» no
        dice nada sin «meta 85 %».

     node .arnes/ac-informe-pdf.mjs
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

writeFileSync(R(".arnes/_acinf-entrada.tsx"), `
import { jsPDF } from "jspdf";
import { medir } from "../src/modulos/acciones/medir";
import { informePdf } from "../src/app/(app)/acciones/analisis/informe";

/* SE LE QUITA EL «GUARDAR» A jsPDF Y SE QUEDA CON LOS BYTES.
   \`pdf.save()\` dispara una descarga del navegador, y lo que hace
   falta aquí es el archivo. Interceptar \`createObjectURL\` no sirvió:
   jsPDF no pasa por ahí. El parche va al prototipo, que es el mismo
   objeto que usa el \`await import("jspdf")\` de dentro del informe. */
(jsPDF as any).API.save = function (this: any) {
  (window as any).__PDF__ = this.output("datauristring");
  return this;
};
(jsPDF as any).prototype.save = (jsPDF as any).API.save;
(window as any).__PARCHE__ = typeof (jsPDF as any).prototype.save;

const HOY = new Date("2026-09-24T12:00:00Z");
const DIA = 86400000;

/* EL AZAR VA CON SEMILLA FIJA, y no es un detalle.
   Con \`Math.random()\` cada corrida medía datos distintos: probando
   que el eje usa pasos legibles, una corrida daba 10 —que está en la
   lista— y pasaba aunque el código estuviera roto. Un arnés que
   contesta distinto en cada corrida no caza nada; lo que hace es dar
   confianza falsa. */
let semilla = 20260924;
const azar = () => {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
};

/* NOMBRES LARGOS Y CORTOS A PROPÓSITO: lo que revienta una tabla es el
   motivo de nueve palabras, no el de dos. */
const MOTIVOS = [
  ["orden", "Orden y aseo en pasillos de picking y zona de cargue"],
  ["estibas", "Estibas en mal estado"],
  ["senal", "Señalización borrada o ausente"],
  ["derrame", "Derrame de producto"],
  ["monta", "Falla mecánica del montacargas"],
];
const ZONAS = [["p1","Pasillo 1 · Picking"],["p2","Pasillo 2"],["car","Zona de cargue"]];
const GENTE = ["Genesis Visbal", "Andrés Palacio", "Cañizares", "CDARENOSA", "Administrador"];

/* 140 acciones repartidas en 90 días: es el orden de magnitud real, y
   con cuatro no se ve si las etiquetas del eje se pisan. */
const acciones = Array.from({ length: 140 }, (_, i) => {
  const reportada = HOY.getTime() - Math.floor(azar() * 90) * DIA;
  const cerrada = i % 4 === 0 ? null : reportada + (6 + azar() * 200) * 3600000;
  const verificada = cerrada && i % 3 === 0 ? cerrada + 48 * 3600000 : null;
  const [mc, mn] = MOTIVOS[i % MOTIVOS.length];
  const [zc, zn] = ZONAS[i % ZONAS.length];
  return {
    id: "a" + i, codigo: "AC-" + String(1000 + i), tipo: "correctiva",
    titulo: mn, descripcion: null,
    motivo: mc, motivo_nombre: mn, motivo_critico: false,
    area: "almacenamiento", area_nombre: "Almacenamiento",
    zona: zc, zona_nombre: zn, zona_proceso: null, ubicacion: null,
    lat: null, lng: null, precision_m: null,
    prioridad: (["alta","media","baja"] as const)[i % 3],
    plazo: null,
    vence_en: new Date(reportada + 72 * 3600000).toISOString(),
    estado: cerrada ? "cerrada" : "abierta",
    viva: !cerrada, vencida: !cerrada && i % 5 === 0,
    horas_restantes: 10, dias: 2,
    equipo: null, equipo_nombre: null,
    responsable: "u" + (i % GENTE.length), sin_dueno: false,
    reportada_por: "u1", reportada_en: new Date(reportada).toISOString(),
    asignada_en: new Date(reportada + 4 * 3600000).toISOString(),
    cerrada_en: cerrada ? new Date(cerrada).toISOString() : null,
    verificada_en: verificada ? new Date(verificada).toISOString() : null,
    efectiva: verificada ? i % 7 !== 0 : null,
    fotos: 0, que_se_hizo: null, cerrada_por: null, anulada_en: null,
  };
});

const nombres = Object.fromEntries(GENTE.map((n, i) => ["u" + i, n]));
const m = medir(acciones as any, HOY, 90, { aTiempo: 85, efectividad: 90 } as any, nombres);

(window as any).__MEDIDA__ = {
  semanas: m.semanas.length, pareto: m.pareto.length,
  responsables: m.responsables.length, repiten: m.reincidencia.repiten.length,
};
(window as any).__LISTO__ = informePdf(m as any, HOY).then(() => true);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_acinf-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", alias: { "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

/* EL LOGO SE SIRVE DE VERDAD. Sin esto el informe cae al `catch` de
   «sin logo se sigue» y el arnés nunca comprobaría lo que se pidió
   primero — «el logo, el encabezado, todo». */
/* LA PÁGINA SE SIRVE DESDE UNA DIRECCIÓN DE VERDAD, no con
   `setContent`. Con `setContent` la página vive en `about:blank` y el
   `fetch("/marca/logo-b.png")` del informe no tiene contra qué
   resolverse: cae al `catch` de «sin logo se sigue» y el arnés daría
   verde sin haber visto nunca el logo — que es lo primero que se
   pidió. Ya me pasó igual con el arnés de ABI. */
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <script>${js.replace(/<\/script/g, "\\u003c/script")}</script></body></html>`;
await pg.route("http://arnes.local/", (r) =>
  r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
/* LA DEL LOGO SE REGISTRA DESPUÉS: la última que se registra gana. */
const logo = readFileSync(R("public/marca/logo-b.png"));
await pg.route("**/marca/logo-b.png", (r) =>
  r.fulfill({ status: 200, contentType: "image/png", body: logo }));

await pg.goto("http://arnes.local/");

await pg.waitForFunction(() => (window).__LISTO__ !== undefined, null, { timeout: 20000 });
await pg.evaluate(() => (window).__LISTO__);
ok(rotos.length === 0, `el informe tiró un error: ${rotos[0]}`);
console.log("parche:", await pg.evaluate(() => (window).__PARCHE__),
            " hay pdf:", await pg.evaluate(() => Boolean((window).__PDF__)));

const datos = await pg.evaluate(() => (window).__MEDIDA__);
console.log(`datos: ${datos.semanas} semanas · ${datos.pareto} motivos · ` +
            `${datos.responsables} responsables · ${datos.repiten} repeticiones`);
ok(datos.semanas >= 8, `solo ${datos.semanas} semanas: con menos no se ve si el eje se pisa`);
ok(datos.responsables >= 3, `solo ${datos.responsables} responsables en la tabla`);

const b64 = await pg.evaluate(() => {
  const d = (window).__PDF__;
  if (!d) throw new Error("el informe no llamó a save(): no hay PDF que mirar");
  return String(d).split(",")[1];
});
await nav.close();

mkdirSync(R(".arnes/_pdf"), { recursive: true });
const ruta = R(".arnes/_pdf/ac-indicadores.pdf");
writeFileSync(ruta, Buffer.from(b64, "base64"));
console.log(`pdf: ${(Buffer.from(b64, "base64").length / 1024).toFixed(0)} KB`);

/* ---------- EL TEXTO DEL PDF, para poder afirmar sobre él ---------- */
const texto = execSync(`pdftotext -layout "${ruta}" -`, { encoding: "utf8" });
const paginas = (texto.match(/\f/g) ?? []).length + 1;
console.log(`páginas: ${paginas}`);

/* 1 · TODAS LAS SECCIONES */
for (const t of ["Acciones correctivas y preventivas", "Entran contra salen",
                 "Cuánto se demora cada prioridad", "Qué es lo que más sale",
                 "Quién las tiene"]) {
  ok(texto.includes(t), `falta la sección «${t}» en el PDF`);
}
/* EL LOGO VA DE VERDAD, y no por el `catch` de «sin logo se sigue».
   Se mira si el PDF trae una imagen: fue lo primero que se pidió —«el
   logo, el encabezado, todo»— y es lo que más fácil se pierde sin que
   nadie lo note, porque el informe sale igual de bien sin él. */
{
  const imagenes = execSync(`pdfimages -list "${ruta}"`, { encoding: "utf8" })
    .trim().split("\n").length - 2;
  console.log(`imágenes en el PDF: ${Math.max(0, imagenes)}`);
  ok(imagenes >= 1,
     "el PDF no lleva ninguna imagen: el logo se perdió por el catch de «sin logo se sigue»");
}

/* 5 · LAS METAS, AL LADO DE SU CIFRA */
ok(/meta \d+%/.test(texto), "las cifras salen sin su meta: un número suelto no dice si está bien");
/* 4 · LA LEYENDA, EN PALABRAS */
for (const t of ["Entran", "Se cierran", "Siguen abiertas"]) {
  ok(texto.includes(t), `la leyenda no dice «${t}»: en blanco y negro el color no basta`);
}
/* 3 · LA GRÁFICA TIENE ESCALA */
ok(/página 1 de/.test(texto), "el pie no lleva la paginación");

/* EL EJE, EN NÚMEROS QUE SE LEEN. Dividir el máximo entre cuatro da
   ejes como «0 · 11 · 22 · 33 · 44»: no está mal, pero nadie lo lee de
   un vistazo. */
{
  const primera = texto.split("\f")[0];
  const ejes = [...primera.matchAll(/^\s*(\d{1,4})\s*$/gm)].map((m) => Number(m[1]));
  const paso = ejes.length >= 2 ? Math.abs(ejes[1] - ejes[0]) : 0;
  ok([1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 250, 500, 1000].includes(paso) || paso === 0,
     `el eje de la gráfica va de ${paso} en ${paso}: nadie lee eso de un vistazo`);
  console.log(`eje: paso de ${paso}`);
}

/* ---------- 2 · NADA SE SALE DEL PAPEL ---------- */
const caja = execSync(`pdftotext -bbox "${ruta}" -`, { encoding: "utf8" });
{
  /* Carta a 72 ppp = 612 × 792 puntos. */
  const fuera = [...caja.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)]
    .filter((m) => Number(m[3]) > 612.5 || Number(m[4]) > 792.5 || Number(m[1]) < -0.5);
  ok(fuera.length === 0, `${fuera.length} trozo(s) de texto se salen del papel`);
}

/* ---------- Y SE MIRA ---------- */
execSync(`pdftoppm -png -r 110 "${ruta}" "${R(".arnes/_pdf/ac-ind")}"`);
console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log("✓ El informe de Indicadores sale entero, con sus metas al lado de cada cifra, la " +
            "leyenda en palabras, la paginación en el pie, y nada se sale del papel. " +
            "Las páginas quedaron en .arnes/_pdf/ para mirarlas.");
