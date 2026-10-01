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
w.__llamadas = []; w.__falla = null; w.__refresh = 0;
export function createClient() { return { rpc: async (fn: string, args: any) => { w.__llamadas.push({ fn, args }); return w.__falla ? { data: null, error: { message: w.__falla } } : { data: [{ codigo: args.p_codigo, renglones: 1 }], error: null } } } }`);
writeFileSync(R(".arnes/_fe-nav.ts"), `export const useRouter = () => ({ refresh() { (window as any).__refresh++ }, push() {}, replace() {} });`);
writeFileSync(R(".arnes/_fe-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Base } from "../src/app/(app)/inventario/base/Base";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Base enviadas={[]} abiertas={[]} conteos={w.CONTEOS} tope={false} manda={w.MANDA === "omitido" ? undefined : w.MANDA} />);`);
const js = buildSync({ entryPoints: [R(".arnes/_fe-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_fe-cliente.ts"), "next/navigation": R(".arnes/_fe-nav.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/base/base.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const C = (id, codigo, estado, fecha, renglones) => ({ id, codigo, estado, fecha_analisis: fecha, responsable: "Ana", envio_nombre: estado === "cerrado" ? "Jefe" : null,
  enviado_en: estado === "cerrado" ? fecha + "T17:00:00Z" : null, renglones, ubicaciones: 1, total_cajas: 100, bodega: "CD38" });
const CONTEOS = [C("a", "FEFO-20260926-01", "cerrado", "2026-09-26", 2), C("b", "FEFO-20260929-01", "en_proceso", "2026-09-29", 5), C("c", "FEFO-20260923-01", "anulado", "2026-09-23", 0)];
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = []; pg.on("pageerror", (e) => roto.push(e.message));
const monta = async (manda, ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div>
    <script>window.CONTEOS=${JSON.stringify(CONTEOS)};window.MANDA=${JSON.stringify(manda)};</script><script>${js}<\/script></body></html>`);
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
/* Pide confirmar y «No» no manda nada. */
await pg.locator('button[aria-label="Eliminar el FEFO FEFO-20260929-01"]').click();
ok(/¿Eliminar FEFO-20260929-01\?/.test(await pg.locator(".ba-elim").textContent()), "no pide confirmar");
ok(await pg.evaluate(() => window.__llamadas.length) === 0, "pedir confirmación ya eliminó");
await pg.click('.ba-elim-conf button:has-text("No")');
ok(await pg.evaluate(() => window.__llamadas.length) === 0 && await pg.locator(".ba-elim-conf").count() === 0, "«No» eliminó o dejó la pregunta abierta");
/* Sí: manda el id Y el código del FEFO que se ve, refresca y avisa. */
await pg.locator('button[aria-label="Eliminar el FEFO FEFO-20260926-01"]').click();
await pg.click('.ba-elim-conf button:has-text("Sí, eliminar")');
await pg.waitForFunction(() => window.__llamadas.length === 1);
const ll = await pg.evaluate(() => window.__llamadas[0]);
ok(ll.fn === "conteo_fefo_eliminar" && ll.args.p_conteo === "a" && ll.args.p_codigo === "FEFO-20260926-01", "lo que se manda a la base: " + JSON.stringify(ll));
ok(await pg.evaluate(() => window.__refresh) === 1, "después de eliminar no refresca");
ok(await pg.locator(".ba-elim-conf").count() === 0, "después de eliminar sigue la pregunta de confirmar");
ok(/Se eliminó el FEFO FEFO-20260926-01/.test(await pg.locator(".ba-elim").textContent()), "no avisa que eliminó");
/* Si la base rechaza, lo dice y no avisa de éxito. */
await pg.evaluate(() => { window.__falla = "function public.conteo_fefo_eliminar(uuid, text) does not exist" });
await pg.locator('button[aria-label="Eliminar el FEFO FEFO-20260923-01"]').click();
await pg.click('.ba-elim-conf button:has-text("Sí, eliminar")');
await pg.waitForSelector(".ba-conso-mal");
ok(/2026-10-fefo-eliminar\.sql/.test(await pg.locator(".ba-conso-mal").textContent()), "si falta el SQL no dice cuál correr: " + await pg.locator(".ba-conso-mal").textContent());
ok(!/Se eliminó el FEFO FEFO-20260923/.test(await pg.locator(".ba-elim").textContent()), "avisa éxito aunque la base rechazó");
/* Nada se sale y el dedo alcanza. */
for (const w of [360, 390, 820, 1440]) {
  await monta(true, w);
  await pg.locator(".ba-elim > summary").click();
  await pg.locator('button[aria-label="Eliminar el FEFO FEFO-20260929-01"]').click();
  const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
    chico: [...document.querySelectorAll(".ba-elim button, .ba-elim summary")].filter((e) => e.getBoundingClientRect().height < 43).length }));
  ok(d.ancho <= d.vista, `a ${w} px se sale: ${d.ancho}>${d.vista}`);
  ok(d.chico === 0, `a ${w} px hay ${d.chico} controles de menos de 44 px`);
}
if (process.env.FOTO) { await monta(true, 390); await pg.locator(".ba-elim > summary").click(); await pg.locator('button[aria-label="Eliminar el FEFO FEFO-20260929-01"]').click(); await pg.screenshot({ path: process.env.FOTO + "/fefo-eliminar-m.png", fullPage: true }) }
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 2).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Eliminar FEFOs: solo lo ve quien administra, lista todos con su estado, pide confirmar, manda el id y el código, refresca, dice si la base rechaza y nada se sale en 4 anchos.");
