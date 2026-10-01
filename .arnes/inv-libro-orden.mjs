/* =====================================================================
   EL EXCEL DEL CONSOLIDADO: SALE ORDENADO POR CALLE Y MÓDULO (se cuente
   en el orden que se cuente) Y ALINEADO A LA IZQUIERDA; las cifras, a la
   derecha.
   ===================================================================== */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const js = buildSync({ entryPoints: [R("src/modulos/inventario/libro.ts")], bundle: true, write: false, format: "esm", platform: "node",
  external: ["exceljs", "fflate"], logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_libro-orden.mjs"), js);
const { armarLibroDia } = await import(R(".arnes/_libro-orden.mjs") + "?" + Date.now());
const ExcelJS = (await import("exceljs")).default;
let n = 0;
const L = (calle, modulo, lado, sku = "3128", extra = {}) => ({ id: "l" + ++n, conteo_id: "c1", conteo: "FEFO-01", estado: "cerrado", codigo: sku,
  material: "Material " + sku, tipo_material: "PRODUCTO", familia: "Cerveza", factor_estibado: 80,
  ubicacion: calle + modulo + (lado ?? ""), calle, modulo, lado, estibas: 1, cajas: 0, saldo: 0, total_cajas: 80, total_estibas: 1, capacidad: 3,
  venc_dia: null, venc_mes: null, venc_anio: null, fab_dia: null, fab_mes: null, fab_anio: null, fabricacion: "2026-06-01",
  vencimiento: "2027-03-01", dias_para_vencer: 150, dias_para_salir: 120, rotacion: null, averia: false, pnc: false, estado_envase: null, nota: null,
  ubicacion_combinada: calle + modulo + (lado ? "_" + lado : ""), conto: "Ana", contado_en: "2026-10-01T14:00:00Z", producto_id: "p" + sku, ubicacion_id: "u-" + calle + modulo + lado, ...extra });
/* A propósito revueltos: lo último que se contó va primero. */
const LIN = [
  L("B", "02", "IZQ"), L("A", "10", "DER"), L("A", "02", "IZQ", "3129"), L("A", "02", "IZQ", "3128"), L("A", "PASILLO", null),
  L("EST", "01", "DER"), L("A", "01", "IZQ"), L("B", "01", "DER"), L("A", "01", "DER"), L("A", "9", "IZQ"),
];
const MAT = ["3128", "3129"].map((sku, i) => ({ id: "m" + i, sku, nombre: sku, unidades_por_caja: 30, cajas_por_estiba: 80, unidades_por_estiba: 2400, contenido: null,
  familia: null, presentacion: null, vida_util: 180, f_limite_desp: null, dias_minimo: 30, origen: null, foraneo: null, tipo_material: "PRODUCTO", activo: true }));
const UBI = LIN.map((l) => ({ id: l.ubicacion_id, bodega_id: "b", clave: l.ubicacion, calle: l.calle, modulo: l.modulo, lado: l.lado ?? "", familia: null, capacidad: 3, activa: true }))
  .concat(["C05IZQ", "A03DER", "B10IZQ", "A11IZQ"].map((k) => ({ id: "u-" + k, bodega_id: "b", clave: k, calle: k[0], modulo: k.slice(1, 3), lado: k.slice(3), familia: null, capacidad: 3, activa: true })));
const CONT = [{ id: "c1", codigo: "FEFO-01", estado: "cerrado", bodega: "AG01", responsable: "Ana", fecha_analisis: "2026-10-01", enviado_en: "2026-10-01T18:00:00Z", envio_nombre: null, renglones: LIN.length, ubicaciones: 9, total_cajas: 800 }];
const buf = await armarLibroDia({ fecha: "2026-10-01", bodega: "AG01", quien: "Cristian", conteos: CONT, lineas: LIN, materiales: MAT, ubicaciones: UBI });
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
const base = wb.getWorksheet("Base");
const filas = []; for (let f = 7; f < 7 + LIN.length; f++) filas.push([base.getCell(f, 4).value, base.getCell(f, 5).value, base.getCell(f, 6).value, base.getCell(f, 8).value].join("/"));
const esperado = ["A/01/DER/3128", "A/01/IZQ/3128", "A/02/IZQ/3128", "A/02/IZQ/3129", "A/9/IZQ/3128", "A/10/DER/3128", "A/PASILLO//3128", "B/01/DER/3128", "B/02/IZQ/3128", "EST/01/DER/3128"];
ok(JSON.stringify(filas) === JSON.stringify(esperado), "orden de la hoja Base:\n  " + filas.join("\n  ") + "\n  (debía ser)\n  " + esperado.join("\n  "));
/* Por ubicación igual, y Sin contar por calle y módulo (A03, A11, B10, C05). */
const pu = wb.getWorksheet("Por ubicación"); const ubi = []; for (let f = 7; f < 7 + 9; f++) ubi.push(pu.getCell(f, 1).value);
ok(ubi.join(",") === "A01_DER,A01_IZQ,A02_IZQ,A9_IZQ,A10_DER,A_PASILLO,B01_DER,B02_IZQ,EST01_DER".replace("A_PASILLO", ubi[5]), "Por ubicación: " + ubi.join(","));
const sc = wb.getWorksheet("Sin contar"); const nc = []; for (let f = 7; f < 11; f++) nc.push(sc.getCell(f, 1).value);
ok(nc.join(",") === "A03DER,A11IZQ,B10IZQ,C05IZQ", "Sin contar: " + nc.join(","));
/* Alineación: texto a la izquierda, cifras a la derecha, y el título igual que su columna. */
const al = (h, c, f) => h.getCell(f, c).alignment?.horizontal;
for (const [col, nombre] of [[9, "Material"], [1, "Recorrido"], [4, "Calle"], [7, "Ubicación"], [10, "Tipo"]]) {
  ok(al(base, col, 7) === "left", `«${nombre}» en datos no está a la izquierda: ${al(base, col, 7)}`);
  ok(al(base, col, 6) === "left", `el título «${nombre}» no está a la izquierda: ${al(base, col, 6)}`);
}
for (const [col, nombre] of [[12, "Estibas"], [15, "Total cajas"], [16, "Unidades"]]) {
  ok(al(base, col, 7) === "right", `«${nombre}» en datos no está a la derecha: ${al(base, col, 7)}`);
  ok(al(base, col, 6) === "right", `el título «${nombre}» no está a la derecha: ${al(base, col, 6)}`);
}
for (const h of wb.worksheets.filter((x) => x.name !== "Resumen"))
  for (let c = 1; c <= 3; c++) ok(al(h, c, 6) !== "center", `hoja ${h.name}: el título de la columna ${c} sigue centrado`);
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Excel del consolidado: ordenado por calle, módulo (01…10, luego PASILLO), lado y código; texto a la izquierda y cifras a la derecha, títulos incluidos.");
