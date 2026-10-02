/* =====================================================================
   ADMINISTRACIÓN EN EL CELULAR — solo por debajo de 700 px

   «El módulo de administración en el celular es complejo; ayúdame a que
    se vea más factible, solo en el celular.»

   Se montan las pantallas reales (Usuarios, Roles, Borrar datos) con la
   base de mentiras de sus pruebas y se mira a 390 y 360 px:

   USUARIOS
   1. La lista son TARJETAS, no una tabla que rueda de lado: ninguna celda
      se sale, el encabezado de la tabla no estorba y se puede «Seleccionar
      todos».
   2. Cada tarjeta trae nombre, usuario, rol, estado y tres botones del
      ancho del dedo (44 px): Editar, Nueva clave y «Más»; Desactivar y
      Eliminar solo salen con «Más». «Al día» no se repite en cada tarjeta.
   3. Los filtros se esconden tras «Filtrar y ordenar» y el botón dice
      cuántos hay puestos; buscar sigue a la vista.
   4. Al marcar a alguien, la barra de acciones queda FIJA ABAJO, en una
      sola fila, y no tapa la última tarjeta.
   5. Las ventanas (cambiar rol, claves) ocupan la pantalla entera.
   6. Nada de esto toca el escritorio: a 1200 px sigue la tabla.
   ROLES
   7. Los roles son fichas que se deslizan; las pantallas van en módulos
      que se abren de a uno, dicen cuántas tienen y la lista ya no rueda
      dentro de su caja; guardar queda fijo abajo cuando hay cambios.
   BORRAR DATOS
   8. El registro de lo borrado son tarjetas, y de cada opción solo se ve
      la explicación completa de la escogida.

     node .arnes/ad-celular.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

async function usuarios() {
writeFileSync(R(".arnes/_nav-us.ts"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-us.ts"), `export const createClient = () => ({ rpc: async () => ({ data: true, error: null }) });`);
writeFileSync(R(".arnes/_us-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Usuarios } from "../src/app/(app)/admin/usuarios/Usuarios";
const roles = [{ clave: "admin", nombre: "Administrador", manda: true, descripcion: "Todo, incluido Usuarios" },
               { clave: "operador", nombre: "Operador", manda: false, descripcion: "Contar, registrar, roturas" },
               { clave: "portero", nombre: "Portero", manda: false, descripcion: null }];
const P = (id: string, nombre: string, usuario: string, rol: string, extra: any = {}) =>
  ({ id, nombre, usuario, rol, activo: true, clave_provisional: false, permisos_extra: {}, ...extra });
const gente = [
  P("00000000-0000-0000-0000-000000000001", "Cristian Padilla", "cpadilla", "admin"),
  P("00000000-0000-0000-0000-000000000002", "Génesis Visbal", "gvisbal", "operador"),
  P("00000000-0000-0000-0000-000000000003", "Santiago Leal", "sleal", "portero", { clave_provisional: true }),
  P("00000000-0000-0000-0000-000000000004", "Ana Pérez", "aperez", "operador", { activo: false }),
];
const hoy = new Date();
const ingresos = { "00000000-0000-0000-0000-000000000001": hoy.toISOString(),
  "00000000-0000-0000-0000-000000000002": new Date(hoy.getTime() - 5 * 864e5).toISOString(),
  "00000000-0000-0000-0000-000000000003": null, "00000000-0000-0000-0000-000000000004": null };
const registros = { "00000000-0000-0000-0000-000000000001": 900, "00000000-0000-0000-0000-000000000002": 12,
  "00000000-0000-0000-0000-000000000003": 0, "00000000-0000-0000-0000-000000000004": 0 };
const delRol = [{ rol: "operador", seccion: "/inventario/conteo", nivel: "editar" }, { rol: "operador", seccion: "/quiebra/rotura", nivel: "editar" },
                { rol: "portero", seccion: "/sider", nivel: "ver" }];
createRoot(document.getElementById("r")!).render(<Usuarios gente={gente as any} roles={roles} delRol={delRol as any} catalogo={[]}
  hayLlave={true} yo="00000000-0000-0000-0000-000000000001" ingresos={ingresos} registros={registros} buscar="" />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_us-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-us.ts"), "@/lib/supabase/client": R(".arnes/_supa-us.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/admin/roles/roles.css"), "utf8") + readFileSync(R("src/app/(app)/admin/usuarios/usuarios.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
const pg = await ctx.newPage();
let mandados = [];
await pg.route("**/*", async (r) => {
  const u = r.request().url();
  if (u.endsWith("/api/admin/usuarios/lote")) {
    const b = JSON.parse(r.request().postData());
    mandados.push(b);
    if (b.accion === "crear" && globalThis.CORTAR && mandados.filter((m) => m.accion === "crear").length > 1)
      return r.fulfill({ status: 504, contentType: "text/html", body: "<html>timeout</html>" });
    if (b.accion === "crear") return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ resultados: b.personas.map((p, i) => i === 2 ? { ...p, ok: false, error: "Ya está tomado." } : { ...p, ok: true, clave: String(100000 + i) }) }) });
    if (b.accion === "eliminar") return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ resultados: b.ids.map((id) => ({ id, nombre: "x", hecho: "desactivado", registros: 12 })) }) });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cambiados: b.ids.length, sinBloqueo: 0 }) });
  }
  if (u.endsWith("/api/admin/usuarios") && r.request().method() === "PATCH") {
    const b = JSON.parse(r.request().postData());
    mandados.push({ accion: "clave", ...b });
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ clave: "Tolva-" + b.id.slice(-2), usuario: "u" + b.id.slice(-1), nombre: "" }) });
  }
  return r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" });
});
const monta = async (ancho, tema) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/admin/usuarios");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="rl us" id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".us-tabla");
  mandados = [];
};

return { nav, pg, monta };
}
async function roles() {
writeFileSync(R(".arnes/_nav-ro.ts"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-ro.ts"), `export const createClient = () => ({ rpc: async (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
  return { data: f === "rol_borrar" ? (a.p_mover_a ? 2 : 0) : f === "rol_crear" ? a.p_clave : 3, error: null };
} });`);
writeFileSync(R(".arnes/_ro-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Roles } from "../src/app/(app)/admin/roles/Roles";
const roles = [
  { clave: "admin", nombre: "Administrador", descripcion: null, manda: true, sistema: true, orden: 1 },
  { clave: "operador", nombre: "Operador", descripcion: "Consulta lo que le habiliten.", manda: false, sistema: true, orden: 2 },
  { clave: "portero", nombre: "Portero", descripcion: null, manda: false, sistema: false, orden: 3 },
  { clave: "vacio", nombre: "Sin nadie", descripcion: null, manda: false, sistema: false, orden: 4 },
];
const gente = [
  { id: "1", nombre: "Ana Pérez", usuario: "ana", activo: true, rol: "portero" },
  { id: "2", nombre: "Beto Díaz", usuario: "beto", activo: false, rol: "portero" },
  { id: "3", nombre: "Caro", usuario: "caro", activo: true, rol: "operador" },
];
const historial = [
  { id: 9, rol: "portero", rol_nombre: "Portero", accion: "permisos", detalle: { cambios: [
    { seccion: "/traspasos", antes: "editar", despues: "ver" }, { seccion: "/acciones", antes: "ninguno", despues: "editar" }] },
    hecho_nombre: "Cristian Padilla", hecho_en: "2026-09-21T15:00:00Z" },
  { id: 8, rol: "portero", rol_nombre: "Portero", accion: "duplicado", detalle: { de_nombre: "Supervisor", pantallas: 12 }, hecho_nombre: "Cristian Padilla", hecho_en: "2026-09-20T15:00:00Z" },
  { id: 7, rol: "viejo", rol_nombre: "Rol viejo", accion: "borrado", detalle: { usuarios: 1, quienes: ["Dani"], a_nombre: "Operador" }, hecho_nombre: "Cristian Padilla", hecho_en: "2026-09-19T15:00:00Z" },
];
const catalogo = [
  { id: "traspasos", nombre: "Traspasos", acento: "#0A7", secciones: Array.from({ length: 20 }, (_, i) => ({ nombre: "Pantalla " + i, ruta: i ? "/traspasos/p" + i : "/traspasos" })) },
  { id: "inventario", nombre: "Inventario", acento: "#E9A81F",
    ramas: [{ id: "conteos", nombre: "Conteos", permiso: "/inventario/tablero" }, { id: "averias", nombre: "Averías" }],
    secciones: [
      { nombre: "Suelta", ruta: "/inventario/suelta" },
      { nombre: "Maestro", ruta: "/inventario/maestro", rama: "conteos" },
      { nombre: "Contar", ruta: "/inventario/conteo", rama: "conteos" },
      { nombre: "Tablero", ruta: "/inventario/tablero", rama: "conteos" },
      { nombre: "Registrar", ruta: "/inventario/averias", rama: "averias" },
      { nombre: "Tablero", ruta: "/inventario/averias/tablero", rama: "averias" },
    ] },
  { id: "acciones", nombre: "Acciones", acento: "#C21", secciones: Array.from({ length: 23 }, (_, i) => ({ nombre: "Otra " + i, ruta: i ? "/acciones/p" + i : "/acciones" })) },
];
createRoot(document.getElementById("r")!).render(<Roles roles={roles} catalogo={catalogo} gente={gente} historial={historial as any}
  cuantos={{ portero: 2, operador: 1 }} permisos={[{ rol: "portero", seccion: "/traspasos", nivel: "ver" }, { rol: "operador", seccion: "/acciones", nivel: "ver" }]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ro-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-ro.ts"), "@/lib/supabase/client": R(".arnes/_supa-ro.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/admin/roles/roles.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ancho, tema, alto = 900) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="rl" id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".rl-roles");
  await pg.evaluate(() => { window.llamadas = [] });
};

return { nav, pg, monta };
}
async function datos() {
writeFileSync(R(".arnes/_nav-ad.ts"), `export const useRouter = () => ({ refresh() { (window as any).refrescos = ((window as any).refrescos ?? 0) + 1 } });`);
writeFileSync(R(".arnes/_supa-ad.ts"), `export const createClient = () => ({ rpc: async (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
  const n = a.p_desde ? 40 : 125;
  return { data: [{ filas: n, archivos: a.p_clave === "rotlinea.hojas" ? 3 : 0, primera: a.p_desde ?? "2026-01-02", ultima: a.p_hasta ?? "2026-09-21" }], error: null };
} });`);
writeFileSync(R(".arnes/_ad-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { BorrarDatos } from "../src/app/(app)/admin/datos/BorrarDatos";
const P = (clave: string, modulo: string, nombre: string) => ({ clave, modulo, nombre, detalle: "Detalle de " + nombre + " para ver cómo se parte en dos renglones en el celular.", bucket: null });
createRoot(document.getElementById("r")!).render(<BorrarDatos hoy="2026-09-21" hayLlave={true}
  puntos={[P("traspasos.plan","Traspasos","Plan de viajes"), P("traspasos.viajes","Traspasos","Viajes registrados"),
           P("rotlinea.registro","Rotura de línea","Pesadas registradas"), P("rotlinea.hojas","Rotura de línea","Hojas del día generadas")]}
  historial={[{ id: 1, nombre: "Traspasos · Viajes registrados", desde: "2026-09-01", hasta: "2026-09-10", filas: 1234, archivos: 0, borrado_nombre: "Cristian Padilla", borrado_en: "2026-09-20T15:00:00Z" }]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ad-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-ad.ts"), "@/lib/supabase/client": R(".arnes/_supa-ad.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/admin/roles/roles.css"), "utf8") + readFileSync(R("src/app/(app)/admin/datos/datos.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.route("**/*", (r) => r.request().url().includes("/api/admin/datos") && r.request().method() === "POST"
  ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ filas: 40, archivos: 0, quedaron: 0 }) })
  : r.request().url().startsWith("https://control.prueba/") && !r.request().url().includes("/api/")
    ? r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" })
    : r.fulfill({ status: 200, body: "" }));
const monta = async (ancho, tema) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/admin/datos");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="rl bd" id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".bd-punto");
};

return { nav, pg, monta };
}

const foto = (pg, n, o = {}) => process.env.FOTO ? pg.screenshot({ path: `${process.env.FOTO}/${n}.png`, ...o }) : null;
/* medidas comunes: lo que se sale y lo que no se toca con el dedo */
const medir = (pg, sel) => pg.evaluate((s) => {
  const fuera = [...document.querySelectorAll(s + " *")].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5) && !x.closest(".us-lote") });
  return { lado: document.documentElement.scrollWidth - innerWidth, fuera: fuera.slice(0, 3).map((x) => x.className || x.tagName) };
}, sel);

/* ============================ USUARIOS ============================ */
{
  const { nav, pg, monta } = await usuarios();
  for (const ancho of [390, 360]) {
    await monta(ancho);
    /* 1 · TARJETAS */
    const t = await pg.evaluate(() => {
      const tr = document.querySelector(".us-tabla:not(.us-tabla-lote) tbody tr");
      const tabla = document.querySelector(".us-tabla:not(.us-tabla-lote)");
      return { disp: getComputedStyle(tr).display, tablaDisp: getComputedStyle(tabla).display,
               rueda: document.querySelector(".us-marco").scrollWidth - document.querySelector(".us-marco").clientWidth,
               ths: [...document.querySelectorAll(".us-tabla:not(.us-tabla-lote) thead th")].filter((x) => getComputedStyle(x).display !== "none").length,
               marca: getComputedStyle(document.querySelector("thead th.us-marca"), "::after").content };
    });
    ok(t.disp === "grid" && t.tablaDisp === "block", `${ancho} px: la lista sigue siendo tabla (${t.disp}/${t.tablaDisp})`);
    ok(t.rueda <= 0, `${ancho} px: la lista rueda de lado ${t.rueda} px`);
    ok(t.ths === 1 && /Seleccionar todos/.test(t.marca), `${ancho} px: del encabezado debe quedar solo «Seleccionar todos» (${t.ths}, ${t.marca})`);
    const g = await medir(pg, ".us-tabla");
    ok(g.lado <= 0 && g.fuera.length === 0, `${ancho} px: algo se sale: ${JSON.stringify(g)}`);

    /* 2 · BOTONES DEL ANCHO DEL DEDO Y «MÁS» */
    const fila = pg.locator(".us-tabla tbody tr", { hasText: "Génesis Visbal" });
    const bots = await fila.locator(".us-acc-in .us-mini").evaluateAll((b) => b.filter((x) => getComputedStyle(x).display !== "none").map((x) => ({ t: x.textContent.trim(), h: Math.round(x.getBoundingClientRect().height), w: Math.round(x.getBoundingClientRect().width) })));
    ok(bots.map((b) => b.t).join("|") === "Editar|Nueva clave|Más", `${ancho} px: la tarjeta debe ofrecer Editar, Nueva clave y Más; ofrece ${bots.map((b) => b.t)}`);
    ok(bots.every((b) => b.h >= 44 && b.w >= 60), `${ancho} px: botones chicos ${JSON.stringify(bots)}`);
    ok(!(await fila.locator(".us-mas-sec").first().isVisible()), `${ancho} px: Desactivar y Eliminar deberían esconderse tras «Más»`);
    await foto(pg, `us-lista-${ancho}`, { fullPage: true });
    await fila.locator(".us-mas-bot").click();
    await foto(pg, `us-mas-${ancho}`, { fullPage: true });
    ok(await fila.locator(".us-mas-sec").first().isVisible() && await fila.locator(".us-mas-sec").nth(1).isVisible(), `${ancho} px: «Más» no muestra Desactivar y Eliminar`);
    ok((await fila.locator(".us-mas-bot").innerText()).trim() === "Menos", `${ancho} px: el botón no cambia a «Menos»`);
    await fila.locator(".us-mas-bot").click();
    ok(!(await fila.locator(".us-mas-sec").first().isVisible()), `${ancho} px: «Menos» no los vuelve a esconder`);
    const gh = await medir(pg, ".us-tabla");
    ok(gh.lado <= 0, `${ancho} px: abierto el «Más» la página se arrastra ${gh.lado}`);
    /* la tarjeta dice lo importante y no repite «al día» */
    const txt = await pg.locator(".us-tabla tbody").innerText();
    ok(!/al día/i.test(txt), `${ancho} px: «al día» se repite en las tarjetas`);
    ok(/inactivo/i.test(txt) && /clave provisional/i.test(txt), `${ancho} px: las excepciones (inactivo, clave provisional) deben seguir diciéndose`);
    const rot = await pg.evaluate(() => [".us-ingreso", ".us-c-reg"].map((q) => getComputedStyle(document.querySelector(".us-tabla tbody " + q), "::before").content));
    ok(/Último ingreso/.test(rot[0]) && /Registros/.test(rot[1]), `${ancho} px: la tarjeta no rotula el ingreso ni los registros (${rot})`);
    /* uno mismo no tiene «Más» (no se desactiva ni se elimina) */
    ok(await pg.locator(".us-tabla tbody tr", { hasText: "Cristian Padilla" }).locator(".us-mas-bot").count() === 0, `${ancho} px: uno mismo ofrece «Más»`);

    /* 3 · FILTROS TRAS UN BOTÓN */
    await monta(ancho);
    ok(await pg.locator(".us-buscar input").isVisible(), `${ancho} px: la búsqueda debe verse siempre`);
    ok(!(await pg.locator(".us-filtros label:nth-child(2) select").isVisible()), `${ancho} px: los filtros deberían esconderse`);
    ok((await pg.locator(".us-filtros-bot").innerText()).trim() === "Filtrar y ordenar", `${ancho} px: el botón de filtros dice «${await pg.locator(".us-filtros-bot").innerText()}»`);
    await pg.locator(".us-filtros-bot").click();
    ok(await pg.locator(".us-filtros label:nth-child(2) select").isVisible(), `${ancho} px: el botón no abre los filtros`);
    await pg.selectOption(".us-filtros label:nth-child(2) select", "operador");
    await pg.selectOption(".us-filtros label:nth-child(3) select", "inactivos");
    ok((await pg.locator(".us-filtros-bot i").innerText()).trim() === "2", `${ancho} px: la insignia debe decir 2 filtros puestos`);
    await foto(pg, `us-filtros-${ancho}`);
    await pg.locator(".us-filtros-bot").click();
    ok(!(await pg.locator(".us-filtros label:nth-child(2) select").isVisible()), `${ancho} px: «Ocultar filtros» no los esconde`);
    ok((await pg.locator(".us-filtros-bot i").innerText()).trim() === "2", `${ancho} px: al esconderlos se pierde la cuenta de filtros puestos`);
    ok(/1 de 4/.test(await pg.locator(".us-cuenta").innerText()), `${ancho} px: escondidos, los filtros deben seguir filtrando (${await pg.locator(".us-cuenta").innerText()})`);

    /* 4 · LA BARRA, FIJA ABAJO */
    await monta(ancho);
    await pg.setViewportSize({ width: ancho, height: 640 });
    await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
    const b = await pg.evaluate(() => {
      const l = document.querySelector(".us-lote"); const r = l.getBoundingClientRect(); const cs = getComputedStyle(l);
      const bs = [...l.querySelectorAll(".btn")].map((x) => Math.round(x.getBoundingClientRect().height));
      const ult = [...document.querySelectorAll(".us-tabla tbody tr")].pop().getBoundingClientRect();
      return { pos: cs.position, fondo: Math.round(innerHeight - r.bottom), alto: Math.round(r.height), ancho: Math.round(r.width), vp: innerWidth, bs,
               tapa: document.documentElement.scrollHeight - innerHeight };
    });
    await foto(pg, `us-barra-${ancho}`);
    ok(b.pos === "fixed" && b.fondo === 0, `${ancho} px: la barra de marcados no está fija abajo (${b.pos}, a ${b.fondo} px del borde)`);
    ok(b.alto <= 76, `${ancho} px: la barra ocupa ${b.alto} px: debería ser una sola fila`);
    ok(b.bs.every((h) => h >= 44), `${ancho} px: botones de la barra chicos ${b.bs}`);
    await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const fin = await pg.evaluate(() => { const l = document.querySelector(".us-lote").getBoundingClientRect(); const ult = [...document.querySelectorAll(".us-tabla tbody tr")].pop().getBoundingClientRect(); return { ultAbajo: Math.round(ult.bottom), barraArriba: Math.round(l.top) } });
    ok(fin.ultAbajo <= fin.barraArriba, `${ancho} px: la barra tapa la última tarjeta (${JSON.stringify(fin)})`);
    const desborda = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(desborda <= 0, `${ancho} px: con la barra, la página se arrastra ${desborda}`);

    /* 5 · VENTANA A PANTALLA ENTERA */
    await pg.locator(".us-lote .btn", { hasText: "Cambiar rol" }).click();
    await pg.waitForSelector(".us-pnl");
    await foto(pg, `us-ventana-${ancho}`);
    const v = await pg.evaluate(() => { const p = document.querySelector(".us-pnl"); const r = p.getBoundingClientRect(); return { pos: getComputedStyle(p).position, w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight } });
    ok(v.pos === "fixed" && v.w === v.vw && v.h === v.vh, `${ancho} px: el panel de «Cambiar rol» no ocupa la pantalla entera (${JSON.stringify(v)})`);
    const pie = await pg.evaluate(() => { const r = document.querySelector(".us-pnl-pie").getBoundingClientRect(); return Math.round(innerHeight - r.bottom) });
    ok(pie === 0, `${ancho} px: los botones del panel no están pegados abajo (${pie})`);
  }

  /* 6 · EL ESCRITORIO QUEDA IGUAL */
  await monta(1200);
  const e = await pg.evaluate(() => ({
    tr: getComputedStyle(document.querySelector(".us-tabla:not(.us-tabla-lote) tbody tr")).display,
    bot: getComputedStyle(document.querySelector(".us-filtros-bot")).display,
    mas: getComputedStyle(document.querySelector(".us-mas-bot")).display,
    sel: [...document.querySelectorAll(".us-filtros select")].every((s) => getComputedStyle(s).display !== "none"),
    ths: [...document.querySelectorAll(".us-tabla:not(.us-tabla-lote) thead th")].filter((x) => getComputedStyle(x).display !== "none").length }));
  ok(e.tr === "table-row" && e.bot === "none" && e.mas === "none" && e.sel && e.ths === 8, `1200 px: el escritorio cambió: ${JSON.stringify(e)}`);
  await nav.close();
}

/* ============================ ROLES ============================ */
{
  const { nav, pg, monta } = await roles();
  for (const ancho of [390, 360]) {
    await monta(ancho, null, 700);
    await pg.click('.rl-roles button:has-text("Portero")');
    /* 7a · FICHAS QUE SE DESLIZAN */
    const f = await pg.evaluate(() => {
      const ul = document.querySelector(".rl-roles"); const cs = getComputedStyle(ul);
      const bs = [...ul.querySelectorAll("button")].map((x) => Math.round(x.getBoundingClientRect().height));
      return { disp: cs.display, ox: cs.overflowX, alto: Math.round(ul.getBoundingClientRect().height), bs, lado: document.documentElement.scrollWidth - innerWidth };
    });
    ok(f.disp === "flex" && f.ox === "auto", `${ancho} px: los roles no son fichas que se deslizan (${f.disp}/${f.ox})`);
    ok(f.alto <= 90 && f.bs.every((h) => h >= 44), `${ancho} px: las fichas de rol miden ${f.alto} px de alto y botones ${f.bs}`);
    ok(f.lado <= 0, `${ancho} px: la página se arrastra ${f.lado}`);
    /* 7b · MÓDULOS QUE SE ABREN DE A UNO */
    const m = await pg.evaluate(() => {
      const mod = document.querySelector(".rl-modulo");
      const cuerpo = document.querySelector(".rl-cuerpo"); const cs = getComputedStyle(cuerpo);
      return { visibles: [...mod.querySelectorAll("li")].filter((x) => x.getBoundingClientRect().height > 0).length,
               resumen: mod.querySelector(".rl-resumen")?.textContent.trim() ?? null, maxH: cs.maxHeight, ov: cs.overflowY,
               sticky: getComputedStyle(mod.querySelector("header")).position };
    });
    ok(m.visibles === 0, `${ancho} px: el primer módulo debería venir cerrado (${m.visibles} filas a la vista)`);
    ok(m.resumen === "1 de 20 con acceso", `${ancho} px: el módulo debe decir cuántas pantallas tiene abiertas: 1 de 20 («${m.resumen}»)`);
    ok(m.maxH === "none" && m.ov === "visible", `${ancho} px: la lista de pantallas sigue rodando dentro de su caja (${m.maxH}/${m.ov})`);
    ok(m.sticky !== "sticky", `${ancho} px: el encabezado del módulo queda pegado y tapa las filas`);
    await foto(pg, `rl-cerrado-${ancho}`, { fullPage: true });
    await pg.click(".rl-modulo header .rl-abre");
    const abierto = await pg.evaluate(() => [...document.querySelector(".rl-modulo").querySelectorAll("li")].filter((x) => x.getBoundingClientRect().height > 0).length);
    ok(abierto >= 20, `${ancho} px: tocar el módulo no muestra sus pantallas (${abierto})`);
    ok(await pg.isVisible(".rl-modulo .rl-todo"), `${ancho} px: abierto el módulo no ofrece «todo el módulo»`);
    /* 7c · GUARDAR, FIJO ABAJO CUANDO HAY CAMBIOS */
    await foto(pg, `rl-abierto-${ancho}`);
    const sinCambio = await pg.evaluate(() => getComputedStyle(document.querySelector(".rl-acciones")).position);
    ok(sinCambio !== "fixed", `${ancho} px: sin cambios la barra de guardar no debería estar fija`);
    await pg.click('.rl-modulo li:not(.rl-rama) .rl-n.rl-ver >> nth=1');
    const g = await pg.evaluate(() => { const a = document.querySelector(".rl-acciones"); const r = a.getBoundingClientRect(); const b = a.querySelector(".btn").getBoundingClientRect();
      return { pos: getComputedStyle(a).position, fondo: Math.round(innerHeight - r.bottom), bh: Math.round(b.height), txt: a.querySelector(".btn").textContent.trim(), lado: document.documentElement.scrollWidth - innerWidth } });
    const res2 = await pg.locator(".rl-modulo .rl-resumen").first().innerText();
    ok(res2.trim() === "2 de 20 con acceso", `${ancho} px: al dar acceso a otra pantalla el resumen debe pasar a «2 de 20 con acceso» y dice «${res2}»`);
    await foto(pg, `rl-guardar-${ancho}`);
    ok(g.pos === "fixed" && g.fondo === 0, `${ancho} px: con cambios, «Guardar» debe quedar fijo abajo (${g.pos}, ${g.fondo})`);
    ok(g.bh >= 44 && /Guardar/.test(g.txt), `${ancho} px: el botón de guardar mide ${g.bh} y dice «${g.txt}»`);
    ok(g.lado <= 0, `${ancho} px: con la barra de guardar la página se arrastra ${g.lado}`);
    /* que no tape el final */
    await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const fin = await pg.evaluate(() => { const a = document.querySelector(".rl-acciones").getBoundingClientRect(); const u = [...document.querySelectorAll(".rl > *")].pop().getBoundingClientRect(); return { abajoUlt: Math.round(u.bottom), arribaBarra: Math.round(a.top) } });
    ok(fin.abajoUlt <= fin.arribaBarra + 1, `${ancho} px: la barra de guardar tapa el final (${JSON.stringify(fin)})`);
  }
  await monta(1200);
  await pg.click('.rl-roles button:has-text("Portero")');
  const e2 = await pg.evaluate(() => ({ li: [...document.querySelector(".rl-modulo").querySelectorAll("li")].filter((x) => x.getBoundingClientRect().height > 0).length,
    abre: getComputedStyle(document.querySelector(".rl-abre")).display, roles: getComputedStyle(document.querySelector(".rl-roles")).display,
    ov: getComputedStyle(document.querySelector(".rl-cuerpo")).overflowY, resumen: getComputedStyle(document.querySelector(".rl-resumen")).display }));
  ok(e2.li >= 20 && e2.abre === "none" && e2.roles === "block" && e2.ov === "auto" && e2.resumen === "none", `1200 px: el escritorio cambió: ${JSON.stringify(e2)}`);
  await nav.close();
}

/* ============================ BORRAR DATOS ============================ */
{
  const { nav, pg, monta } = await datos();
  for (const ancho of [390, 360]) {
    await monta(ancho);
    await pg.click("text=Viajes registrados");
    await pg.waitForFunction(() => /40/.test(document.querySelector(".bd-cuenta").textContent));
    await foto(pg, `bd-${ancho}`, { fullPage: true });
    const d = await pg.evaluate(() => {
      const vis = (e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
      const puntos = [...document.querySelectorAll(".bd-punto")];
      const esc = puntos.find((p) => p.querySelector("input")?.checked);
      return { detEsc: esc ? vis(esc.querySelector("i")) : null, detOtros: puntos.filter((p) => p !== esc).filter((p) => p.querySelector("i") && vis(p.querySelector("i"))).length,
               tabla: getComputedStyle(document.querySelector(".bd-tabla")).display, lado: document.documentElement.scrollWidth - innerWidth,
               rueda: document.querySelector(".bd-tabla-env").scrollWidth - document.querySelector(".bd-tabla-env").clientWidth,
               alto: Math.min(...puntos.map((p) => Math.round(p.getBoundingClientRect().height))) };
    });
    ok(d.detEsc === true, `${ancho} px: la opción escogida debe explicarse completa`);
    ok(d.detOtros === 0, `${ancho} px: las opciones NO escogidas deberían ir sin el párrafo largo (${d.detOtros} lo muestran)`);
    ok(d.alto >= 52, `${ancho} px: una opción mide ${d.alto} px: poca para tocarla`);
    ok(d.lado <= 0 && d.rueda <= 0, `${ancho} px: lo borrado rueda de lado (${d.lado}/${d.rueda})`);
    ok(d.tabla === "block", `${ancho} px: lo que se ha borrado sigue siendo tabla (${d.tabla})`);
    const rot = await pg.evaluate(() => [1, 3, 4, 5, 6].map((n) => getComputedStyle(document.querySelector(`.bd-tabla tbody td:nth-child(${n})`), "::before").content).join("|"));
    ok(/Cuándo/.test(rot) && /Fechas/.test(rot) && /Filas/.test(rot) && /Archivos/.test(rot) && /Quién/.test(rot), `${ancho} px: la tarjeta de lo borrado no rotula cuándo, fechas, filas, archivos y quién (${rot})`);
  }
  await monta(1200);
  const e = await pg.evaluate(() => ({ tabla: getComputedStyle(document.querySelector(".bd-tabla")).display,
    det: [...document.querySelectorAll(".bd-punto i")].every((i) => getComputedStyle(i).display !== "none") }));
  ok(e.tabla === "table" && e.det, `1200 px: el escritorio cambió: ${JSON.stringify(e)}`);
  await nav.close();
}

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Administración en el celular: Usuarios en tarjetas, Roles por módulos y Borrar datos corto; el escritorio queda igual.");
