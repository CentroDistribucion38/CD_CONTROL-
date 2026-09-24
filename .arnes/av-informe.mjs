/* =====================================================================
   AVERÍAS — LOS HALLAZGOS Y EL PAPEL, medidos.

   1. LOS HALLAZGOS son una función pura: entra una lista de averías,
      sale una lista de conclusiones. Se miden SIN generar un PDF, que
      es lo único que permite comprobar que la conclusión es la
      correcta: una conclusión mal sacada se lee perfectamente normal
      en un papel bonito.
   2. NO SE INVENTAN cuando no hay de dónde: un porcentaje sobre cuatro
      cajas no es una concentración, es el azar.
   3. EL PAPEL los dice, con su cuenta al lado, y es el mismo diseño de
      la hoja de rotura de línea.
   ===================================================================== */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { transformSync } from "esbuild";
import { jsPDF } from "jspdf";

const U = (p) => new URL(p, import.meta.url);
const compila = (ruta, salida, repl = []) => {
  let js = transformSync(readFileSync(U(ruta), "utf8"), { loader: "ts", format: "esm" }).code;
  for (const [a, b] of repl) js = js.replaceAll(a, b);
  writeFileSync(U(salida), js);
  return import(U(salida).href + "?v=" + Date.now());
};
const HA = await compila("../src/modulos/averias/hallazgos.ts", "./_av-hallazgos.mjs");
await compila("../src/modulos/rotlinea/hoja.ts", "./_av-hoja.mjs");
const IN = await compila("../src/modulos/averias/informe.ts", "./_av-informe.mjs",
  [['"@/modulos/rotlinea/hoja"', '"./_av-hoja.mjs"'], ['"./hallazgos"', '"./_av-hallazgos.mjs"']]);

const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

const png = (r) => "data:image/png;base64," + readFileSync(U(r)).toString("base64");
const MARCA = { palabra: png("../public/marca/logo-bavaria.png"), sello: png("../public/marca/logo-b.png") };
const HOY = "2026-09-24";

let seq = 40;
const av = (o) => ({
  codigo: `AV-${String(seq++).padStart(4, "0")}`,
  fecha: "2026-09-20", ubicacion: "A03 · M12",
  producto_codigo: "3128", producto: "Águila RN 330cc X30",
  cajas: 5, unidades: 150, vence: "2027-07-20", causal: "deposito",
  reporto: "Genesis Visbal", documento: "BJ-77118", documento_en: "2026-09-22", ...o,
});

/* ============ 1 · LA CONCENTRACIÓN POR CALLE, Y DE QUÉ ES ========= */
{
  const datos = [
    av({ ubicacion: "A01 · M02", cajas: 12, unidades: 360, causal: "deposito" }),
    av({ ubicacion: "A03 · M12", cajas: 10, unidades: 300, causal: "deposito" }),
    av({ ubicacion: "B01 · M04", cajas: 6,  unidades: 180, causal: "transporte" }),
    av({ ubicacion: "C02 · M07", cajas: 5,  unidades: 150, causal: "transporte" }),
    av({ ubicacion: "E01 · M01", cajas: 3,  unidades: 90,  causal: "contaminado" }),
  ];
  const h = HA.hallazgos(datos, HOY);
  const calle = h.find((x) => /calle A/.test(x.dice));
  ok(calle, `no salió el hallazgo de la calle: ${JSON.stringify(h.map((x) => x.dice))}`);
  /* 22 de 36 = 61 %. Si la cuenta cambia, el informe afirma otra cosa. */
  ok(calle?.cifra === "61 %", `la concentración de la calle A dice ${calle?.cifra} y son 22 de 36 = 61 %`);
  ok(calle?.peso === "alto", "una concentración del 61 % debería pesar alto");
  /* Y LO QUE VALE ES LA SEGUNDA LÍNEA: las 22 son de depósito, así que
     el problema es del sitio y no del viaje. */
  ok(/del sitio/.test(calle?.porque ?? ""),
     `con el 100 % de depósito debería decir que es del sitio: «${calle?.porque}»`);
  ok(/22 de 36/.test(calle?.cuenta ?? ""), `la cuenta que lo sostiene dice «${calle?.cuenta}»`);
}
{
  /* LA MISMA CONCENTRACIÓN PERO DE TRANSPORTE dice lo CONTRARIO: el
     camión no es de la calle. Es el hallazgo que más fácil se saca al
     revés. */
  const datos = [
    av({ ubicacion: "A01 · M02", cajas: 12, unidades: 360, causal: "transporte" }),
    av({ ubicacion: "A03 · M12", cajas: 10, unidades: 300, causal: "transporte" }),
    av({ ubicacion: "B01 · M04", cajas: 6,  unidades: 180, causal: "deposito" }),
    av({ ubicacion: "C02 · M07", cajas: 5,  unidades: 150, causal: "deposito" }),
    av({ ubicacion: "E01 · M01", cajas: 3,  unidades: 90,  causal: "contaminado" }),
  ];
  const calle = HA.hallazgos(datos, HOY).find((x) => /calle A/.test(x.dice));
  ok(/llega averiado/.test(calle?.porque ?? ""),
     `con el 0 % de depósito debería decir que llega averiado: «${calle?.porque}»`);
}

/* ============ 2 · NO SE INVENTAN HALLAZGOS SIN MATERIAL =========== */
{
  const dos = [av({ ubicacion: "A01 · M02", cajas: 3, unidades: 90 }),
               av({ ubicacion: "B01 · M04", cajas: 1, unidades: 30 })];
  const h = HA.hallazgos(dos, HOY);
  ok(!h.some((x) => /calle/.test(x.dice)),
     "sacó una concentración de calle con 4 cajas: eso es azar, no un hallazgo");
  ok(HA.hallazgos([], HOY).length === 0, "sin averías igual sacó hallazgos");
}

/* ============ 3 · LO QUE SIGUE CONTANDO EN EL INVENTARIO ========== */
{
  const datos = [
    av({ cajas: 12, unidades: 360, documento: null, documento_en: null, fecha: "2026-09-10" }),
    av({ cajas: 9,  unidades: 270, documento: null, documento_en: null, fecha: "2026-09-22" }),
    av({ cajas: 5,  unidades: 150 }),
  ];
  const h = HA.hallazgos(datos, HOY).find((x) => /sin documento de baja/.test(x.dice));
  ok(h, "no avisó de las averías sin documento de baja");
  ok(h?.cifra === "2", `dice ${h?.cifra} y son 2`);
  ok(/21 cajas \(630 unidades\)/.test(h?.porque ?? ""),
     `debería sumar 21 cajas y 630 unidades: «${h?.porque}»`);
  /* LA MÁS VIEJA LLEVA 14 DÍAS: con 7 o más, el hallazgo pesa alto. */
  ok(/14 días/.test(h?.porque ?? ""), `no dice cuánto lleva la más vieja: «${h?.porque}»`);
  ok(h?.peso === "alto", "dos semanas de producto fantasma en el inventario debería pesar alto");
}

/* ============ 4 · LO QUE VA A VENCER ESTANDO AVERIADO ============= */
{
  const datos = [
    av({ cajas: 8, unidades: 240, vence: "2026-09-28" }),
    av({ cajas: 4, unidades: 120, vence: "2026-10-20" }),
    av({ cajas: 6, unidades: 180, vence: "2027-05-01" }),
  ];
  const h = HA.hallazgos(datos, HOY).find((x) => /vencen dentro de 30 días/.test(x.dice));
  ok(h, "no avisó de lo que vence en 30 días");
  ok(h?.cifra === "12", `debería contar 12 cajas (8 + 4) y dice ${h?.cifra}`);
  ok(/4 días/.test(h?.porque ?? ""), `la más próxima vence en 4 días: «${h?.porque}»`);
  ok(h?.peso === "alto", "algo que vence en 4 días debería pesar alto");
  /* Y LO QUE VENCE EN UN AÑO NO ENTRA. */
  ok(!/2027/.test(h?.cuenta ?? ""), "metió en la cuenta algo que vence el año que viene");
}

/* ============ 5 · UN SOLO REPORTANTE ============================== */
{
  const datos = Array.from({ length: 6 }, () => av({ reporto: "Genesis Visbal" }));
  const h = HA.hallazgos(datos, HOY).find((x) => /una sola persona/.test(x.dice));
  ok(h, "con seis averías y un solo reportante no dijo nada");
  ok(/no reportan/.test(h?.porque ?? ""),
     "no explica que el problema es de reporte y no de que los otros turnos no rompan");
  const dos = HA.hallazgos([av({ reporto: "A" }), av({ reporto: "B" })], HOY);
  ok(!dos.some((x) => /una sola persona/.test(x.dice)), "lo sacó con dos reportantes distintos");
}

/* ============ 6 · LO ALTO VA PRIMERO ============================== */
{
  const datos = [
    av({ ubicacion: "A01 · M02", cajas: 12, unidades: 360, documento: null, documento_en: null, fecha: "2026-09-05" }),
    av({ ubicacion: "A03 · M12", cajas: 10, unidades: 300 }),
    av({ ubicacion: "B01 · M04", cajas: 6,  unidades: 180, causal: "transporte" }),
    av({ ubicacion: "C02 · M07", cajas: 5,  unidades: 150, causal: "transporte" }),
    av({ ubicacion: "E01 · M01", cajas: 3,  unidades: 90,  causal: "contaminado" }),
  ];
  const h = HA.hallazgos(datos, HOY);
  const pesos = h.map((x) => x.peso);
  const orden = { alto: 0, medio: 1, dato: 2 };
  ok(pesos.every((p, i) => i === 0 || orden[pesos[i - 1]] <= orden[p]),
     `los hallazgos no vienen ordenados por peso: ${JSON.stringify(pesos)}`);
  ok(h.every((x) => x.cuenta && x.cuenta.length > 3),
     "hay un hallazgo sin la cuenta que lo sostiene: habría que creerle");
}

/* ============ 7 · EL PAPEL ======================================== */
{
  const datos = [
    av({ ubicacion: "A03 · M12", cajas: 12, unidades: 360, fecha: "2026-09-23",
         documento: null, documento_en: null, producto: "Águila RN 330cc X30" }),
    av({ ubicacion: "B01 · M04", cajas: 5, unidades: 150, fecha: "2026-09-22", causal: "transporte",
         producto: "Poker R 330cc X30", producto_codigo: "2512", vence: "2026-10-12",
         reporto: "Santiago Leal", documento: "BJ-77120", documento_en: "2026-09-23" }),
    av({ ubicacion: "A01 · M02", cajas: 9, unidades: 270, fecha: "2026-09-22", causal: "contaminado",
         producto: "Costeñita 175R X30", producto_codigo: "3500", vence: "2026-11-03",
         documento: null, documento_en: null }),
    av({ ubicacion: "C02 · M07", cajas: 3, unidades: 90, fecha: "2026-09-21",
         reporto: "Santiago Leal", documento: "BJ-77118", documento_en: "2026-09-23" }),
    av({ ubicacion: "A03 · M12", cajas: 7, unidades: 210, fecha: "2026-09-21", causal: "transporte",
         producto: "Poker R 330cc X30", producto_codigo: "2512", vence: "2026-10-12",
         documento: "BJ-77118", documento_en: "2026-09-23" }),
  ];
  const D = { hoy: HOY, periodo: "septiembre de 2026", filtros: "", averias: datos };
  const doc = IN.dibujarInformeAverias(jsPDF, D,
    { generado: new Date("2026-09-24T08:32:00"), marca: MARCA });
  const ruta = "/tmp/claude-0/av-informe.pdf";
  writeFileSync(ruta, Buffer.from(doc.output("arraybuffer")));
  const todo = execFileSync("pdftotext", ["-layout", ruta, "-"], { encoding: "utf8" });

  ok(/Averías del período/.test(todo), "el papel no dice qué es");
  ok(/CENTRO DE DISTRIBUCIÓN CD38 · CONTROL/.test(todo), "falta la línea del centro");
  ok(/Hallazgos/.test(todo), "el papel no trae los hallazgos");
  /* LOS HALLAZGOS VAN ANTES DE LA TABLA: un informe que empieza por una
     tabla obliga a cada quien a sacar sus propias conclusiones. */
  ok(todo.indexOf("Hallazgos") < todo.indexOf("Las averías"),
     "los hallazgos van DESPUÉS de la tabla: así nadie los lee");
  ok(/36/.test(todo), "el total de 36 cajas no aparece");
  ok(/1\.080/.test(todo) || /1080/.test(todo), "el total de unidades no aparece");
  ok(/Pendiente/.test(todo), "no marca las que no tienen documento de baja");
  for (const a of datos) ok(todo.includes(a.codigo), `la tabla no trae ${a.codigo}`);
  for (const c of ["Avería transporte", "Avería depósito", "Producto contaminado"]) {
    ok(todo.includes(c), `falta la causal «${c}»`);
  }
  ok(/Página 1 de \d/.test(todo), "el pie no numera las páginas");
  ok(/Bavaria/.test(todo), "el pie no dice Bavaria");
  /* EL PIE NO SE CORTA A LA MITAD DE UNA PALABRA. Cortado en seco
     —«…todas las averías del»— se lee como un error de la app. */
  ok(!/ del\s*$/m.test(todo) && !/ las\s*$/m.test(todo),
     "el pie quedó cortado a la mitad de una palabra");
  ok(statSync(ruta).size < 400_000, "el PDF pesa demasiado para mandarlo");

  /* NADA SE SALE DEL MARGEN, ni con 60 averías. */
  const muchas = Array.from({ length: 60 }, (_, i) =>
    av({ cajas: 9, unidades: 270, ubicacion: `A0${i % 9} · M1${i % 9}`,
         producto: "Producto de nombre bastante largo 330cc X30" }));
  const g = IN.dibujarInformeAverias(jsPDF,
    { ...D, averias: muchas, filtros: "causal Avería depósito · calle A" },
    { generado: new Date("2026-09-24T08:32:00"), marca: MARCA });
  const r2 = "/tmp/claude-0/av-informe-largo.pdf";
  writeFileSync(r2, Buffer.from(g.output("arraybuffer")));
  const bbox = execFileSync("pdftotext", ["-bbox", r2, "-"], { encoding: "utf8" });
  const MARGEN = 595.28 - 14 * 72 / 25.4 + 1.5;
  const fuera = [...bbox.matchAll(/<word xMin="[\d.]+" yMin="[\d.]+" xMax="([\d.]+)"[^>]*>([^<]*)</g)]
    .filter((m) => +m[1] > MARGEN).map((m) => m[2]);
  ok(fuera.length === 0, `se salen del margen: ${JSON.stringify(fuera.slice(0, 6))}`);
  const pgs = execFileSync("pdftotext", ["-layout", r2, "-"], { encoding: "utf8" }).split("\f");
  ok(pgs.length >= 3, "con 60 averías debería partir en varias páginas");
  ok(/continúa/.test(pgs[1] ?? ""), "la tabla sigue sin volver a poner el encabezado");
}

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Averías: los hallazgos salen de la cuenta y no de una frase —la concentración de calle dice " +
            "«del sitio» cuando es depósito y «llega averiado» cuando es transporte—, no se inventan sin material, " +
            "avisan de lo que el inventario sigue contando y de lo que vence en 30 días, y lo alto va primero " +
            "con su cuenta al lado. El papel los pone ANTES de la tabla, es el diseño de la hoja de rotura de línea, " +
            "y con 60 averías parte páginas sin salirse del margen.");
