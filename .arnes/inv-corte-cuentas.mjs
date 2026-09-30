/* Las cuentas del corte de líneas: node .arnes/inv-corte-cuentas.mjs */
import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
buildSync({ entryPoints: [R("src/modulos/inventario/corte.ts")], bundle: true, format: "esm", outfile: R(".arnes/tmp/corte.mjs"), logLevel: "silent" });
const { analizar, aCajas, duracion, renglonesPorCorte } = await import(pathToFileURL(R(".arnes/tmp/corte.mjs")).href);
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const sitio = (u, cant, unidad) => ({ ubicacion_id: u, cant, unidad });
const reng = (linea, cajas, o = {}, d = {}) => ({ linea, cajas_depa: cajas, envase_id: o.mat ?? null, material_id: d.mat ?? null, origenes: o.s ? [o.s] : [], destinos: d.s ? [d.s] : [], nota: null });
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
  ok(l1.linea === "L1" && l1.origen.dif === null && /falta el envase/.test(l1.origen.motivo), "estibas sin material no debe dar diferencia: " + JSON.stringify(l1.origen));
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
  ok(f.origen.mov === 180 && f.envase_id === "m3", `con el envase del final (30 cajas por estiba) bajó ${f.origen.mov}, envase ${f.envase_id}`);
  /* y si el final no trae material, vale el del inicial */
  const fin2 = corte("final", "2026-09-30T13:00:00Z", [reng("L1", 100, { s: sitio("A01", 4, "estibas") })]);
  ok(analizar(ini, fin2, porEstiba).filas[0].origen.mov === 360, "sin material en el final debía usar el del inicial (60 por estiba)");
}
/* 5c · CADA LADO USA EL FACTOR DE SU MATERIAL: lo que se toma es ENVASE (m1: 60 por estiba) y lo
       que queda ubicado es PRODUCTO (m3: 30 por estiba). Mezclarlos daría otra diferencia. */
{
  const ini = corte("inicial", "2026-09-30T11:00:00Z", [reng("L1", 0, { s: sitio("A01", 10, "estibas"), mat: "m1" }, { s: sitio("B12", 0, "estibas"), mat: "m3" })]);
  const fin = corte("final", "2026-09-30T13:00:00Z", [reng("L1", 100, { s: sitio("A01", 8, "estibas"), mat: "m1" }, { s: sitio("B12", 4, "estibas"), mat: "m3" })]);
  const f = analizar(ini, fin, porEstiba).filas[0];
  ok(f.origen.mov === 120, `el origen debía usar el envase (2 estibas × 60): ${f.origen.mov}`);
  ok(f.destino.mov === 120 && f.destino.dif === -20, `el destino debía usar el producto (4 estibas × 30): ${f.destino.mov} / ${f.destino.dif}`);
  /* Sin envase en el origen, las estibas no se pasan a cajas aunque haya producto. */
  const sinEnv = corte("inicial", "2026-09-30T11:00:00Z", [reng("L1", 0, { s: sitio("A01", 10, "estibas") }, { s: sitio("B12", 0, "estibas"), mat: "m3" })]);
  const sinEnvF = corte("final", "2026-09-30T13:00:00Z", [reng("L1", 100, { s: sitio("A01", 8, "estibas") }, { s: sitio("B12", 4, "estibas"), mat: "m3" })]);
  const g = analizar(sinEnv, sinEnvF, porEstiba).filas[0];
  ok(g.origen.dif === null && /falta el envase/.test(g.origen.motivo) && g.destino.mov === 120, "sin envase no debía usar el factor del producto: " + JSON.stringify(g.origen));
}
/* 7 · VARIOS MÓDULOS POR LADO: el total es la suma de los emparejados. */
{
  const rengM = (linea, cajas, os, ds, env = "m1", mat = null) =>
    ({ linea, cajas_depa: cajas, envase_id: env, material_id: mat, origenes: os, destinos: ds, nota: null });
  const H1 = "2026-09-30T11:00:00Z", H2 = "2026-09-30T17:00:00Z";
  /* Tomó de A01 (40 → 30) y de A02 (20 → 0): bajó 600 + 1.200 = 1.800 cajas (60 por estiba). */
  {
    const ini = corte("inicial", H1, [rengM("L1", 1000, [sitio("A01", 40, "estibas"), sitio("A02", 20, "estibas")], [sitio("B12", 0, "cajas")])]);
    const fin = corte("final", H2, [rengM("L1", 2800, [sitio("A01", 30, "estibas"), sitio("A02", 0, "estibas")], [sitio("B12", 1800, "cajas")])]);
    const f = analizar(ini, fin, porEstiba).filas[0];
    ok(f.origen.mov === 1800 && f.origen.dif === 0, `dos módulos: bajó ${f.origen.mov}, dif ${f.origen.dif}`);
    ok(f.origen.ini === 3600 && f.origen.fin === 1800, `el total inicial/final: ${f.origen.ini} / ${f.origen.fin}`);
    ok(f.origen.modulos.length === 2 && f.origen.modulos[0].mov === 600 && f.origen.modulos[1].mov === 1200, "el detalle por módulo: " + JSON.stringify(f.origen.modulos.map((m) => m.mov)));
    ok(f.origen.aviso === null && f.origen.motivo === null, "con todos emparejados no debía avisar nada");
    ok(f.destino.mov === 1800 && f.destino.dif === 0, "un destino sigue igual");
  }
  /* Uno BAJÓ y otro SUBIÓ (repusieron estibas): el total los resta y el módulo lo dice. */
  {
    const ini = corte("inicial", H1, [rengM("L1", 0, [sitio("A01", 40, "estibas"), sitio("A03", 10, "estibas")], [sitio("B12", 0, "cajas")])]);
    const fin = corte("final", H2, [rengM("L1", 1500, [sitio("A01", 20, "estibas"), sitio("A03", 15, "estibas")], [sitio("B12", 1500, "cajas")])]);
    const f = analizar(ini, fin, porEstiba).filas[0];
    ok(f.origen.mov === 1200 - 300 && f.origen.dif === 1500 - 900, `bajó en uno y subió en otro: ${f.origen.mov} / ${f.origen.dif}`);
    ok(f.origen.modulos[1].mov === -300, "el módulo repuesto debía dar −300: " + f.origen.modulos[1].mov);
  }
  /* DESTINO con varios módulos y el factor del PRODUCTO (30 por estiba, m3). */
  {
    const ini = corte("inicial", H1, [rengM("L1", 0, [sitio("A01", 40, "estibas")], [sitio("B12", 0, "cajas"), sitio("B13", 1, "estibas")], "m1", "m3")]);
    const fin = corte("final", H2, [rengM("L1", 1200, [sitio("A01", 30, "estibas")], [sitio("B12", 600, "cajas"), sitio("B13", 21, "estibas")], "m1", "m3")]);
    const f = analizar(ini, fin, porEstiba).filas[0];
    ok(f.destino.mov === 600 + 600 && f.destino.dif === 0, `destino con dos módulos: subió ${f.destino.mov}, dif ${f.destino.dif}`);
  }
  /* UN MÓDULO QUE SOLO ESTÁ EN UN CORTE no entra a la suma, y el lado lo dice. */
  {
    const ini = corte("inicial", H1, [rengM("L1", 0, [sitio("A01", 40, "estibas"), sitio("A04", 10, "estibas")], [sitio("B12", 0, "cajas")])]);
    const fin = corte("final", H2, [rengM("L1", 600, [sitio("A01", 30, "estibas")], [sitio("B12", 600, "cajas")])]);
    const f = analizar(ini, fin, porEstiba, (id) => "módulo " + id).filas[0];
    ok(f.origen.mov === 600 && f.origen.dif === 0, `el módulo que falta en el final no debía entrar: ${f.origen.mov} / ${f.origen.dif}`);
    const a4 = f.origen.modulos.find((m) => m.ubicacion_id === "A04");
    ok(a4 && a4.mov === null && /Solo estaba en el inicial/.test(a4.nota), "A04 debía decir que solo estaba en el inicial: " + JSON.stringify(a4));
    ok(f.origen.aviso && /módulo A04/.test(f.origen.aviso) && /solo estaba en el inicial/.test(f.origen.aviso), "el aviso no nombra el módulo que quedó por fuera: " + f.origen.aviso);
  }
  {
    const ini = corte("inicial", H1, [rengM("L1", 0, [sitio("A01", 40, "estibas")], [sitio("B12", 0, "cajas")])]);
    const fin = corte("final", H2, [rengM("L1", 600, [sitio("A01", 30, "estibas"), sitio("A05", 3, "estibas")], [sitio("B12", 600, "cajas")])]);
    const f = analizar(ini, fin, porEstiba).filas[0];
    const a5 = f.origen.modulos.find((m) => m.ubicacion_id === "A05");
    ok(f.origen.mov === 600 && a5 && /Solo está en el final/.test(a5.nota) && f.origen.aviso, "un módulo nuevo en el final debía quedar por fuera con aviso: " + JSON.stringify(f.origen));
  }
  /* ESTIBAS SIN FACTOR en un módulo: ese queda por fuera, los demás suman. */
  {
    const ini = corte("inicial", H1, [rengM("L1", 0, [sitio("A01", 40, "estibas"), sitio("A02", 50, "cajas")], [sitio("B12", 0, "cajas")], null)]);
    const fin = corte("final", H2, [rengM("L1", 600, [sitio("A01", 30, "estibas"), sitio("A02", 40, "cajas")], [sitio("B12", 600, "cajas")], null)]);
    const f = analizar(ini, fin, porEstiba).filas[0];
    ok(f.origen.mov === 10 && f.origen.modulos[0].mov === null && /falta el envase/.test(f.origen.modulos[0].nota) && f.origen.aviso, "el módulo con estibas sin envase debía quedar por fuera: " + JSON.stringify(f.origen));
  }
  /* NINGÚN MÓDULO SE PUEDE EMPAREJAR: sin diferencia y con su motivo. */
  {
    const ini = corte("inicial", H1, [rengM("L1", 0, [sitio("A01", 40, "estibas"), sitio("A02", 5, "estibas")], [sitio("B12", 0, "cajas")])]);
    const fin = corte("final", H2, [rengM("L1", 600, [sitio("A07", 30, "estibas"), sitio("A08", 3, "estibas")], [sitio("B12", 600, "cajas")])]);
    const f = analizar(ini, fin, porEstiba).filas[0];
    ok(f.origen.dif === null && f.origen.mov === null && /Cambió de módulo/.test(f.origen.motivo) && f.origen.modulos.length === 4, "ningún módulo emparejado: " + JSON.stringify(f.origen));
  }
}
/* 8 · LEER DE LA BASE: los módulos nuevos, y los cortes viejos (un solo módulo en el renglón). */
{
  const base = { material_id: null, envase_id: "m1", nota: null, cajas_depa: "100", origen_ubicacion_id: null, origen_cant: null, origen_unidad: null, destino_ubicacion_id: null, destino_cant: null, destino_unidad: null };
  const ren = [
    { ...base, id: "r1", corte_id: "c1", linea: "L1" },
    { ...base, id: "r2", corte_id: "c2", linea: "L1", origen_ubicacion_id: "A01", origen_cant: "40.000", origen_unidad: "estibas", destino_ubicacion_id: "B12", destino_cant: "900", destino_unidad: "cajas" },
    { ...base, id: "r3", corte_id: "c2", linea: "L2" },
  ];
  const sit = [
    { renglon_id: "r1", rol: "origen", orden: 1, ubicacion_id: "A02", cant: "20", unidad: "estibas" },
    { renglon_id: "r1", rol: "origen", orden: 0, ubicacion_id: "A01", cant: "40", unidad: "estibas" },
    { renglon_id: "r1", rol: "destino", orden: 0, ubicacion_id: "B12", cant: "0", unidad: "cajas" },
  ];
  const m = renglonesPorCorte(ren, sit);
  const r1 = m.get("c1")[0];
  ok(r1.origenes.map((x) => x.ubicacion_id).join() === "A01,A02" && r1.origenes[1].cant === 20 && r1.destinos.length === 1, "los módulos nuevos, en el orden en que se anotaron: " + JSON.stringify(r1));
  const r2 = m.get("c2")[0];
  ok(r2.origenes.length === 1 && r2.origenes[0].ubicacion_id === "A01" && r2.origenes[0].cant === 40 && r2.destinos[0].cant === 900, "un corte viejo debía leerse de las columnas del renglón: " + JSON.stringify(r2));
  ok(m.get("c2")[1].origenes.length === 0 && m.get("c2")[1].destinos.length === 0, "un renglón sin módulos no debía inventar ninguno");
  ok(typeof r1.cajas_depa === "number" && r1.cajas_depa === 100, "las cajas de la depa deben ser número");
}
/* 6 · aCajas */
ok(aCajas({ ubicacion_id: "x", cant: 3, unidad: "estibas" }, 45) === 135, "3 estibas × 45");
ok(aCajas({ ubicacion_id: "x", cant: 3, unidad: "estibas" }, null) === null && aCajas({ ubicacion_id: "x", cant: 3, unidad: "estibas" }, 0) === null, "estibas sin factor");
ok(aCajas({ ubicacion_id: "x", cant: 7, unidad: "cajas" }, null) === 7 && aCajas(null, 5) === null, "cajas / sin sitio");
ok(duracion(0.25) === "15 min" && duracion(3) === "3 h" && duracion(-2) === "0 min", "duración");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Corte de líneas, las cuentas: pasadas, bajó del origen, subió en el destino, diferencias con su signo, y no inventa lo que no se puede comparar.");
