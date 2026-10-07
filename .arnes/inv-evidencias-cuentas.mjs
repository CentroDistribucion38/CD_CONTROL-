/* EVIDENCIAS — las cuentas puras (tendencia por ubicación, estados, PNC, lecturas).
     node .arnes/inv-evidencias-cuentas.mjs */
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
buildSync({ entryPoints: [R("src/modulos/inventario/evidencias.ts")], bundle: true, format: "esm", platform: "node", outfile: R(".arnes/tmp/evidencias.mjs"), logLevel: "error" });
const E = await import(R(".arnes/tmp/evidencias.mjs"));

const nov = (dia, ub, tipo, extra = {}) => ({ dia, conteo_id: "c" + dia, conteo: "C", ubicacion_id: ub, ubicacion: ub, calle: ub[0], modulo: ub.slice(1, 3), lado: "DER",
  tipo, linea_id: null, codigo: null, material: null, cajas: null, persona: "Ana", hora: dia + "T13:00:00Z", ruta: null, pnc_rotulo: null, pnc_bloqueo_mecanico: null, cumple: null, ...extra });
const cob = (dia, ub) => ({ dia, ubicacion_id: ub, ubicacion: ub, calle: ub[0], modulo: ub.slice(1, 3), lado: "DER", renglones: 3, conteos: 1 });
/* 5 días: 10-01 … 10-05 */
const novs = [
  /* A01: novedad d1, d2, d3, d4, d5 → PERSISTE (racha 5) */
  ...["01", "02", "03", "04", "05"].map((d) => nov(`2026-10-${d}`, "A01", "averia")),
  /* B02: novedad d1; limpia d2…d5 → YA NO */
  nov("2026-10-01", "B02", "pnc", { pnc_rotulo: true, pnc_bloqueo_mecanico: false, cumple: false }),
  /* C03: limpia d1, novedad d2, limpia d3, novedad d5 (d4 no se contó) → REINCIDE */
  nov("2026-10-02", "C03", "mezclado"), nov("2026-10-05", "C03", "mezclado"),
  /* D04: solo novedad d5 → NUEVA */
  nov("2026-10-05", "D04", "sin_acceso"),
  /* E05: novedad d2, d3 y luego d4 no contada, d5 no contada → su último día visto es d3 con novedad y antes d2 → PERSISTE (no «ya no») */
  nov("2026-10-02", "E05", "pnc", { pnc_rotulo: true, pnc_bloqueo_mecanico: true, cumple: true, ruta: "x.jpg" }), nov("2026-10-03", "E05", "pnc"),
];
const cobs = [
  ...["01", "02", "03", "04", "05"].flatMap((d) => [cob(`2026-10-${d}`, "A01")]),
  ...["01", "02", "03", "04", "05"].map((d) => cob(`2026-10-${d}`, "B02")),
  cob("2026-10-01", "C03"), cob("2026-10-03", "C03"), /* d4 NO */ 
  cob("2026-10-01", "D04"), cob("2026-10-02", "D04"), cob("2026-10-03", "D04"), cob("2026-10-04", "D04"),
  cob("2026-10-01", "E05"),
];
const a = E.analizar(novs, cobs, "2026-10-01", "2026-10-05");
const f = (k) => a.filas.find((x) => x.clave === k);
ok(a.dias.length === 5, "5 días");
ok(a.total === 11, `total ${a.total}`);
ok(a.ubicacionesAfectadas === 5, "5 ubicaciones afectadas");
ok(f("A01").tendencia === "persiste" && f("A01").racha === 5, "A01 persiste con racha 5");
ok(f("B02").tendencia === "ya_no", "B02 ya no");
ok(f("C03").tendencia === "reincide", "C03 reincide: " + f("C03").tendencia);
ok(f("D04").tendencia === "nueva", "D04 nueva: " + f("D04").tendencia);
ok(f("E05").tendencia === "persiste", "E05 persiste (los días sin conteo no la limpian): " + f("E05").tendencia);
ok(f("C03").celdas.map((c) => c.estado).join() === "limpia,novedad,limpia,sin,novedad", "C03 celdas: " + f("C03").celdas.map((c) => c.estado).join());
ok(f("E05").celdas.map((c) => c.estado).join() === "limpia,novedad,novedad,sin,sin", "E05 celdas: " + f("E05").celdas.map((c) => c.estado).join());
ok(a.filas[0].tendencia === "persiste", "las que persisten van primero");
ok(a.filas[a.filas.length - 1].tendencia === "ya_no", "las que ya no, al final");
ok(JSON.stringify(a.conteoTendencia) === JSON.stringify({ nueva: 1, persiste: 2, reincide: 1, ya_no: 1 }), "conteo por tendencia " + JSON.stringify(a.conteoTendencia));
ok(a.porDia[0].total === 2 && a.porDia[0].contadas === 5, `día 1: total ${a.porDia[0].total} contadas ${a.porDia[0].contadas}`);
ok(a.porDia[3].contadas === 3, "día 4: A01,B02,D04 contadas = " + a.porDia[3].contadas);
ok(a.porTipo.averia === 5 && a.porTipo.pnc === 3 && a.porTipo.mezclado === 2 && a.porTipo.sin_acceso === 1, "por tipo " + JSON.stringify(a.porTipo));
ok(a.pnc.total === 3 && a.pnc.respondidos === 2 && a.pnc.cumplen === 1 && a.pnc.noCumplen === 1 && a.pnc.sinRespuesta === 1 && a.pnc.sinBloqueo === 1 && a.pnc.sinRotulo === 0, "PNC " + JSON.stringify(a.pnc));
ok(a.fotos === 1, "una foto");
ok(a.modulos[0].modulo === "A01" && a.modulos[0].total === 5, "módulo A01 el de más novedades");
/* filtro por tipo */
const soloAv = E.analizar(novs, cobs, "2026-10-01", "2026-10-05", ["averia"]);
ok(soloAv.total === 5 && soloAv.ubicacionesAfectadas === 1, "filtro por avería");
/* rango sin nada */
const vacio = E.analizar([], [], "2026-10-01", "2026-10-03");
ok(vacio.total === 0 && E.lecturas(vacio)[0].includes("ninguna novedad"), "vacío");
const L = E.lecturas(a);
ok(L.length >= 4 && L[0].includes("11 novedades en 5 ubicaciones"), "lectura: " + L[0]);
ok(E.letrasTipos(["pnc", "averia"]) === "A·P", "letras");
ok(E.rangoDias("2026-09-29", "2026-10-02").join() === "2026-09-29,2026-09-30,2026-10-01,2026-10-02", "rango cruza el mes");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Evidencias (cuentas): tendencia Nueva/Persiste/Reincide/Ya no sobre los días contados, sin confundir «no se contó» con «limpia»; PNC, tipos, módulos y lecturas.");
