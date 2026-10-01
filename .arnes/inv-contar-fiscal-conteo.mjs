/* =====================================================================
   CONTAR · EL FISCAL — en Chromium, con los componentes de verdad.
   «Debería aparecer la opción de fiscal y de una un toolbox para contar.»
   Cubre: el selector FEFO | Fiscal (y que el FEFO sigue montado), el formulario (el mismo del
   conteo diario), lo que se manda a la base, lo que se rechaza antes de mandar, el cero que
   cuenta, «lo que llevas anotado» con su Quitar, y que nada se sale en 4 anchos.
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_ccf-cliente.ts"), `
const w = window as any;
w.__llamadas = []; w.__falla = null; w.__mios = w.__mios ?? []; w.__n = 100;
export function createClient() { return { rpc: async (fn: string, a: any) => { w.__llamadas.push({ fn, args: a });
  if (fn === "inv_fiscal_contar_mios") return { data: w.__miosFalla ? null : w.__mios, error: w.__miosFalla ? { message: w.__miosFalla } : null };
  if (w.__falla && fn === w.__fallaFn) return { data: null, error: { message: w.__falla } };
  if (fn === "conteo_ubicacion_asegurar") return { data: "u-nueva", error: null };
  if (fn === "inv_fiscal_contar_agregar") {
    const m = w.MATERIALES.find((x: any) => x.id === a.p_producto); const u = w.UBIS.find((x: any) => x.id === a.p_ubicacion);
    const total = a.p_cajas != null ? a.p_cajas : (a.p_estibas ?? 0) * (m.cajas_por_estiba ?? 0) + (a.p_saldo ?? 0);
    w.__mios.unshift({ id: "r" + (w.__n++), ubicacion_id: a.p_ubicacion, ubicacion: u ? u.clave : "NUEVA", producto_id: m.id, sku: m.sku, material: m.nombre,
      estibas: a.p_estibas, saldo: a.p_saldo, cajas: a.p_cajas, total_cajas: total, venc_dia: a.p_dia, venc_mes: a.p_mes, venc_anio: a.p_anio, nota: a.p_nota, contado_en: "2026-10-02T15:00:00Z" });
    return { data: "r-nuevo", error: null } }
  if (fn === "inv_fiscal_contar_quitar") { w.__mios = w.__mios.filter((r: any) => r.id !== a.p_id); return { data: null, error: null } }
  return { data: null, error: null } } } }`);
writeFileSync(R(".arnes/_ccf-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { ContarConFiscal } from "../src/app/(app)/inventario/conteo/ContarConFiscal";
const w = window as any;
createRoot(document.getElementById("r")!).render(
  <ContarConFiscal hojas={w.HOJAS} bodegaId="b1" materiales={w.MATERIALES} ubicaciones={w.UBIS}><div id="fefo-vivo"><input id="fefo-campo" placeholder="campo del FEFO" /></div></ContarConFiscal>);`);
const js = buildSync({ entryPoints: [R(".arnes/_ccf-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_ccf-cliente.ts"), "next/navigation": R(".arnes/stub-nav.js"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/conteo/asignado.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const M = (id, sku, nombre, cajas_por_estiba, tipo = "PRODUCTO") => ({ id, sku, nombre, cajas_por_estiba, tipo_material: tipo, activo: true, dias_minimo: 30, unidades_por_caja: 24, unidades_por_estiba: null, contenido: null, familia: null, presentacion: null, vida_util: null, f_limite_desp: null, origen: null, foraneo: null, en_sitio: false });
const MATERIALES = [M("p1", "3128", "AGUILA 330 ML", 54), M("p2", "3500231", "ENVASE COSTEÑITA 175 ML", 80, "ENVASE"), M("p3", "9999", "MATERIAL SIN FACTOR", null)];
const U = (id, clave, calle, modulo, lado) => ({ id, bodega_id: "b1", clave, calle, modulo, lado, familia: null, capacidad: null, activa: true });
const UBIS = [U("u1", "A01_IZQ", "A", "01", "IZQ"), U("u2", "A01_DER", "A", "01", "DER"), U("u3", "A02_DER", "A", "02", "DER"), U("u4", "B01_DER", "B", "01", "DER")];
const H1 = { hojaId: "h1", fiscalId: "f1", nombre: "FISCAL OCTUBRE 2026 · viernes 02/10", fecha: "2026-10-02", numero: 3, equipo: "Operador logístico", puedeContar: true, misRenglones: 0 };
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = []; pg.on("pageerror", (e) => roto.push(e.message));
const monta = async (hojas, ancho = 390, mios = [], extra = "", ls = {}, aviso = "cierra", ss = {}) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe contando"><div id="r"></div></div></main></div></div>
    <script>(function(){var d=${JSON.stringify(ls)};Object.defineProperty(window,"localStorage",{value:{getItem:function(k){return k in d?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}}}});window.__ls=function(){return d};var e=${JSON.stringify(ss)};Object.defineProperty(window,"sessionStorage",{value:{getItem:function(k){return k in e?e[k]:null},setItem:function(k,v){e[k]=String(v)},removeItem:function(k){delete e[k]}}});window.__ss=function(){return e};window.__miosFalla=null;window.__falla=null})();${extra}window.__mios=${JSON.stringify(mios)};window.HOJAS=${JSON.stringify(hojas)};window.MATERIALES=${JSON.stringify(MATERIALES)};window.UBIS=${JSON.stringify(UBIS)};</script><script>${js}<\/script></body></html>`);
  await pg.waitForSelector("#r > *");
  /* Casi todas las pruebas no son del aviso: lo cierran con «Continuar con el fiscal». */
  if (aviso === "cierra" && hojas.some((h) => h.puedeContar)) { await pg.waitForSelector(".fc-aviso"); await pg.click('.fc-aviso button:has-text("Continuar con el fiscal")'); await pg.waitForSelector(".fc-aviso", { state: "detached" }) }
};
const llamadas = (fn) => pg.evaluate((f) => window.__llamadas.filter((c) => c.fn === f), fn);
const escoger = async (n, texto) => { const campo = pg.locator(".fc-anotar .bs-campo").nth(n); await campo.click(); await campo.fill(texto); await pg.locator(".bs-lista [role=option]").first().dispatchEvent("mousedown") };
const llena = async ({ calle = "A", modulo = "01", lado = "Izquierdo", codigo = "3128", fecha = ["11", "03", "27"], estibas = "3", saldo = "" } = {}) => {
  await escoger(0, calle); await escoger(1, modulo);
  if (lado) await pg.click(`.fc-anotar [aria-labelledby=fc-rot-lado] button:has-text("${lado}")`);
  await pg.fill('.fc-anotar input[placeholder="Teclea el código"]', codigo);
  await pg.waitForTimeout(40); /* el salto automático a «Vence» corre en el siguiente ciclo: una persona no teclea tan rápido */
  if (fecha) { await pg.fill('.fc-anotar input[placeholder="DD"]', fecha[0]); await pg.fill('.fc-anotar input[placeholder="MM"]', fecha[1]); await pg.fill('.fc-anotar input[placeholder="AA"]', fecha[2]) }
  if (estibas !== null) await pg.locator(".fc-anotar .fe-cuanto-campo input").first().fill(estibas);
  if (saldo) await pg.locator(".fc-anotar .fe-cuanto-campo input").nth(1).fill(saldo);
};
const aviso = async () => (await pg.locator(".av-pila").textContent().catch(() => "")).replace(/\s+/g, " ");

/* ---- 0 · el aviso «tienes un fiscal asignado» ---- */
const H1P = { ...H1, pareja: "Cañizares", parejaEquipo: "Operador logístico", equipo: "Bavaria" };
await monta([H1P], 390, [], "", {}, "deja");
ok(await pg.locator(".fc-aviso").count() === 1, "el día de la hoja no sale el aviso de «tienes un fiscal asignado»");
const av = (await pg.locator(".fc-aviso").textContent()).replace(/\s+/g, " ");
ok(/Tienes un inventario fiscal asignado/.test(av) && /FISCAL OCTUBRE 2026/.test(av) && /Hoja 3 · cuentas por Bavaria/.test(av) && /Tu pareja: Cañizares \(Operador logístico\)/.test(av) && /viernes 02\/10\/2026 · HOY/.test(av), "el aviso no dice lo esencial: " + av);
ok(await pg.locator('.fc-aviso button:has-text("Continuar con el fiscal")').evaluate((e) => e === document.activeElement), "el foco debe estar en «Continuar con el fiscal»");
await pg.click('.fc-aviso button:has-text("Continuar con el fiscal")');
ok(await pg.locator(".fc-aviso").count() === 0 && await pg.locator(".fc-anotar").isVisible() && await pg.locator("#fefo-vivo").isHidden() && /Fiscal/.test(await pg.locator(".fc-modo button.on").textContent()), "«Continuar» debe dejar el formulario del fiscal");
ok("fiscal.aviso.h1" in await pg.evaluate(() => window.__ss()), "no recuerda en la pestaña que ya avisó");
/* El conteo diario. */
await monta([H1P], 390, [], "", {}, "deja");
await pg.click('.fc-aviso button:has-text("Conteo diario")');
ok(await pg.locator(".fc-aviso").count() === 0 && await pg.locator("#fefo-vivo").isVisible() && await pg.locator(".fc-anotar").isHidden() && /FEFO diario/.test(await pg.locator(".fc-modo button.on").textContent()), "«Conteo diario» debe dejar el FEFO");
/* Escape cierra sin cambiar lo escogido por defecto. */
await monta([H1P], 390, [], "", {}, "deja");
await pg.keyboard.press("Escape");
ok(await pg.locator(".fc-aviso").count() === 0 && /Fiscal/.test(await pg.locator(".fc-modo button.on").textContent()), "Escape debe cerrar el aviso");
/* Ya avisó en esta pestaña: no vuelve a salir. */
await monta([H1P], 390, [], "", {}, "deja", { "fiscal.aviso.h1": "1" });
await pg.waitForTimeout(150);
ok(await pg.locator(".fc-aviso").count() === 0, "volvió a avisar en la misma pestaña");
/* Solo en la fecha asignada: antes del día no sale. */
await monta([{ ...H1P, puedeContar: false }], 390, [], "", {}, "deja");
await pg.waitForTimeout(150);
ok(await pg.locator(".fc-aviso").count() === 0, "avisó antes de la fecha asignada");
/* Sin hojas: nada. */
await monta([], 390, [], "", {}, "deja");
ok(await pg.locator(".fc-aviso").count() === 0, "avisó a quien no tiene hoja");
/* Dos hojas de hoy salen las dos en el aviso; la de otro día no. */
await monta([H1P, { ...H1P, hojaId: "h2", nombre: "OTRO FISCAL", numero: 2 }, { ...H1P, hojaId: "h3", nombre: "FISCAL FUTURO", numero: 1, puedeContar: false }], 390, [], "", {}, "deja");
ok(await pg.locator(".fc-aviso-lista li").count() === 2 && !/FISCAL FUTURO/.test(await pg.locator(".fc-aviso").textContent()), "el aviso debe listar solo las hojas de hoy");

/* ---- 1 · el selector ---- */
await monta([H1]);
const tabs = await pg.locator(".fc-modo button").allTextContents();
ok(tabs.length === 2 && /FEFO diario/.test(tabs[0]) && /Fiscal · Hoja 3/.test(tabs[1]), "los dos botones: " + tabs.join(" | "));
ok(await pg.locator('.fc-modo button.on').textContent().then((t) => /Fiscal/.test(t)), "el día de la hoja debe abrir en Fiscal");
ok(await pg.locator("#fefo-vivo").isHidden() && await pg.locator(".fc-anotar").isVisible(), "en Fiscal debe verse el formulario y esconderse el FEFO");
/* Lo tecleado en el FEFO no se pierde al ir y volver: sigue montado. */
await pg.click('.fc-modo button:has-text("FEFO diario")');
ok(await pg.locator("#fefo-vivo").isVisible() && await pg.locator(".fc-anotar").isHidden(), "en FEFO debe verse el FEFO y esconderse el fiscal");
await pg.fill("#fefo-campo", "a medias");
await pg.click('.fc-modo button:has-text("Fiscal")');
await pg.click('.fc-modo button:has-text("FEFO diario")');
ok(await pg.inputValue("#fefo-campo") === "a medias", "al cambiar de pestaña el FEFO perdió lo que se tecleaba (se desmontó)");
/* Sin hoja que contar hoy, abre en FEFO. */
await monta([{ ...H1, puedeContar: false }]);
ok(/FEFO diario/.test(await pg.locator(".fc-modo button.on").textContent()), "antes del día debe abrir en el FEFO");
await pg.click('.fc-modo button:has-text("Fiscal")');
ok(/Todavía no es el día/.test(await pg.locator(".fe-faltan").textContent()) && /viernes 02\/10\/2026/.test(await pg.locator(".fe-faltan").textContent()) && await pg.locator(".fc-anotar").count() === 0, "antes del día debe decir cuándo y no dejar anotar");
await monta([{ ...H1, puedeContar: false }]);
await pg.click('.fc-modo button:has-text("Fiscal")');
ok(await pg.locator(".fc-pes").count() === 0 && await pg.locator(".fc-mios").isVisible(), "antes del día no debe haber pestañas y sí verse lo anotado");
/* Sin hojas: ni selector. */
await monta([]);
ok(await pg.locator(".fc-modo").count() === 0 && await pg.locator("#fefo-vivo").isVisible(), "sin hojas no debe haber selector");

/* ---- 2 · anotar ---- */
await monta([H1]);
ok(/Hoja 3 · anotar lo que hay/.test(await pg.locator(".fc-anotar").textContent()) && /a ciegas/.test(await pg.locator(".fc-ciego").textContent()), "no dice la hoja ni que es a ciegas");
for (const r of ["Calle", "Módulo", "Lado", "Código", "Descripción", "Vence", "Estibas completas", "Saldo · cajas", "Total"]) ok(new RegExp(r).test(await pg.locator(".fc-anotar").textContent()), "el formulario no tiene «" + r + "»");
/* Sin nada: dice qué falta, no manda. */
await pg.click(".fc-anotar .btn.grande");
ok(/Escoge el módulo/.test(await aviso()) && (await llamadas("inv_fiscal_contar_agregar")).length === 0, "anotar vacío debería pedir el módulo y no mandar nada: " + await aviso());
/* El renglón entero. */
await llena({ saldo: "10" });
ok(/AGUILA 330 ML/.test(await pg.locator(".fe-desc-campo").textContent()) && /172/.test(await pg.locator(".fe-total-caja").textContent()), "no reconoce el material o no cuenta 3 × 54 + 10 = 172: " + await pg.locator(".fe-total-caja").textContent());
ok(/3 × 54 \+ 10 = 172 cajas/.test(await pg.locator(".fe-cuenta-linea").textContent()), "no enseña la cuenta");
await pg.click(".fc-anotar .btn.grande");
await pg.waitForSelector(".fc-lista li", { state: "attached" });
let envio = (await llamadas("inv_fiscal_contar_agregar"))[0]?.args;
ok(envio && envio.p_hoja === "h1" && envio.p_ubicacion === "u1" && envio.p_producto === "p1" && envio.p_estibas === 3 && envio.p_saldo === 10 && envio.p_cajas === null
   && envio.p_dia === 11 && envio.p_mes === 3 && envio.p_anio === 27 && envio.p_nota === null, "lo que se manda a la base: " + JSON.stringify(envio));
ok(/anotado en A01_IZQ/.test(await aviso()) && /172 cajas/.test(await aviso()), "no avisa lo que anotó: " + await aviso());
/* El formulario queda en blanco y el cursor vuelve a la calle. */
ok(await pg.inputValue('.fc-anotar input[placeholder="Teclea el código"]') === "" && await pg.locator(".fc-anotar .bs-campo").first().evaluate((e) => e === document.activeElement), "después de anotar el formulario debe quedar en blanco y con el cursor en la calle");
/* Aparece en «lo que llevas». */
let fila = (await pg.locator(".fc-lista li").first().textContent()).replace(/\s+/g, " ");
ok(/A01_IZQ · 3128 · AGUILA 330 ML/.test(fila) && /3 estibas \+ 10 cajas = 172 cajas/.test(fila) && /vence 11\/03\/27/.test(fila), "la fila anotada: " + fila);
ok(/1 renglón · 172 cajas/.test(await pg.locator(".fc-mios .fe-rec-cab > span").textContent()), "el resumen de lo anotado: " + await pg.locator(".fc-mios .fe-rec-cab > span").textContent());
ok(/1/.test(await pg.locator(".fe-fija-cuenta b").textContent()), "la barra no lleva la cuenta");
/* LAS DOS PESTAÑAS (igual que en FEFO diario): Anotar | El borrador con su cuenta. */
{
  const t = (await pg.locator(".fc-pes button").allTextContents()).map((x) => x.trim());
  ok(t.length === 2 && t[0] === "Anotar" && /^El borrador\s*1$/.test(t[1]), "las pestañas del fiscal: " + t.join(" | "));
  ok(await pg.locator(".fc-anotar").isVisible() && await pg.locator(".fc-mios").isHidden(), "al abrir debe verse Anotar y no el borrador");
  await pg.click('.fc-pes button:has-text("El borrador")');
  ok(await pg.locator(".fc-mios").isVisible() && await pg.locator(".fc-anotar").isHidden() && /A01_IZQ · 3128/.test(await pg.locator(".fc-mios").textContent()), "en El borrador debe verse lo anotado y esconderse el formulario");
  ok(await pg.locator('.fc-pes button[aria-selected=true]').textContent().then((x) => /borrador/.test(x)), "la pestaña activa no está marcada");
  await pg.click('.fc-pes button:has-text("Anotar")');
  ok(await pg.locator(".fc-anotar").isVisible() && await pg.locator(".fc-mios").isHidden(), "al volver a Anotar debe verse el formulario");
}
/* Por cajas, y el CERO cuenta. */
await pg.click('.fc-anotar .fe-segmento button:has-text("Cajas")');
await escoger(0, "B"); await escoger(1, "01");
await pg.fill('.fc-anotar input[placeholder="Teclea el código"]', "3128");
await pg.fill('.fc-anotar input[placeholder="DD"]', "01"); await pg.fill('.fc-anotar input[placeholder="MM"]', "04"); await pg.fill('.fc-anotar input[placeholder="AA"]', "28");
await pg.locator(".fc-anotar .fe-cuanto-campo input").first().fill("0");
ok(/0/.test(await pg.locator(".fe-total-caja").textContent()) && !/esperando/.test(await pg.locator(".fe-total-caja").getAttribute("class")), "un cero no se toma como «sin cantidad»");
await pg.click(".fc-anotar .btn.grande");
await pg.waitForFunction(() => document.querySelectorAll(".fc-lista li").length === 2);
envio = (await llamadas("inv_fiscal_contar_agregar"))[1]?.args;
ok(envio && envio.p_cajas === 0 && envio.p_estibas === null && envio.p_saldo === null && envio.p_ubicacion === "u4", "el cero por cajas: " + JSON.stringify(envio));
ok(/0 cajas/.test((await pg.locator(".fc-lista li").first().textContent())), "la fila del cero: " + await pg.locator(".fc-lista li").first().textContent());

/* Lo que quedó tecleado en el otro modo NO viaja: estibas escritas, cambio a cajas, y solo van las cajas (y al revés). */
await monta([H1]);
await llena({ estibas: "5", saldo: "2" });
await pg.click('.fc-anotar .fe-segmento button:has-text("Cajas")');
await pg.locator(".fc-anotar .fe-cuanto-campo input").first().fill("7");
await pg.click(".fc-anotar .btn.grande"); await pg.waitForSelector(".fc-lista li", { state: "attached" });
envio = (await llamadas("inv_fiscal_contar_agregar"))[0]?.args;
ok(envio && envio.p_cajas === 7 && envio.p_estibas === null && envio.p_saldo === null, "estibas tecleadas y luego cajas: viajó lo del otro modo: " + JSON.stringify(envio));
await pg.click('.fc-anotar .fe-segmento button:has-text("Cajas")');
await pg.locator(".fc-anotar .fe-cuanto-campo input").first().fill("9");
await pg.click('.fc-anotar .fe-segmento button:has-text("Estibas")');
await escoger(0, "B"); await escoger(1, "01");
await pg.fill('.fc-anotar input[placeholder="Teclea el código"]', "3128");
await pg.fill('.fc-anotar input[placeholder="DD"]', "05"); await pg.fill('.fc-anotar input[placeholder="MM"]', "05"); await pg.fill('.fc-anotar input[placeholder="AA"]', "28");
await pg.locator(".fc-anotar .fe-cuanto-campo input").first().fill("4");
await pg.click(".fc-anotar .btn.grande"); await pg.waitForFunction(() => document.querySelectorAll(".fc-lista li").length === 2);
envio = (await llamadas("inv_fiscal_contar_agregar"))[1]?.args;
ok(envio && envio.p_estibas === 4 && envio.p_cajas === null, "cajas tecleadas y luego estibas: viajó lo del otro modo: " + JSON.stringify(envio));

/* ---- 3 · lo que se rechaza antes de mandar ---- */
const n0 = (await llamadas("inv_fiscal_contar_agregar")).length;
const rechaza = async (esperado, preparar, nombre) => {
  await monta([H1]);
  await preparar();
  await pg.click(".fc-anotar .btn.grande");
  await pg.waitForTimeout(80);
  ok(esperado.test(await aviso()), nombre + ": " + await aviso());
  ok((await llamadas("inv_fiscal_contar_agregar")).length === 0, nombre + ": mandó a la base lo que debía rechazar");
};
await rechaza(/Falta decir de qué lado/, () => llena({ lado: null }), "sin lado");
await rechaza(/no está en el maestro/, () => llena({ codigo: "1234" }), "código que no existe");
await rechaza(/Falta la fecha de vencimiento/, () => llena({ fecha: null }), "producto sin fecha");
await rechaza(/El 31\/2\/27 no existe/, () => llena({ fecha: ["31", "02", "27"] }), "fecha que no existe");
await rechaza(/Va de 1 a 12/, () => llena({ fecha: ["10", "13", "27"] }), "mes 13");
await rechaza(/¿Cuántas estibas\?/, () => llena({ estibas: null }), "sin cantidad");
await rechaza(/no dice cuántas cajas lleva una estiba/, () => llena({ codigo: "9999", estibas: "2" }), "estibas de un material sin factor");
/* Un envase no necesita fecha; y el material sin factor sí se puede contar por cajas o con puro saldo. */
await monta([H1]);
await llena({ codigo: "3500231", fecha: null, estibas: "2" });
await pg.click(".fc-anotar .btn.grande"); await pg.waitForSelector(".fc-lista li", { state: "attached" });
envio = (await llamadas("inv_fiscal_contar_agregar"))[0]?.args;
ok(envio && envio.p_dia === null && envio.p_mes === null && envio.p_anio === null && envio.p_estibas === 2, "el envase sin fecha: " + JSON.stringify(envio));
/* Una fecha a medias en un envase tampoco pasa. */
await monta([H1]);
await llena({ codigo: "3500231", fecha: ["11", "", ""], estibas: "2" });
await pg.click(".fc-anotar .btn.grande"); await pg.waitForTimeout(80);
ok(/completa/.test(await aviso()) && (await llamadas("inv_fiscal_contar_agregar")).length === 0, "una fecha a medias en un envase pasó: " + await aviso());

/* ---- 4 · errores de la base ---- */
await monta([H1]);
await pg.evaluate(() => { window.__falla = "Ya anotaste ese material en ese sitio con ese vencimiento. Quita el renglón anterior y vuelve a anotarlo."; window.__fallaFn = "inv_fiscal_contar_agregar" });
await llena();
await pg.click(".fc-anotar .btn.grande"); await pg.waitForTimeout(100);
ok(/Ya anotaste ese material/.test(await aviso()), "el error de la base no se le dice a la persona: " + await aviso());
ok(await pg.inputValue('.fc-anotar input[placeholder="Teclea el código"]') === "3128" && await pg.locator(".fc-lista li").count() === 0, "si la base rechaza, el renglón no debe borrarse del formulario");
await pg.evaluate(() => { window.__falla = null });
await pg.click(".fc-anotar .btn.grande"); await pg.waitForSelector(".fc-lista li", { state: "attached" });
ok(await pg.locator(".fc-lista li").count() === 1, "reintentar después del error no anotó");
/* El renglón a medias se guarda en el teléfono y vuelve al abrir otra vez. */
await monta([H1]);
await pg.fill('.fc-anotar input[placeholder="Teclea el código"]', "3128");
await pg.waitForTimeout(50);
const guardado = await pg.evaluate(() => window.__ls()["fiscal.renglon.h1"]);
ok(guardado && /"codigo":"3128"/.test(guardado), "el renglón a medias no se guarda en el teléfono: " + guardado);
await monta([H1], 390, [], "", { "fiscal.renglon.h1": guardado });
ok(await pg.inputValue('.fc-anotar input[placeholder="Teclea el código"]') === "3128", "al volver a abrir, el renglón a medias no regresa");
/* Y al anotarlo se borra del teléfono. */
await llena();
await pg.click(".fc-anotar .btn.grande"); await pg.waitForSelector(".fc-lista li", { state: "attached" });
await pg.waitForTimeout(50);
ok(!("fiscal.renglon.h1" in await pg.evaluate(() => window.__ls())), "anotado el renglón, sigue guardado como a medias en el teléfono");

/* ---- 5 · quitar ---- */
await monta([H1], 390, [{ id: "r1", ubicacion_id: "u1", ubicacion: "A01_IZQ", producto_id: "p1", sku: "3128", material: "AGUILA 330 ML", estibas: 3, saldo: null, cajas: null, total_cajas: 162, venc_dia: 1, venc_mes: 2, venc_anio: 28, nota: null, contado_en: "2026-10-02T15:00:00Z" },
  { id: "r2", ubicacion_id: "u2", ubicacion: "A01_DER", producto_id: "p1", sku: "3128", material: "AGUILA 330 ML", estibas: null, saldo: null, cajas: 20, total_cajas: 20, venc_dia: null, venc_mes: null, venc_anio: null, nota: "mojada", contado_en: "2026-10-02T14:00:00Z" }]);
await pg.waitForSelector(".fc-lista li", { state: "attached" });
await pg.click('.fc-pes button:has-text("El borrador")');
ok(await pg.locator(".fc-lista li").count() === 2 && /2 renglones · 182 cajas/.test(await pg.locator(".fc-mios .fe-rec-cab > span").textContent()), "la lista inicial: " + await pg.locator(".fc-mios .fe-rec-cab > span").textContent());
ok(/mojada/.test(await pg.locator(".fc-lista li").nth(1).textContent()) && !/vence/.test(await pg.locator(".fc-lista li").nth(1).textContent()), "la nota o el «sin vencimiento»");
await pg.locator(".fc-lista li").first().locator("button").click();
ok(/¿Quitar este renglón\?/.test(await pg.locator("[role=dialog], [role=alertdialog]").first().textContent().catch(() => "")), "no pide confirmar el quitar");
ok((await llamadas("inv_fiscal_contar_quitar")).length === 0, "pedir confirmación ya quitó");
await pg.locator("[role=dialog] button, [role=alertdialog] button").filter({ hasText: /^Cancelar$|^No/ }).first().click();
ok((await llamadas("inv_fiscal_contar_quitar")).length === 0 && await pg.locator(".fc-lista li").count() === 2, "cancelar quitó el renglón");
await pg.locator(".fc-lista li").first().locator("button").click();
await pg.locator("[role=dialog] button, [role=alertdialog] button").filter({ hasText: "Quitarlo" }).click();
await pg.waitForFunction(() => document.querySelectorAll(".fc-lista li").length === 1);
const q = await llamadas("inv_fiscal_contar_quitar");
ok(q.length === 1 && q[0].args.p_id === "r1", "quitó el renglón equivocado o no lo mandó: " + JSON.stringify(q));
ok(/1 renglón · 20 cajas/.test(await pg.locator(".fc-mios .fe-rec-cab > span").textContent()), "no actualizó el resumen al quitar");
/* Quitar el SEGUNDO manda el id del segundo. */
await monta([H1], 390, [{ id: "r1", ubicacion_id: "u1", ubicacion: "A01_IZQ", producto_id: "p1", sku: "3128", material: "AGUILA 330 ML", estibas: 3, saldo: null, cajas: null, total_cajas: 162, venc_dia: 1, venc_mes: 2, venc_anio: 28, nota: null, contado_en: "2026-10-02T15:00:00Z" },
  { id: "r2", ubicacion_id: "u2", ubicacion: "A01_DER", producto_id: "p1", sku: "3128", material: "AGUILA 330 ML", estibas: null, saldo: null, cajas: 20, total_cajas: 20, venc_dia: null, venc_mes: null, venc_anio: null, nota: null, contado_en: "2026-10-02T14:00:00Z" }]);
await pg.waitForSelector(".fc-lista li", { state: "attached" });
await pg.click('.fc-pes button:has-text("El borrador")');
await pg.locator(".fc-lista li").nth(1).locator("button").click();
await pg.locator("[role=dialog] button, [role=alertdialog] button").filter({ hasText: "Quitarlo" }).click();
await pg.waitForFunction(() => document.querySelectorAll(".fc-lista li").length === 1);
ok((await llamadas("inv_fiscal_contar_quitar"))[0]?.args.p_id === "r2" && /A01_IZQ/.test(await pg.locator(".fc-lista li").textContent()), "quitar el segundo renglón quitó otro");
/* ---- 5b · TERMINÉ MI HOJA ---- */
const R1 = { id: "r1", ubicacion_id: "u1", ubicacion: "A01_IZQ", producto_id: "p1", sku: "3128", material: "AGUILA 330 ML", estibas: 3, saldo: null, cajas: null, total_cajas: 162, venc_dia: 1, venc_mes: 2, venc_anio: 28, nota: null, contado_en: "2026-10-02T15:00:00Z" };
const R2 = { ...R1, id: "r2", ubicacion_id: "u2", ubicacion: "A01_DER", estibas: null, cajas: 20, total_cajas: 20 };
const HT = { ...H1, pareja: "Cañizares", parejaEquipo: "Operador logístico", puedeTerminar: true, termine: false, parejaTermino: false };
const confirma = (t) => pg.locator("[role=dialog] button, [role=alertdialog] button").filter({ hasText: t }).first().click();
{
  /* La base todavía no sabe terminar hojas: el botón no se ofrece. */
  await monta([H1], 390, [R1, R2]);
  await pg.waitForSelector(".fc-lista li", { state: "attached" });
  ok(await pg.locator(".fc-terminar-ir, .fc-terminar-fin").count() === 0, "sin 2026-10-fiscal-cruce.sql se ofrece «Terminé mi hoja»");
  /* Sin renglones no se puede terminar. */
  await monta([HT], 390, []);
  ok(await pg.locator(".fc-terminar-ir").isDisabled(), "con la hoja vacía «Terminé mi hoja» no está deshabilitado");
  ok(await pg.locator(".fc-terminar-fin").count() === 0, "con la hoja vacía sale el aviso de terminar al final de lo anotado");
  /* Con renglones: pide confirmar; cancelar no llama; confirmar llama una vez. */
  await monta([HT], 390, [R1, R2]);
  await pg.waitForSelector(".fc-lista li", { state: "attached" });
  ok(await pg.locator(".fc-terminar-ir").isEnabled(), "con renglones «Terminé mi hoja» debía poder pulsarse");
  await pg.click(".fc-terminar-ir");
  ok(/¿Terminaste tu hoja\?/.test(await pg.locator("[role=dialog], [role=alertdialog]").first().textContent()) && /2 renglones/.test(await pg.locator("[role=dialog], [role=alertdialog]").first().textContent()), "no pide confirmar con cuántos renglones lleva");
  ok((await llamadas("inv_fiscal_terminar")).length === 0, "pedir confirmación ya terminó la hoja");
  await confirma(/^Cancelar$|^No/);
  ok((await llamadas("inv_fiscal_terminar")).length === 0 && await pg.locator(".fc-anotar").isVisible(), "cancelar terminó la hoja");
  await pg.click(".fc-terminar-ir"); await confirma("Sí, terminé mi hoja");
  await pg.waitForSelector(".fc-terminada");
  const tl = await llamadas("inv_fiscal_terminar");
  ok(tl.length === 1 && tl[0].args.p_hoja === "h1" && tl[0].args.p_terminado === true, "lo que se manda al terminar: " + JSON.stringify(tl));
  ok(/Terminaste tu hoja/.test(await pg.locator(".fc-terminada").textContent()) && /Falta que Cañizares termine la suya/.test(await pg.locator(".fc-terminada").textContent()), "la tarjeta de terminada no dice que falta la pareja: " + await pg.locator(".fc-terminada").textContent());
  ok(await pg.locator(".fc-anotar").isHidden() && await pg.locator(".fc-terminada").isVisible(), "terminada, el formulario sigue a la vista");
  ok(/Llevas 2 renglones · 182 cajas/.test(await pg.locator(".fc-term-cuenta").textContent()), "la tarjeta de terminada no suma las cajas (162 + 20): " + await pg.locator(".fc-term-cuenta").textContent());
  ok(/Hoja terminada/.test(await aviso()), "no avisó que terminó: " + await aviso());
  /* En «El borrador»: nada se quita y se puede reabrir. */
  await pg.click('.fc-pes button:has-text("El borrador")');
  ok(await pg.locator(".fc-lista li button:not([disabled])").count() === 0, "terminada, todavía se puede pulsar «Quitar»");
  ok(/reábrela/.test(await pg.locator(".fc-nota-term").textContent()) && await pg.locator(".fc-terminar-fin").count() === 0, "en el borrador no avisa que está terminada");
  await pg.click('.fc-pes button:has-text("Anotar")');
  await pg.click(".fc-terminada .fc-reabrir");
  await pg.waitForSelector(".fc-anotar", { state: "visible" });
  const tl2 = await llamadas("inv_fiscal_terminar");
  ok(tl2.length === 2 && tl2[1].args.p_terminado === false, "reabrir no manda p_terminado=false: " + JSON.stringify(tl2));
  ok(await pg.locator(".fc-terminada").count() === 0 && /reabierta/.test(await aviso()), "reabierta, sigue la tarjeta de terminada o no avisó: " + await aviso());
  /* Quitar vuelve a poder usarse. */
  await pg.click('.fc-pes button:has-text("El borrador")');
  ok(await pg.locator(".fc-lista li button:not([disabled])").count() === 2, "reabierta, «Quitar» sigue bloqueado");
  /* Desde el aviso del final de lo anotado también se termina. */
  await pg.click(".fc-terminar-fin"); await confirma("Sí, terminé mi hoja");
  await pg.waitForSelector(".fc-terminada", { state: "attached" });
  ok((await llamadas("inv_fiscal_terminar")).length === 3 && (await llamadas("inv_fiscal_terminar"))[2].args.p_terminado === true, "el botón del borrador no termina la hoja");
  /* Mi pareja ya terminó (y yo ya terminé): se dice. */
  await monta([{ ...HT, termine: true, parejaTermino: true }], 390, [R1, R2]);
  ok(/Tu pareja también terminó/.test(await pg.locator(".fc-terminada").textContent()), "no dice que la pareja ya terminó");
  /* Terminé y la pareja no: pero la base lo sabe desde el principio (la página lo trae). */
  await monta([{ ...HT, termine: true }], 390, [R1]);
  ok(await pg.locator(".fc-terminada").isVisible() && await pg.locator(".fc-anotar").isHidden(), "una hoja ya terminada debía abrir como terminada");
  /* Si la base se niega, la hoja sigue abierta y se dice por qué. */
  await monta([HT], 390, [R1]);
  await pg.evaluate(() => { window.__falla = "Anota al menos un renglón antes de terminar tu hoja."; window.__fallaFn = "inv_fiscal_terminar" });
  await pg.click(".fc-terminar-ir"); await confirma("Sí, terminé mi hoja");
  await pg.waitForTimeout(150);
  ok(/Anota al menos un renglón/.test(await aviso()) && await pg.locator(".fc-terminada").count() === 0 && await pg.locator(".fc-anotar").isVisible(), "si la base rechaza terminar, la hoja debía seguir abierta con su aviso: " + await aviso());
  await pg.evaluate(() => { window.__falla = null });
  /* «terminé» sin que la base sepa terminar (o antes del día) no cierra la hoja. */
  await monta([{ ...HT, termine: true, puedeTerminar: false }], 390, [R1]);
  ok(await pg.locator(".fc-terminada").count() === 0 && await pg.locator(".fc-anotar").isVisible(), "sin 2026-10-fiscal-cruce.sql una hoja «terminada» debía seguir abierta");
  await monta([{ ...HT, termine: true, puedeContar: false }], 390, [R1]);
  ok(await pg.locator(".fc-terminada").count() === 0, "antes del día una hoja «terminada» muestra la tarjeta de terminada");
  /* Una hoja de otro día no se termina. */
  await monta([{ ...HT, puedeContar: false }], 390, [R1]);
  ok(await pg.locator(".fc-terminar-ir, .fc-terminar-fin, .fc-terminada").count() === 0, "antes del día se ofrece terminar la hoja");
}
/* Si la base no tiene el SQL, lo dice con el nombre del archivo. */
await monta([H1], 390, [], "window.__miosFalla='function public.inv_fiscal_contar_mios(uuid) does not exist';");
await pg.waitForTimeout(150);
ok(/2026-10-fiscal-contar\.sql/.test(await aviso()), "si falta el SQL no dice cuál correr: " + await aviso());

/* ---- 6 · dos hojas ---- */
await monta([H1, { ...H1, hojaId: "h2", fiscalId: "f2", nombre: "FISCAL NOVIEMBRE 2026", fecha: "2026-11-06", numero: 1, puedeContar: false }]);
ok(/^Fiscal$/.test((await pg.locator(".fc-modo button").nth(1).locator("b").textContent()).trim()), "con dos hojas el botón no debe decir «Hoja N»: " + await pg.locator(".fc-modo button").nth(1).locator("b").textContent());
ok(await pg.locator(".fc-hoja-sel select").count() === 1 && await pg.locator(".fc-hoja-sel option[disabled]").count() === 1, "con dos hojas debe poder escoger, y la de otro día no se puede contar");

/* La primera hoja es de otro día y la segunda es de hoy: se cuenta la de hoy, y sus renglones son los suyos. */
await monta([{ ...H1, hojaId: "h0", fiscalId: "f0", nombre: "FISCAL FUTURO", fecha: "2026-11-06", numero: 1, puedeContar: false }, { ...H1, hojaId: "h2", numero: 2 }]);
await pg.waitForSelector(".fc-anotar");
ok(await pg.locator(".fc-hoja-sel select").inputValue() === "h2" && /Hoja 2 · anotar/.test(await pg.locator(".fc-anotar").textContent()), "con la primera hoja de otro día debe abrir la de hoy");
ok((await llamadas("inv_fiscal_contar_mios")).every((c) => c.args.p_hoja === "h2"), "leyó los renglones de otra hoja: " + JSON.stringify(await llamadas("inv_fiscal_contar_mios")));
/* Dos hojas de hoy: al cambiar, lee y anota en la otra. */
await monta([H1, { ...H1, hojaId: "h2", fiscalId: "f2", nombre: "OTRO FISCAL", numero: 2 }]);
await pg.waitForSelector(".fc-anotar");
await pg.locator(".fc-hoja-sel select").selectOption("h2");
await pg.waitForFunction(() => /Hoja 2 · anotar/.test(document.querySelector(".fc-anotar").textContent));
ok((await llamadas("inv_fiscal_contar_mios")).at(-1)?.args.p_hoja === "h2", "al cambiar de hoja siguió leyendo la anterior: " + JSON.stringify((await llamadas("inv_fiscal_contar_mios")).map((c) => c.args.p_hoja)));
await llena();
await pg.click(".fc-anotar .btn.grande"); await pg.waitForSelector(".fc-lista li", { state: "attached" });
ok((await llamadas("inv_fiscal_contar_agregar"))[0]?.args.p_hoja === "h2", "anotó en la hoja anterior en vez de la escogida");

/* ---- 7 · 4 anchos ---- */
for (const w of [360, 390, 820, 1440]) {
  await monta([{ ...H1, puedeTerminar: true }], w, [{ id: "r1", ubicacion_id: "u1", ubicacion: "A01_IZQ", producto_id: "p1", sku: "3128", material: "AGUILA 330 ML CON UN NOMBRE LARGUÍSIMO PARA PROBAR QUE ENVUELVE", estibas: 3, saldo: 10, cajas: null, total_cajas: 172, venc_dia: 1, venc_mes: 2, venc_anio: 28, nota: "una observación bastante larga para ver si se sale", contado_en: "2026-10-02T15:00:00Z" }]);
  await pg.waitForSelector(".fc-lista li", { state: "attached" });
  await llena({ saldo: "10" });
  const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
    chicos: [...document.querySelectorAll(".fc-modo button, .fc-anotar button, .fc-lista button, .fc-anotar input")].filter((e) => e.offsetParent && (e.getBoundingClientRect().height < 40 && !e.closest(".fe-dma"))).map((e) => (e.textContent || e.placeholder || e.className).slice(0, 20) + ":" + Math.round(e.getBoundingClientRect().height)) }));
  await pg.click('.fc-pes button:has-text("El borrador")');
  const fl = await pg.evaluate(() => { const li = document.querySelector('.fc-lista li'); const t = li.querySelector('.fc-ren'); return { h: li.getBoundingClientRect().height, tw: t.getBoundingClientRect().width, lw: li.getBoundingClientRect().width } });
  await pg.click('.fc-pes button:has-text("Anotar")');
  ok(fl.tw > fl.lw * 0.5 && fl.h < 260, `a ${w} px el texto de lo anotado se aplasta: ancho ${Math.round(fl.tw)} de ${Math.round(fl.lw)}, alto ${Math.round(fl.h)}`);
  ok(d.ancho <= d.vista, `a ${w} px se sale: ${d.ancho}>${d.vista}`);
  ok(d.chicos.length === 0, `a ${w} px hay controles de menos de 40 px: ${d.chicos.join(", ")}`);
  const modo = await pg.locator(".fc-modo button").evaluateAll((b) => b.map((x) => Math.round(x.getBoundingClientRect().height)));
  ok(modo.every((h) => h >= 44), `a ${w} px los botones del selector miden ${modo} (mínimo 44)`);
  if (process.env.FOTO && w === 390) { await monta([H1P], 390, [], "", {}, "deja"); await pg.waitForTimeout(600); await pg.screenshot({ path: process.env.FOTO + "/contar-fiscal-aviso-m.png" }); await monta([H1P], 1440, [], "", {}, "deja"); await pg.waitForTimeout(600); await pg.screenshot({ path: process.env.FOTO + "/contar-fiscal-aviso-pc.png" }) }
  if (process.env.FOTO && w === 390) await pg.screenshot({ path: process.env.FOTO + "/contar-fiscal-form-m.png", fullPage: true });
}
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 2).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Contar el fiscal: selector FEFO | Fiscal (el FEFO no se desmonta), el formulario del conteo diario, lo que se manda, lo que se rechaza antes de mandar, el cero que cuenta, lo anotado con su Quitar y nada se sale en 4 anchos.");
