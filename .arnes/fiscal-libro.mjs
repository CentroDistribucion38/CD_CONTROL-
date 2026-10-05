/* El Excel único del cruce fiscal, con datos de prueba: node .arnes/fiscal-libro.mjs [salida.xlsx]
   Arma el libro, lo relee con exceljs y comprueba lo que tiene que decir. */
import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
buildSync({ entryPoints: [R("src/modulos/inventario/libro-cruce-fiscal.ts")], bundle: true, format: "esm", platform: "node", outfile: R(".arnes/tmp/libro-cruce.mjs"), logLevel: "silent", external: ["exceljs"] });
const { armarCruceFiscal, exactitud, cajasDistintas, lecturaHoja } = await import(pathToFileURL(R(".arnes/tmp/libro-cruce.mjs")).href);
const ExcelJS = (await import("exceljs")).default;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

const F = (ubicacion, sku, material, venc, ol, ba) => ({ ubicacion, sku, material, vencDia: venc[0], vencMes: venc[1], vencAnio: venc[2],
  cajasOl: ol, cajasBavaria: ba, diferencia: (ol ?? 0) - (ba ?? 0), estado: ol === null ? "SOLO_BAVARIA" : ba === null ? "SOLO_OL" : ol === ba ? "COINCIDE" : "DIFIERE" });
const hojas = [
  { numero: 1, ol: "Carlos Mejía", bavaria: "Génesis Visbal", estado: "lista", olRenglones: 6, bavariaRenglones: 6, filas: [
    F("A · 01 · DER", "3500887", "Botella Flint 1000R", [null, 6, 2027], 1200, 1200),
    F("A · 01 · DER", "3500005", "Envase Costeñita 175R", [null, 3, 2027], 3888, 3780),
    F("A · 02 · IZQ", "3128", "Águila RN 330cc X30", [15, 11, 2026], 540, 540),
    F("A · 02 · IZQ", "3128", "Águila RN 330cc X30", [20, 12, 2026], 180, null),
    F("B · 12 · IZQ", "3500887", "Botella Flint 1000R", [null, 6, 2027], 960, 1020),
    F("B · 12 · DER", "3617", "Costeña R 175cc X 38", [null, null, null], 0, 0) ] },
  { numero: 2, ol: "Ana Pérez", bavaria: "Santiago Leal", estado: "lista", olRenglones: 3, bavariaRenglones: 3, filas: [
    F("C · 03 · DER", "3500005", "Envase Costeñita 175R", [null, 3, 2027], 2000, 2000),
    F("C · 03 · IZQ", "3128", "Águila RN 330cc X30", [15, 11, 2026], 360, 360),
    F("C · 04 · DER", "3617", "Costeña R 175cc X 38", [null, 9, 2026], null, 144) ] },
  { numero: 3, ol: "Luis Rojas", bavaria: null, estado: "una-termino", olRenglones: 4, bavariaRenglones: 0, filas: null },
  { numero: 4, ol: null, bavaria: null, estado: "sin-empezar", olRenglones: 0, bavariaRenglones: 0, filas: null },
];
/* Lo que anotó cada persona: sale de las mismas filas (estibas × 54 + saldo para los de 54 por estiba, cajas sueltas para el resto). */
const conteosDe = (h, hora, quitar = {}) => h.filas.flatMap((f, i) => ["OL", "BAVARIA"].flatMap((eq) => {
  const t = eq === "OL" ? f.cajasOl : f.cajasBavaria;
  if (t === null) return [];
  const con = f.sku === "3128" || f.sku === "3500887";
  const tot = t + (quitar[eq + i] ?? 0);
  return [{ equipo: eq, persona: eq === "OL" ? h.ol : h.bavaria, ubicacion: f.ubicacion, sku: f.sku, material: f.material,
    cajasPorEstiba: con ? 54 : null, estibas: con ? Math.floor(tot / 54) : null, saldo: con ? tot % 54 : null, cajas: con ? null : tot, totalCajas: tot,
    vencDia: f.vencDia, vencMes: f.vencMes, vencAnio: f.vencAnio, nota: i === 0 && eq === "OL" ? "pallet mojado" : null,
    contadoEn: `2026-10-02T${String(14 + (eq === "OL" ? 0 : 1)).padStart(2, "0")}:${String(10 + i).padStart(2, "0")}:00Z` }];
}));
hojas[0].conteos = conteosDe(hojas[0]); hojas[0].olTermino = "2026-10-02T20:30:00Z"; hojas[0].bavariaTermino = "2026-10-02T21:00:00Z";
hojas[1].conteos = conteosDe(hojas[1], null, { BAVARIA1: 1 }); hojas[1].olTermino = "2026-10-02T20:10:00Z"; hojas[1].bavariaTermino = "2026-10-02T20:40:00Z";   // Bavaria 1 caja de más: no cuadra
hojas[2].olTermino = "2026-10-02T20:00:00Z";
const logo = readFileSync(R("public/marca/logo-b.png"));
const buf = await armarCruceFiscal({ nombre: "FISCAL OCTUBRE 2026 · viernes 02/10", fecha: "2026-10-02", quien: "Cristian Padilla", hojas, sello: logo });
const salida = process.argv[2] ?? R(".arnes/tmp/cruce-fiscal.xlsx");
writeFileSync(salida, Buffer.from(buf));

const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
ok(wb.worksheets.map((w) => w.name).join() === "Resumen,Diferencias,Por material,Por persona,Conteos por persona,Conteos cruzados", "pestañas: " + wb.worksheets.map((w) => w.name));
const det = wb.getWorksheet("Conteos cruzados");
const filasDet = []; det.eachRow((r, n) => { if (n > 7) filasDet.push(r.values.slice(2)) });
ok(filasDet.length === 9, "el detalle trae las 9 filas de las 2 hojas cruzadas: " + filasDet.length);
ok(filasDet.every((f) => f[0] === 1 || f[0] === 2), "solo hojas cruzadas en el detalle");
const rs = wb.getWorksheet("Resumen");
const fila = (n) => rs.getRow(n).values.slice(2).map((v) => (v && typeof v === "object" && "result" in v ? v.result : v));
const h1 = fila(10), h2 = fila(11), h3 = fila(12), h4 = fila(13), tt = fila(14);
ok(h1[0] === 1 && h1[1] === "Carlos Mejía" && h1[2] === "Génesis Visbal" && h1[3] === "Lista para cruzar", "hoja 1 pareja y estado: " + h1.slice(0, 4));
ok(h1[4] === 6 && h1[5] === 3 && h1[6] === 2 && h1[7] === 1 && !(h1[8] && h1[8].result), "hoja 1 renglones/coinciden/difieren/solo OL/solo Bavaria: " + h1.slice(4, 9));
ok(h1[9] === 6768 && h1[10] === 6540 && h1[11] === 228 && h1[12] === 348, "hoja 1 cajas OL, Bavaria, neta y distintas: " + h1.slice(9, 13));
ok(Math.abs(h1[13] - 0.5) < 1e-9, "hoja 1: 3 de 6 coinciden = 50 %: " + h1[13]);
ok(h1[15] === "3 de 6 renglones no coinciden.", "lectura hoja 1: " + h1[15]);
ok(h2[4] === 3 && h2[5] === 2 && h2[8] === 1 && h2[11] === -144, "hoja 2: " + h2.slice(4, 12));
ok(h3[3] === "Falta una" && h3[4] == null && h3[15] === "Falta que la otra persona termine." && h3[2] === "falta", "hoja 3 sin cruzar: " + h3);
ok(h4[3] === "Sin empezar" && h4[1] === "falta", "hoja 4: " + h4);
ok(tt[1] === "TOTAL DEL INVENTARIO" && tt[4] === 9 && tt[5] === 5 && tt[9] === 9128 && tt[10] === 9044 && tt[11] === 84 && tt[12] === 348 + 144, "total del inventario: " + tt);
const dif = wb.getWorksheet("Diferencias"); const dr = []; dif.eachRow((r, n) => { if (n > 7) dr.push(r.values.slice(2)) });
ok(dr.length === 4 && dr.map((x) => Math.abs(x[9])).join() === "180,144,108,60", "diferencias ordenadas de mayor a menor: " + dr.map((x) => x[9]).join());
const pm = wb.getWorksheet("Por material"); const mm = []; pm.eachRow((r, n) => { if (n > 7) mm.push(r.values.slice(2)) });
ok(mm[0][0] === "3128" && mm[0][7] === 180, "por material: el que más difiere primero: " + mm.map((x) => x[0] + ":" + (x[7] ?? "")).join());
ok(wb.getWorksheet("Resumen").getImages().length === 1, "el logo va en el resumen");
/* ----- volver al resumen en cada pestaña menos el resumen ----- */
for (const n of ["Diferencias", "Por material", "Por persona", "Conteos por persona", "Conteos cruzados"]) {
  const v = wb.getWorksheet(n).getCell(5, 3).value;
  ok(v && /HYPERLINK\("#'Resumen'!A1"/.test(v.formula), "«" + n + "» debe traer «← volver al resumen»");
}
ok(!rs.getCell(5, 3).value, "el resumen no se vuelve a sí mismo");
/* ----- conteos por persona, renglón por renglón ----- */
const cps = wb.getWorksheet("Conteos por persona"); const cr = []; cps.eachRow((r, n) => { if (n > 7) cr.push(r.values.slice(2).map((v) => (v && typeof v === "object" && "result" in v ? v.result : v))) });
ok(cr.length === 16, "renglones de las personas (hoja 1: 6 del operador + 5 de Bavaria; hoja 2: 2 + 3): " + cr.length);
ok(cr.every((x) => x[0] === 1 || x[0] === 2), "solo las hojas cruzadas");
ok(cr[0][0] === 1 && cr[0][2] === "Operador logístico" && cr[0][3] === "Carlos Mejía", "primero la hoja 1 y el operador, con su persona: " + cr[0].slice(0, 4));
const ult = cr.filter((x) => x[2] === "Bavaria" && x[0] === 1).at(-1);
ok(ult && ult[3] === "Génesis Visbal", "las filas de Bavaria llevan su persona");
const mj = cr.find((x) => x[5] === "3500887" && x[0] === 1 && x[2] === "Operador logístico");
ok(mj && mj[8] === 22 && mj[10] === 12 && mj[12] === 1200 && mj[9] === 54, "estibas × factor + saldo = total: " + mj);
ok(cr.some((x) => x[13] === "pallet mojado"), "la nota del renglón viaja");
ok(cr.every((x) => x[14] instanceof Date), "cada renglón lleva su hora");
ok(cr[0][14].getUTCHours() === 9 && cr[0][14].getUTCMinutes() === 11, "la hora va en hora de Colombia (UTC−5): " + cr[0][14].toISOString());
/* ----- por persona ----- */
const pps = wb.getWorksheet("Por persona"); const pr = []; pps.eachRow((r, n) => { if (n > 7) pr.push(r.values.slice(2).map((v) => (v && typeof v === "object" && "result" in v ? v.result : v))) });
ok(pr.length === 8, "una fila por persona (2 por hoja × 4 hojas): " + pr.length);
ok(pr[0][1] === "Operador logístico" && pr[0][2] === "Carlos Mejía" && pr[0][3] === "Génesis Visbal" && pr[1][2] === "Génesis Visbal" && pr[1][3] === "Carlos Mejía", "persona y su pareja: " + pr[0].slice(0, 4) + " | " + pr[1].slice(0, 4));
ok(pr[0][4] === 6 && pr[0][8] === 6768 && pr[0][9] === 6768 && pr[0][10] === "✓ cuadra", "hoja 1, operador: renglones, total y cuadra con el cruce: " + pr[0].slice(4, 11));
ok(pr[1][4] === 5 && pr[1][8] === 6540 && pr[1][10] === "✓ cuadra", "hoja 1, Bavaria (5 renglones, uno no lo contó): " + pr[1].slice(4, 11));
ok(pr[3][8] === 2505 && pr[3][9] === 2504 && pr[3][10] === "revisar", "hoja 2, Bavaria con 1 caja de más NO cuadra: " + pr[3].slice(4, 11));
ok(pr[0][5] > 0 && pr[0][6] >= 0, "estibas y saldo por persona suman");
ok(pr[0][11] instanceof Date && pr[0][12] instanceof Date && pr[0][13] instanceof Date, "empezó, última anotación y terminó llevan fecha: " + pr[0].slice(11, 14));
ok(pr[4][1] === "Operador logístico" && pr[4][4] === 4 && pr[4][10] == null && pr[4][13] instanceof Date, "hoja 3 sin cruzar: renglones del avance, sin cuadre, terminó el operador: " + pr[4].slice(4, 14));
ok(pr[5][2] === "falta" && pr[5][13] === "sin empezar", "hoja 3, Bavaria falta: " + pr[5]);
ok(pr[7][13] === "sin empezar", "hoja 4: sin empezar");
/* puras */
ok(cajasDistintas([F("a", "1", "m", [null, null, null], 10, 4)]) === 6 && exactitud([F("a", "1", "m", [null, null, null], 10, 10)]) === 1 && exactitud([]) === 1, "puras");
ok(lecturaHoja(hojas[0]) === "3 de 6 renglones no coinciden." && lecturaHoja(hojas[1]) === "1 de 3 renglones no coinciden.", "lecturaHoja");
/* sin el SQL de los conteos: lo dice en vez de dejar la pestaña en blanco, y el cruce sale completo */
const sinC = await armarCruceFiscal({ nombre: "X", fecha: "2026-10-02", quien: "Y", sinConteos: true, hojas: hojas.map((h) => ({ ...h, conteos: null })), sello: null });
const w3 = new ExcelJS.Workbook(); await w3.xlsx.load(sinC);
ok(/2026-10-fiscal-conteos-por-persona\.sql/.test(JSON.stringify(w3.getWorksheet("Conteos por persona").getRow(8).values)), "sin el SQL dice qué correr");
ok(w3.getWorksheet("Conteos cruzados").rowCount >= 7 + 9, "el cruce sale completo aunque falten los conteos de las personas");
/* sin hojas cruzadas: no se cae */
const vacio = await armarCruceFiscal({ nombre: "X", fecha: "2026-10-02", quien: "Y", hojas: hojas.slice(2), sello: null });
const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(vacio);
ok(/Todavía no hay hojas cruzadas/.test(JSON.stringify(w2.getWorksheet("Diferencias").getRow(8).values)), "sin cruces dice que todavía no hay");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Excel del cruce fiscal: Resumen por pareja con total, Diferencias, Por material, Por persona, Conteos por persona y Conteos cruzados; las hojas sin cruzar salen con lo que les falta.");
