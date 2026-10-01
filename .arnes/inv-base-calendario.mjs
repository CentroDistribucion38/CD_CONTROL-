/* =====================================================================
   LA BASE · EL CALENDARIO (decide qué recorridos se ven y se exportan) — en Chromium, con el componente de verdad.
   «Que esto sea calendario, así, no con desde-hasta: dentro de allí mismo.»
   Un día (un toque) o un período (dos toques), todo en el mismo panel.
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_bc-cliente.ts"), `export function createClient() { return { rpc: async () => ({ data: null, error: null }) } }`);
writeFileSync(R(".arnes/_bc-nav.ts"), `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });`);
writeFileSync(R(".arnes/_bc-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Base } from "../src/app/(app)/inventario/base/Base";
createRoot(document.getElementById("r")!).render(<Base enviadas={[]} abiertas={[]} conteos={(window as any).CONTEOS} tope={false} />);`);
const js = buildSync({ entryPoints: [R(".arnes/_bc-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_bc-cliente.ts"), "next/navigation": R(".arnes/_bc-nav.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/base/base.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const C = (id, codigo, estado, fecha, renglones = 3) => ({ id, codigo, estado, fecha_analisis: fecha, responsable: "Ana", envio_nombre: "Jefe",
  enviado_en: estado === "cerrado" ? fecha + "T17:00:00Z" : null, renglones, ubicaciones: 2, total_cajas: 100, bodega: "CD38" });
const CONTEOS = [C("a", "FEFO-0923", "cerrado", "2026-09-23"), C("b", "FEFO-0926-1", "cerrado", "2026-09-26"), C("c", "FEFO-0926-2", "cerrado", "2026-09-26"),
  C("d", "FEFO-0926-3", "cerrado", "2026-09-26"), C("e", "FEFO-1001", "cerrado", "2026-10-01"), C("f", "FEFO-0929", "en_proceso", "2026-09-29")];
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = []; pg.on("pageerror", (e) => roto.push(e.message));
const monta = async (ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div>
    <script>window.CONTEOS=${JSON.stringify(CONTEOS)};window.__urls=[];window.fetch=async(u)=>{window.__urls.push(String(u));return new Response(new Blob(["x"]),{status:200})};URL.createObjectURL=()=>"blob:x";</script><script>${js}<\/script></body></html>`);
  await pg.waitForSelector(".ba-ctrl");
};
const disparo = () => pg.locator(".ba-cal .disparo");
const abrir = async () => { await disparo().click(); await pg.waitForSelector(".ba-cal .calendario .panel") };
const fefos = () => pg.locator(".ba-ch .ba-ch-cod").allTextContents();
const boton = () => pg.locator(".ba-prim");
const dia = (iMes, d) => pg.locator(".ba-cal .calendario .mes").nth(iMes).locator(".dias button:not(.fuera)", { hasText: new RegExp("^" + d + "$") });
const aplicar = () => pg.locator(".ba-cal .cal-pie .aplicar").click();
const urls = () => pg.evaluate(() => window.__urls);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

await monta();
/* Arranca en el último día con algo enviado. */
ok(/1 oct 2026/.test(await disparo().textContent()) && !/—/.test(await disparo().textContent()), "no arranca en el último día enviado (1 oct 2026): " + await disparo().textContent());
ok(igual(await fefos(), ["-1001"]), "arranca con los recorridos de ese día: " + (await fefos()).join(","));
/* El panel: dos meses, atajos, y puntitos en los días que tienen algo. */
await abrir();
ok(await pg.locator(".ba-cal .calendario .mes").count() === 2, "no hay dos meses");
const marcados = await pg.locator(".ba-cal .dias button.marcado").evaluateAll((b) => b.map((x) => x.textContent.trim()));
ok(igual(marcados, ["23", "26", "1"]), "los días con FEFO enviados deben tener puntito (el borrador del 29 no): " + marcados.join(","));
ok(await pg.locator(".ba-cal .dias button.fuera").count() > 0 && await pg.locator('.ba-cal .mes').first().locator('.dias button.fuera', { hasText: /^22$/ }).count() === 1, "los días fuera del rango con datos no salen apagados");
const atajos = await pg.locator(".ba-cal .atajos button").allTextContents();
ok(igual(atajos, ["Último día enviado", "Últimos 7 días", "Este mes", "Todo lo enviado"]), "los atajos: " + atajos.join("|"));
/* Un solo toque y Aplicar: un día. */
await dia(0, 23).click();
ok(/El 23 sep 2026/.test(await pg.locator(".cal-pie .resumen").textContent()) && !(await pg.locator(".cal-pie .aplicar").isDisabled()), "con un toque ya debe valer un día: " + await pg.locator(".cal-pie .resumen").textContent());
await aplicar();
ok(/23 sep 2026/.test(await disparo().textContent()) && !/—/.test(await disparo().textContent()), "un día suelto se escribe con una sola fecha: " + await disparo().textContent());
ok(igual(await fefos(), ["-0923"]), "no trae solo el recorrido de ese día: " + (await fefos()).join(","));
await boton().click(); await pg.waitForFunction(() => window.__urls.length === 1);
ok((await urls())[0].includes("desde=2026-09-23&hasta=2026-09-23") && !(await urls())[0].includes("ids="), "lo que se pide al servidor: " + (await urls())[0]);
/* Dos toques: un período. Y al revés también. */
await abrir(); await dia(0, 26).click(); await dia(0, 23).click();
ok(/Del <b>/.test(await pg.locator(".cal-pie .resumen").innerHTML()) && /23 sep 2026<\/b> al <b>26 sep 2026/.test(await pg.locator(".cal-pie .resumen").innerHTML()), "tocando el 26 y luego el 23 no se ordena: " + await pg.locator(".cal-pie .resumen").textContent());
await aplicar();
ok(/23 sep 2026 — 26 sep 2026/.test(await disparo().textContent()), "el período no se escribe desde — hasta: " + await disparo().textContent());
ok(igual(await fefos(), ["-3", "-2", "-1", "-0923"]), "el período no junta los FEFO de todos sus días: " + (await fefos()).join(","));
ok(igual(await pg.locator(".ba-dl").allTextContents(), ["26 sep", "23 sep"]), "en un período cada recorrido cuelga de su día: " + (await pg.locator(".ba-dl").allTextContents()).join("|"));
ok(/4 de 4 recorridos/.test(await pg.locator(".ba-cnt").textContent()), "la cuenta de recorridos del período: " + await pg.locator(".ba-cnt").textContent());
/* Desmarcar uno manda los ids; pedir todo no. */
await pg.locator(".ba-ch").first().click();
ok(/3 de 4 recorridos/.test(await pg.locator(".ba-cnt").textContent()), "no dice «3 de 4 recorridos»: " + await pg.locator(".ba-cnt").textContent());
await boton().click(); await pg.waitForFunction(() => window.__urls.length === 2);
const u2 = (await urls())[1];
ok(u2.includes("desde=2026-09-23&hasta=2026-09-26") && /ids=[bcda,]+/.test(u2) && u2.split("ids=")[1].split("&")[0].split(",").length === 3, "el período con uno quitado: " + u2);
/* Un atajo: los últimos 7 días (del 25/9 al 1/10). */
await abrir(); await pg.locator(".ba-cal .atajos button", { hasText: "Últimos 7 días" }).click();
await aplicar();
ok(/25 sep 2026 — 1 oct 2026/.test(await disparo().textContent()) && igual(await fefos(), ["-1001", "-3", "-2", "-1"]), "«Últimos 7 días»: " + await disparo().textContent() + " " + (await fefos()).join(","));
ok(/4 de 4 recorridos/.test(await pg.locator(".ba-cnt").textContent()), "cambiar de período no vuelve a marcar todos (quedó: " + await pg.locator(".ba-cnt").textContent() + ")");
/* Todo lo enviado. */
await abrir(); await pg.locator(".ba-cal .atajos button", { hasText: "Todo lo enviado" }).click(); await aplicar();
ok((await fefos()).length === 5, "«Todo lo enviado» no trae los 5 FEFO enviados (el borrador no entra): " + (await fefos()).join(","));
/* Un período sin nada: avisa y no deja exportar. */
await abrir(); await dia(0, 28).click(); await dia(0, 30).click(); await aplicar();
ok(/Sin recorridos enviados en esas fechas/.test(await pg.locator(".ba-fichas").textContent()) && await boton().isDisabled(), "un período sin recorridos debe avisar y no dejar exportar: " + await pg.locator(".ba-fichas").textContent());
/* Cancelar no cambia nada. */
await abrir(); await dia(0, 26).click(); await pg.locator(".cal-pie .cancelar").click();
ok(!/26 sep/.test(await disparo().textContent()) && await pg.locator(".ba-cal .calendario .panel").count() === 0, "cancelar cambió el período o dejó el panel abierto");

/* Nada se sale y el dedo alcanza, con el panel abierto, en cuatro anchos. */
for (const w of [360, 390, 820, 1440]) {
  await monta(w); await abrir();
  const d = await pg.evaluate(() => {
    const p = document.querySelector(".ba-cal .calendario .panel").getBoundingClientRect();
    return { ancho: document.documentElement.scrollWidth, vista: window.innerWidth, izq: p.left, der: p.right,
      chico: [...document.querySelectorAll(".ba-cal .disparo, .ba-cal .atajos button, .ba-cal .cal-pie button, .ba-cal .mes-cab button")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < (window.innerWidth <= 760 || !e.classList.contains("disparo") ? 43 : 39)).map((e) => e.className || e.textContent.trim()) };
  });
  ok(d.ancho <= d.vista, `a ${w} px la página se va de lado: ${d.ancho}>${d.vista}`);
  ok(d.izq >= -1 && d.der <= d.vista + 1, `a ${w} px el panel del calendario se sale de la pantalla (${Math.round(d.izq)}–${Math.round(d.der)} de ${d.vista})`);
  ok(d.chico.length === 0, `a ${w} px hay controles de menos de 44 px: ${d.chico.slice(0, 3).join(",")}`);
}
/* EN CELULAR solo cabe un mes: el del día elegido, con su flecha para ir atrás. */
await monta(390); await abrir();
const mes = await pg.evaluate(() => [...document.querySelectorAll(".ba-cal .mes")].filter((e) => getComputedStyle(e).display !== "none").map((e) => e.querySelector(".titulo-mes").textContent.trim()));
ok(mes.length === 1 && /octubre 2026/i.test(mes[0]), "en celular el mes visible no es el del día elegido: " + mes);
const atras = pg.locator(".ba-cal .mes-cab .ant-movil");
ok(await atras.isVisible(), "en celular no hay flecha para ir al mes anterior");
await atras.click();
const mes2 = await pg.evaluate(() => [...document.querySelectorAll(".ba-cal .mes")].filter((e) => getComputedStyle(e).display !== "none").map((e) => e.querySelector(".titulo-mes").textContent.trim()));
ok(mes2.length === 1 && /septiembre 2026/i.test(mes2[0]), "la flecha de atrás no va a septiembre: " + mes2);
if (process.env.FOTO) for (const [w, n] of [[390, "m"], [1440, "d"]]) { await monta(w); await abrir(); await pg.screenshot({ path: process.env.FOTO + `/base-calendario-${n}.png`, fullPage: false }) }
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 2).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ La base con calendario: un día con un toque o un período con dos, atajos, puntitos en los días con FEFO, junta los FEFO del período, pide al servidor desde/hasta, y el panel cabe en 4 anchos.");
