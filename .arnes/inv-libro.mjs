/* =====================================================================
   INVENTARIO · EL CONSOLIDADO DEL DÍA EN EXCEL — se arma con datos de
   prueba, se abre con openpyxl y LibreOffice, y se mira.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const js = buildSync({ entryPoints: [R("src/modulos/inventario/libro.ts")], bundle: true, write: false, format: "esm", platform: "node",
  external: ["exceljs", "fflate"], logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_libro.mjs"), js);
const { armarLibroDia } = await import(R(".arnes/_libro.mjs") + "?" + Date.now());
let n = 0;
const L = (o) => ({ id: "l" + ++n, conteo_id: o.c ?? "c2", conteo: o.c === "c1" ? "FEFO-01" : "FEFO-02", estado: "cerrado", codigo: o.sku ?? "3128",
  material: o.nom ?? "Águila Original 330 ml x 30", tipo_material: o.tipo ?? "PRODUCTO", familia: "Cerveza", factor_estibado: 80,
  ubicacion: o.u, calle: o.u[0], modulo: o.u.slice(1, 3), lado: o.u.endsWith("DER") ? "DER" : "IZQ", estibas: o.e ?? 2, cajas: 0, saldo: 0,
  total_cajas: o.t ?? 160, total_estibas: o.e ?? 2, capacidad: 3, venc_dia: null, venc_mes: null, venc_anio: null, fab_dia: null, fab_mes: null, fab_anio: null,
  fabricacion: "2026-06-01", vencimiento: o.sinf ? null : new Date(Date.now() + (o.dv ?? 60) * 864e5).toISOString().slice(0, 10),
  dias_para_vencer: o.sinf ? null : (o.dv ?? 60), dias_para_salir: o.sinf ? null : (o.dv ?? 60) - 30, rotacion: null, averia: !!o.av, pnc: false,
  estado_envase: null, nota: o.nota ?? null, ubicacion_combinada: o.u, conto: "Génesis Visbal", contado_en: "2026-09-22T14:00:00Z",
  producto_id: "p", ubicacion_id: "u-" + o.u });
const CONT = [
  { id: "c1", codigo: "FEFO-01", estado: "cerrado", bodega: "AG01", responsable: "Santiago Leal", fecha_analisis: "2026-09-22", enviado_en: "2026-09-22T12:00:00Z", envio_nombre: null, renglones: 2, ubicaciones: 2, total_cajas: 320 },
  { id: "c2", codigo: "FEFO-02", estado: "cerrado", bodega: "AG01", responsable: "Génesis Visbal", fecha_analisis: "2026-09-22", enviado_en: "2026-09-22T18:00:00Z", envio_nombre: null, renglones: 6, ubicaciones: 5, total_cajas: 900 },
];
const LIN = [
  L({ c: "c1", u: "A01IZQ", t: 999 }),              // reemplazado por c2
  L({ c: "c1", u: "Z09DER", sku: "3129", nom: "Águila Light 330", dv: 90 }),
  L({ u: "A01IZQ", t: 160 }), L({ u: "A01DER", dv: -3, t: 80 }), L({ u: "A02IZQ", dv: 32, e: 5, t: 400 }),
  L({ u: "A02IZQ", dv: 32, e: 1, t: 80 }),         // repetido + sobre capacidad (6 > 3)
  L({ u: "B01IZQ", sinf: true, sku: "3130", nom: "Póker 330" }), L({ u: "C01IZQ", tipo: "ENVASE", sku: "900", nom: "Canasta 30", sinf: true, av: true, nota: "rota" }),
  L({ u: "C02IZQ", sku: "7777", nom: "Fuera del maestro" }),
];
const MAT = ["3128", "3129", "3130", "900"].map((sku, i) => ({ id: "m" + i, sku, nombre: sku, unidades_por_caja: sku === "3130" ? null : 30, cajas_por_estiba: 80,
  unidades_por_estiba: 2400, contenido: null, familia: null, presentacion: null, vida_util: 180, f_limite_desp: null, dias_minimo: 30, origen: null, foraneo: null,
  tipo_material: sku === "900" ? "ENVASE" : "PRODUCTO", activo: true }));
const UBI = ["A01IZQ", "A01DER", "A02IZQ", "B01IZQ", "C01IZQ", "C02IZQ", "Z09DER", "D01IZQ", "D02DER"].map((k) => ({ id: "u-" + k, bodega_id: "b", clave: k, calle: k[0], modulo: k.slice(1, 3), lado: k.slice(3), familia: null, capacidad: 3, activa: true }));
const buf = await armarLibroDia({ fecha: "2026-09-22", bodega: "AG01", quien: "Cristian", conteos: CONT, lineas: LIN, materiales: MAT, ubicaciones: UBI, logo: readFileSync(R("public/marca/logo-b.png")), colores: process.env.COLORES ? JSON.parse(process.env.COLORES) : undefined });
const dest = (process.env.FOTO ?? "/tmp") + "/inventario-dia.xlsx";
writeFileSync(dest, buf);
const py = execSync(`python3 - <<'P'
import openpyxl, json, warnings
warnings.filterwarnings("ignore")
wb = openpyxl.load_workbook("${dest}")
wb2 = openpyxl.load_workbook("${dest}", data_only=True)
o = {"hojas": wb.sheetnames}
b = wb["Base"]; o["base"] = [[b.cell(r, 7).value, b.cell(r, 8).value, b.cell(r, 15).value, b.cell(r, 21).value] for r in range(7, b.max_row + 1)]
v = wb["Validar"]; o["validar"] = [v.cell(r, 1).value for r in range(7, v.max_row + 1)]
s = wb["Sin contar"]; o["sin"] = [s.cell(r, 1).value for r in range(7, s.max_row + 1)]
import zipfile
o["imgs"] = len([n for n in zipfile.ZipFile("${dest}").namelist() if n.startswith("xl/media/") and not n.endswith("/")])
o["total"] = b.cell(b.max_row, 1).value
o["filtro"] = b.auto_filter.ref
# LO CONTADO: las cuatro tarjetas van en la fila 13 (rótulo en la 12).
z = wb["Resumen"]
o["contado"] = {"cajas": z.cell(13, 2).value, "unidades": z.cell(13, 4).value, "estibas": z.cell(13, 6).value, "renglones": z.cell(13, 8).value}
o["rotulos"] = [z.cell(12, c).value for c in (2, 4, 6, 8)]
o["aclara"] = z.cell(20, 5).value
# La tabla de riesgo: 7 franjas desde la 22, el total en la 29.
o["riesgo"] = {"cajas": wb2["Resumen"].cell(29, 4).value, "rot": z.cell(29, 2).value}
o["cuadre"] = [str(z.cell(r, 8).value) for r in range(30, 40)]
m = wb["Por material"]
o["mats"] = [[m.cell(r, 1).value, m.cell(r, 3).value, m.cell(r, 7).value] for r in range(7, m.max_row + 1)]
print(json.dumps(o, default=str))
P`).toString();
const x = JSON.parse(py);
ok(x.hojas.join() === "Resumen,Base,Por material,Por ubicación,Validar,Sin contar", `hojas: ${x.hojas}`);
ok(x.imgs === 1, "el libro no trae el logo");
const filasBase = x.base.slice(0, -1);
ok(filasBase.length === 8, `base: ${filasBase.length} renglones (8: el A01IZQ viejo reemplazado)`);
ok(!filasBase.some((f) => f[2] === 999), "el renglón reemplazado quedó en la base");
ok(x.total === "TOTAL (lo filtrado)", "no hay fila de totales");
for (const t of ["Repetido", "Sin fecha", "Vencido", "Código fuera del maestro", "Sobre capacidad", "Reemplazado", "Avería"])
  ok(x.validar.includes(t), `Validar no avisa «${t}»: ${x.validar}`);
ok(JSON.stringify(x.sin) === JSON.stringify(["D01IZQ", "D02DER"]), `sin contar: ${x.sin}`);
ok(x.filtro === "A6:Z14", `filtro de la base: ${x.filtro}`);

/* ---------- EL ENVASE CUENTA EN LO CONTADO Y NO CUENTA EN EL RIESGO ----
   La foto son 8 renglones: 1.360 cajas y 18 estibas, de las cuales 160
   cajas y 2 estibas son canastas (ENVASE). La canasta no se vence, así
   que la tabla de riesgo suma 1.200 — pero «LO CONTADO» tiene que decir
   1.360, o el Excel enseña 18 estibas al lado de 1.200 cajas y nadie
   sabe cuál de las dos está mala. Este es el defecto que traía PRUEBA:
   un día de solo envase salía en ceros con las estibas puestas. */
ok(JSON.stringify(x.rotulos) === JSON.stringify(["CAJAS", "UNIDADES", "ESTIBAS", "RENGLONES"]), `las tarjetas de LO CONTADO se movieron de fila: ${x.rotulos}`);
ok(x.contado.cajas === 1360, `LO CONTADO · cajas: ${x.contado.cajas} (1360 con el envase)`);
ok(x.contado.estibas === 18, `LO CONTADO · estibas: ${x.contado.estibas}`);
ok(x.contado.renglones === 8, `LO CONTADO · renglones: ${x.contado.renglones}`);
/* 1.040 cajas traen factor (las 160 de Póker y las 160 del código fuera
   del maestro no), y 160 de esas 1.040 son canastas: si el envase se
   volviera a quedar por fuera, esto cae a 26.400. */
ok(x.contado.unidades === 31200, `LO CONTADO · unidades: ${x.contado.unidades} (31200 = 1040 cajas con factor × 30, envase incluido)`);
ok(x.riesgo.rot === "Total", `la fila 29 del Resumen ya no es el total del riesgo: ${x.riesgo.rot}`);
ok(x.riesgo.cajas === 1200, `riesgo · total de cajas: ${x.riesgo.cajas} (1200: sin las 160 del envase)`);
ok(/envase/i.test(x.aclara ?? ""), `falta la aclaración de que el riesgo es solo producto: ${x.aclara}`);
/* EL CUADRE APUNTA A LA TARJETA, NO A LA TABLA DE RIESGO. Con «D29» la
   diferencia salía de 160 cajas que nadie perdió. */
const cuadre = x.cuadre.find((c) => c.includes("-"));
ok(!!cuadre && cuadre.includes("B13") && !cuadre.includes("D29"), `el cuadre no compara contra LO CONTADO: ${cuadre}`);
const mats = x.mats.slice(0, -1);   // la última es la fila de totales
const m900 = mats.find((m) => m[0] === "900");
ok(!!m900, `«Por material» se saltó el envase: ${mats.map((m) => m[0])}`);
ok(m900 && m900[1] === "ENVASE" && m900[2] === 160, `el envase en «Por material» salió mal: ${JSON.stringify(m900)}`);
ok(mats.length === 5, `«Por material»: ${mats.length} materiales (5 con el envase y el que está fuera del maestro)`);
/* LibreOffice lo abre sin quejarse y lo pasa a PDF. */
try { execSync(`cd ${process.env.FOTO ?? "/tmp"} && timeout 90 soffice --headless --convert-to pdf inventario-dia.xlsx >/dev/null 2>&1`); }
catch { fallas.push("LibreOffice no pudo abrir el archivo") }
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Consolidado del día en Excel: 6 hojas con logo, base sin duplicar recorridos, totales que siguen al filtro, validación y sin contar; abre en LibreOffice.");
