/* =====================================================================
   TRASPASOS · EL INFORME EN EXCEL — se arma con datos de prueba, se abre
   con openpyxl y se comprueban las cifras.

   «Necesito que traspasos me genere informes por turno, por fecha, como
   yo quiera, de cómo va todo; que yo pueda evidenciar eso y bajar una
   data, un Excel.»

   QUÉ SE MIDE Y POR QUÉ:

   1. LAS CUATRO HOJAS, con sus nombres. Si mañana alguien renombra una,
      los vínculos del resumen apuntan a nada y nadie lo ve hasta que un
      jefe abre el archivo.

   2. QUE LAS CIFRAS DEL RESUMEN SEAN LAS DE LA PANTALLA. Es lo único
      que de verdad importa: un Excel que suma distinto que el tablero
      convierte la reunión en una discusión sobre cuál de los dos
      miente. Se comprueba contra las cuentas hechas a mano aquí.

   3. QUE LA ADHERENCIA NO SE PASE DE 100 y que el cumplimiento sí:
      hacer viajes de más no arregla los que faltaron.

   4. QUE «DÍA POR TURNO» AGRUPE DE VERDAD: tres tipos de un mismo turno
      son UNA fila, no tres.

   5. QUE EL DETALLE TRAIGA TODO —vacíos y anulados incluidos—, porque
      es para cruzar con SAP y lo que falta es justo lo que se busca.

   6. QUE LOS FILTROS DE CADA HOJA NO ROMPAN EL ARCHIVO: exceljs escribe
      mal _FilterDatabase con más de una hoja filtrada y Excel abre con
      «encontramos un problema con parte del contenido».
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

const js = buildSync({ entryPoints: [R("src/modulos/traspasos/libro.ts")], bundle: true, write: false,
  format: "esm", platform: "node", external: ["exceljs", "fflate"], logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_tp-libro.mjs"), js);
const { armarInformeTraspasos } = await import(R(".arnes/_tp-libro.mjs") + "?" + Date.now());

/* ---------- LOS DATOS DE PRUEBA ----------
   Dos días, tres turnos, tres tipos. Con un caso de cada cosa que se
   mide: un tipo que se pasó del plan, uno que no salió, uno que se
   movió sin estar planeado. */
const ORDEN = { A: 1, B: 2, C: 3 };
const F = (fecha, turno, tipo, nombre, orden, planeado, cumplido, extra = {}) => {
  const adheridos = Math.min(cumplido, planeado);
  return {
    fecha, turno, turno_orden: ORDEN[turno], tipo, tipo_nombre: nombre, tipo_orden: orden,
    plan_id: planeado ? "p-" + fecha + turno + tipo : null,
    planeado, vacios_planeados: 0, nota: null,
    cumplido, registros: cumplido, carga: cumplido * 100, placas: Math.min(cumplido, 3),
    adheridos, adicionales: Math.max(cumplido - planeado, 0), faltan: Math.max(planeado - cumplido, 0),
    sin_planear: planeado === 0,
    adherencia: planeado ? Math.min(Math.round((adheridos / planeado) * 100), 100) : null,
    cumplimiento: planeado ? Math.round((cumplido / planeado) * 100) : null,
    ...extra,
  };
};
const FILAS = [
  F("2026-09-21", "A", "casco", "Casco", 1, 10, 8),
  F("2026-09-21", "A", "canastas", "Canastas", 2, 4, 6),     // se pasó del plan
  F("2026-09-21", "B", "casco", "Casco", 1, 6, 6),
  F("2026-09-21", "C", "casco", "Casco", 1, 5, 0),           // no salió ninguno
  F("2026-09-22", "A", "casco", "Casco", 1, 10, 10),
  F("2026-09-22", "A", "canastas", "Canastas", 2, 3, 3),
  F("2026-09-22", "A", "estibas", "Estibas", 3, 0, 2),       // sin planear
  F("2026-09-22", "B", "casco", "Casco", 1, 8, 5),
];
let n = 0;
const V = (o) => ({
  id: "v" + ++n, codigo: "TR-" + String(1000 + n), fecha: o.fecha, turno: o.turno,
  turno_orden: ORDEN[o.turno], tipo: o.tipo ?? "casco", tipo_nombre: o.nombre ?? "Casco",
  placa: o.placa ?? "ABC12" + (n % 10), documento: o.doc ?? "OC-" + (5000 + n),
  sin_documento: !!o.sinDoc, origen: "cd38", origen_nombre: "CD38", destino: "ag01", destino_nombre: "AG01",
  origen_suelto: false, destino_suelto: false, viajes: 1, vacio: !!o.vacio,
  carga: o.vacio ? null : (o.carga ?? 100), unidad: "canastas", nota: o.nota ?? null,
  hora: `${o.fecha}T1${n % 9}:30:00Z`, registrado_por: o.por ?? "u1",
  registrado_en: `${o.fecha}T20:00:00Z`, dias_atras: o.atras ?? 0, atrasado: (o.atras ?? 0) > 0,
  ediciones: 0, editado_en: null, editado_por: null,
  estado: o.anulado ? "anulado" : "registrado", vale: !o.anulado,
  motivo_anulacion: o.anulado ? "placa equivocada" : null, anulado_en: null, anulado_por: null,
});
const VIAJES = [
  V({ fecha: "2026-09-21", turno: "A" }), V({ fecha: "2026-09-21", turno: "A", tipo: "canastas", nombre: "Canastas" }),
  V({ fecha: "2026-09-21", turno: "B" }), V({ fecha: "2026-09-21", turno: "B", vacio: true }),
  V({ fecha: "2026-09-22", turno: "A", atras: 1 }), V({ fecha: "2026-09-22", turno: "A", sinDoc: true, doc: null }),
  V({ fecha: "2026-09-22", turno: "B", anulado: true }),
  V({ fecha: "2026-09-22", turno: "A", tipo: "estibas", nombre: "Estibas" }),
];
const NOMBRES = { u1: "Génesis Visbal", u2: "Santiago Leal" };

/* Las cuentas a mano, que es contra lo que se compara. */
const sum = (k) => FILAS.reduce((a, f) => a + f[k], 0);
const PLANEADO = sum("planeado"), CUMPLIDO = sum("cumplido");
const ADHERIDOS = sum("adheridos"), ADICIONALES = sum("adicionales");
const FALTAN = PLANEADO - ADHERIDOS;
const ADHERENCIA = Math.round((ADHERIDOS / PLANEADO) * 100);
const CUMPLIMIENTO = Math.round((CUMPLIDO / PLANEADO) * 100);

const buf = await armarInformeTraspasos({
  desde: "2026-09-21", hasta: "2026-09-22", quien: "Cristian Padilla",
  filas: FILAS, viajes: VIAJES, vacios: 3, turnos: [], tipos: [], nombres: NOMBRES,
  logo: readFileSync(R("public/marca/logo-b.png")),
  colores: process.env.COLORES ? JSON.parse(process.env.COLORES) : undefined,
});
const dest = (process.env.FOTO ?? "/tmp") + "/traspasos-informe.xlsx";
writeFileSync(dest, buf);

const py = execSync(`python3 - <<'P'
import openpyxl, json, warnings, zipfile, re
warnings.filterwarnings("ignore")
wb = openpyxl.load_workbook("${dest}")
o = {"hojas": wb.sheetnames}

r = wb["Resumen"]
o["resumen"] = [[c.value for c in fila] for fila in r.iter_rows()]

d = wb["Día por turno"]
o["dias"] = [[d.cell(f, c).value for c in range(1, 13)] for f in range(7, d.max_row)]

t = wb["Por tipo"]
o["tipos"] = [[t.cell(f, c).value for c in range(1, 10)] for f in range(7, t.max_row)]

v = wb["Viajes"]
o["viajes"] = [[v.cell(f, c).value for c in (3, 12, 13, 16)] for f in range(7, v.max_row)]

o["filtros"] = {h.title: (h.auto_filter.ref or "") for h in wb.worksheets}
z = zipfile.ZipFile("${dest}")
x = z.read("xl/workbook.xml").decode()
o["nombres"] = re.findall(r'<definedName name="_xlnm._FilterDatabase" localSheetId="(\\d+)"', x)
o["dup"] = x.count("_xlnm._FilterDatabase")
print(json.dumps(o, default=str))
P`, { encoding: "utf8" });
const X = JSON.parse(py);

/* ---------- 1 · LAS CUATRO HOJAS ---------- */
ok(JSON.stringify(X.hojas) === JSON.stringify(["Resumen", "Día por turno", "Por tipo", "Viajes"]),
   `las hojas son ${JSON.stringify(X.hojas)} y tienen que ser Resumen · Día por turno · Por tipo · Viajes`);

/* ---------- 2 · LAS CIFRAS DEL RESUMEN SON LAS DE LA PANTALLA ---------- */
const planas = X.resumen.flat().filter((v) => v != null);
const nums = planas.filter((v) => typeof v === "number");
const textos = planas.filter((v) => typeof v === "string");
const hay = (v) => nums.some((x) => Math.abs(x - v) < 1e-9);
ok(hay(PLANEADO), `el resumen no trae los ${PLANEADO} viajes planeados`);
ok(hay(ADHERIDOS), `el resumen no trae los ${ADHERIDOS} viajes cumplidos`);
ok(hay(ADICIONALES), `el resumen no trae los ${ADICIONALES} adicionales`);
ok(hay(FALTAN), `el resumen no trae los ${FALTAN} que faltaron`);
ok(hay(ADHERENCIA / 100), `el resumen no trae la adherencia (${ADHERENCIA}%)`);
ok(hay(CUMPLIMIENTO / 100), `el resumen no trae el cumplimiento (${CUMPLIMIENTO}%)`);
ok(hay(3), "el resumen no trae los viajes vacíos, que van aparte");
ok(textos.some((t) => /Traspasos/.test(t)), "el resumen no dice de qué es el informe");
ok(textos.some((t) => /exportó Cristian Padilla/.test(t)), "el resumen no dice quién lo exportó");
ok(textos.some((t) => /21 de septiembre[\s\S]*22 de septiembre/.test(t)),
   "el resumen no dice el rango de fechas en el subtítulo");
/* La nota que explica cómo se cuenta: sin ella, la primera reunión se
   va en discutir si los vacíos suman. */
ok(textos.some((t) => /vacíos y los anulados no entran/.test(t)),
   "falta la nota que dice qué entra y qué no en las dos cifras");
ok(textos.some((t) => /Arenosa/.test(t)),
   "la nota no dice la regla de estibas · Arenosa, que es la que cambió el cálculo");

/* ---------- 3 · LA ADHERENCIA NO SE PASA DE 100 ---------- */
ok(ADHERENCIA <= 100, "la prueba está mal armada: la adherencia se pasó de 100");
ok(CUMPLIMIENTO > ADHERENCIA,
   "con adicionales en los datos, el cumplimiento tiene que ser mayor que la adherencia");

/* ---------- 4 · DÍA POR TURNO AGRUPA ---------- */
const esperadas = new Set(FILAS.map((f) => f.fecha + "|" + f.turno)).size;
ok(X.dias.length === esperadas,
   `«Día por turno» trae ${X.dias.length} filas y los días×turno son ${esperadas} — no está agrupando`);
{
  /* El 21 turno A: casco 10/8 y canastas 4/6 → planeado 14, cumplido 10,
     adicionales 2, faltan 2. Es la fila que prueba que suma por turno. */
  const f = X.dias.find((r) => String(r[0]).startsWith("2026-09-21") && r[1] === "A");
  ok(!!f, "no está la fila del 21 turno A");
  if (f) ok(f[2] === 14 && f[3] === 12 && f[4] === 2 && f[5] === 2,
    `el 21 turno A da [plan ${f[2]}, cumplido ${f[3]}, adicional ${f[4]}, faltan ${f[5]}] y debe ser [14, 12, 2, 2]`);
}
{
  const f = X.dias.find((r) => String(r[0]).startsWith("2026-09-21") && r[1] === "C");
  ok(f && f[6] === 0, "el turno C del 21 no salió: su % de adherencia tiene que ser 0, no vacío");
}

/* ---------- 5 · POR TIPO ---------- */
ok(X.tipos.length === 3, `«Por tipo» trae ${X.tipos.length} tipos y son 3`);
{
  const casco = X.tipos.find((r) => r[0] === "Casco");
  ok(casco && casco[1] === 39 && casco[2] === 29,
     `casco da [plan ${casco?.[1]}, cumplido ${casco?.[2]}] y debe ser [39, 29]`);
  const est = X.tipos.find((r) => r[0] === "Estibas");
  ok(est && est[1] === 0 && est[2] === 0 && est[3] === 2,
     "las estibas se movieron sin plan: 0 planeado, 0 cumplido y 2 adicionales");
}

/* ---------- 6 · EL DETALLE TRAE TODO ---------- */
ok(X.viajes.length === VIAJES.length,
   `el detalle trae ${X.viajes.length} viajes y son ${VIAJES.length} — está filtrando lo que no debe`);
ok(X.viajes.some((r) => r[1] === "Sí"), "el detalle no marca los viajes vacíos");
ok(X.viajes.some((r) => r[2] === "ANULADO"), "el detalle no trae los anulados, que es lo que se busca al cruzar");
ok(X.viajes.some((r) => r[3] === 1), "el detalle no dice cuáles se digitaron después de su día");

/* ---------- 7 · LOS FILTROS, UNO POR HOJA Y SIN ROMPER ---------- */
for (const h of ["Día por turno", "Por tipo", "Viajes"]) {
  ok((X.filtros[h] ?? "").startsWith("A6:"), `«${h}» no tiene filtro en la fila del encabezado`);
}
ok(X.nombres.length === 3 && new Set(X.nombres).size === 3,
   `los filtros quedaron con ${X.nombres.length} ámbitos y deben ser 3 distintos — Excel abriría con «encontramos un problema»`);
ok(X.dup === 3, `_xlnm._FilterDatabase aparece ${X.dup} veces y deben ser 3`);

console.log("");
console.log(`  rango 21–22 sep · plan ${PLANEADO} · cumplidos ${ADHERIDOS} · adicionales ${ADICIONALES} · faltan ${FALTAN}`);
console.log(`  adherencia ${ADHERENCIA}%  ·  cumplimiento ${CUMPLIMIENTO}%  ·  ${X.dias.length} día×turno · ${X.tipos.length} tipos · ${X.viajes.length} viajes`);
console.log(`  archivo: ${dest}`);
console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Traspasos · informe en Excel: cuatro hojas, las cifras del tablero, agrupa por día y turno, "
          + "el detalle trae vacíos y anulados, y los filtros no rompen el archivo.");
