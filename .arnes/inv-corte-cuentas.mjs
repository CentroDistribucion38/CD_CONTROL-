/* Las cuentas del corte de líneas: node .arnes/inv-corte-cuentas.mjs */
import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
buildSync({ entryPoints: [R("src/modulos/inventario/corte.ts")], bundle: true, format: "esm", outfile: R(".arnes/tmp/corte.mjs"), logLevel: "silent" });
const { analizar, aCajas, duracion } = await import(pathToFileURL(R(".arnes/tmp/corte.mjs")).href);
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const sitio = (u, cant, unidad) => ({ ubicacion_id: u, cant, unidad });
const reng = (linea, cajas, o = {}, d = {}) => ({ linea, cajas_depa: cajas, material_id: o.mat ?? null, origen: o.s ?? null, destino: d.s ?? null, nota: null });
const corte = (tipo, hora, renglones) => ({ id: tipo, tipo, inicial_id: null, cortado_en: hora, nota: null, creado_por: null, renglones });
const porEstiba = (m) => (m === "m1" ? 60 : m === "m3" ? 30 : null);

/* 1 · EL EJEMPLO DE CRISTIAN: 06:00 con 18.801 en la depa. */
{
  const ini = corte("inicial", "2026-09-30T11:00:00Z", [reng("L1", 18801, { s: sitio("A01", 40, "estibas"), mat: "m1" }, { s: sitio("B12", 900, "cajas") })]);
  const fin = corte("final", "2026-09-30T17:30:00Z", [reng("L1", 30801, { s: sitio("A01", 30, "estibas"), mat: "m1" }, { s: sitio("B12", 1800, "cajas") })]);
  const a = analizar(ini, fin, porEstiba);
  const f = a.filas[0];
  ok(f.pasadas === 12000, `pasadas ${f.pasadas}`);
  ok(f.origen.mov === 600 && f.origen.dif === 11400, `origen bajó ${f.origen.mov}, dif ${f.origen.dif}`); // 10 estibas × 60
  ok(f.destino.mov === 900 && f.destino.dif === 11100, `destino subió ${f.destino.mov}, dif ${f.destino.dif}`);
  ok(Math.abs(a.horas - 6.5) < 1e-9 && duracion(a.horas) === "6 h 30 min", `horas ${a.horas} ${duracion(a.horas)}`);
  ok(a.totalPasadas === 12000, "total");
}
/* 2 · CUADRA: lo que pasó por la depa es lo que bajó del origen y subió en el destino. */
{
  const ini = corte("inicial", "2026-09-30T11:00:00Z", [reng("L2", 1000, { s: sitio("A01", 1000, "cajas") }, { s: sitio("B12", 0, "cajas") })]);
  const fin = corte("final", "2026-09-30T13:00:00Z", [reng("L2", 1600, { s: sitio("A01", 400, "cajas") }, { s: sitio("B12", 600, "cajas") })]);
  const f = analizar(ini, fin, porEstiba).filas[0];
  ok(f.origen.dif === 0 && f.destino.dif === 0, `no cuadra: ${f.origen.dif} / ${f.destino.dif}`);
}
/* 3 · FALTANTE: bajaron más cajas del módulo de las que pasaron (dif negativa). */
{
  const ini = corte("inicial", "2026-09-30T11:00:00Z", [reng("L4", 0, { s: sitio("A01", 1000, "cajas") })]);
  const fin = corte("final", "2026-09-30T13:00:00Z", [reng("L4", 500, { s: sitio("A01", 300, "cajas") })]);
  const f = analizar(ini, fin, porEstiba).filas[0];
  ok(f.origen.mov === 700 && f.origen.dif === -200, `faltante: bajó ${f.origen.mov}, dif ${f.origen.dif}`);
}
/* 4 · NO SE INVENTA: módulo distinto, estibas sin material, sitio que falta. */
{
  const ini = corte("inicial", "2026-09-30T11:00:00Z", [
    reng("L1", 100, { s: sitio("A01", 5, "estibas") }, { s: sitio("B12", 10, "cajas") }),
    reng("L2", 100, { s: sitio("A01", 10, "cajas") }, { s: sitio("B12", 10, "cajas") }),
    reng("L6", 100, { s: sitio("A01", 10, "cajas") })]);
  const fin = corte("final", "2026-09-30T13:00:00Z", [
    reng("L1", 200, { s: sitio("A01", 3, "estibas") }, { s: sitio("B12", 50, "cajas") }),
    reng("L2", 200, { s: sitio("Z99", 10, "cajas") }, { s: sitio("B12", 50, "cajas") }),
    reng("L6", 200, { s: sitio("A01", 4, "cajas") })]);
  const a = analizar(ini, fin, porEstiba);
  const [l1, l2, l6] = a.filas;
  ok(l1.linea === "L1" && l1.origen.dif === null && /falta el material/.test(l1.origen.motivo), "estibas sin material no debe dar diferencia: " + JSON.stringify(l1.origen));
  ok(l2.origen.dif === null && /Cambió de módulo/.test(l2.origen.motivo) && l2.destino.dif === 60, "cambió de módulo: " + JSON.stringify(l2));
  ok(l6.destino.dif === null && /Falta dónde estaba ubicado/.test(l6.destino.motivo) && l6.origen.dif === 94, "sin destino: " + JSON.stringify(l6));
}
/* 5 · CONTADOR ATRÁS, LÍNEAS QUE FALTAN EN UN LADO, ORDEN L1 < L2 < L10. */
{
  const ini = corte("inicial", "2026-09-30T11:00:00Z", [reng("L10", 50), reng("L2", 900), reng("L1", 10), reng("L4", 1)]);
  const fin = corte("final", "2026-09-30T13:00:00Z", [reng("L2", 100), reng("L10", 80), reng("L1", 60), reng("L6", 7)]);
  const a = analizar(ini, fin, porEstiba);
  ok(a.filas.map((f) => f.linea).join() === "L1,L2,L10", "orden: " + a.filas.map((f) => f.linea));
  ok(a.filas.find((f) => f.linea === "L2").contadorAtras === true, "no marcó el contador atrás");
  ok(a.totalPasadas === 50 + 30, "el total no debe restar un contador que retrocedió: " + a.totalPasadas);
  ok(a.soloInicial.join() === "L4" && a.soloFinal.join() === "L6", `solo: ${a.soloInicial} / ${a.soloFinal}`);
}
/* 5b · EL MATERIAL DEL FINAL MANDA: es el que corría al cerrar. */
{
  const ini = corte("inicial", "2026-09-30T11:00:00Z", [reng("L1", 0, { s: sitio("A01", 10, "estibas"), mat: "m1" })]);
  const fin = corte("final", "2026-09-30T13:00:00Z", [reng("L1", 100, { s: sitio("A01", 4, "estibas"), mat: "m3" })]);
  const f = analizar(ini, fin, porEstiba).filas[0];
  ok(f.origen.mov === 180 && f.material_id === "m3", `con el material del final (30 cajas por estiba) bajó ${f.origen.mov}, material ${f.material_id}`);
  /* y si el final no trae material, vale el del inicial */
  const fin2 = corte("final", "2026-09-30T13:00:00Z", [reng("L1", 100, { s: sitio("A01", 4, "estibas") })]);
  ok(analizar(ini, fin2, porEstiba).filas[0].origen.mov === 360, "sin material en el final debía usar el del inicial (60 por estiba)");
}
/* 6 · aCajas */
ok(aCajas({ ubicacion_id: "x", cant: 3, unidad: "estibas" }, 45) === 135, "3 estibas × 45");
ok(aCajas({ ubicacion_id: "x", cant: 3, unidad: "estibas" }, null) === null && aCajas({ ubicacion_id: "x", cant: 3, unidad: "estibas" }, 0) === null, "estibas sin factor");
ok(aCajas({ ubicacion_id: "x", cant: 7, unidad: "cajas" }, null) === 7 && aCajas(null, 5) === null, "cajas / sin sitio");
ok(duracion(0.25) === "15 min" && duracion(3) === "3 h" && duracion(-2) === "0 min", "duración");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Corte de líneas, las cuentas: pasadas, bajó del origen, subió en el destino, diferencias con su signo, y no inventa lo que no se puede comparar.");
