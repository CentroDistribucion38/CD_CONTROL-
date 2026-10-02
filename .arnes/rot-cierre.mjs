/* =====================================================================
   ROTURAS EN SITIO · EL CIERRE DE TURNO — LAS CUENTAS
   El turno se deriva de la hora de registro (Colombia, UTC−5):
     C 22:00→06:00 (abre el día: 23:30 del 22 es el C del 23) · A 06→14 · B 14→22.
   Registros = reportadas (OPM) + encontradas + sin origen. Siempre.
   Las anuladas no son registros: se dicen aparte.
   ===================================================================== */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
process.on("uncaughtException", (e) => { fallas.forEach((x) => console.log("✗ " + x)); console.log("✗ el arnés no pudo terminar: " + e.message); process.exit(1) });

writeFileSync(R(".arnes/_rc.mjs"), buildSync({ entryPoints: [R("src/modulos/roturas/cierre.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" }).outputFiles[0].text);
const M = await import(R(".arnes/_rc.mjs") + "?" + Date.now());
const { turnoYDia, armarCierre, etiquetaRotura, faseRotura, textoCierre, periodoCierre, sumaDias } = M;

/* ---------- 1 · LOS BORDES DEL TURNO (hora de Colombia = UTC−5) ---------- */
const t = (utc) => { const x = turnoYDia(utc); return x.turno + "@" + x.dia + " " + x.hhmm };
// 22:00 Colombia del 22 = 03:00 UTC del 23  → C del día 23
ok(t("2026-09-23T03:00:00Z") === "C@2026-09-23 22:00", "22:00 del 22 abre el C del 23: " + t("2026-09-23T03:00:00Z"));
ok(t("2026-09-23T02:59:00Z") === "B@2026-09-22 21:59", "21:59 sigue siendo el B del 22: " + t("2026-09-23T02:59:00Z"));
ok(t("2026-09-23T04:59:00Z").startsWith("C@2026-09-23 23:59"), "23:59 del 22 es el C del 23: " + t("2026-09-23T04:59:00Z"));
ok(t("2026-09-23T05:00:00Z").startsWith("C@2026-09-23 00:00"), "00:00 es el C del mismo día: " + t("2026-09-23T05:00:00Z"));
ok(t("2026-09-23T10:59:00Z").startsWith("C@2026-09-23 05:59"), "05:59 todavía es C: " + t("2026-09-23T10:59:00Z"));
ok(t("2026-09-23T11:00:00Z").startsWith("A@2026-09-23 06:00"), "06:00 entra el A: " + t("2026-09-23T11:00:00Z"));
ok(t("2026-09-23T18:59:00Z").startsWith("A@2026-09-23 13:59"), "13:59 sigue en A: " + t("2026-09-23T18:59:00Z"));
ok(t("2026-09-23T19:00:00Z").startsWith("B@2026-09-23 14:00"), "14:00 entra el B: " + t("2026-09-23T19:00:00Z"));
// fin de mes y de año: el C de las 23:00 del 31 es del 1
ok(turnoYDia("2026-10-01T04:00:00Z").dia === "2026-10-01" && turnoYDia("2026-10-01T04:00:00Z").turno === "C", "30/09 23:00 → C del 01/10");
ok(turnoYDia("2027-01-01T04:30:00Z").dia === "2027-01-01", "31/12 23:30 → C del 01/01 del año siguiente: " + turnoYDia("2027-01-01T04:30:00Z").dia);
ok(sumaDias("2026-12-31", 1) === "2027-01-01" && sumaDias("2026-03-01", -1) === "2026-02-28", "sumaDias");

/* ---------- 2 · LAS CUENTAS ---------- */
let n = 0;
const RO = (utc, o = {}) => ({
  id: "r" + (++n), codigo: "ROT-" + String(n).padStart(3, "0"), material: "3128", material_nombre: "Águila 330",
  tipo: "producto_terminado", color: null, unidades: 10, contaminadas: 0, botellas: null, unidades_liquido: 10, unidades_vidrio: 10,
  proceso: "pr1", proceso_nombre: "Despaletizado", area: "a1", area_nombre: "Plazoleta",
  causa: "c1", causa_nombre: "Estibas en mal estado", grupo: "asumida", exige_foto: false, descripcion: null,
  lat: null, lng: null, precision_m: null, estado: "esperando", esperando: true, cuenta: false,
  reportada_por: "u1", reportada_en: utc, decidida_por: null, decidida_en: null, nota_decision: null, fotos: 0,
  etapa: "espera_ol", origen: "opm", opm_nombre: "Juan OPM", le_falta_foto: false, minutos: 0, ...o,
});
const nombres = { u1: "Ana Registra", u2: "Beto Registra" };
const dia22 = [
  RO("2026-09-23T03:30:00Z", { origen: "opm" }),                                   // C del 23
  RO("2026-09-23T04:10:00Z", { origen: "encontrada", etapa: "cobro", estado: "cuenta", unidades: 4, reportada_por: "u2", opm_nombre: null }), // C del 23
  RO("2026-09-23T11:30:00Z", { origen: "opm", contaminadas: 3, causa_nombre: "Montacarga", etapa: "desacuerdo" }), // A 23
  RO("2026-09-23T12:00:00Z", { origen: null, causa: "", causa_nombre: "" }),          // A 23, sin origen y sin causa
  RO("2026-09-23T19:30:00Z", { origen: "opm", estado: "anulada", etapa: "anulada" }), // B 23, anulada
  RO("2026-09-23T20:00:00Z", { origen: "encontrada", etapa: "cobro", estado: "cuenta", unidades: 6, tipo: "eer", contaminadas: 9 }), // B 23 (EER: sin contaminadas)
  RO("2026-09-22T20:00:00Z", { origen: "opm" }),                                    // B 22 (otro día)
];
const c = armarCierre(dia22, nombres, { desde: "2026-09-23", hasta: "2026-09-23" });
ok(c.turnos.map((x) => x.turno).join("") === "CAB", "el orden del día es C, A, B: " + c.turnos.map((x) => x.turno).join(""));
const [tC, tA, tB] = c.turnos;
ok(tC.registros === 2 && tC.reportadas === 1 && tC.encontradas === 1 && tC.sinOrigen === 0, "C: " + JSON.stringify([tC.registros, tC.reportadas, tC.encontradas]));
ok(tA.registros === 2 && tA.reportadas === 1 && tA.sinOrigen === 1 && tA.contaminadas === 3, "A: registros 2, reportada 1, sin origen 1, contaminadas 3");
ok(tB.registros === 1 && tB.encontradas === 1 && tB.anuladas === 1 && tB.contaminadas === 0, "B: la anulada no es registro y la EER no tiene contaminadas: " + JSON.stringify([tB.registros, tB.anuladas, tB.contaminadas]));
for (const x of [tC, tA, tB, c.total]) ok(x.registros === x.reportadas + x.encontradas + x.sinOrigen, `registros = reportadas + encontradas + sin origen (${x.turno}: ${x.registros})`);
ok(c.total.registros === 5 && c.total.rotas === 10 + 4 + 10 + 10 + 6, "el total del día: " + c.total.registros + " / " + c.total.rotas);
ok(!c.turnos.some((x) => x.dia !== "2026-09-23"), "el B del 22 no entra al cierre del 23");
ok(tA.porCausa.at(-1).nombre === "Sin dato" && tA.porCausa.reduce((s, x) => s + x.n, 0) === tA.registros, "«Sin dato» va al final y la lista suma los registros");
ok(tC.porQuien.map((x) => x.nombre).sort().join() === "Ana Registra,Beto Registra", "por quién registró: " + JSON.stringify(tC.porQuien));
ok(tA.desacuerdo === 1 && tA.esperanOL === 1 && tC.aCobro === 1 && tB.aCobro === 1, "en qué parte de la cadena quedó");
ok(tC.filas[0].hora === "22:30" && tC.filas[0].opm === "Juan OPM" && tC.filas[1].opm === "", "hora local y operario OPM en cada fila: " + tC.filas[0].hora);
ok(c.turnos.every((x) => ["porCausa", "porProceso", "porArea"].every((k) => x[k].reduce((s, y) => s + y.n, 0) === x.registros)), "cada «a qué corresponde» suma los registros");

/* «Sin dato» va AL FINAL aunque sea lo más frecuente: es un registro por arreglar, no una causa. */
const sd = armarCierre([RO("2026-09-23T12:00:00Z", { causa_nombre: "" }), RO("2026-09-23T12:01:00Z", { causa_nombre: "" }), RO("2026-09-23T12:02:00Z", { causa_nombre: "" }),
                        RO("2026-09-23T12:03:00Z", { causa_nombre: "Montacarga" })], nombres, {});
ok(sd.total.porCausa.map((x) => x.nombre).join() === "Montacarga,Sin dato" && sd.total.porCausa[1].n === 3, "«Sin dato» al final aunque tenga más: " + sd.total.porCausa.map((x) => x.nombre + x.n).join());

/* ---------- 3 · FILTROS: TURNOS, RANGO Y VACÍOS ---------- */
const soloA = armarCierre(dia22, nombres, { desde: "2026-09-23", hasta: "2026-09-23", turnos: ["A"] });
ok(soloA.turnos.length === 1 && soloA.total.registros === 2, "solo el A: " + soloA.turnos.length + " tarjeta");
const rango = armarCierre(dia22, nombres, { desde: "2026-09-22", hasta: "2026-09-24" });
ok(rango.turnos.length === 9 && rango.turnos[0].dia === "2026-09-22" && rango.turnos[8].dia === "2026-09-24", "3 días × 3 turnos, también los vacíos: " + rango.turnos.length);
ok(rango.turnos.find((x) => x.dia === "2026-09-24" && x.turno === "A").registros === 0, "el turno sin registros sale en cero");
const largo = armarCierre(dia22, nombres, { desde: "2026-08-01", hasta: "2026-09-30" });
ok(largo.turnos.length === 4, "con más de 14 días solo salen los que tienen algo: " + largo.turnos.length);
const todo = armarCierre(dia22, nombres, {});
ok(todo.desde === "2026-09-22" && todo.hasta === "2026-09-23" && todo.total.registros === 6, "sin rango: de la primera a la última: " + todo.desde + " " + todo.hasta + " " + todo.total.registros);
ok(armarCierre([], nombres, { desde: "2026-09-23", hasta: "2026-09-23" }).turnos.length === 3, "un día sin roturas igual enseña los tres turnos en cero");
ok(armarCierre([], nombres, {}).turnos.length === 0 && armarCierre([], nombres, {}).total.registros === 0, "sin nada ni rango: vacío, sin reventar");

/* ---------- 4 · ESTADO Y TEXTO ---------- */
ok(etiquetaRotura(dia22[1]).txt === "A COBRO · ENCONTRADA" && etiquetaRotura(dia22[0]).txt === "ESPERA AL OL" && etiquetaRotura(dia22[4]).txt === "ANULADA", "etiquetas");
ok(faseRotura({ estado: "cuenta", etapa: undefined }) === "cobro" && faseRotura({ estado: "esperando" }) === "espera", "sin `etapa` cae al estado de siempre");
const txt = textoCierre(c, { rotulo: "23/09", filtros: "", generado: new Date("2026-09-23T20:00:00Z") });
ok(/Registros 5 · reportadas 2 · encontradas 2 · sin origen 1/.test(txt) && /Turno C \(22:00 · 06:00\)/.test(txt) && /ROT-001/.test(txt) && !/ROT-005/.test(txt), "el texto trae lo mismo y no las anuladas: " + txt.slice(0, 300));
ok(periodoCierre(c, []) === "23/09" && periodoCierre(rango, ["C", "A"]) === "del 22/09 al 24/09 · turnos C y A", "período: " + periodoCierre(rango, ["C", "A"]));

if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Cierre de turno de roturas: C abre el día (22:00), registros = reportadas + encontradas + sin origen, anuladas aparte, turnos vacíos en cero, rango y turnos filtran, y el texto dice lo mismo.");
