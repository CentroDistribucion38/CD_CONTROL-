/* =====================================================================
   USUARIOS — la pantalla de verdad, en Chromium.

   Se monta Usuarios.tsx tal cual; la base de mentiras contesta que todo
   usuario está libre, y /api/admin/usuarios/lote se intercepta y anota
   lo que se le manda. Se recorre:
   1. buscar (con y sin tildes), filtrar por rol y por «nunca han entrado»,
      ordenar por último ingreso;
   2. seleccionar a varios: aparece la barra, cambiar el rol pide
      confirmación nombrándolos y manda {accion:"rol", ids, rol};
   3. uno mismo en la selección: no se manda nada y se dice por qué;
   4. eliminar a quien tiene registros avisa que se desactiva;
   5. crear varios: se pegan nombres (con tildes, repetidos, de Excel),
      los usuarios salen sin chocar, se corrige uno, y las claves salen
      en una tabla que se copia y se baja;
   6. 1200, 390 y 360 sin arrastrar la página; siete temas legibles.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-us.ts"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-us.ts"), `export const createClient = () => ({ rpc: async () => ({ data: true, error: null }) });`);
writeFileSync(R(".arnes/_us-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Usuarios } from "../src/app/(app)/admin/usuarios/Usuarios";
const roles = [{ clave: "admin", nombre: "Administrador", manda: true }, { clave: "operador", nombre: "Operador", manda: false },
               { clave: "portero", nombre: "Portero", manda: false }];
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
createRoot(document.getElementById("r")!).render(<Usuarios gente={gente as any} roles={roles} delRol={[]} catalogo={[]}
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
    if (b.accion === "crear") return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ resultados: b.personas.map((p, i) => i === 2 ? { ...p, ok: false, error: "Ya está tomado." } : { ...p, ok: true, clave: String(100000 + i) }) }) });
    if (b.accion === "eliminar") return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ resultados: b.ids.map((id) => ({ id, nombre: "x", hecho: "desactivado", registros: 12 })) }) });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cambiados: b.ids.length, sinBloqueo: 0 }) });
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
const filas = () => pg.$$eval(".us-tabla:not(.us-tabla-lote):not(.us-tabla-claves) tbody tr td:nth-child(2)", (t) => t.map((x) => x.textContent.trim()));

await monta(1200);
/* 1 · BUSCAR, FILTRAR, ORDENAR */
ok((await filas()).join("|") === "Ana Pérez|Cristian Padilla|Génesis Visbal|Santiago Leal", `no ordena por nombre: ${await filas()}`);
await pg.fill(".us-buscar input", "genesis");
ok((await filas()).join("|") === "Génesis Visbal", `buscar sin tilde no encuentra a Génesis: ${await filas()}`);
await pg.fill(".us-buscar input", "SLEAL");
ok((await filas()).join("|") === "Santiago Leal", "no busca por usuario en mayúsculas");
await pg.fill(".us-buscar input", "");
await pg.selectOption(".us-filtros label:nth-child(2) select", "operador");
ok((await filas()).join("|") === "Ana Pérez|Génesis Visbal", `el filtro de rol no filtra: ${await filas()}`);
ok(/2 de 4/.test(await pg.textContent(".us-cuenta")), "no dice cuántos de cuántos");
await pg.selectOption(".us-filtros label:nth-child(2) select", "");
await pg.selectOption(".us-filtros label:nth-child(3) select", "nunca");
ok((await filas()).join("|") === "Ana Pérez|Santiago Leal", `«nunca han entrado» no filtra: ${await filas()}`);
await pg.selectOption(".us-filtros label:nth-child(3) select", "todos");
await pg.selectOption(".us-filtros label:nth-child(4) select", "ingreso");
ok((await filas()).slice(0, 2).join("|") === "Cristian Padilla|Génesis Visbal", `no ordena por último ingreso: ${await filas()}`);
const ing = await pg.$$eval(".us-ingreso", (t) => t.map((x) => x.textContent));
ok(ing[0].startsWith("hoy") && /hace \d+ días/.test(ing[1]) && ing[2] === "nunca", `el último ingreso no se lee: ${ing}`);
await pg.selectOption(".us-filtros label:nth-child(4) select", "nombre");

/* 2 · VARIOS: CAMBIAR ROL */
ok(!(await pg.isVisible(".us-lote")), "la barra de seleccionados sale sin seleccionar a nadie");
await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
await pg.check('input[aria-label="Seleccionar a Santiago Leal"]');
ok(/2 seleccionados/.test(await pg.textContent(".us-lote")), "la barra no dice cuántos");
await pg.selectOption(".us-lote select", "portero");
await pg.click(".us-lote .btn.sec:has-text('Aplicar')");
await pg.waitForSelector(".cf-caja");
ok(/Génesis Visbal, Santiago Leal/.test(await pg.textContent(".cf-caja")), "la confirmación no nombra a quiénes");
await pg.click(".cf-caja .cf-btn:not(.plano)");
await pg.waitForSelector(".us-bien");
ok(mandados[0]?.accion === "rol" && mandados[0].rol === "portero" && mandados[0].ids.length === 2, `no manda el cambio de rol: ${JSON.stringify(mandados[0])}`);
ok(!(await pg.isVisible(".us-lote")), "después de aplicar sigue la selección");
ok((await pg.textContent(".us-tabla tbody")).split("Portero").length - 1 === 2, "la tabla no muestra el rol nuevo");

/* 3 · UNO MISMO */
await pg.check('input[aria-label="Seleccionar todos los de la lista"]');
await pg.click(".us-lote .btn.sec:has-text('Desactivar')");
if (await pg.isVisible(".cf-caja")) await pg.click(".cf-caja .cf-btn:not(.plano)");
await pg.waitForSelector(".us-mal, .us-bien", { timeout: 5000 }).catch(() => {});
ok(/Tú estás en la selección/.test((await pg.textContent(".us-mal").catch(() => "")) ?? "") && mandados.length === 1, "se manda desactivar incluyéndose a uno mismo");
if (await pg.isVisible(".us-lote")) await pg.click(".us-lote .btn.plano");

/* 4 · ELIMINAR A QUIEN TIENE REGISTROS */
await pg.click('tr:has-text("Génesis Visbal") .us-mini.peligro');
await pg.waitForSelector(".cf-caja");
ok(/Tiene registros/.test(await pg.textContent(".cf-caja")) && /se desactiva en vez de borrarse/.test(await pg.textContent(".cf-caja")), "eliminar a quien tiene registros no avisa que se desactiva");
await pg.click(".cf-caja .cf-btn:not(.plano)");
await pg.waitForFunction(() => /desactivado porque tenía registros/.test(document.querySelector(".us-bien")?.textContent ?? ""));
ok(mandados.at(-1).accion === "eliminar", "no manda eliminar");
ok(!(await pg.isVisible('tr:has-text("Cristian Padilla") .us-mini.peligro')), "uno mismo tiene botón de eliminar");

/* 5 · CREAR VARIOS */
await monta(1200);
await pg.click(".us-cab-bot .btn.sec");
await pg.fill(".us-varios textarea", "Génesis Villa\tBodega\nGabriel Villa\n  maria   jose  perez \nAna Pérez\nxx");
const u = await pg.$$eval(".us-tabla-lote input", (t) => t.map((x) => x.value));
ok(u.length === 4, `no lee un nombre por renglón (quitando lo corto y la otra columna de Excel): ${u}`);
ok(u[0] === "gvilla" && u[1] === "gvilla2" && u[2] === "mperez" && u[3] === "aperez2", `los usuarios propuestos chocan o no salen del nombre: ${u}`);
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
await pg.fill('.us-tabla-lote input[aria-label="Usuario de Gabriel Villa"]', "gpeña");
ok((await pg.inputValue('.us-tabla-lote input[aria-label="Usuario de Gabriel Villa"]')) === "gpea", "corregir un usuario no lo limpia");
await pg.fill('.us-tabla-lote input[aria-label="Usuario de Gabriel Villa"]', "gvisbal");
ok(await pg.isDisabled(".us-varios .btn:not(.plano)") && /ya está tomado/.test(await pg.textContent(".us-tabla-lote")), "deja crear con un usuario que ya existe");
await pg.fill('.us-tabla-lote input[aria-label="Usuario de Gabriel Villa"]', "gabriel");
await pg.selectOption(".us-varios-rol select", "portero");
ok(/Crear 4 usuarios · Portero/.test(await pg.textContent(".us-varios .btn:not(.plano)")), "el botón no dice cuántos ni con qué rol");
await pg.click(".us-varios .btn:not(.plano)");
await pg.click(".cf-caja .cf-btn:not(.plano)");
await pg.waitForSelector(".us-lote-claves");
const c = mandados.find((m) => m.accion === "crear");
ok(c && c.rol === "portero" && c.personas.map((p) => p.usuario).join(",") === "gvilla,gabriel,mperez,aperez2" && c.personas[2].nombre === "maria jose perez",
   `crear varios no manda lo que se ve: ${JSON.stringify(c)}`);
const claves = await pg.textContent(".us-lote-claves");
ok(/3 de 4 creados/.test(claves) && /100000/.test(claves) && /Ya está tomado/.test(claves), "la tabla de claves no dice cuáles salieron y cuál no");
await pg.click(".us-lote-bot .btn:has-text('Copiar todo')");
await pg.waitForTimeout(200);
const copiado = await pg.evaluate(() => navigator.clipboard.readText());
ok(copiado.split("\n").length === 4 && /gvilla\t100000/.test(copiado) && !/aperez2|mperez\t/.test(copiado.split("\n").find((l) => l.includes("mperez")) ? "x" : "")
   , `«Copiar todo» no copia una fila por clave creada: ${JSON.stringify(copiado)}`);
const [d] = await Promise.all([pg.waitForEvent("download"), pg.click(".us-lote-bot .btn:has-text('Bajar')")]);
ok(/claves-provisionales-.*\.csv$/.test(d.suggestedFilename()), "el CSV no se baja con nombre");

/* 6 · ANCHOS */
for (const ancho of [1200, 390, 360]) {
  await monta(ancho);
  await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
  const g = await pg.evaluate(() => {
    const alto = (s) => Math.min(...[...document.querySelectorAll(s)].map((x) => x.getBoundingClientRect().height));
    const fuera = [...document.querySelectorAll(".us-filtros *, .us-lote *")].filter((x) => x.getBoundingClientRect().right > innerWidth + 0.5);
    return { lado: document.documentElement.scrollWidth - innerWidth, fuera: fuera.length, tocar: alto(".us-filtros select, .us-filtros input, .us-lote .btn, .us-lote select") };
  });
  ok(g.lado <= 0 && g.fuera === 0, `${ancho} px: la página se sale (${g.lado} px, ${g.fuera} elementos)`);
  ok(g.tocar >= 40, `${ancho} px: un control de filtros o de la barra mide ${g.tocar} px`);
}

/* 7 · TEMAS */
const lum = (c) => { const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * n[0] + .7152 * n[1] + .0722 * n[2] };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1200, t);
  await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
  const pares = await pg.evaluate(() => {
    const fondo = (e) => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s); return [getComputedStyle(e).color, fondo(e)] };
    return { "rótulo filtro": par(".us-filtros label > span"), "cuenta": par(".us-cuenta"), "barra": par(".us-lote > b"),
             "botón barra": par(".us-lote .btn.sec"), "quitar": par(".us-lote .btn.plano"), "eliminar fila": par(".us-mini.peligro"),
             "ingreso": par(".us-ingreso") };
  });
  for (const [k, [a, b]] of Object.entries(pares)) ok(razon(a, b) >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${razon(a, b).toFixed(2)}`);
}
await monta(390); await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
await pg.screenshot({ path: "/tmp/claude-0/ad-us-390.png" });
await monta(1300); await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
await pg.screenshot({ path: "/tmp/claude-0/ad-us-1300.png" });
await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Usuarios: busca y filtra, cambia a varios nombrándolos, no se toca a uno mismo, eliminar avisa si desactiva, crea varios con claves para copiar y bajar; 3 anchos, 7 temas.");
