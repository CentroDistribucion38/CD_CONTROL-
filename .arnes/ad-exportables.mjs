/* =====================================================================
   USUARIOS · LOS EXPORTABLES CON DISEÑO — pases (Excel con QR), la lista
   de la gente (Excel) y la tarjeta en imagen. Se arman con datos de
   prueba, se abren con openpyxl y LibreOffice, y se miran.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const FOTO = process.env.FOTO ?? "/tmp";
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const js = buildSync({ entryPoints: [R("src/modulos/admin/libro-accesos.ts")], bundle: true, write: false, format: "esm", platform: "node",
  external: ["exceljs"], alias: { "@": R("src") }, logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_accesos.mjs"), js);
const { armarPases, armarUsuarios } = await import(R(".arnes/_accesos.mjs") + "?" + Date.now());
const ROLES = [{ clave: "admin", nombre: "Administrador", manda: true }, { clave: "inventario", nombre: "Inventario", manda: false }, { clave: "trafico", nombre: "Tráfico", manda: false }];
const colores = process.env.COLORES ? JSON.parse(process.env.COLORES) : { tinta: "23262c", banda: "ffc000" };
const sello = readFileSync(R("public/marca/logo-b.png"));
const pases = ["Cristian_A|cristian_a|228312", "Cristian_p|cristian_p|242806", "YuranisCastro|yuraniscastro|141683", "Cañizares|canizares|315087", "Shirlysepulveda|shirlysepulveda|031787"]
  .map((x, i) => { const [nombre, usuario, clave] = x.split("|"); return { nombre, usuario, clave, rol: i === 4 ? "trafico" : "inventario", rolNombre: i === 4 ? "Tráfico" : "Inventario" } });
writeFileSync(`${FOTO}/pases.xlsx`, Buffer.from(await armarPases({ pases, roles: ROLES, url: "https://control-cd38.vercel.app/login", lugar: "CD38 · bodega Ag01", sello, colores })));
const gente = pases.map((p, i) => ({ ...p, activo: i !== 3, provisional: i < 2, ingreso: i === 2 ? null : "2026-09-21T15:00:00Z", registros: i * 7, aMano: i === 1 ? 2 : 0 }))
  .concat([{ nombre: "Administrador", usuario: "admin", rol: "admin", rolNombre: "Administrador", activo: true, provisional: false, ingreso: "2026-09-22T13:00:00Z", registros: 120, aMano: 0 }]);
writeFileSync(`${FOTO}/usuarios.xlsx`, Buffer.from(await armarUsuarios({ gente, roles: ROLES.map((r) => ({ ...r, pantallas: r.manda ? 30 : 8 })), quien: "Cristian", sello, colores })));
/* EL EXCEL COMPLETO: perfil + accesos pantalla por persona + a mano + historial. */
const NIV = (n, m = false) => ({ nivel: n, aMano: m });
const completo = {
  acceso: [
    { modulo: "Inventario", pantalla: "Contar", ruta: "/inventario/conteo", niveles: gente.map((_, i) => i === 5 ? NIV("editar") : NIV(i === 3 ? "ninguno" : "editar")) },
    { modulo: "Sider", pantalla: "Pedir / quitar revisión AI", ruta: "/sider/transito/revision-ai", niveles: gente.map((_, i) => i === 1 ? NIV("editar", true) : i === 5 ? NIV("editar") : NIV("ninguno")) },
    { modulo: "Roturas", pantalla: "Tablero", ruta: "/roturas/en-sitio/tablero", niveles: gente.map((_, i) => i === 0 ? NIV("ninguno", true) : NIV("ver")) },
  ],
  aMano: [
    { nombre: "Cristian_p", usuario: "cristian_p", rolNombre: "Inventario", pantalla: "Sider · Pedir / quitar revisión AI", rolDa: "ninguno", aMano: "editar" },
    { nombre: "Cristian_A", usuario: "cristian_a", rolNombre: "Inventario", pantalla: "Roturas · Tablero", rolDa: "ver", aMano: "ninguno" },
  ],
  historial: [
    { fecha: "2026-09-21T15:00:00Z", aQuien: "Cristian_A", usuario: "cristian_a", que: "Creado", detalle: "con rol Inventario", hizo: "Administrador" },
    { fecha: "2026-09-22T15:00:00Z", aQuien: "Cristian_A", usuario: "cristian_a", que: "Clave nueva", detalle: "", hizo: "Administrador" },
  ],
};
const gente2 = gente.map((g, i) => ({ ...g, creado: i === 0 ? "2026-09-21T15:00:00Z" : null, creadoPor: i === 0 ? "Administrador" : null,
  claveNueva: i === 0 ? "2026-09-22T15:00:00Z" : null, entra: 2 + i, cambios: i === 0 ? 2 : 0 }));
writeFileSync(`${FOTO}/usuarios-completo.xlsx`, Buffer.from(await armarUsuarios({ gente: gente2, roles: ROLES.map((r) => ({ ...r, pantallas: r.manda ? 30 : 8 })), quien: "Cristian", sello, colores, completo })));
const py = JSON.parse(execSync(`python3 - <<'P'
import openpyxl, json, zipfile, warnings
warnings.filterwarnings("ignore")
o = {}
wb = openpyxl.load_workbook("${FOTO}/pases.xlsx")
o["hp"] = wb.sheetnames; L = wb["Lista"]
o["clave"] = [L.cell(r, 4).value for r in range(7, 12)]
o["fclave"] = L.cell(7, 4).fill.fgColor.rgb; o["frol"] = L.cell(7, 5).fill.fgColor.rgb; o["lrol"] = L.cell(7, 5).font.color.rgb
o["pase"] = wb["Pases"].cell(11, 3).value
o["imgp"] = [n for n in zipfile.ZipFile("${FOTO}/pases.xlsx").namelist() if n.startswith("xl/media/") and not n.endswith("/")]
w2 = openpyxl.load_workbook("${FOTO}/usuarios.xlsx"); U = w2["Usuarios"]
o["hu"] = w2.sheetnames; o["u"] = [[U.cell(r, c).value for c in range(2, 6)] for r in range(10, U.max_row + 1)]
o["af"] = U.auto_filter.ref; o["imgu"] = len([n for n in zipfile.ZipFile("${FOTO}/usuarios.xlsx").namelist() if n.startswith("xl/media/") and not n.endswith("/")])
wc = openpyxl.load_workbook("${FOTO}/usuarios-completo.xlsx")
o["hc"] = wc.sheetnames; UC = wc["Usuarios"]
o["cab"] = [UC.cell(9, c).value for c in range(2, UC.max_column)]
o["uc0"] = [UC.cell(10, c).value for c in range(2, UC.max_column)]
o["afc"] = UC.auto_filter.ref
o["nota"] = [UC.cell(r, 2).value for r in range(10, UC.max_row + 1) if UC.cell(r, 2).value and "NO se puede exportar" in str(UC.cell(r, 2).value)]
PM = wc["Permisos"]
o["pm"] = [[PM.cell(r, c).value for c in range(2, 3 + 6 + 1)] for r in range(6, 11)]
AM = wc["A mano"]; o["am"] = [[AM.cell(r, c).value for c in range(2, 9)] for r in range(7, 9)]
HI = wc["Historial"]; o["hi"] = [[HI.cell(r, c).value for c in range(2, 8)] for r in range(7, 9)]
print(json.dumps(o, default=str))
P`).toString());
ok(py.hp.join() === "Pases,Lista", `hojas de los pases: ${py.hp}`);
ok(py.clave[4] === "031787", `la clave perdió el cero: ${py.clave}`);
ok(py.fclave === "FF" + colores.banda.toUpperCase(), `la clave no va llena del color del tema: ${py.fclave}`);
ok(py.frol === "FF00B050" && py.lrol === "FFFFFFFF", `el rol no va vivo: ${py.frol} ${py.lrol}`);
ok(/Lista!D7/.test(py.pase), `el pase no lee la clave de la lista: ${py.pase}`);
ok(py.imgp.some((n) => n.endsWith(".gif")) && py.imgp.some((n) => n.endsWith(".png")), `faltan el sello o el QR: ${py.imgp}`);
ok(py.hu.join() === "Usuarios,Por rol", `hojas de usuarios: ${py.hu}`);
ok(py.u.length === 6 && py.u[5][2] === "ADMINISTRADOR" && py.u[3][3] === "INACTIVO", `la lista de la gente: ${JSON.stringify(py.u)}`);
ok(py.af === "B9:I15", `filtro: ${py.af}`); ok(py.imgu === 1, "la lista no trae el sello");
ok(py.hc.join() === "Usuarios,Permisos,A mano,Historial,Por rol", `hojas del completo: ${py.hc}`);
ok(["Creado", "Creado por", "Última clave nueva", "Pantallas a las que entra", "Cambios en su cuenta"].every((t) => py.cab.includes(t)), `columnas del completo: ${py.cab}`);
ok(py.uc0.includes("Provisional · aún sin cambiar") && py.uc0.includes("Administrador"), `fila 1 del completo: ${JSON.stringify(py.uc0)}`);
ok(py.nota.length === 1, "el Excel completo no avisa que la clave no se puede exportar");
ok(py.afc === "B9:N15", `filtro del completo: ${py.afc}`);
ok(py.pm[2][0] === "Inventario" && py.pm[2][1] === "Contar" && py.pm[3][3] === "EDITAR *", `matriz de permisos: ${JSON.stringify(py.pm)}`);
ok(py.pm[4][2] === "— *", `el «ninguno» puesto a mano debería verse con asterisco: ${JSON.stringify(py.pm[4])}`);
ok(py.am[0][5] === "EDITAR" && py.am[0][6] === "Le abre" && py.am[1][6] === "Le cierra", `permisos a mano: ${JSON.stringify(py.am)}`);
ok(py.hi[1][3] === "Clave nueva" && py.hi[0][1] === "Cristian_A", `historial: ${JSON.stringify(py.hi)}`);
for (const f of ["pases", "usuarios", "usuarios-completo"]) {
  try { execSync(`cd ${FOTO} && timeout 90 soffice --headless --convert-to pdf ${f}.xlsx >/dev/null 2>&1`) } catch { fallas.push(`LibreOffice no abrió ${f}`) }
}
/* LA TARJETA en imagen, en el navegador de verdad. */
const tj = buildSync({ entryPoints: [R("src/app/(app)/admin/usuarios/tarjeta.ts")], bundle: true, write: false, format: "iife", globalName: "T",
  alias: { "@": R("src") }, logLevel: "silent" }).outputFiles[0].text;
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.route("**/marca/logo-b.png", (r) => r.fulfill({ body: sello, contentType: "image/png" }));
await pg.route("http://prueba/", (r) => r.fulfill({ body: "<body style='font-family:Arial'></body>", contentType: "text/html" }));
await pg.goto("http://prueba/");
await pg.addScriptTag({ content: tj });
const b64 = await pg.evaluate(async ({ ROLES, colores }) => {
  const b = await T.dibujarTarjeta({ nombre: "Cristian_A", usuario: "cristian_a", clave: "228312", rol: "inventario", rolNombre: "Inventario",
    roles: ROLES, colores, lugar: "CD38 · bodega Ag01", host: "control-cd38.vercel.app" });
  const r = new FileReader(); return await new Promise((ok) => { r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(b) });
}, { ROLES, colores });
writeFileSync(`${FOTO}/tarjeta.png`, Buffer.from(b64, "base64"));
ok(b64.length > 20000, "la tarjeta salió vacía");
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Exportables de usuarios: pases con sello, QR, rol vivo y clave con ceros; lista de la gente con roles y estado; tarjeta en imagen; abren en LibreOffice.");
