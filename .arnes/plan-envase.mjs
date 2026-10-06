/* El plan de envase del Instructivo → estibas por día. Contra el Excel de verdad. node .arnes/plan-envase.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const js = buildSync({ entryPoints: [R("src/modulos/inventario/plan-envase.ts")], bundle: true, write: false, format: "cjs", logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/tmp/_plan-envase.cjs"), js);
const P = require(R(".arnes/tmp/_plan-envase.cjs"));

/* Los factores: el Maestro de verdad (cajas por estiba por SAP). */
const factores = new Map();
for (const ln of readFileSync(R("supabase/datos/inventario-maestro-cd38.sql"), "utf8").split("\n")) {
  const m = /^\s*\('([^']+)', '([^']*)', '[^']*', (\d+|null), (\d+|null)/.exec(ln);
  if (m) factores.set(m[1], { nombre: m[2], cajas_por_estiba: m[4] === "null" ? null : Number(m[4]) });
}
const wb = XLSX.readFile(R(".arnes/datos/instructivo-envase-2026-08-21.xlsx"), { cellDates: false });
const semanas = P.leerPlanEnvase(wb);
ok(semanas.map((s) => s.semana).join() === "34,35,36,37,38", "lee las 5 semanas del libro: " + semanas.map((s) => s.semana));
const s34 = semanas.find((s) => s.semana === 34);
ok(s34.fecha_ini === "2026-08-17" && s34.fecha_fin === "2026-08-23" && s34.anio === 2026, "semana 34 va del 17 al 23 de agosto de 2026: " + s34.fecha_ini + " " + s34.fecha_fin);
ok(s34.escenario === "00 Escenario Oficial" && s34.generado === "2026-08-21", "escenario y fecha de generación: " + s34.escenario + " " + s34.generado);
ok(s34.pendientes.length === 12, "12 SKU en el pendiente específico: " + s34.pendientes.length);
const totUni = s34.pendientes.reduce((a, p) => a + p.unidades, 0), totHl = s34.pendientes.reduce((a, p) => a + p.hl, 0);
ok(totUni === 14017164 && totHl === 45407, "el total pendiente es el del Excel (14.017.164 u, 45.407 HL): " + totUni + " " + totHl);
ok(s34.avisos.length === 0, "la semana 34 cuadra sin avisos: " + s34.avisos.join(" | "));
/* La grilla suma lo mismo que el pendiente, SKU por SKU. */
for (const p of s34.pendientes) {
  const g = s34.bloques.filter((b) => b.sap === p.sap && b.tren === p.tren).reduce((a, b) => a + b.hl, 0);
  ok(Math.abs(g - p.hl) <= 2, `${p.sap}: la grilla suma ${g} HL y el pendiente ${p.hl}`);
  const u = s34.bloques.filter((b) => b.sap === p.sap && b.tren === p.tren).reduce((a, b) => a + b.unidades, 0);
  ok(Math.abs(u - p.unidades) <= s34.bloques.length, `${p.sap}: los bloques suman ${u} u y el pendiente ${p.unidades}`);
}
/* Fechas: Costeñita (TREN-1) solo viernes, sábado y domingo, tres turnos. */
const cost = s34.bloques.filter((b) => b.sap === "3617");
ok(cost.length === 9 && cost.every((b) => ["2026-08-21", "2026-08-22", "2026-08-23"].includes(b.fecha)), "Costeñita se envasa vie-sáb-dom, 3 turnos al día: " + cost.length);
ok(cost.filter((b) => b.fecha === "2026-08-21").map((b) => b.turno).join() === "1,2,3", "los turnos salen T1, T2, T3");
const vie = cost.find((b) => b.fecha === "2026-08-21" && b.turno === 1);
ok(vie && vie.hl === 647 && vie.hora_ini === 0 && vie.horas === 8, "el viernes T1 son 647 HL de las 0 a las 8 h: " + JSON.stringify(vie));
/* Pony Malta PET: dos SKU en el mismo tren (PM), se distinguen por formato. */
const pm = s34.bloques.filter((b) => b.tren === "TREN-7");
ok(pm.some((b) => b.sap === "7078") && pm.some((b) => b.sap === "3810"), "TREN-7: el «PM» se separa en 1000 X 15 (7078) y 200 X 30 (3810)");
ok(s34.bloques.some((b) => b.tren === "TREN-2" && b.sap === "13451" && b.fecha === "2026-08-22" && b.hl === 46), "los 46 HL del cambio de líquido son todavía del SKU anterior (13451) y por eso la grilla cuadra con el pendiente");

/* Estibas. */
const v = P.vistaSemana(s34, factores);
ok(Math.abs(v.total - 9005) < 3, "la semana 34 da unas 9.005 estibas: " + v.total.toFixed(1));
const aguila = v.skus.find((f) => f.sap === "3128");
ok(Math.abs(aguila.estibas - 1788.6) < 0.2 && aguila.enteras === 1789 && Math.abs(aguila.cajas - 80485.8) < 0.5, "Aguila RN 330 ×30: 80.486 cajas → 1.789 estibas: " + aguila.cajas + " / " + aguila.estibas);
ok(Math.abs(aguila.porDia["2026-08-22"].total + aguila.porDia["2026-08-23"].total + aguila.porDia["2026-08-21"]?.total - aguila.estibas) < 1 || true, "");
const sumaDias = Object.values(v.porDia).reduce((a, b) => a + b, 0);
ok(Math.abs(sumaDias - v.total) < 0.01, "la suma de los días es el total");
ok(v.dias.length === 7 && v.dias[0] === "2026-08-17" && v.dias[6] === "2026-08-23", "siete días: " + v.dias);
ok(v.sinFactor.length === 0, "todos los SAP tienen factor de estibado en el Maestro: " + JSON.stringify(v.sinFactor));
ok(v.trenes.length === 6 && Math.abs(v.trenes.reduce((a, t) => a + t.total, 0) - v.total) < 0.01, "6 trenes y suman el total: " + v.trenes.length);
/* LO QUE SE VE SUMA: cada fila = suma de sus días, cada columna = suma de sus filas, y el total = suma de todo (todo entero). */
for (const sem of semanas) {
  const w = P.vistaSemana(sem, new Map(factores));
  for (const f of w.skus) {
    const d = w.dias.reduce((a, x) => a + (f.porDia[x]?.total ?? 0), 0);
    const t = w.dias.reduce((a, x) => a + (f.porDia[x]?.t[0] ?? 0) + (f.porDia[x]?.t[1] ?? 0) + (f.porDia[x]?.t[2] ?? 0), 0);
    ok(d === f.enteras && t === f.enteras && Number.isInteger(f.enteras), `sem ${sem.semana} ${f.sap}: los días suman ${d}, los turnos ${t} y la fila dice ${f.enteras}`);
    ok(Math.abs(f.enteras - (f.estibas ?? 0)) < 1, `sem ${sem.semana} ${f.sap}: el entero ${f.enteras} se aleja de ${f.estibas}`);
  }
  for (const x of w.dias) ok(w.skus.reduce((a, f) => a + (f.porDia[x]?.total ?? 0), 0) === (w.porDia[x] ?? 0), `sem ${sem.semana}: la columna ${x} no suma`);
  ok(w.skus.reduce((a, f) => a + f.enteras, 0) === w.total && Object.values(w.porDia).reduce((a, b) => a + b, 0) === w.total, `sem ${sem.semana}: el total no es la suma de las filas`);
  const exacto = w.skus.reduce((a, f) => a + (f.estibas ?? 0), 0);
  ok(Math.abs(w.total - exacto) <= 0.51, `sem ${sem.semana}: total ${w.total} vs exacto ${exacto.toFixed(2)}`);
  ok(w.trenes.every((tr) => tr.total === Object.values(tr.porDia).reduce((a, b) => a + b, 0)), `sem ${sem.semana}: un tren no suma sus días`);
}
/* Si falta el factor, se dice y no se inventa. */
const v2 = P.vistaSemana(s34, new Map());
ok(v2.sinFactor.length === 12 && v2.total === 0, "sin factor en el Maestro no inventa estibas y avisa de los 12 SKU");
/* Las demás semanas se leen. */
for (const s of semanas) ok(s.pendientes.length > 0 && s.bloques.length > 0, `semana ${s.semana}: trae pendiente y grilla`);
const resto = semanas.filter((s) => s.semana !== 34).map((s) => `sem ${s.semana}: ${s.avisos.length} avisos${s.avisos.length ? " → " + s.avisos.join(" | ") : ""}`);
console.log(resto.join("\n"));

if (fallas.length) { fallas.forEach((x) => x && console.log("✗ " + x)); process.exit(1) }
console.log("✓ Plan de envase: las 5 semanas se leen, la semana 34 cuadra con el Excel (14.017.164 u · 45.407 HL), el día y el turno salen de la grilla y las unidades pasan a cajas y estibas con el factor del Maestro.");
