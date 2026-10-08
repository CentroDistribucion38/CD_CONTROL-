/* =====================================================================
   EL TABLERO DE GERENCIA EN LOS BORDES: más de 7 calles, más de 3
   recorridos, módulos sin capacidad, sin logo (el dibujo de las donas se
   crea solo) y un día sin un solo renglón. Se recalcula en LibreOffice.
   ===================================================================== */
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const js = buildSync({ entryPoints: [R("src/modulos/inventario/libro.ts")], bundle: true, write: false, format: "esm", platform: "node", external: ["exceljs", "fflate"], logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_libro-tab.mjs"), js);
const { armarLibroDia } = await import(R(".arnes/_libro-tab.mjs") + "?" + Date.now());
let n = 0;
const L = (u, o = {}) => ({ id: "l" + ++n, conteo_id: o.c ?? "c1", conteo: o.c ?? "c1", estado: "cerrado", codigo: o.sku ?? "3128", material: o.nom ?? "Águila 330", tipo_material: o.tipo ?? "PRODUCTO", familia: "Cerveza",
  factor_estibado: 80, ubicacion: u, calle: u[0], modulo: u.slice(1, 3), lado: "IZQ", estibas: o.e ?? 2, cajas: 0, saldo: 0, total_cajas: (o.e ?? 2) * 80, total_estibas: o.e ?? 2, capacidad: o.cap === undefined ? 3 : o.cap,
  venc_dia: null, venc_mes: null, venc_anio: null, fab_dia: null, fab_mes: null, fab_anio: null, fabricacion: "2026-06-01", vencimiento: "2027-03-01", dias_para_vencer: 150, dias_para_salir: 120,
  rotacion: null, averia: false, pnc: false, estado_envase: null, nota: null, ubicacion_combinada: u, conto: "Ana", contado_en: "2026-10-01T14:00:00Z", producto_id: "p", ubicacion_id: "u-" + u });
const calles = "ABCDEFGHI".split("");
const LIN = calles.map((c, i) => L(c + "01", { e: 1 + (i % 4), c: "c" + (1 + (i % 5)) })).concat([L("J01", { cap: null, e: 3 }), L("K02", { cap: null, tipo: "ENVASE", sku: "900", nom: "Caja plástica 30" })]);
const MAT = ["3128", "900"].map((sku, i) => ({ id: "m" + i, sku, nombre: sku, unidades_por_caja: 30, cajas_por_estiba: 80, unidades_por_estiba: 2400, contenido: null, familia: null, presentacion: null, vida_util: 180,
  f_limite_desp: null, dias_minimo: 30, origen: null, foraneo: null, tipo_material: sku === "900" ? "ENVASE" : "PRODUCTO", activo: true }));
const UBI = LIN.map((l) => ({ id: l.ubicacion_id, bodega_id: "b", clave: l.ubicacion, calle: l.calle, modulo: l.modulo, lado: "IZQ", familia: null, capacidad: l.capacidad, activa: true }));
const CONT = [1, 2, 3, 4, 5].map((i) => ({ id: "c" + i, codigo: "FEFO-0" + i, estado: "cerrado", bodega: "AG01", responsable: "Ana", fecha_analisis: "2026-10-01", enviado_en: "2026-10-01T18:00:00Z", envio_nombre: null, renglones: 2, ubicaciones: 2, total_cajas: 300 }));
const dir = "/tmp/tab-bordes"; execSync(`rm -rf ${dir} && mkdir -p ${dir}/out`);
const buf = await armarLibroDia({ fecha: "2026-10-01", bodega: "AG01", quien: "Cristian", conteos: CONT, lineas: LIN, materiales: MAT, ubicaciones: UBI, logo: null });
writeFileSync(dir + "/a.xlsx", buf);
const vacio = await armarLibroDia({ fecha: "2026-10-01", bodega: "AG01", quien: "Cristian", conteos: [], lineas: [], materiales: MAT, ubicaciones: [], logo: null });
writeFileSync(dir + "/vacio.xlsx", vacio);
const py = execSync(`python3 - <<'P'
import openpyxl, json, warnings, zipfile
warnings.filterwarnings("ignore")
o = {}
for k in ("a", "vacio"):
    wb = openpyxl.load_workbook("${dir}/" + k + ".xlsx", data_only=True); z = wb["Tablero"]
    o[k] = {"charts": [n for n in zipfile.ZipFile("${dir}/" + k + ".xlsx").namelist() if "charts/chart" in n], "otras": z["AA31"].value, "rec": [z["R38"].value, z["R39"].value, z["R40"].value], "sincap": [z["AA32"].value, z["AH32"].value, z["AL32"].value],
            "ocup": z["AM9"].value, "foco": [z["AL37"].value, z["AL40"].value], "calles": [z.cell(r, 27).value for r in range(25, 33)], "avance": z["I9"].value, "riesgo": z["C44"].value}
print(json.dumps(o, default=str))
P`).toString();
const x = JSON.parse(py);
ok(x.a.charts.length === 2 && x.vacio.charts.length === 2, `donas sin logo: ${x.a.charts} / ${x.vacio.charts}`);
ok(x.a.otras === "Otras (3)", `con 9 calles con capacidad, la 7.ª fila debe ser «Otras (3)»: ${x.a.calles}`);
ok(x.a.rec[2] === "+ 3 recorridos más", `con 5 recorridos, la 3.ª fila los resume: ${x.a.rec}`);
ok(x.a.sincap[0] === "SIN CAPACIDAD" && /2 módulos/.test(x.a.sincap[2]), `módulos sin capacidad: ${x.a.sincap}`);
ok(/^Calle /.test(x.a.foco[0]) && /^Calle /.test(x.a.foco[1]) && x.a.foco[0] !== x.a.foco[1], `focos: ${x.a.foco}`);
ok(x.a.riesgo && /Con datos/.test(x.a.riesgo), `mensaje de riesgo: ${x.a.riesgo}`);
ok(x.vacio.ocup === 0 && x.vacio.avance === 0, `día vacío: ocupación ${x.vacio.ocup}, avance ${x.vacio.avance}`);
/* Las fórmulas del Tablero recalculan a lo guardado (sin resultados guardados, en LibreOffice). */
const { unzipSync, zipSync } = await import("fflate");
const z = unzipSync(new Uint8Array(buf));
for (const k of Object.keys(z)) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) {
  let t = new TextDecoder().decode(z[k]);
  t = t.replace(/(<f>[^<]*<\/f>)<v>[^<]*<\/v>/g, "$1").replace(/(<c [^>]*?) t="str"([^>]*>)(<f>)/g, "$1$2$3");
  z[k] = new TextEncoder().encode(t);
}
writeFileSync(dir + "/sin-cache.xlsx", Buffer.from(zipSync(z)));
try { execSync(`cd ${dir} && timeout 150 soffice --headless --convert-to xlsx --outdir out sin-cache.xlsx >/dev/null 2>&1`) } catch { fallas.push("LibreOffice no recalculó") }
const cmp = JSON.parse(execSync(`python3 - <<'P'
import openpyxl, json, warnings
warnings.filterwarnings("ignore")
a = openpyxl.load_workbook("${dir}/a.xlsx", data_only=True)["Tablero"]; b = openpyxl.load_workbook("${dir}/out/sin-cache.xlsx", data_only=True)["Tablero"]; f = openpyxl.load_workbook("${dir}/a.xlsx")["Tablero"]
malas = []; n = 0
for row in f.iter_rows():
    for c in row:
        if isinstance(c.value, str) and c.value.startswith("=") and "HYPERLINK" not in c.value:
            n += 1; x = a[c.coordinate].value; y = b[c.coordinate].value
            if x in (None, "") and y in (None, ""): continue
            try: good = abs(float(x) - float(y)) < 0.01
            except Exception: good = str(x) == str(y)
            if not good: malas.append([c.coordinate, c.value[:60], x, y])
print(json.dumps({"n": n, "malas": malas[:10], "t": len(malas)}, default=str))
P`).toString());
ok(cmp.n > 100, `pocas fórmulas en el Tablero: ${cmp.n}`);
ok(cmp.t === 0, `fórmulas del Tablero que recalculadas dan otra cosa (${cmp.t}): ${JSON.stringify(cmp.malas)}`);
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Tablero en los bordes: 9 calles → «Otras», 5 recorridos → resumen, módulos sin capacidad aparte, donas aun sin logo, día vacío sin romper, fórmulas recalculan igual.");
