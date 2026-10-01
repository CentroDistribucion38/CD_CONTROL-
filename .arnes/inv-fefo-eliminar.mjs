/* =====================================================================
   LA BASE · ELIMINAR FEFOs ESPECÍFICOS — en Chromium, con el componente de verdad.
   «Que el super admin pueda eliminar algunos FEFO específicos.»
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_fe-cliente.ts"), `
const w = window as any;
w.__llamadas = []; w.__falla = null; w.__refresh = 0; w.__fallaEn = 0;
export function createClient() { return { rpc: async (fn: string, args: any) => { w.__llamadas.push({ fn, args });
  const falla = w.__falla || (w.__fallaEn && w.__llamadas.length === w.__fallaEn ? "function public." + fn + "(uuid, text) does not exist" : null);
  if (fn === "conteo_fefo_cambiar_fecha") return falla ? { data: null, error: { message: falla } } : { data: [{ codigo_anterior: args.p_codigo, codigo_nuevo: w.__codigoNuevo || args.p_codigo, fecha: args.p_fecha }], error: null };
  return falla ? { data: null, error: { message: falla } } : { data: [{ codigo: args.p_codigo, renglones: 1 }], error: null } } } }`);
writeFileSync(R(".arnes/_fe-nav.ts"), `export const useRouter = () => ({ refresh() { (window as any).__refresh++ }, push() {}, replace() {} });`);
writeFileSync(R(".arnes/_fe-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Base } from "../src/app/(app)/inventario/base/Base";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Base enviadas={w.ENVIADAS ?? []} abiertas={[]} conteos={w.CONTEOS} tope={false} manda={w.MANDA === "omitido" ? undefined : w.MANDA} />);`);
const js = buildSync({ entryPoints: [R(".arnes/_fe-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_fe-cliente.ts"), "next/navigation": R(".arnes/_fe-nav.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/base/base.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const C = (id, codigo, estado, fecha, renglones) => ({ id, codigo, estado, fecha_analisis: fecha, responsable: "Ana", envio_nombre: estado === "cerrado" ? "Jefe" : null,
  enviado_en: estado === "cerrado" ? fecha + "T17:00:00Z" : null, renglones, ubicaciones: 1, total_cajas: 100, bodega: "CD38" });
const CONTEOS = [C("b", "FEFO-20260929-01", "en_proceso", "2026-09-29", 5), C("a", "FEFO-20260926-01", "cerrado", "2026-09-26", 2), C("c", "FEFO-20260923-01", "anulado", "2026-09-23", 0)];
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = []; pg.on("pageerror", (e) => roto.push(e.message));
const REN = { id: "r1", conteo_id: "a", conteo: "FEFO-20260926-01", estado: "cerrado", codigo: "3500231", material: "ENVASE COSTEÑITA 175 ML", tipo_material: "ENVASE", familia: "RETORNABLE",
  factor_estibado: 54, ubicacion: "BAHIA_6", ubicacion_combinada: "ALAR_BAHIA_6", calle: "ALAR", modulo: "BAHIA_6", lado: "DER", estibas: 80, cajas: 12, saldo: null, total_cajas: 4320,
  total_estibas: 80, capacidad: 90, venc_dia: null, venc_mes: null, venc_anio: null, fabricacion: null, vencimiento: "2026-09-13", dias_para_salir: -3, dias_para_vencer: 12,
  rotacion: true, averia: false, pnc: false, estado_envase: "VACIOS", nota: null, conto: "jefe", contado_en: "2026-09-26T15:56:00Z" };
const monta = async (manda, ancho = 1440, enviadas = []) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div>
    <script>window.CONTEOS=${JSON.stringify(CONTEOS)};window.MANDA=${JSON.stringify(manda)};window.ENVIADAS=${JSON.stringify(enviadas)};</script><script>${js}<\/script></body></html>`);
  await pg.waitForSelector("#r > *");
};
/* Quien no administra no ve nada de esto. */
await monta("omitido");
ok(await pg.locator(".ba-elim").count() === 0, "sin decir nada, el panel de eliminar FEFOs se ve (debe ser solo para quien administra)");
await monta(false);
ok(await pg.locator(".ba-elim").count() === 0, "quien no administra ve el panel de eliminar FEFOs");
/* Quien administra: lista de todos, el más reciente primero, con su estado. */
await monta(true);
await pg.locator(".ba-elim > summary").click();
const filas = await pg.locator(".ba-elim-lista li").evaluateAll((l) => l.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
ok(filas.length === 3 && /FEFO-20260929-01.*ABIERTO.*5 rengl/.test(filas[0]) && /FEFO-20260926-01.*ENVIADO.*2 rengl/.test(filas[1]) && /FEFO-20260923-01.*ANULADO/.test(filas[2]),
   "la lista de FEFOs: " + filas.join(" | "));
const marca = (cod) => pg.locator(`input[aria-label="Marcar el FEFO ${cod}"]`);
const textoPanel = async () => (await pg.locator(".ba-elim").textContent()).replace(/\s+/g, " ");
/* Sin nada marcado, no hay a qué darle eliminar. */
ok(await pg.locator(".ba-elim-ir").isDisabled(), "con nada marcado el botón de eliminar está activo");
ok(/Ninguno marcado/.test(await textoPanel()), "no dice que no hay nada marcado");
/* Marcar UNO y pedir: pregunta por ese y «No» no manda nada. */
await marca("FEFO-20260929-01").check();
ok(/1 marcado/.test(await textoPanel()), "no cuenta el marcado");
await pg.click(".ba-elim-ir");
ok(/¿Eliminar FEFO-20260929-01\?/.test(await textoPanel()), "no pide confirmar el uno");
ok(await pg.evaluate(() => window.__llamadas.length) === 0, "pedir confirmación ya eliminó");
await pg.click('.ba-elim-conf button:has-text("No")');
ok(await pg.evaluate(() => window.__llamadas.length) === 0 && await pg.locator(".ba-elim-conf").count() === 0, "«No» eliminó o dejó la pregunta abierta");
/* Marcar un segundo cambia la pregunta y desmarcar la cierra. */
await marca("FEFO-20260926-01").check();
await pg.click(".ba-elim-ir");
ok(/estos 2 FEFO/.test(await textoPanel()), "con dos marcados no pregunta por los dos: " + await textoPanel());
await marca("FEFO-20260926-01").uncheck();
ok(await pg.locator(".ba-elim-conf").count() === 0, "cambiar la marca no cierra la pregunta vieja");
/* VARIOS: marca dos y elimina juntos; manda el id Y el código de cada uno, en orden. */
await marca("FEFO-20260926-01").check();
await pg.click(".ba-elim-ir");
await pg.click('.ba-elim-conf button:has-text("Sí, eliminar 2")');
await pg.waitForFunction(() => window.__llamadas.length === 2);
const ll = await pg.evaluate(() => window.__llamadas);
ok(ll.every((x) => x.fn === "conteo_fefo_eliminar") && ll[0].args.p_conteo === "b" && ll[0].args.p_codigo === "FEFO-20260929-01" && ll[1].args.p_conteo === "a" && ll[1].args.p_codigo === "FEFO-20260926-01",
   "lo que se manda a la base: " + JSON.stringify(ll));
ok(await pg.evaluate(() => window.__refresh) === 1, "después de eliminar no refresca (una vez)");
ok(await pg.locator(".ba-elim-conf").count() === 0, "después de eliminar sigue la pregunta de confirmar");
ok(/Se eliminaron 2 FEFO: FEFO-20260929-01, FEFO-20260926-01/.test(await textoPanel()), "no avisa cuáles eliminó: " + await textoPanel());
ok(!(await marca("FEFO-20260929-01").isChecked()) && !(await marca("FEFO-20260926-01").isChecked()), "los eliminados siguen marcados");
/* «Marcar todos» y «Quitar todas las marcas». */
await pg.click('.ba-elim-barra button:has-text("Marcar todos")');
ok(/3 marcados/.test(await textoPanel()), "marcar todos no marca los tres");
await pg.click('.ba-elim-barra button:has-text("Quitar todas las marcas")');
ok(/Ninguno marcado/.test(await textoPanel()), "quitar las marcas no las quita");
/* Si la base rechaza el segundo: el primero se fue, dice cuál falló y ese queda marcado. */
await pg.evaluate(() => { window.__llamadas.length = 0; window.__refresh = 0; window.__fallaEn = 2; window.__falla = null });
await marca("FEFO-20260923-01").check(); await marca("FEFO-20260929-01").check();
await pg.click(".ba-elim-ir");
await pg.evaluate(() => { const o = window.__llamadas; window.__n = 0 });
await pg.click('.ba-elim-conf button:has-text("Sí, eliminar 2")');
await pg.waitForSelector(".ba-conso-mal");
const t = await textoPanel();
ok(/Se eliminó el FEFO FEFO-20260929-01/.test(t) && /No se pudo eliminar FEFO-20260923-01/.test(t) && /2026-10-fefo-eliminar\.sql/.test(t), "falla a la mitad: " + t);
ok(await marca("FEFO-20260923-01").isChecked() && !(await marca("FEFO-20260929-01").isChecked()), "tras fallar, el que falló debe seguir marcado y el que se fue no");
ok(await pg.evaluate(() => window.__refresh) === 1, "tras eliminar uno y fallar otro no refresca");
/* CAMBIAR LA FECHA de un FEFO (el del sábado que se envió hoy): sin borrar nada. */
await monta(true);
await pg.locator(".ba-elim > summary").click();
await pg.evaluate(() => { window.__llamadas.length = 0; window.__refresh = 0; window.__fallaEn = 0; window.__falla = null; window.__codigoNuevo = "FEFO-20261001-01" });
const hoy = await pg.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
const fila = (cod) => pg.locator(".ba-elim-lista li", { hasText: cod });
ok(await pg.locator('button[aria-label^="Cambiar la fecha del FEFO"]').count() === 3, "no hay «Cambiar fecha» en cada FEFO");
await fila("FEFO-20260926-01").locator("button", { hasText: "Cambiar fecha" }).click();
const campo = pg.locator('input[aria-label="Nueva fecha del FEFO FEFO-20260926-01"]');
ok(await campo.inputValue() === hoy, "la fecha que se propone no es hoy: " + await campo.inputValue());
ok(await campo.getAttribute("max") === hoy, "se puede elegir una fecha del futuro");
await fila("FEFO-20260926-01").locator("button", { hasText: "Cancelar" }).click();
ok(await pg.evaluate(() => window.__llamadas.length) === 0 && await pg.locator('input[type=date]').count() === 0, "cancelar mandó algo o dejó el campo abierto");
await fila("FEFO-20260926-01").locator("button", { hasText: "Cambiar fecha" }).click();
await campo.fill("2026-09-30");
await fila("FEFO-20260926-01").locator("button", { hasText: "Guardar fecha" }).click();
await pg.waitForFunction(() => window.__llamadas.length === 1);
const lf = await pg.evaluate(() => window.__llamadas[0]);
ok(lf.fn === "conteo_fefo_cambiar_fecha" && lf.args.p_conteo === "a" && lf.args.p_codigo === "FEFO-20260926-01" && lf.args.p_fecha === "2026-09-30", "lo que se manda: " + JSON.stringify(lf));
ok(await pg.evaluate(() => window.__refresh) === 1, "cambiar la fecha no refresca");
const tf = await textoPanel();
ok(/FEFO-20260926-01 quedó con fecha 30\/09\/2026 y ahora se llama FEFO-20261001-01/.test(tf), "no avisa del cambio: " + tf);
ok(await pg.locator('input[type=date]').count() === 0, "tras guardar queda el campo abierto");
/* Si la base no tiene la función, dice qué archivo correr. */
await pg.evaluate(() => { window.__llamadas.length = 0; window.__falla = "function public.conteo_fefo_cambiar_fecha(uuid, text, date) does not exist" });
await fila("FEFO-20260929-01").locator("button", { hasText: "Cambiar fecha" }).click();
await fila("FEFO-20260929-01").locator("button", { hasText: "Guardar fecha" }).click();
await pg.waitForSelector(".ba-conso-mal");
ok(/No se pudo cambiar la fecha de FEFO-20260929-01/.test(await textoPanel()) && /2026-10-fefo-cambiar-fecha\.sql/.test(await textoPanel()), "no dice qué SQL falta: " + await textoPanel());
await pg.evaluate(() => { window.__falla = null });
/* EL ATAJO junto al buscador del inventario que se mira: «Cambiar la fecha de este recorrido». */
await monta(true, 1440, [REN]);
{
  const atajo = pg.locator('button:has-text("Cambiar la fecha de este recorrido")');
  ok(await atajo.count() === 1, "el administrador no ve «Cambiar la fecha de este recorrido» junto al inventario que mira");
  ok(await pg.locator(".ba-elim").evaluate((e) => e.open) === false, "el panel de administrador arranca abierto");
  await atajo.click();
  ok(await pg.locator(".ba-elim").evaluate((e) => e.open) === true, "el atajo no abre el panel");
  const campoA = pg.locator('input[aria-label="Nueva fecha del FEFO FEFO-20260926-01"]');
  await campoA.fill("2026-09-30"); await pg.locator(".ba-elim-fecha button", { hasText: "Guardar fecha" }).click();
  await pg.waitForFunction(() => window.__llamadas.length >= 1);
  ok((await pg.evaluate(() => window.__llamadas[window.__llamadas.length - 1])).args.p_conteo === "a", "el atajo cambia la fecha de otro FEFO y no del que se mira");
  await pg.waitForSelector(".ba-elim-ok");
  await atajo.click();
  await campoA.waitFor({ timeout: 3000 }).catch(() => {});
  await pg.waitForFunction((h) => document.querySelector('.ba-elim-fecha input')?.value === h, hoy, { timeout: 3000 }).catch(() => {});
  ok(await campoA.count() === 1 && await campoA.inputValue() === hoy, "el atajo no deja listo el cambio de fecha del recorrido que se mira (con hoy): " + await campoA.count());
  ok(await pg.locator('input[type=date]').count() === 1, "el atajo abre el cambio de fecha de otro FEFO");
}
await monta(false, 1440, [REN]);
ok(await pg.locator('button:has-text("Cambiar la fecha de este recorrido")').count() === 0, "quien no administra ve el atajo de cambiar la fecha");
await monta(true, 1440, [REN]);
await pg.locator(".ba-inv.todos").click();
ok(await pg.locator('button:has-text("Cambiar la fecha de este recorrido")').count() === 0, "con «Todos los recorridos» el atajo no sabe cuál cambiar");
/* Nada se sale y el dedo alcanza. */
for (const w of [360, 390, 820, 1440]) {
  await monta(true, w);
  await pg.locator(".ba-elim > summary").click();
  await marca("FEFO-20260929-01").check(); await marca("FEFO-20260926-01").check(); await pg.click(".ba-elim-ir");
  const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
    chico: [...document.querySelectorAll(".ba-elim button, .ba-elim summary, .ba-elim-lista label")].filter((e) => e.getBoundingClientRect().height < 43).length }));
  ok(d.ancho <= d.vista, `a ${w} px se sale: ${d.ancho}>${d.vista}`);
  ok(d.chico === 0, `a ${w} px hay ${d.chico} controles de menos de 44 px`);
}
if (process.env.FOTO) { await monta(true, 390); await pg.locator(".ba-elim > summary").click(); await marca("FEFO-20260929-01").check(); await marca("FEFO-20260926-01").check(); await pg.click(".ba-elim-ir"); await pg.screenshot({ path: process.env.FOTO + "/fefo-eliminar-m.png", fullPage: true }) }
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 2).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Eliminar FEFOs: solo lo ve quien administra, lista todos con su estado, deja marcar varios, pide confirmar una vez, manda el id y el código de cada uno, cambia la fecha de uno sin borrarlo (con «hoy» de Colombia como propuesta), dice cuál falló si se corta, refresca, dice si la base rechaza y nada se sale en 4 anchos.");
