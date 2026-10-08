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
  L({ u: "A01IZQ", t: 160 }), L({ u: "A01DER", dv: -3, e: 1, t: 80 }), L({ u: "A02IZQ", dv: 32, e: 5, t: 400 }),
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
b = wb2["Base consolidada"]; bf = wb["Base consolidada"]
o["base"] = [[b.cell(r, 7).value, b.cell(r, 8).value, b.cell(r, 16).value, b.cell(r, 25).value] for r in range(7, b.max_row + 1)]
o["formulas_base"] = [bf.cell(7, c).value for c in (12, 15, 16, 17, 18, 19, 20, 31)]
o["cabeza_base"] = [bf.cell(6, c).value for c in range(1, 32)]
v = wb["Validar"]; o["validar"] = [v.cell(r, 1).value for r in range(7, v.max_row + 1)]
s = wb["Sin contar"]; o["sin"] = [s.cell(r, 1).value for r in range(7, s.max_row + 1)]
import zipfile
o["imgs"] = len([n for n in zipfile.ZipFile("${dest}").namelist() if n.startswith("xl/media/") and not n.endswith("/")])
o["total"] = b.cell(b.max_row, 1).value
o["hora"] = str(b.cell(7, 3).value)
o["filtro"] = bf.auto_filter.ref
z = wb2["Tablero"]; zf = wb["Tablero"]
o["contado"] = {"cajas": z["R9"].value, "unidades": z["W9"].value, "estibas": z["AB9"].value, "renglones": z["M12"].value, "plast": z["AG9"].value}
o["rotulos"] = [z[a].value for a in ("R8", "W8", "AB8", "AG8")]
o["estibas_tarjetas"] = [[z[a].value for a in ("V17", "V18", "V19", "V20")], [z[a].value for a in ("AA17", "AA18", "AA19", "AA20")]]
o["espacio"] = [[z[a].value for a in ("AK17", "AK18", "AK19", "AK20")], [z[a].value for a in ("AQ17", "AQ18", "AQ19", "AQ20")]]
o["aclara"] = z["K36"].value
o["riesgo"] = {"cajas": sum((z.cell(r, 14).value or 0) for r in range(37, 44)), "filas": [z.cell(r, 4).value for r in range(37, 44)]}
o["clases"] = {z.cell(r, 2).value: [z[f"{L}{r}"].value for L in ("F", "I", "L", "O", "R", "U", "X")] for r in range(25, 30)}
o["calles"] = {z.cell(r, 27).value: [z[f"{L}{r}"].value for L in ("AD", "AH", "AU")] for r in range(25, 32) if z.cell(r, 27).value}
o["cuadre"] = [str(z["R43"].value), str(zf["R43"].value), str(zf["BA15"].value)]
o["focos"] = [str(z["AL37"].value), str(z["AL40"].value), str(z["AL43"].value), str(z["AL46"].value)]
o["titulo"] = [str(z["I2"].value), str(z["AO3"].value), z["AO3"].number_format]
o["navegacion"] = [str(zf[a].value) for a in ("E6", "AM6")]
o["cf"] = len(zf.conditional_formatting)
o["area"] = str(zf.print_area)
o["charts"] = [n for n in zipfile.ZipFile("${dest}").namelist() if n.startswith("xl/charts/chart")]
m = wb2["Por material"]
o["mats"] = [[m.cell(r, 1).value, m.cell(r, 3).value, m.cell(r, 8).value] for r in range(7, m.max_row + 1)]
u = wb2["Por ubicación"]
o["ubi"] = {u.cell(r, 1).value: [u.cell(r, c).value for c in range(5, 15)] for r in range(7, u.max_row)}
for nom in ("Base envase", "Base producto"):
    t = wb2[nom]; o[nom] = [[t.cell(r, c).value for c in (8, 12, 16)] for r in range(7, t.max_row)]
a = wb2["Análisis"]
o["analisis"] = [[a.cell(r, c).value for c in range(1, 8)] for r in range(1, a.max_row + 1)]
o["maestro"] = [[wb2["Maestro"].cell(r, c).value for c in range(1, 7)] for r in range(7, wb2["Maestro"].max_row + 1)]
print(json.dumps(o, default=str))
P`).toString();
const x = JSON.parse(py);
ok(x.hojas.join() === "Tablero,Base consolidada,Base envase,Base producto,Análisis,Por material,Por ubicación,Validar,Sin contar,Maestro,Cómo leer", `hojas: ${x.hojas}`);
ok(x.imgs === 1, "el libro no trae el logo");
/* LA HORA ES LA DE COLOMBIA: 14:00 UTC = 09:00 en Bogotá (antes salía 14:00, cinco horas adelantada). */
ok(x.hora === "2026-09-22 09:00:00", `«Contado» en la hoja Base consolidada: ${x.hora} (debe ser 2026-09-22 09:00:00, hora de Colombia)`);
/* LA HOJA BASE ES LA MISMA «LA BASE» DE LA PANTALLA: se compara con el cruce que usa la pantalla (base-cruce.ts). */
const jc = buildSync({ entryPoints: [R("src/modulos/inventario/base-cruce.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_cruce.mjs"), jc);
const { cruzar } = await import(R(".arnes/_cruce.mjs") + "?" + Date.now());
const pantalla = cruzar(LIN, CONT).vigentes;
const excelBase = x.base.slice(0, -1);
ok(excelBase.length === pantalla.length, `la hoja Base trae ${excelBase.length} renglones y «La base» de la pantalla ${pantalla.length}`);
const clavesP = pantalla.map((l) => `${l.ubicacion}|${l.codigo}|${Number(l.total_cajas)}`).sort().join("\n");
const clavesX = excelBase.map((f) => `${f[0]}|${f[1]}|${f[2]}`).sort().join("\n");
ok(clavesP === clavesX, "los renglones de la hoja Base no son los mismos de «La base» de la pantalla");
/* SIN TOPE OCULTO: el paginador sigue pidiendo hasta que se acaban las filas (PostgREST corta en 1.000). */
const jp = buildSync({ entryPoints: [R("src/modulos/inventario/paginas.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_paginas.mjs"), jp);
const { todas, porTandas } = await import(R(".arnes/_paginas.mjs") + "?" + Date.now());
const fuente = Array.from({ length: 2750 }, (_, i) => ({ id: i }));
const pedidas = [];
const r1 = await todas(async (d, h) => { pedidas.push([d, h]); return { data: fuente.slice(d, Math.min(h, d + 999) + 1), error: null } });
ok(r1.data.length === 2750 && !r1.error, `el paginador trajo ${r1.data.length} de 2750`);
ok(new Set(r1.data.map((x) => x.id)).size === 2750, "el paginador repitió filas");
const r2 = await porTandas(Array.from({ length: 60 }, (_, i) => "c" + i), async (t, d, h) => ({ data: t.slice(d, h + 1).map((c) => ({ id: c })), error: null }));
ok(r2.data.length === 60, `por tandas: ${r2.data.length} de 60`);
const filasBase = x.base.slice(0, -1);
ok(filasBase.length === 8, `base: ${filasBase.length} renglones (8: el A01IZQ viejo reemplazado)`);
ok(!filasBase.some((f) => f[2] === 999), "el renglón reemplazado quedó en la base");
ok(x.total === "TOTAL (lo filtrado)", "no hay fila de totales");
for (const t of ["Repetido", "Sin fecha", "Vencido", "Código fuera del maestro", "Sobre capacidad", "Reemplazado", "Avería"])
  ok(x.validar.includes(t), `Validar no avisa «${t}»: ${x.validar}`);
ok(JSON.stringify(x.sin) === JSON.stringify(["D01IZQ", "D02DER"]), `sin contar: ${x.sin}`);
ok(x.filtro === "A6:AE14", `filtro de la base: ${x.filtro}`);

/* ---------- EL ENVASE CUENTA EN LO CONTADO Y NO CUENTA EN EL RIESGO ----
   La foto son 8 renglones: 1.360 cajas y 17 estibas, de las cuales 160
   cajas y 2 estibas son canastas (ENVASE). La canasta no se vence, así
   que la tabla de riesgo suma 1.200 — pero «LO CONTADO» tiene que decir
   1.360, o el Excel enseña 17 estibas al lado de 1.200 cajas y nadie
   sabe cuál de las dos está mala. Este es el defecto que traía PRUEBA:
   un día de solo envase salía en ceros con las estibas puestas. */
ok(JSON.stringify(x.rotulos) === JSON.stringify(["CAJAS", "UNIDADES", "ESTIBAS FÍSICAS", "CAJAS PLÁSTICAS"]), `las cifras grandes del Tablero se movieron: ${x.rotulos}`);
ok(x.contado.cajas === 1360, `LO CONTADO · cajas: ${x.contado.cajas} (1360 con el envase)`);
ok(x.contado.renglones === 8, `renglones: ${x.contado.renglones}`);
ok(x.contado.estibas === 17, `LO CONTADO · estibas: ${x.contado.estibas}`);
ok(x.contado.renglones === 8, `LO CONTADO · renglones: ${x.contado.renglones}`);
/* 1.040 cajas traen factor (las 160 de Póker y las 160 del código fuera
   del maestro no), y 160 de esas 1.040 son canastas: si el envase se
   volviera a quedar por fuera, esto cae a 26.400. */
ok(x.contado.unidades === 31200, `LO CONTADO · unidades: ${x.contado.unidades} (31200 = 1040 cajas con factor × 30, envase incluido)`);
ok(x.riesgo.cajas === 1200, `riesgo · total de cajas: ${x.riesgo.cajas} (1200: sin las 160 del envase; incluye las 160 de producto sin fecha)`);
ok(/producto terminado/i.test(x.aclara ?? ""), `falta la aclaración de que el riesgo es solo producto: ${x.aclara}`);
/* EL CUADRE: recorridos contra el consolidado (lo de «LO CONTADO»), no contra la tabla de riesgo (solo producto). */
ok(x.cuadre[1].includes("$BA$15") && x.cuadre[1].includes("Base consolidada") && !x.cuadre[1].includes("$N$"), `el cuadre no compara contra el consolidado: ${x.cuadre[1]}`);
ok(x.cuadre[2].includes("Base consolidada") && x.cuadre[2].includes("$AE$41"), `la diferencia de recorridos no sale de la base: ${x.cuadre[2]}`);
ok(/No cuadra|Se volvió a contar|Cuadra/.test(x.cuadre[0]), `mensaje de cuadre: ${x.cuadre[0]}`);
ok(x.contado.plast === 1360, `cajas plásticas (todo menos barriles y madera): ${x.contado.plast}`);
ok(x.titulo[0] === "INVENTARIO CONSOLIDADO · AG01", `título del Tablero: ${x.titulo[0]}`);
ok(x.navegacion[0].includes("Base consolidada") && x.navegacion[1].includes("Sin contar"), `barra de enlaces: ${x.navegacion}`);
ok(x.focos[0].startsWith("Calle ") && x.focos[2] === "Vencimiento sin fecha" && x.focos[3] === "Conteo pendiente", `focos de atención: ${x.focos}`);
ok(x.cf >= 8, `semáforos (formato condicional) del Tablero: ${x.cf}`);
ok(/Tablero.*\$A\$1:\$AX\$52/.test(x.area) || x.area.includes("A1:AX52"), `área de impresión del Tablero: ${x.area}`);
ok(x.charts.length === 2, `las dos donas del Tablero: ${x.charts}`);
const mats = x.mats.slice(0, -1);   // la última es la fila de totales
const m900 = mats.find((m) => m[0] === "900");
ok(!!m900, `«Por material» se saltó el envase: ${mats.map((m) => m[0])}`);
ok(m900 && m900[1] === "ENVASE" && m900[2] === 160, `el envase en «Por material» salió mal: ${JSON.stringify(m900)}`);
ok(mats.length === 5, `«Por material»: ${mats.length} materiales (5 con el envase y el que está fuera del maestro)`);

/* ---------- TODO FORMULADO: de dónde sale cada cifra ---------- */
ok(!JSON.stringify(x.cabeza_base).includes("Cajas sueltas"), "«Cajas sueltas» sigue como columna");
ok(x.cabeza_base.includes("Cajas por estiba") && x.cabeza_base.includes("Estibas físicas") && x.cabeza_base.includes("Cajas plásticas"), `faltan columnas de factor/estibas/plástico: ${x.cabeza_base}`);
ok(x.formulas_base.every((f) => typeof f === "string" && f.startsWith("=")), `la base no está formulada: ${JSON.stringify(x.formulas_base)}`);
ok(/Maestro!/.test(x.formulas_base[1]), "el factor de estibado no sale de Maestro");
ok(/\*/.test(x.formulas_base[2]), "el total de cajas no es estibas × factor + saldo");
/* La fórmula tiene que dar lo mismo que guardó la aplicación (las 8 de la base). */
ok(!x.validar.includes("No cuadra con la aplicación"), "la fórmula del total de cajas no cuadra con la aplicación");
/* Clases: producto 6 renglones (A01IZQ, A01DER, A02IZQ×2, B01IZQ, C02IZQ), envase 1 (la canasta). */
/* La tabla por clase: [estibas, cajas, plásticas, unidades, hl, % cajas, renglones] — los renglones van de último. */
ok(x.clases.Producto?.[6] === 7 && x.clases.Producto?.[2] === 1200, `clase Producto: ${JSON.stringify(x.clases.Producto)}`);
ok(x.clases.Envase?.[6] === 1 && x.clases.Envase?.[1] === 160 && x.clases.Envase?.[2] === 160, `clase Envase: ${JSON.stringify(x.clases.Envase)}`);
ok(Math.abs(x.clases.Total?.[5] - 1) < 1e-9 && x.clases.Total?.[2] === 1360, `la tabla por clase no suma 100% o las plásticas no suman 1360: ${JSON.stringify(x.clases.Total)}`);
ok(x.clases.Libre?.[6] === 0 && x.clases["Otro envase"]?.[6] === 0, `las clases Libre y Otro envase deben salir (en cero): ${JSON.stringify(x.clases)}`);
ok(x.calles.A && x.calles.A.join() === "9,9,1", `ocupación por calle (A: capacidad, ocupadas, %): ${JSON.stringify(x.calles)}`);
ok(x.clases.Total?.[1] === 1360, `total cajas en la tabla por clase: ${JSON.stringify(x.clases.Total)}`);
/* Estibas físicas: las completas, y 0 por saldo (en esta prueba no hay saldos). */
ok(x.clases.Total?.[0] === 17, `estibas físicas: ${JSON.stringify(x.clases.Total)}`);
ok(x.estibas_tarjetas[0].join() === "Con envase,Libres,Con producto,Total", `tarjeta de estibas: ${x.estibas_tarjetas}`);
ok(x.estibas_tarjetas[1].join() === "2,0,15,17", `envase/libres/producto/total (17 = las estibas físicas): ${x.estibas_tarjetas[1]}`);
ok(x.espacio[0].join() === "Capacidad,Sin usar,Sobre capacidad,Por validar", `tarjeta de espacio: ${x.espacio[0]}`);
ok(x.ubi["C01IZQ"] && x.ubi["C01IZQ"][1] === 2 && x.ubi["C01IZQ"][5] === 1, `C01IZQ: ${JSON.stringify(x.ubi["C01IZQ"])} (2 con envase, 1 libre... capacidad 3)`);
ok(x.ubi["B01IZQ"] && x.ubi["B01IZQ"][2] === 2 && x.ubi["B01IZQ"][5] === 1, `B01IZQ: ${JSON.stringify(x.ubi["B01IZQ"])} (2 con producto, 1 libre)`);
ok(x["Base envase"].length === 1 && x["Base envase"][0][0] === "900", `Base envase: ${JSON.stringify(x["Base envase"])}`);
ok(x["Base producto"].length === 7, `Base producto: ${x["Base producto"].length} renglones (7)`);
ok(x.analisis.some((f) => f[0] === "Por calle y clase") && x.analisis.some((f) => f[0] === "Producto por franja de vencimiento"), "faltan las tablas del Análisis");
ok(x.maestro.some((m) => m[0] === "3128" && m[3] === 80 && m[4] === 30), `Maestro: ${JSON.stringify(x.maestro)}`);

/* ---------- LAS FÓRMULAS CALCULAN SOLAS ----------
   Se quitan los resultados guardados y LibreOffice recalcula: si una
   fórmula estuviera mal escrita, el valor no sería el que se guardó. */
{
  const { unzipSync, zipSync } = await import("fflate");
  const z = unzipSync(new Uint8Array(buf));
  for (const k of Object.keys(z)) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) {
    let t = new TextDecoder().decode(z[k]);
    t = t.replace(/(<f>[^<]*<\/f>)<v>[^<]*<\/v>/g, "$1").replace(/(<c [^>]*?) t="str"([^>]*>)(<f>)/g, "$1$2$3");
    z[k] = new TextEncoder().encode(t);
  }
  const dir = (process.env.FOTO ?? "/tmp") + "/recalc"; execSync(`rm -rf ${dir} && mkdir -p ${dir}/out`);
  writeFileSync(dir + "/sin-cache.xlsx", Buffer.from(zipSync(z)));
  try { execSync(`cd ${dir} && timeout 120 soffice --headless --convert-to xlsx --outdir out sin-cache.xlsx >/dev/null 2>&1`); } catch { fallas.push("LibreOffice no recalculó el libro sin resultados guardados") }
  const cmp = execSync(`python3 - <<'P'
import openpyxl, json, warnings
warnings.filterwarnings("ignore")
a = openpyxl.load_workbook("${dest}", data_only=True)
b = openpyxl.load_workbook("${dir}/out/sin-cache.xlsx", data_only=True)
f = openpyxl.load_workbook("${dest}")
malas = []; n = 0
for ws in f.worksheets:
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("=") and "HYPERLINK" not in c.value:
                n += 1
                x = a[ws.title][c.coordinate].value; y = b[ws.title][c.coordinate].value
                if x in (None, "") and y in (None, ""): continue
                try:
                    ok = abs(float(x) - float(y)) < 0.01
                except Exception:
                    ok = str(x) == str(y)
                if not ok: malas.append([ws.title, c.coordinate, c.value[:70], x, y])
print(json.dumps({"n": n, "malas": malas[:12], "total_malas": len(malas)}, default=str))
P`).toString();
  const rc = JSON.parse(cmp);
  ok(rc.n > 200, `pocas fórmulas en el libro: ${rc.n}`);
  ok(rc.total_malas === 0, `fórmulas que recalculadas dan otra cosa (${rc.total_malas} de ${rc.n}): ${JSON.stringify(rc.malas)}`);
}
/* LibreOffice lo abre sin quejarse y lo pasa a PDF. */
try { execSync(`cd ${process.env.FOTO ?? "/tmp"} && timeout 90 soffice --headless --convert-to pdf inventario-dia.xlsx >/dev/null 2>&1`); }
catch { fallas.push("LibreOffice no pudo abrir el archivo") }
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Consolidado del día en Excel: 11 hojas con logo y Tablero de gerencia, todo formulado, base sin duplicar recorridos, totales que siguen al filtro, validación y sin contar; abre en LibreOffice.");
