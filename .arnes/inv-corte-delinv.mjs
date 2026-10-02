/* El corte final toma de dónde sale la línea del INVENTARIO (el último conteo enviado):
   node .arnes/inv-corte-delinv.mjs */
import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
buildSync({ entryPoints: [R("src/modulos/inventario/corte.ts")], bundle: true, format: "esm", outfile: R(".arnes/tmp/corte.mjs"), logLevel: "silent" });
const { armarPar, conteoDelPar, usaInventarioDelDia, renglonesPorCorte, cruzar, armarTabla } = await import(pathToFileURL(R(".arnes/tmp/corte.mjs")).href);
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const nom = (id) => ({ A01: "A · 01 · DER", A02: "A · 02 · DER", B12: "B · 12 · IZQ" }[id] ?? id);
const sitio = (u, cant, unidad = "cajas", extra = {}) => ({ ubicacion_id: u, cant, unidad, ...extra });
const del = (u) => ({ ubicacion_id: u, cant: 0, unidad: "cajas", delInventario: true });
const reng = (linea, depa, o, d, env = "m1") => ({ linea, cajas_depa: depa, envase_id: env, material_id: "m3", origenes: o, destinos: d, nota: null });
const corte = (tipo, hora, renglones) => ({ id: tipo, tipo, inicial_id: null, cortado_en: hora, nota: null, creado_por: null, renglones });
const porEstiba = (m) => (m === "m1" ? 60 : null);
const LC = (conteo_id, producto_id, ubicacion_id, total_cajas) => ({ conteo_id, producto_id, ubicacion_id, total_cajas, averia: false, pnc: false });
const conteo = (id, codigo, fecha, enviado) => ({ id, codigo, fecha, enviado_en: enviado });
const ctxDe = (conteos, lineas) => {
  const m = new Map(); for (const l of lineas) { const x = m.get(l.conteo_id); if (x) x.push(l); else m.set(l.conteo_id, [l]) }
  return { conteos, lineasPorConteo: m, envaseDe: (r) => r.envase_id ?? null };
};
const H1 = "2026-09-30T11:00:00Z", H2 = "2026-09-30T17:00:00Z";

/* 1 · renglonesPorCorte: cant/unidad null del origen del final = «del inventario» (0 cajas por ahora). */
{
  const r = renglonesPorCorte(
    [{ id: "r1", corte_id: "c", linea: "L1", cajas_depa: 100, material_id: "m3", envase_id: "m1", origen_ubicacion_id: null, origen_cant: null, origen_unidad: null, destino_ubicacion_id: null, destino_cant: null, destino_unidad: null, nota: null }],
    [{ renglon_id: "r1", rol: "origen", orden: 0, ubicacion_id: "A01", cant: null, unidad: null }, { renglon_id: "r1", rol: "destino", orden: 0, ubicacion_id: "B12", cant: 900, unidad: "cajas" }]).get("c");
  ok(r[0].origenes[0].delInventario === true && r[0].origenes[0].cant === 0 && r[0].destinos[0].delInventario !== true, "el origen sin cantidad se marca delInventario: " + JSON.stringify(r[0]));
  ok(usaInventarioDelDia(corte("final", H2, r)) && !usaInventarioDelDia(corte("final", H2, [reng("L1", 1, [sitio("A01", 1)], [])])), "usaInventarioDelDia");
}

/* 2 · Toma la cantidad del ÚLTIMO conteo enviado, módulo por módulo, y calcula la diferencia. */
{
  const ini = corte("inicial", H1, [reng("L1", 1000, [sitio("A01", 2000), sitio("A02", 600)], [sitio("B12", 0)])]);
  const fin = corte("final", H2, [reng("L1", 2000, [del("A01"), del("A02")], [sitio("B12", 1000)])]);
  const viejo = conteo("k1", "FEFO-1", "2026-09-29", "2026-09-29T20:00:00Z"), nuevo = conteo("k2", "FEFO-2", "2026-09-30", "2026-09-30T20:00:00Z");
  const ctx = ctxDe([nuevo, viejo], [LC("k2", "m1", "A01", 1000), LC("k2", "m1", "A02", 200), LC("k1", "m1", "A01", 1500), LC("k1", "m1", "A02", 100)]);
  ok(conteoDelPar(ini, fin, ctx.conteos) === "k2", "el conteo por defecto es el último enviado: " + conteoDelPar(ini, fin, ctx.conteos));
  const p = armarPar(ini, fin, porEstiba, nom, ctx, "k2");
  const o = p.a.filas[0].origen;
  ok(o.mov === 1400 && o.dif === -400, `A01 bajó 1000 y A02 400 = 1.400 (2.600 → 1.200); dif −400 vs la depa: ${JSON.stringify(o)}`);
  ok(p.a.delInventario && p.a.delInventario.conteo.id === "k2" && p.a.delInventario.falta === null, "dice de qué conteo salió: " + JSON.stringify(p.a.delInventario));
  const t = cruzar(p.a, "k2", ctx.lineasPorConteo.get("k2"))[0];
  ok(t.finDelInventario === true, "el cruce sabe que el final es del inventario");
  const tabla = armarTabla(t, true, nom);
  ok(!JSON.stringify(tabla).includes('"Cuadra con el corte final"'), "no compara el inventario contra sí mismo");
  /* El selector manda: con el conteo viejo salen otras cantidades. */
  const p1 = armarPar(ini, fin, porEstiba, nom, ctx, "k1").a.filas[0].origen;
  ok(p1.mov === 1000 && p1.dif === 0, `con el conteo FEFO-1: bajó 2.600 → 1.600 = 1.000 y cuadra con la depa: ${JSON.stringify(p1)}`);
}

/* 3 · Módulo que el inventario no visitó = 0 cajas, y se dice. */
{
  const ini = corte("inicial", H1, [reng("L1", 1000, [sitio("A01", 600), sitio("A02", 600)], [sitio("B12", 0)])]);
  const fin = corte("final", H2, [reng("L1", 2200, [del("A01"), del("A02")], [sitio("B12", 1200)])]);
  const k = conteo("k", "FEFO-9", "2026-09-30", "2026-09-30T20:00:00Z");
  const ctx = ctxDe([k], [LC("k", "m1", "A01", 0), LC("k", "m1", "B12", 1200)]); // A02 no se visitó
  const o = armarPar(ini, fin, porEstiba, nom, ctx, "k").a.filas[0].origen;
  ok(o.mov === 1200 && o.dif === 0, `sin visitar = 0: bajó los 1.200 que había: ${JSON.stringify(o)}`);
  ok(/no contó A · 02 · DER: se toma como 0 cajas/.test(o.aviso ?? ""), "el aviso dice qué módulo no se contó: " + o.aviso);
}

/* 4 · Sin inventario enviado o sin envase: no inventa, dice por qué. */
{
  const ini = corte("inicial", H1, [reng("L1", 1000, [sitio("A01", 600)], [sitio("B12", 0)])]);
  const fin = corte("final", H2, [reng("L1", 2000, [del("A01")], [sitio("B12", 600)])]);
  const sin = armarPar(ini, fin, porEstiba, nom, ctxDe([], []), null);
  ok(sin.a.delInventario?.falta && /No hay ningún inventario enviado/.test(sin.a.filas[0].origen.motivo ?? ""), "sin inventario en la base lo dice: " + JSON.stringify(sin.a.filas[0].origen));
  ok(conteoDelPar(ini, fin, []) === null, "sin conteos no hay conteo por defecto");
  const k = conteo("k", "FEFO-9", "2026-09-30", "2026-09-30T20:00:00Z");
  const fin2 = corte("final", H2, [reng("L1", 2000, [del("A01")], [sitio("B12", 600)], null)]);
  const ini2 = corte("inicial", H1, [reng("L1", 1000, [sitio("A01", 600)], [sitio("B12", 0)], null)]);
  const se = armarPar(ini2, fin2, porEstiba, nom, ctxDe([k], [LC("k", "m1", "A01", 500)]), "k").a.filas[0].origen;
  ok(/Falta escoger el envase/.test(se.motivo ?? ""), "sin envase no se sabe qué buscar: " + JSON.stringify(se));
}

/* 5 · Un corte final con cantidades a mano sigue igual (no se toca el inventario). */
{
  const ini = corte("inicial", H1, [reng("L1", 1000, [sitio("A01", 600)], [sitio("B12", 0)])]);
  const fin = corte("final", H2, [reng("L1", 1500, [sitio("A01", 100)], [sitio("B12", 500)])]);
  const p = armarPar(ini, fin, porEstiba, nom, ctxDe([], []), null);
  ok(!p.a.delInventario && p.a.filas[0].origen.mov === 500 && p.a.filas[0].origen.dif === 0, "cantidades a mano: igual que antes: " + JSON.stringify(p.a.filas[0].origen));
}

if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Corte final desde el inventario: toma el último conteo enviado, módulo por módulo; lo no contado vale 0 y se avisa; el selector manda; sin inventario o sin envase lo dice; lo escrito a mano no cambia.");
