/* =====================================================================
   USUARIOS — la pantalla de verdad, en Chromium.

   Se monta Usuarios.tsx tal cual; la base de mentiras contesta que todo
   usuario está libre, y /api/admin/usuarios/lote se intercepta y anota
   lo que se le manda. Se recorre:
   1. buscar (con y sin tildes), filtrar por rol y por «nunca han entrado»,
      ordenar por último ingreso;
   2. seleccionar a varios: aparece la barra; «Cambiar rol» abre el panel
      de la derecha con los roles, dice HOY quién tiene cuál, enseña «Así
      queda» y manda {accion:"rol"} SOLO con los que cambian;
   3. uno mismo en la selección: no se manda nada y se dice por qué;
   4. eliminar abre el panel: avisa que quien tiene registros se
      desactiva, se quita a uno con ×, y no deja hasta escribir ELIMINAR;
   4b. «Nueva clave» a varios: las claves salen juntas en el panel, que no
      se cierra tocando fuera;
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
/* Una acción sobre los seleccionados: en el PC sale en el panel de al lado
   (paso 1); en tableta y celular, en la barra negra de arriba de la tabla. */
const accion = async (que) => {
  if (await pg.isVisible(".us-pnl.menu")) await pg.click(`.us-pnl-acc:has-text('${que}')`);
  else await pg.click(`.us-lote .btn.sec:has-text('${que}')`);
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
ok(!(await pg.isVisible(".us-pnl.menu")) && !(await pg.isVisible(".us-lote")), "el panel de seleccionados sale sin seleccionar a nadie");
await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
await pg.check('input[aria-label="Seleccionar a Santiago Leal"]');
ok(await pg.isVisible(".us-pnl.menu") && /2 seleccionados/.test(await pg.textContent(".us-pnl-tit")),
   "en el PC, marcar a dos no abre al lado el panel con cuántos van");
ok(!(await pg.isVisible(".us-lote")), "en el PC sigue saliendo la barra negra además del panel");
const acc = await pg.$$eval(".us-pnl-acc b", (t) => t.map((x) => x.textContent));
ok(acc.join("|") === "Cambiar rol|Nueva clave|Desactivar|Eliminar", `el paso 1 no ofrece lo que se puede hacer: ${acc}`);
ok(await pg.$eval(".us-cuerpo .us-marco", (t) => t.getBoundingClientRect().right) <= (await pg.$eval(".us-pnl", (e) => e.getBoundingClientRect().left)) + 1,
   "el panel no va al lado de la tabla");
await accion("Cambiar rol");
await pg.waitForSelector(".us-pnl-ro");
await pg.click(".us-pnl-vol");
ok(await pg.isVisible(".us-pnl.menu") && (await pg.$$('input[aria-label^="Seleccionar a "]:checked')).length === 2,
   "‹ en Cambiar rol no vuelve al paso 1 con la selección");
await accion("Cambiar rol");
await pg.waitForSelector(".us-pnl");
ok(/Génesis Visbal y Santiago Leal/.test(await pg.textContent(".us-pnl-tit")), "el panel de rol no nombra a quiénes");
ok(await pg.isDisabled(".us-pnl-pie .btn:not(.sec)"), "se puede cambiar el rol sin escoger uno");
const hoy = await pg.$$eval(".us-pnl-ro", (b) => b.map((x) => x.querySelector(".hoy")?.textContent ?? ""));
ok(hoy[1] === "HOY · Génesis Visbal" && hoy[2] === "HOY · Santiago Leal" && hoy[0] === "", `el panel no dice qué rol tiene HOY cada uno: ${hoy}`);
ok(/Contar, registrar, roturas/.test(await pg.textContent(".us-pnl-roles")), "no sale la descripción del rol");
ok((await pg.$$eval(".us-pnl-ro .pt", (t) => t.map((x) => x.textContent))).join(",") === "0,2,1", "no dice cuántas pantallas da cada rol");
await pg.click(".us-pnl-ro:has-text('Portero')");
const queda = await pg.textContent(".us-pnl-queda");
ok(/Génesis Visbal\s*Operador\s*→\s*Portero/.test(queda) && /Santiago Leal\s*ya es Portero/.test(queda), `«Así queda» no dice de qué a qué: ${queda}`);
ok(/Cambiar a Portero/.test(await pg.textContent(".us-pnl-pie .btn:not(.sec)")), "el botón no dice a qué rol");
await pg.click(".us-pnl-pie .btn:not(.sec)");
await pg.waitForSelector(".us-bien");
ok(!(await pg.isVisible(".cf-caja")), "el cambio de rol pregunta otra vez después del panel");
ok(mandados[0]?.accion === "rol" && mandados[0].rol === "portero" && mandados[0].ids.join() === "00000000-0000-0000-0000-000000000002",
   `no manda el cambio de rol solo con los que cambian: ${JSON.stringify(mandados[0])}`);
ok(!(await pg.isVisible(".us-pnl")), "el panel sigue abierto después de cambiar el rol");
ok(!(await pg.isVisible(".us-pnl.menu")) && !(await pg.isVisible(".us-lote")), "después de aplicar sigue la selección");
ok((await pg.textContent(".us-tabla tbody")).split("Portero").length - 1 === 2, "la tabla no muestra el rol nuevo");

/* 3 · UNO MISMO */
await pg.check('input[aria-label="Seleccionar todos los de la lista"]');
await accion("Desactivar");
if (await pg.isVisible(".cf-caja")) await pg.click(".cf-caja .cf-btn:not(.plano)");
await pg.waitForSelector(".us-mal, .us-bien", { timeout: 5000 }).catch(() => {});
ok(/Tú estás en la selección/.test((await pg.textContent(".us-mal").catch(() => "")) ?? "") && mandados.length === 1, "se manda desactivar incluyéndose a uno mismo");
if (await pg.isVisible(".us-pnl.menu")) await pg.click(".us-pnl-pie .btn:has-text('Quitar selección')");

/* 4 · ELIMINAR A QUIEN TIENE REGISTROS */
await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
await pg.check('input[aria-label="Seleccionar a Santiago Leal"]');
await accion("Eliminar");
await pg.waitForSelector(".us-pnl");
ok(/Eliminar 2 usuarios/.test(await pg.textContent(".us-pnl-tit")), "el panel no dice a cuántos elimina");
const aviso = await pg.textContent(".us-pnl-aviso.mal");
ok(/1 se borran del todo/.test(aviso) && /Génesis Visbal tiene 12 registros/.test(aviso) && /se desactiva en vez de borrarse/.test(aviso),
   `eliminar no dice qué pasa con cada uno: ${aviso}`);
ok(await pg.isDisabled(".us-pnl-pie .btn.rojo"), "deja eliminar sin escribir ELIMINAR");
await pg.fill(".us-pnl-conf input", "eliminr");
ok(await pg.isDisabled(".us-pnl-pie .btn.rojo"), "deja eliminar con ELIMINAR mal escrito");
await pg.click('.us-pnl-chip button[aria-label="Quitar a Santiago Leal"]');
ok((await pg.$$(".us-pnl-chip")).length === 1 && /Eliminar Génesis Visbal/.test(await pg.textContent(".us-pnl-tit")), "quitar con × no saca a esa persona");
await pg.fill(".us-pnl-conf input", "eliminar");
await pg.click(".us-pnl-pie .btn.rojo");
await pg.waitForFunction(() => /desactivado porque tenía registros/.test(document.querySelector(".us-bien")?.textContent ?? ""));
ok(mandados.at(-1).accion === "eliminar" && mandados.at(-1).ids.length === 1, `no manda eliminar solo a quien quedó: ${JSON.stringify(mandados.at(-1))}`);
ok(!(await pg.isVisible(".cf-caja")), "eliminar pregunta otra vez después del panel");

/* 4b · NUEVA CLAVE A VARIOS */
await monta(1200);
await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
await pg.check('input[aria-label="Seleccionar a Santiago Leal"]');
await accion("Nueva clave");
await pg.waitForSelector(".us-tabla-claves tbody tr");
ok((await pg.$$(".us-tabla-claves tbody tr")).length === 2 && /Tolva-02/.test(await pg.textContent(".us-pnl")) && /Tolva-03/.test(await pg.textContent(".us-pnl")),
   "las dos claves no salen juntas en el panel");
ok(/Se muestran una sola vez/.test(await pg.textContent(".us-pnl-aviso.amb")), "no avisa que las claves salen una sola vez");
ok(/Copiar las dos/.test(await pg.textContent(".us-pnl-pie")), "no está «Copiar las dos»");
await pg.mouse.click(20, 400);
await pg.keyboard.press("Escape");
ok(await pg.isVisible(".us-tabla-claves tbody tr"), "el panel de las claves se cierra tocando fuera o con Esc: se pierden");
/* Sin el panel no hay nada más que medir aquí: se corta con lo que hay. */
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
await pg.click(".us-pnl-pie .btn:has-text('Copiar para compartir')");
await pg.waitForTimeout(150);
const msj = await pg.evaluate(() => navigator.clipboard.readText());
ok(/\/login/.test(msj) && /Usuario: u2\nClave: Tolva-02/.test(msj) && /Clave: Tolva-03/.test(msj), `el mensaje para compartir no trae enlace, usuarios y claves: ${JSON.stringify(msj)}`);
ok(await pg.isVisible(".us-modal-velo .us-tabla-claves"), "las claves no salen al centro de la pantalla");
await pg.click(".us-pnl-pie .btn:has-text('Copiar las dos')");
await pg.waitForTimeout(150);
const dos = await pg.evaluate(() => navigator.clipboard.readText());
ok(dos.split("\n").length === 3 && /Tolva-02/.test(dos), `«Copiar las dos» no copia las dos: ${JSON.stringify(dos)}`);
await pg.click(".us-tabla-claves tbody tr:first-child .us-pnl-copiar");
await pg.waitForTimeout(150);
ok(/^u2\tTolva-02$/.test(await pg.evaluate(() => navigator.clipboard.readText())), "el botón de copiar de una fila no copia esa clave");
await pg.click(".us-pnl-pie .btn.sec:has-text('Listo')");
ok(!(await pg.isVisible(".us-pnl")), "«Listo» no cierra el panel");
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
await pg.waitForSelector(".us-tabla-claves tbody tr");
const c = mandados.find((m) => m.accion === "crear");
ok(c && c.rol === "portero" && c.personas.map((p) => p.usuario).join(",") === "gvilla,gabriel,mperez,aperez2" && c.personas[2].nombre === "maria jose perez",
   `crear varios no manda lo que se ve: ${JSON.stringify(c)}`);
const claves = await pg.textContent(".us-pnl");
if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/us-claves.png` });
ok(/3 de 4 usuarios creados/.test(claves) && /100000/.test(claves) && /Ya está tomado/.test(claves), "el panel de claves no dice cuáles salieron y cuál no");
await pg.click(".us-pnl-pie .btn:has-text('Copiar las 3')");
await pg.waitForTimeout(200);
const copiado = await pg.evaluate(() => navigator.clipboard.readText());
ok(copiado.split("\n").length === 4 && /gvilla\t100000/.test(copiado) && !/aperez2|mperez\t/.test(copiado.split("\n").find((l) => l.includes("mperez")) ? "x" : "")
   , `«Copiar todo» no copia una fila por clave creada: ${JSON.stringify(copiado)}`);
const [d] = await Promise.all([pg.waitForEvent("download"), pg.click(".us-pnl-pie .btn:has-text('Bajar')")]);
ok(/claves-provisionales-.*\.csv$/.test(d.suggestedFilename()), "el CSV no se baja con nombre");

/* 6 · ANCHOS */
for (const ancho of [1200, 390, 360]) {
  await monta(ancho);
  await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
  const g = await pg.evaluate(() => {
    const alto = (s) => Math.min(...[...document.querySelectorAll(s)].map((x) => x.getBoundingClientRect().height).filter((h) => h > 0));
    const fuera = [...document.querySelectorAll(".us-filtros *, .us-lote *")].filter((x) => x.getBoundingClientRect().right > innerWidth + 0.5);
    return { lado: document.documentElement.scrollWidth - innerWidth, fuera: fuera.length, tocar: alto(".us-filtros select, .us-filtros input, .us-lote .btn, .us-lote select") };
  });
  ok(g.lado <= 0 && g.fuera === 0, `${ancho} px: la página se sale (${g.lado} px, ${g.fuera} elementos)`);
  ok(g.tocar >= 40, `${ancho} px: un control de filtros o de la barra mide ${g.tocar} px`);
  /* LOS TRES PANELES, en cada ancho: nada se sale y lo que se toca mide ≥ 44. */
  await pg.check('input[aria-label="Seleccionar a Santiago Leal"]');
  for (const [boton, antes] of [["Cambiar rol", async () => pg.click(".us-pnl-ro:has-text('Portero')")],
                                ["Eliminar", async () => pg.fill(".us-pnl-conf input", "ELIMINAR")],
                                ["Nueva clave", async () => {}]]) {
    await accion(boton);
    await pg.waitForSelector(".us-pnl");
    await antes();
    const q = await pg.evaluate(() => {
      const p = document.querySelector(".us-pnl").getBoundingClientRect();
      const fuera = [...document.querySelectorAll(".us-pnl *")].filter((x) => { const r = x.getBoundingClientRect(); return r.width && (r.right > p.right + 0.5 || r.left < p.left - 0.5) })
        .map((x) => (x.className || x.tagName) + "");
      const chicos = [...document.querySelectorAll(".us-pnl button, .us-pnl input")].map((x) => [Math.round(x.getBoundingClientRect().height), (x.className || x.tagName) + " " + x.textContent.trim().slice(0, 12)])
        .filter(([h]) => h < 44);
      const pie = document.querySelector(".us-pnl-pie").getBoundingClientRect();
      /* El panel va AL LADO de la tabla, dentro de la página. Lo que
         importa: que esté en pantalla al abrirse, que su pie no quede
         cortado, y en el PC que la tabla siga a la vista a su lado. */
      const tabla = document.querySelector(".us-cuerpo .us-marco").getBoundingClientRect();
      return { fuera, chicos, pie: pie.bottom <= p.bottom + 0.5 && pie.height > 40, ancho: Math.round(p.width),
               visto: p.top < innerHeight && p.bottom > 0, alLado: tabla.right <= p.left + 1 && tabla.width > 300 };
    });
    ok(!q.fuera.length, `${ancho} px, panel «${boton}»: se sale ${q.fuera.join(", ")}`);
    ok(!q.chicos.filter(([, n]) => !/us-pnl-link/.test(n)).length, `${ancho} px, panel «${boton}»: se toca y mide menos de 44: ${JSON.stringify(q.chicos)}`);
    ok(q.pie, `${ancho} px, panel «${boton}»: los botones de abajo quedan cortados`);
    ok(q.visto, `${ancho} px, panel «${boton}»: al abrirse no queda en pantalla`);
    if (ancho >= 1200) ok(q.alLado, `${ancho} px, panel «${boton}»: no va al lado de la tabla`);
    else ok(q.ancho >= ancho - 40, `${ancho} px: el panel no ocupa el ancho (${q.ancho})`);
    if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/us-${boton.replace(" ", "")}-${ancho}.png` });
    if (boton === "Nueva clave") await pg.click(".us-pnl-pie .btn.sec:has-text('Listo')");
    else await pg.click(".us-pnl-x");
    await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
    await pg.check('input[aria-label="Seleccionar a Santiago Leal"]');
  }
}

/* 7 · TEMAS */
const lum = (c) => { const k = c.startsWith("color(srgb") ? 1 : 255; const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { v /= k; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * n[0] + .7152 * n[1] + .0722 * n[2] };
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
  const menu = await pg.evaluate(() => {
    const e = document.querySelector(".us-pnl-acc small");
    let f = e; for (; f; f = f.parentElement) { const c = getComputedStyle(f).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) break }
    const r = document.querySelector(".us-pnl-acc.peligro b");
    return { "acción · explica": [getComputedStyle(e).color, f ? getComputedStyle(f).backgroundColor : "rgb(255,255,255)"],
             "acción eliminar": [getComputedStyle(r).color, "rgb(255,255,255)"] };
  });
  Object.assign(pares, menu);
  await accion("Cambiar rol");
  await pg.click(".us-pnl-ro:has-text('Portero')");
  const pnl = await pg.evaluate(() => {
    const fondo = (e) => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s); return [getComputedStyle(e).color, fondo(e)] };
    return { "subtítulo panel": par(".us-pnl-tit span"), "rol escogido": par(".us-pnl-ro.on .tx b"), "descripción rol": par(".us-pnl-ro.on small"),
             "hoy": par(".us-pnl-ro .hoy"), "rol nuevo": par(".us-pnl-queda .a"), "rol viejo": par(".us-pnl-queda s"),
             "iniciales": par(".us-ini"), "botón panel": par(".us-pnl-pie .btn:not(.sec)"), "rótulo": par(".us-pnl-rot") };
  });
  Object.assign(pares, pnl);
  await pg.click(".us-pnl-x");
  for (const [k, [a, b]] of Object.entries(pares)) ok(razon(a, b) >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${razon(a, b).toFixed(2)}`);
}
await monta(390); await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
await pg.screenshot({ path: "/tmp/claude-0/ad-us-390.png" });
await monta(1300); await pg.check('input[aria-label="Seleccionar a Génesis Visbal"]');
await pg.screenshot({ path: "/tmp/claude-0/ad-us-1300.png" });
/* DE A CINCO Y SI SE CORTA, SE DICE: 7 nombres = dos tandas; la segunda
   da 504 → las 5 primeras salen con clave, el error se ve AL LADO del
   botón y las 2 que faltan quedan en la caja para volver a intentar. */
await monta(1200);
mandados = []; globalThis.CORTAR = true;
await pg.click(".us-cab-bot .btn.sec");
await pg.fill(".us-varios textarea", ["Uno Prueba", "Dos Prueba", "Tres Prueba", "Cuatro Prueba", "Cinco Prueba", "Seis Prueba", "Siete Prueba"].join("\n"));
await pg.click(".us-varios .btn:not(.plano)");
await pg.click(".cf-caja .cf-btn:not(.plano)");
await pg.waitForSelector(".us-varios .us-mal", { timeout: 5000 }).catch(() => null);
const tandas = mandados.filter((m) => m.accion === "crear").map((m) => m.personas.length);
ok(JSON.stringify(tandas) === "[5,2]", `crear varios no va de a cinco: ${JSON.stringify(tandas)}`);
ok(/tardó demasiado/.test(await pg.textContent(".us-varios .us-mal").catch(() => "")), "si el servidor se corta, no se dice al lado del botón");
ok((await pg.inputValue(".us-varios textarea")).split("\n").length === 2, "las que faltaron no quedan en la caja para reintentar");
ok(/de 7 usuarios creados/.test(await pg.textContent(".us-pnl").catch(() => "")), "las claves de la primera tanda no se muestran");
globalThis.CORTAR = false;
await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Usuarios: busca y filtra; al marcar, el panel de al lado dice qué hacer (‹ vuelve, × suelta); cambia el rol (HOY, pantallas, «Así queda», solo los que cambian), " +
            "elimina escribiendo ELIMINAR y dice quién se desactiva, y entrega las claves juntas una sola vez; no se toca a uno mismo; " +
            "crea varios con claves para copiar y bajar; 3 anchos, 7 temas.");
