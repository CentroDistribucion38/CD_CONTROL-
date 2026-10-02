/* =====================================================================
   EL EXCEL DEL CONSOLIDADO CON FOTOS: la evidencia va en OTRA hoja
   («Evidencias») y las demás no se mueven ni un byte. Sin fotos, el libro
   sale sin esa hoja. «Para no dañar lo que tenemos.»
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const js = buildSync({ entryPoints: [R("src/modulos/inventario/libro.ts")], bundle: true, write: false, format: "esm", platform: "node",
  external: ["exceljs", "fflate"], logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_libro-evid.mjs"), js);
const { armarLibroDia } = await import(R(".arnes/_libro-evid.mjs") + "?" + Date.now());
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

const base = { fecha: "2026-10-01", bodega: "AG01", quien: "Cristian", conteos: CONT, lineas: LIN, materiales: MAT, ubicaciones: UBI };
const JPG = readFileSync(R(".arnes/_foto.jpg"));
const sin = await armarLibroDia(base);
const con = await armarLibroDia({ ...base, evidencias: [
  { linea_id: LIN[1].id, foto: JPG, ancho: 640, alto: 480, tomada_en: "2026-10-01T15:30:00Z" },
  { linea_id: LIN[6].id, foto: JPG, ancho: 480, alto: 640, tomada_en: "2026-10-01T15:45:00Z" },
  { linea_id: "no-existe", foto: JPG, ancho: null, alto: null, tomada_en: null },
  { linea_id: LIN[0].id, foto: Buffer.alloc(0), ancho: null, alto: null, tomada_en: null },
] });
const vacio = await armarLibroDia({ ...base, evidencias: [] });
const nombres = async (b) => { const w = new ExcelJS.Workbook(); await w.xlsx.load(b); return w.worksheets.map((h) => h.name) };
const sinN = await nombres(sin), conN = await nombres(con), vacN = await nombres(vacio);
ok(!sinN.includes("Evidencias") && !vacN.includes("Evidencias"), "sin fotos sale una hoja «Evidencias» vacía: " + sinN.join(","));
ok(conN.join(",") === sinN.join(",") + ",Evidencias", `con fotos las hojas no son las de siempre + Evidencias: ${conN.join(",")}`);

/* LAS DEMÁS HOJAS NO SE MUEVEN: el XML de cada una es idéntico con y sin fotos. */
const zs = unzipSync(new Uint8Array(sin)), zc = unzipSync(new Uint8Array(con));
const td = new TextDecoder();
for (const h of ["sheet1", "sheet2", "sheet3", "sheet4", "sheet5", "sheet6"]) {
  const a = td.decode(zs[`xl/worksheets/${h}.xml`]), b = td.decode(zc[`xl/worksheets/${h}.xml`]);
  ok(a === b, `la hoja ${h} cambió al agregar fotos (${a.length} → ${b.length} bytes)`);
}
ok(Object.keys(zc).filter((k) => k.startsWith("xl/media/")).length >= 3, "las fotos no quedaron incrustadas (media): " + Object.keys(zc).filter((k) => k.startsWith("xl/media/")).join(","));

const wb = new ExcelJS.Workbook(); await wb.xlsx.load(con);
const h = wb.getWorksheet("Evidencias");
ok(h.getRow(6).values.slice(1).join("|") === "Recorrido|Ubicación|Código|Material|Total cajas|Estado envase|Marca|Nota|Foto tomada|Foto", "encabezado de Evidencias: " + h.getRow(6).values.slice(1).join("|"));
ok(/3 fotos/.test(h.getCell(4, 1).value), "el subtítulo no cuenta 3 fotos (la vacía no cuenta): " + h.getCell(4, 1).value);
const ubi = [7, 8, 9].map((f) => h.getCell(f, 2).value);
ok(ubi[0] === "A01_IZQ" && ubi[1] === "A10_DER" && /ya no está/.test(ubi[2]), "las fotos no salen ordenadas por sitio, con la huérfana al final: " + ubi.join(" | "));
ok(h.getCell(7, 5).value === 80 && h.getCell(7, 3).value === "3128", "la fila de la foto no trae el renglón al que respalda");
ok(h.getImages().length === 3, `la hoja debía traer 3 imágenes y trae ${h.getImages().length}`);
const im = h.getImages().map((i) => i.range.tl);
ok(im.every((t, i) => Math.round(t.nativeCol ?? t.col) === 9 && Math.floor(t.nativeRow ?? t.row) === 6 + i), "las fotos no están ancladas a la columna Foto, una por fila: " + im.map((t) => `${t.nativeCol ?? t.col},${t.nativeRow ?? t.row}`).join(" "));
ok(h.getRow(7).height >= 150, "la fila de la foto es muy baja");
ok(h.autoFilter && /^A6:J9$/.test(String(h.autoFilter?.ref ?? h.autoFilter)), "filtro de la hoja: " + String(h.autoFilter?.ref ?? h.autoFilter));
/* Pasa por el remiendo de filtros: el workbook.xml no se rompió. */
ok(/_FilterDatabase/.test(td.decode(zc["xl/workbook.xml"])), "se perdieron los filtros del libro");
/* Con la nota de recortadas. */
const rec = await armarLibroDia({ ...base, fotosRecortadas: 4, evidencias: [{ linea_id: LIN[1].id, foto: JPG, ancho: 640, alto: 480, tomada_en: null }] });
const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(rec);
ok(/otras 4 no entraron/.test(w2.getWorksheet("Evidencias").getCell(4, 1).value), "no dice que quedaron fotos por fuera");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Excel con fotos: «Evidencias» es una hoja aparte que solo existe si hay fotos, las otras seis hojas quedan idénticas byte a byte, cada foto va anclada en su fila con el renglón al lado, y avisa si algunas no entraron.");
