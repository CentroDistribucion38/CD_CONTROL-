/* =====================================================================
   LA RELACIÓN DEL PERÍODO — medida, no mirada.

   «Ayúdame a descargar la relación de un rango de fechas en los informes
   de la rotura de línea.» Un PDF consolidado con TODOS los días que
   tuvieron rotura, con o sin hoja.

   1. LAS FILAS: un día por fila, las líneas sumadas, solo días con
      rotura, del más viejo al más nuevo, y el estado correcto de cada uno.
   2. EL PAPEL: se genera con jsPDF de verdad y se lee con pdftotext.
   3. LA PANTALLA: el botón está en Informes y usa el rango elegido.
   ===================================================================== */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { jsPDF } from "jspdf";

const U = (p) => new URL(p, import.meta.url);
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

buildSync({ entryPoints: [R("src/modulos/rotlinea/relacion.ts")], bundle: true, format: "esm", platform: "node",
  outfile: R(".arnes/_relacion.mjs"), external: ["jspdf"], logLevel: "silent" });
const X = await import(U("./_relacion.mjs").href + "?v=" + Date.now());

/* ---- LOS DATOS: dos líneas por día, cinco estados ---- */
const DIAS = [
  { fecha: "2026-09-19", linea: 1, und: 100, kg: 17 }, { fecha: "2026-09-19", linea: 2, und: 20, kg: 3 },   // antes de la hoja
  { fecha: "2026-09-21", linea: 1, und: 700, kg: 120 }, { fecha: "2026-09-21", linea: 2, und: 375, kg: 60 }, // vigente 1075
  { fecha: "2026-09-22", linea: 1, und: 500, kg: 80 },                                                       // cambió: hoja 480
  { fecha: "2026-09-23", linea: 4, und: 90, kg: 15 },                                                        // solo anulada
  { fecha: "2026-09-24", linea: 1, und: 60, kg: 10 },                                                        // sin hoja
  { fecha: "2026-09-25", linea: 1, und: 0, kg: 0 },                                                          // sin rotura
  { fecha: "2026-10-02", linea: 1, und: 999, kg: 99 },                                                       // fuera del rango
];
const H = (id, fecha, und, gen, extra = {}) => ({ id, fecha, unidades: und, generado_en: gen,
  elaboro: "Santiago Leal", supervisor: "Génesis Visbal", anulada_en: null, ...extra });
const HOJAS = [
  H("a", "2026-09-21", 1070, "2026-09-21T20:00:00Z"),
  H("b", "2026-09-21", 1075, "2026-09-21T21:30:00Z", { elaboro: "Cristian Padilla" }),
  H("c", "2026-09-21", 1075, "2026-09-21T22:00:00Z", { anulada_en: "2026-09-22T10:00:00Z" }),
  H("d", "2026-09-22", 480, "2026-09-22T21:00:00Z", { supervisor: null }),
  H("e", "2026-09-23", 90, "2026-09-23T21:00:00Z", { anulada_en: "2026-09-24T09:00:00Z" }),
];
const rel = X.armarRelacion(DIAS, HOJAS, "2026-09-15", "2026-09-30");
const est = Object.fromEntries(rel.filas.map((f) => [f.fecha, f.estado]));
ok(rel.filas.map((f) => f.fecha).join(",") === "2026-09-19,2026-09-21,2026-09-22,2026-09-23,2026-09-24",
   `los días de la relación no son los de rotura en el rango, en orden: ${rel.filas.map((f) => f.fecha)}`);
ok(rel.filas[1].und === 1075 && Math.abs(rel.filas[1].kg - 180) < 1e-9, "no suma las líneas del día");
ok(est["2026-09-19"] === "antes", "un día de antes de la hoja sale como que le falta");
ok(est["2026-09-21"] === "vigente" && rel.filas[1].elaboro === "Cristian Padilla",
   "el día con hoja no toma la última que no se anuló");
ok(est["2026-09-22"] === "cambio" && rel.filas[2].undHoja === 480, "no dice que la hoja cambió después");
ok(est["2026-09-23"] === "anulada", "un día con solo hojas anuladas no sale como anulada");
ok(est["2026-09-24"] === "sin", "un día con rotura y sin hoja no sale SIN HOJA");
ok(rel.und === 120 + 1075 + 500 + 90 + 60, `el total del período no cuadra (${rel.und})`);
ok(rel.conHoja === 2 && rel.sinHoja === 1 && rel.cambio === 1 && rel.anuladas === 1,
   "los conteos de arriba no cuadran con las filas");

/* ---- EL PAPEL ---- */
const MARCA = {
  palabra: "data:image/png;base64," + readFileSync(R("public/marca/logo-bavaria.png")).toString("base64"),
  sello: "data:image/png;base64," + readFileSync(R("public/marca/logo-b.png")).toString("base64"),
};
const leer = (doc, n) => {
  const ruta = `/tmp/claude-0/${n}.pdf`;
  writeFileSync(ruta, Buffer.from(doc.output("arraybuffer")));
  const pags = execFileSync("pdftotext", ["-layout", ruta, "-"], { encoding: "utf8" }).split("\f").filter((p) => p.trim());
  return { ruta, pags, todo: pags.join("\n"), peso: statSync(ruta).size };
};
const p = leer(X.dibujarRelacion(jsPDF, rel, { generado: new Date("2026-09-30T15:00:00"), marca: MARCA }), "rl-relacion");
ok(/Relación del período/.test(p.todo) && /15 de septiembre de 2026 a 30 de septiembre de 2026/.test(p.todo),
   "el papel no dice qué período es");
ok(/1\.845\s+unidades rotas/.test(p.todo), "el total del período no sale arriba");
ok(/2 con hoja · 1 sin hoja · 1 cambiaron después · 1 anulada/.test(p.todo), "arriba no dice cuántos días tienen hoja");
ok(/Lun 21\/09\/2026\s+1\.075\s+180\s+CON HOJA\s+16:30\s+Cristian Padilla\s+Génesis Visbal/.test(p.todo),
   "la fila del día con hoja no se lee entera (la hora, en 24 horas y sin cortar)");
ok(!/…/.test(p.todo), "algo sale cortado con puntos suspensivos");
ok(/CAMBIÓ \(hoja 480\)/.test(p.todo), "el día que cambió no dice qué decía la hoja");
ok(/Jue 24\/09\/2026\s+60\s+10\s+SIN HOJA/.test(p.todo), "el día sin hoja no sale marcado");
ok(/ANTES DE LA HOJA/.test(p.todo) && /ANULADA/.test(p.todo), "faltan los estados de antes o de anulada");
ok(!/2026-10-02|02\/10\/2026|999/.test(p.todo), "se coló un día fuera del rango");
ok(/TOTAL DEL PERÍODO\s+1\.845/.test(p.todo), "la tabla no cierra con el total");
ok(p.pags.every((g, i) => g.includes(`Página ${i + 1} de ${p.pags.length}`) && /\bBavaria\b/.test(g)),
   "alguna página no dice su número o el pie no dice Bavaria");

/* UN PERÍODO LARGO se parte en páginas y repite los títulos. */
const largo = [];
for (let d = 0; d < 120; d++) {
  const f = new Date(Date.UTC(2026, 5, 1) + d * 864e5).toISOString().slice(0, 10);
  largo.push({ fecha: f, linea: 1, und: 10 + d, kg: 2 });
}
const q = leer(X.dibujarRelacion(jsPDF, X.armarRelacion(largo, [], "2026-06-01", "2026-09-28"),
  { generado: new Date(), marca: MARCA }), "rl-relacion-larga");
ok(q.pags.length >= 3, `120 días caben en ${q.pags.length} página(s): la prueba no midió cómo se parte`);
ok(q.pags.every((g) => /DÍA\s+UNIDADES\s+KG\s+HOJA/.test(g)), "una página siguiente no repite los títulos de la tabla");
const filas = (q.todo.match(/\d{2}\/\d{2}\/2026/g) ?? []).length;
ok(filas === 120, `se perdieron filas al partir en páginas: ${filas} de 120`);
ok(q.peso < 200_000, `la relación larga pesa ${Math.round(q.peso / 1024)} KB`);

/* SIN ROTURA, NO REVIENTA. */
const v = leer(X.dibujarRelacion(jsPDF, X.armarRelacion([], [], "2026-09-01", "2026-09-02"), { generado: new Date() }), "rl-relacion-vacia");
ok(/No hubo rotura registrada/.test(v.todo), "un período sin rotura no lo dice");

/* ---- LA PANTALLA ---- */
const sin = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const inf = sin(readFileSync(R("src/app/(app)/quiebra/rotura/tablero/informes/Informes.tsx"), "utf8"));
const pag = sin(readFileSync(R("src/app/(app)/quiebra/rotura/tablero/informes/page.tsx"), "utf8"));
ok(/<Informes [^>]*desde=\{desde\} hasta=\{hasta\}/.test(pag), "la página no le pasa el rango elegido a Informes");
ok(/armarRelacion\(dias, hojas, desde, hasta\)/.test(inf), "la relación no usa el rango elegido");
ok(/Descargar relación \(PDF\)/.test(inf) && /disabled=\{armando \|\| rel\.filas\.length === 0\}/.test(inf),
   "no está el botón de la relación, o se deja tocar sin rotura");
ok(!/^import .*jspdf/m.test(inf) && /import\("jspdf"\)/.test(inf), "jsPDF se carga al abrir la pantalla");
ok(/paleta: leerPaleta\(raiz\.current\)/.test(inf), "la relación no sale con los colores del tema");
ok(/doc\.save\(nombreRelacion\(desde, hasta\)\)/.test(inf), "el archivo no se llama con su rango");

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log(`✓ Relación del período: un día por fila con su estado, el total cierra, 120 días se parten en ${q.pags.length} páginas sin perder filas, y el botón usa el rango elegido.`);
