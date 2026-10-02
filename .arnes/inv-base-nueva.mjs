/* =====================================================================
   LA BASE, REDISEÑADA — en Chromium, con el componente de verdad.
   «ACOMODEMOS ESTE DISEÑO» (la-base.html). Cubre:
   · las fichas de recorridos (orden, hora, cuáles están marcadas, cuál reemplazó a cuál);
   · el CRUCE: de cada ubicación vale el último recorrido; Repetidas, «Reemplazó a», «antes N»;
   · las cuatro cifras, que siguen a las fichas y NO a los filtros de la tabla;
   · Estado PASADO / POR PASAR (un renglón nuevo vuelve a POR PASAR aunque el de antes estuviera pasado);
   · marcar y desmarcar PASADO (lo que se manda y lo que se dice si falla); quién ve las casillas;
   · que «Eliminar» SOLO lo vea quien administra, y solo dentro de ⋯ Administrador;
   · la tabla corta, «Ver todas las columnas» y lo que baja a Excel;
   · «Exportar consolidado»: qué manda al servidor;
   · pestaña Borradores (no cruza, no tiene Estado), paginado, orden;
   · 4 anchos: sin arrastre lateral, lo que se toca mide 44 en el celular, nada se corta.
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_bn-cliente.ts"), `
const w = window as any;
w.__llamadas = [];
export function createClient() { return { rpc: async (fn: string, args: any) => { w.__llamadas.push({ fn, args });
  if (w.__falla && fn === w.__fallaFn) return { data: null, error: { message: w.__falla } };
  if (fn === "conteo_fefo_lineas_eliminar") return { data: [{ codigo: "FEFO-20261001-03", eliminados: args.p_lineas.length, quedan: 1 }], error: null };
  if (fn === "conteo_fefo_marcar_pasado") return { data: args.p_lineas.length, error: null };
  return { data: null, error: null } } } }`);
writeFileSync(R(".arnes/_bn-nav.ts"), `export const useRouter = () => ({ refresh() { (window as any).__refresh++ }, push() {}, replace() {} });`);
writeFileSync(R(".arnes/_bn-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Base } from "../src/app/(app)/inventario/base/Base";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Base enviadas={w.ENVIADAS} abiertas={w.ABIERTAS} conteos={w.CONTEOS} tope={!!w.TOPE}
  manda={w.MANDA} bodega="CD38" uxc={w.UXC} pasados={w.PASADOS} pasadosOk={w.PASADOS_OK !== false} puedeMarcar={w.PUEDE} />);`);
const js = buildSync({ entryPoints: [R(".arnes/_bn-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_bn-cliente.ts"), "next/navigation": R(".arnes/_bn-nav.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/base/base.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");

/* ---------- los datos: el ejemplo de la maqueta ---------- */
const C = (id, codigo, estado, fecha, enviado, quien, renglones) => ({ id, codigo, estado, fecha_analisis: fecha, responsable: quien, envio_nombre: estado === "cerrado" ? quien : null,
  enviado_en: enviado, renglones, ubicaciones: renglones, total_cajas: 100, bodega: "CD38" });
/* Las horas van en UTC; Colombia es UTC-5: 14:34Z = 9:34. */
const CONTEOS = [
  C("c3", "FEFO-20261001-03", "cerrado", "2026-10-01", "2026-10-01T16:40:00Z", "Contador B", 62),
  C("c2", "FEFO-20261001-02", "cerrado", "2026-10-01", "2026-10-01T15:15:00Z", "Contador C", 88),
  C("c1", "FEFO-20261001-01", "cerrado", "2026-10-01", "2026-10-01T14:34:00Z", "JeremyGriego", 147),
  C("c5", "FEFO-20260930-02", "cerrado", "2026-09-30", "2026-09-30T20:02:00Z", "JeremyGriego", 120),
  C("c4", "FEFO-20260930-01", "cerrado", "2026-09-30", "2026-09-30T13:20:00Z", "Contador B", 131),
  C("c6", "FEFO-20261001-04", "en_proceso", "2026-10-01", null, "Génesis", 3),
];
let n = 0;
const L = (conteo, codigoConteo, ubic, ubicId, codigo, material, tipo, estibas, total, extra = {}) => ({
  id: "l" + (++n), conteo_id: conteo, conteo: codigoConteo, estado: conteo === "c6" ? "en_proceso" : "cerrado", codigo, material, tipo_material: tipo, familia: "RETORNABLE",
  factor_estibado: 54, ubicacion: ubic, ubicacion_id: ubicId, ubicacion_combinada: ubic, calle: ubic[0], modulo: ubic.slice(1, 3), lado: ubic.endsWith("DER") ? "DER" : "IZQ",
  estibas, cajas: null, saldo: null, total_cajas: total, total_estibas: estibas, capacidad: 90, venc_dia: null, venc_mes: null, venc_anio: null,
  fabricacion: null, vencimiento: "2026-12-13", dias_para_salir: 12, dias_para_vencer: 60, rotacion: true, averia: false, pnc: false, estado_envase: null,
  nota: null, conto: "jefe", contado_en: "2026-10-01T14:00:00Z", producto_id: "p" + codigo, ...extra });
const L1 = L("c1", "FEFO-20261001-01", "A01_DER", "u1", "3500231", "Envase Costeñita 175R", "ENVASE", 4, 216);
const L1b = L("c1", "FEFO-20261001-01", "A02_DER", "u2", "3500231", "Envase Costeñita 175R", "ENVASE", 15, 810);
const L1c = L("c1", "FEFO-20261001-01", "A03_IZQ", "u3", "3500887", "BOTELLA FLINT 1000R", "ENVASE", 40, 1440);
const L2 = L("c2", "FEFO-20261001-02", "C04_DER", "u4", "3128", "Águila RN 330cc X30", "PRODUCTO", 12, 432);
const L3 = L("c3", "FEFO-20261001-03", "A01_DER", "u1", "3500231", "Envase Costeñita 175R", "ENVASE", 5, 270);
const L4 = L("c4", "FEFO-20260930-01", "D11_IZQ", "u5", "3500102", "Envase Águila 330R", "ENVASE", 8, 432);
const L5 = L("c5", "FEFO-20260930-02", "A01_DER", "u1", "3500231", "Envase Costeñita 175R", "ENVASE", 3, 162);
const L5b = L("c5", "FEFO-20260930-02", "F01_IZQ", "u6", "3128", "Águila RN 330cc X30", "PRODUCTO", 2, 100);
const AB = L("c6", "FEFO-20261001-04", "G01_DER", "u7", "3128", "Águila RN 330cc X30", "PRODUCTO", 1, 54);
const ENVIADAS = [L1, L1b, L1c, L2, L3, L4, L5, L5b];
const UXC = { 3500231: 38, 3500887: 13, 3128: 30, 3500102: null };
/* PASADO: el de A02, el de C04, el de D11… y el de A01 DEL RECORRIDO VIEJO: el renglón nuevo (-03) es otro y debe salir POR PASAR. */
const PASADOS = [L1.id, L1b.id, L2.id, L4.id];

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = []; pg.on("pageerror", (e) => roto.push(e.message));
await pg.goto("about:blank");
await pg.evaluate(() => {
  window.__bajados = []; window.__pedidos = [];
  const crea = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { b.text().then((t) => window.__bajados.push({ tipo: b.type, texto: t })); return crea(b) };
  const f = window.fetch;
  window.fetch = async (u) => { window.__pedidos.push(String(u)); return new Response(new Blob(["x"]), { status: 200 }) };
});
const monta = async ({ conteos = CONTEOS, manda = false, puede = false, ancho = 1440, enviadas = ENVIADAS, abiertas = [AB], pasados = PASADOS, pasadosOk = true, tema = null, tope = false } = {}) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}${css}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div>
    <script>window.CONTEOS=${JSON.stringify(conteos)};window.ENVIADAS=${JSON.stringify(enviadas)};window.ABIERTAS=${JSON.stringify(abiertas)};window.MANDA=${manda};window.PUEDE=${puede};window.UXC=${JSON.stringify(UXC)};window.PASADOS=${JSON.stringify(pasados)};window.PASADOS_OK=${pasadosOk};window.TOPE=${tope};window.__llamadas=[];window.__refresh=0;</script><script>${js}<\/script></body></html>`);
  await pg.waitForSelector(".ba");
};
const txt = async (sel) => ((await pg.locator(sel).first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
const filas = () => pg.locator(".ba-t tbody tr");
const celdas = async (i) => (await filas().nth(i).locator("td").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
const kp = async () => (await pg.locator(".ba-kp > div b").allTextContents());
const llamadas = (fn) => pg.evaluate((f) => window.__llamadas.filter((c) => c.fn === f), fn);

/* ===== 1 · cabecera y fichas ===== */
await monta();
ok(await txt(".ba-cab h1") === "La base" && /Inventario · Bodega CD38/.test(await txt(".ba-eti")), "cabecera: " + await txt(".ba-cab"));
ok(/↓ Bajar esta vista/.test(await txt(".ba-acc")) && /↓ Exportar consolidado/.test(await txt(".ba-acc")), "faltan «Bajar esta vista» o «Exportar consolidado»");
ok(await pg.locator(".ba-adm").count() === 0, "«⋯ Administrador» sale a quien no administra");
const fichas = async () => (await pg.locator(".ba-ch").evaluateAll((es) => es.map((e) => e.querySelector(".ba-ch-cod").textContent + " " + (e.querySelector("small")?.textContent ?? ""))));
const chips = await fichas();
ok(JSON.stringify(chips) === JSON.stringify(["-03 11:40", "-02 10:15", "-01 9:34"]), "fichas del último día, el más nuevo primero y con su hora de envío (Colombia): " + JSON.stringify(chips));
ok(await txt(".ba-dl") === "1 oct", "el día de las fichas: " + await txt(".ba-dl"));
ok(await pg.locator(".ba-ch.re").count() === 1 && /-03/.test(await txt(".ba-ch.re")), "solo -03 debe marcar que reemplazó a otro");
ok(/actualiza 1 ubicación de -01/.test(await pg.locator(".ba-ch.re").getAttribute("title")), "el título de la ficha no dice qué actualiza: " + await pg.locator(".ba-ch.re").getAttribute("title"));
ok(/3 de 3 recorridos/.test(await txt(".ba-cnt")), "cuenta de recorridos: " + await txt(".ba-cnt"));
ok(await pg.locator(".ba-cnt .ba-link").isDisabled(), "«Todos» debe estar apagado si ya están todos");
ok(/1 oct 2026/.test(await txt(".ba-ctrl .disparo")), "el calendario debe decir el día: " + await txt(".ba-ctrl .disparo"));

/* ===== 2 · el cruce ===== */
ok(JSON.stringify(await kp()) === JSON.stringify(["4", "2.952", "4", "1"]), "cifras tras cruzar (4 renglones, 2.952 cajas, 4 ubicaciones, 1 repetida): " + JSON.stringify(await kp()));
ok(await filas().count() === 4, "debe haber 4 renglones (A01 vale -03, no -01): " + await filas().count());
let c0 = await celdas(0);
ok(/A01_DER/.test(c0[0]) && /Envase Costeñita 175R/.test(c0[1]) && /3500231 · envase/.test(c0[1]) && c0[2] === "5" && /^270\s*antes 216$/.test(c0[3]) && c0[4] === "10.260", "renglón A01: " + JSON.stringify(c0));
ok(/-03/.test(c0[5]) && /1 oct 11:40/.test(c0[5]) && /Contador B/.test(c0[5]) && /Reemplazó a -01 \(9:34\)/.test(c0[5]), "A01 debe decir que vale -03 y a quién reemplazó: " + c0[5]);
ok(c0[6] === "POR PASAR", "el renglón nuevo (-03) debe salir POR PASAR aunque el de antes estuviera pasado: " + c0[6]);
const c1 = await celdas(1);
ok(/A02_DER/.test(c1[0]) && c1[3] === "810" && c1[4] === "30.780" && !/antes/.test(c1[3]) && !/Reemplazó/.test(c1[5]) && c1[6] === "PASADO", "renglón A02: " + JSON.stringify(c1));
const c2 = await celdas(2);
ok(/A03_IZQ/.test(c2[0]) && /BOTELLA FLINT 1000R/.test(c2[1]) && c2[4] === "18.720" && c2[6] === "POR PASAR", "renglón A03: " + JSON.stringify(c2));
const c3 = await celdas(3);
ok(/C04_DER/.test(c3[0]) && /producto/.test(c3[1]) && c3[4] === "12.960" && /-02/.test(c3[5]) && c3[6] === "PASADO", "renglón C04: " + JSON.stringify(c3));
ok(/Mostrando 4 renglones · 2.952 cajas/.test(await txt(".ba-th")), "encabezado de la tabla: " + await txt(".ba-th"));
ok(await pg.locator(".ba-tag.nuevo").count() === 1, "la etiqueta del recorrido que reemplazó debe llevar resalte");
ok(await pg.locator(".ba-t th").count() === 7, "tabla corta: Ubicación, Material, Estibas, Cajas, Unidades, Recorrido que vale, Estado → " + await pg.locator(".ba-t th").count());
ok(/Recorrido que vale/.test(await txt(".ba-t thead")), "falta el título «Recorrido que vale»");

/* Quitar -03: A01 vuelve a valer lo de -01, sin «antes» ni «Reemplazó». */
await pg.click(".ba-ch >> nth=0");
ok(JSON.stringify(await kp()) === JSON.stringify(["4", "2.898", "4", "0"]), "al quitar -03: " + JSON.stringify(await kp()));
c0 = await celdas(0);
ok(c0[3] === "216" && /-01/.test(c0[5]) && !/Reemplazó/.test(c0[5]) && c0[6] === "PASADO", "sin -03, A01 vale -01 y ya estaba pasado: " + JSON.stringify(c0));
ok(await pg.locator(".ba-ch.re").count() === 0 && /2 de 3 recorridos/.test(await txt(".ba-cnt")), "tras quitar -03 ya nadie reemplaza y la cuenta dice 2 de 3");
await pg.click(".ba-cnt .ba-link");
ok(await pg.locator(".ba-ch.on").count() === 3 && JSON.stringify(await kp()) === JSON.stringify(["4", "2.952", "4", "1"]), "«Todos» debe volver a marcarlos");
/* Si no queda ninguno marcado. */
for (let i = 0; i < 3; i++) await pg.click(".ba-ch.on >> nth=0");
ok(/no hay ningún renglón/.test(await txt(".ba-vacio")) && await pg.locator(".ba-prim").isDisabled(), "sin recorridos marcados: " + await txt(".ba-vacio"));
await pg.click(".ba-cnt .ba-link");

/* ===== 3 · el calendario: todo lo enviado ===== */
await pg.click(".ba-ctrl .disparo");
await pg.click('.ba-cal .atajos button:has-text("Todo lo enviado")');
await pg.click(".ba-cal .aplicar");
const chips2 = await fichas();
ok(chips2.length === 5 && /-03/.test(chips2[0]) && /-01 8:20/.test(chips2[4]), "con todo lo enviado deben salir las 5 fichas, las de los dos días: " + JSON.stringify(chips2));
ok((await pg.locator(".ba-dl").allTextContents()).join("|") === "1 oct|30 sep", "los dos días rotulados: " + (await pg.locator(".ba-dl").allTextContents()).join("|"));
ok(JSON.stringify(await kp()) === JSON.stringify(["6", "3.484", "6", "1"]), "cifras con los dos días: " + JSON.stringify(await kp()));
const fd = await Promise.all([0, 1, 2, 3, 4, 5].map(celdas));
const d11 = fd.find((r) => /D11_IZQ/.test(r[0]));
ok(d11 && /30\/09 -01/.test(d11[5]) && /30 sep 8:20/.test(d11[5]) && d11[6] === "PASADO", "el renglón de otro día lleva «30/09 -01»: " + JSON.stringify(d11));
ok(/-01 9:34/.test(chips2[2]) && chips2[3] === "-02 15:02", "las horas van en 24 h y en hora de Colombia (15:02, no 3:02): " + chips2.join(" | "));
/* El recorrido -02 del 30/09 no tiene el renglón A01 vigente (lo reemplaza el de hoy): su repetida cuenta una sola vez. */
ok(await pg.locator(".ba-ch.re").count() === 1, "solo -03 reemplaza (el de ayer queda debajo)");

/* ===== 4 · filtros ===== */
await pg.fill(".ba-busca input", "águila");
ok(await filas().count() === 3 && /Mostrando 3 renglones de 6/.test(await txt(".ba-th")), "buscar «águila»: " + await txt(".ba-th"));
ok(JSON.stringify(await kp()) === JSON.stringify(["6", "3.484", "6", "1"]), "las cifras de arriba NO deben seguir a la búsqueda de la tabla");
await pg.fill(".ba-busca input", "");
const seg = (await pg.locator(".ba-seg button").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
ok(JSON.stringify(seg) === JSON.stringify(["Todo6", "Producto2", "Envase4"]), "conteos de Todo/Producto/Envase: " + JSON.stringify(seg));
await pg.click('.ba-seg button:has-text("Envase")');
ok(await filas().count() === 4 && await pg.locator(".ba-seg button.on").count() === 1, "filtro Envase: " + await filas().count());
await pg.click('.ba-seg button:has-text("Todo")');
await pg.selectOption('.ba-sel select >> nth=1', "A");
ok(await filas().count() === 3, "filtro por calle A (A01, A02, A03): " + await filas().count());
const mods = await pg.locator(".ba-sel select >> nth=2").locator("option").allTextContents();
ok(mods.includes("A") || mods.length >= 2, "el desplegable de módulo debe salir de lo que hay");
await pg.selectOption('.ba-sel select >> nth=1', "");
await pg.selectOption(".ba-sel select >> nth=0", "c2");
ok(await filas().count() === 1 && /C04_DER/.test((await celdas(0))[0]), "filtro por recorrido -02");
await pg.selectOption(".ba-sel select >> nth=0", "");
ok(await pg.locator('.ba >> text="Quitar filtros"').count() === 0, "«Quitar filtros» no debe verse sin filtros");
await pg.fill(".ba-busca input", "zzzz");
ok(/Ningún renglón coincide/.test(await txt(".ba-vacio")) && await pg.locator('.ba >> text="Quitar filtros"').count() === 1, "sin coincidencias");
await pg.click('.ba >> text="Quitar filtros"');
ok(await filas().count() === 6, "«Quitar filtros» devuelve las seis");

/* ===== 5 · orden ===== */
await pg.click('.ba-t thead button:has-text("Cajas")');
ok(/ba-t/.test(await pg.locator(".ba-t").getAttribute("class")) && (await celdas(0))[3].startsWith("100"), "ordenar por Cajas ascendente: " + (await celdas(0))[3]);
await pg.click('.ba-t thead button:has-text("Cajas")');
ok((await celdas(0))[3].startsWith("1.440"), "ordenar por Cajas descendente: " + (await celdas(0))[3]);
ok(await pg.locator('.ba-t th[aria-sort="descending"]').count() === 1, "aria-sort");
await pg.click('.ba-t thead button:has-text("Ubicación")');

/* ===== 6 · ver todas las columnas y el Excel ===== */
ok(/Ver todas las columnas/.test(await txt(".ba-th")), "falta el botón «Ver todas las columnas»");
await pg.click('.ba-th .ba-link');
ok(await pg.locator(".ba-t th").count() === 27 && /Ver menos columnas/.test(await txt(".ba-th")), "tabla completa: 26 columnas + Estado → " + await pg.locator(".ba-t th").count());
ok(/Quién contó/.test(await txt(".ba-t thead")) && /Estado/.test(await txt(".ba-t thead")), "faltan columnas de la hoja");
await pg.click('.ba-th .ba-link');
ok(await pg.locator(".ba-t th").count() === 7, "volver a la corta");
await pg.click('.ba-seg button:has-text("Envase")');
await pg.click('.ba-acc button:has-text("Bajar esta vista")');
await pg.waitForFunction(() => window.__bajados.length > 0);
const csv = (await pg.evaluate(() => window.__bajados[0].texto)).replace(/^\uFEFF/, "");
const lin = csv.split("\r\n");
ok(lin[0] === "sep=;" && lin[1].split(";").length === 27 && lin[1].endsWith(";Estado"), "el CSV debe traer las 26 columnas más Estado: " + lin[1].split(";").length);
ok(lin.length === 2 + 4, "el CSV baja lo que se ve (4 envases): " + (lin.length - 2));
ok(/;PASADO$/.test(lin.find((l) => /A02_DER/.test(l)) ?? "") && /;POR PASAR$/.test(lin.find((l) => /A03_IZQ/.test(l)) ?? ""), "el CSV debe decir el Estado de cada renglón: " + lin.slice(2).join(" || "));
await pg.click('.ba-seg button:has-text("Todo")');

/* ===== 6b · «Recorrido que vale»: el día y la hora en que se ENVIÓ (hora de Colombia) ===== */
{
  const recs = await pg.locator(".ba-t tbody .ba-rec").allTextContents();
  ok(recs.length > 0 && recs.every((t) => /\d+ (sep|oct) \d+:\d\d/.test(t) && !/sin enviar/.test(t)), "cada recorrido enviado muestra día y hora de envío: " + recs.join(" | "));
}
/* ===== 7 · exportar consolidado ===== */
await pg.evaluate(() => { window.__pedidos = [] });
await pg.click(".ba-prim");
await pg.waitForFunction(() => window.__pedidos.length > 0);
let ped = await pg.evaluate(() => window.__pedidos[0]);
ok(/\/api\/inventario\/exportar\?desde=2026-09-30&hasta=2026-10-01&tinta=/.test(ped) && !/ids=/.test(ped), "consolidado con todo el período, sin lista de ids: " + ped);
await pg.waitForFunction(() => !document.querySelector(".ba-prim")?.textContent?.includes("Armando"));
await pg.click(".ba-ch >> nth=1");
await pg.evaluate(() => { window.__pedidos = [] });
await pg.click(".ba-prim");
await pg.waitForFunction(() => window.__pedidos.length > 0);
ped = await pg.evaluate(() => window.__pedidos[0]);
ok(/&ids=c3,c1,c5,c4/.test(ped) && !/c2/.test(ped), "con una ficha apagada manda solo las marcadas: " + ped);
await pg.click(".ba-cnt .ba-link");

/* ===== 8 · borradores ===== */
await pg.click('.ba-tabs button:has-text("Borradores")');
ok(await pg.locator(".ba-kp").count() === 0 && await pg.locator(".ba-ctrl").count() === 0, "los borradores no llevan ni cifras ni fichas (no se cruzan)");
ok(/solo para mirar/.test(await txt(".ba-dice.ojo")) && /FEFO-20261001-04 \(Génesis\)/.test(await txt(".ba-dice.ojo")), "el aviso del borrador: " + await txt(".ba-dice.ojo"));
ok(await filas().count() === 1 && !/Estado/.test(await txt(".ba-t thead")) && await pg.locator(".ba-t tbody .ba-pas, .ba-t tbody .ba-pen").count() === 0, "el borrador no lleva Estado");
ok(await pg.locator(".ba-pasar").count() === 0 && await pg.locator(".ba-t .ba-chk").count() === 0, "del borrador no se marca nada");
/* La fecha del recorrido es la del ENVÍO; el borrador no tiene hora inventada: dice que no se ha enviado y cuándo se abrió. */
{
  const rec = await pg.locator(".ba-t tbody .ba-rec").first().textContent();
  const hoyCO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const hoyTxt = `${Number(hoyCO.slice(8, 10))} ${["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][Number(hoyCO.slice(5, 7)) - 1]}`;
  ok(rec.includes(`sin enviar · hoy ${hoyTxt}`) && !/abierto/.test(rec), `el borrador lleva la fecha de HOY (${hoyTxt}), no la de cuando se abrió: ` + rec);
  ok(!/\d+:\d\d/.test(rec), "el borrador no lleva una hora inventada: " + rec);
}
await monta({ manda: true, puede: true });
await pg.click('.ba-tabs button:has-text("Borradores")');
ok(await pg.locator(".ba-t .ba-chk").count() === 0 && await pg.locator(".ba-quitar").count() === 0 && await pg.locator(".ba-pasar").count() === 0, "ni siquiera el administrador toca los borradores");

/* ===== 9 · quién ve qué ===== */
await monta({ puede: false, manda: false });
ok(await pg.locator(".ba-t .ba-chk").count() === 0 && await pg.locator(".ba-pasar").count() === 0 && await pg.locator(".ba-admin").count() === 0, "quien solo mira no ve casillas ni barras");
ok(!/Eliminar/.test(await pg.locator(".ba").textContent()), "quien no administra NO debe ver «Eliminar» por ningún lado");
await monta({ puede: true, manda: false });
ok(await pg.locator(".ba-t tbody .ba-chk").count() === 4 && await pg.locator(".ba-pasar").count() === 1, "quien edita La base ve las casillas y la barra de PASADO");
ok(await pg.locator(".ba-adm").count() === 0 && !/Eliminar/.test(await pg.locator(".ba").textContent()), "quien edita pero no administra NO ve «Eliminar» ni ⋯ Administrador");
await monta({ puede: true, manda: true });
ok(await pg.locator(".ba-adm").count() === 1 && await pg.locator(".ba-admin").count() === 0 && !/Eliminar/.test(await pg.locator(".ba").textContent()), "el administrador ve ⋯ Administrador pero «Eliminar» no está a la vista hasta abrirlo");
await monta({ puede: false, manda: true });
ok(await pg.locator(".ba-t tbody .ba-chk").count() === 4 && await pg.locator(".ba-pasar").count() === 0 && await pg.locator(".ba-adm").count() === 1,
   "quien administra pero no tiene «Editar» en La base ve las casillas (para eliminar) y NO la barra de PASADO");
await monta({ puede: true, pasadosOk: false });
ok(/2026-10-base-pasados\.sql/.test(await txt(".ba-tope")) && await pg.locator(".ba-pasar").count() === 0, "sin el SQL: dice qué archivo correr y no deja marcar");

/* ===== 10 · marcar PASADO ===== */
await monta({ puede: true });
ok(/Marca renglones con la casilla/.test(await txt(".ba-pasar-cuenta")) && await pg.locator('.ba-pasar button:has-text("Marcar")').isDisabled(), "sin marcar nada los botones están apagados");
await pg.locator(".ba-t tbody .ba-chk input").nth(0).check();
await pg.locator(".ba-t tbody .ba-chk input").nth(2).check();
ok(/2 renglones marcados/.test(await txt(".ba-pasar-cuenta")) && /Marcar 2 como PASADO/.test(await txt(".ba-pasar")), "dos marcados: " + await txt(".ba-pasar"));
ok(await pg.locator('.ba-pasar button:has-text("Volver")').isDisabled(), "«Volver a POR PASAR» debe estar apagado si ninguno estaba pasado");
await pg.click('.ba-pasar button:has-text("Marcar 2")');
await pg.waitForFunction(() => window.__llamadas.some((c) => c.fn === "conteo_fefo_marcar_pasado"));
let mc = (await llamadas("conteo_fefo_marcar_pasado"))[0];
ok(mc.args.p_pasado === true && mc.args.p_lineas.length === 2 && mc.args.p_lineas.includes(L3.id) && mc.args.p_lineas.includes(L1c.id), "se manda el id del renglón que VALE (el de -03), no el viejo: " + JSON.stringify(mc.args));
ok(/2 renglones quedaron como PASADO/.test(await txt(".ba-pasar .ba-elim-ok")) && await pg.evaluate(() => window.__refresh) === 1, "avisa y refresca");
ok(await pg.locator(".ba-t tbody .ba-chk input:checked").count() === 0, "después de marcar se limpian las casillas");
/* Quitar la marca: un renglón ya pasado (A02, nº 1). */
await pg.locator(".ba-t tbody .ba-chk input").nth(1).check();
ok(/Volver 1 a POR PASAR/.test(await txt(".ba-pasar")) && await pg.locator('.ba-pasar button:has-text("Marcar")').isDisabled(), "con uno ya pasado solo «Volver»: " + await txt(".ba-pasar"));
await pg.click('.ba-pasar button:has-text("Volver")');
await pg.waitForFunction(() => window.__llamadas.filter((c) => c.fn === "conteo_fefo_marcar_pasado").length === 2);
mc = (await llamadas("conteo_fefo_marcar_pasado"))[1];
ok(mc.args.p_pasado === false && mc.args.p_lineas.length === 1 && mc.args.p_lineas[0] === L1b.id, "quitar la marca manda p_pasado=false: " + JSON.stringify(mc.args));
/* Mezcla: marcados uno pasado y uno por pasar → cada botón actúa solo sobre los suyos. */
await pg.locator(".ba-t tbody .ba-chk input").nth(1).check();
await pg.locator(".ba-t tbody .ba-chk input").nth(2).check();
ok(/Marcar 1 como PASADO/.test(await txt(".ba-pasar")) && /Volver 1 a POR PASAR/.test(await txt(".ba-pasar")), "mezcla: " + await txt(".ba-pasar"));
/* Falla de la base: se dice y no se limpia. */
await pg.evaluate(() => { window.__falla = "Alguno de esos renglones ya no existe"; window.__fallaFn = "conteo_fefo_marcar_pasado" });
await pg.click('.ba-pasar button:has-text("Marcar 1")');
await pg.waitForSelector(".ba-pasar .ba-conso-mal");
ok(/No se cambió ningún renglón/.test(await txt(".ba-pasar .ba-conso-mal")) && await pg.locator(".ba-t tbody .ba-chk input:checked").count() === 2, "si falla lo dice y deja las casillas: " + await txt(".ba-pasar"));
/* Marcar todos de la página; un filtro esconde → no se manda a ciegas. */
await pg.evaluate(() => { window.__falla = null });
await pg.locator(".ba-t thead .ba-chk input").check();
ok(await pg.locator(".ba-t tbody .ba-chk input:checked").count() === 4 && /4 renglones marcados/.test(await txt(".ba-pasar-cuenta")), "marcar todos");
await pg.fill(".ba-busca input", "botella");
ok(/1 renglón marcado/.test(await txt(".ba-pasar-cuenta")), "solo cuentan los marcados que se ven: " + await txt(".ba-pasar-cuenta"));

/* ===== 11 · ⋯ Administrador ===== */
await monta({ manda: true, puede: true });
await pg.click(".ba-adm");
ok(await pg.locator(".ba-admin .ba-elim").count() === 1 && /solo administrador/.test(await txt(".ba-admin")), "⋯ Administrador abre el panel de eliminar FEFO");
ok(/Eliminar FEFO/.test(await pg.locator(".ba-admin").textContent()) || await pg.locator(".ba-admin summary").count() === 1, "el panel trae «Eliminar FEFOs»");
await pg.locator(".ba-t tbody .ba-chk input").nth(0).check();
ok(/1 renglón marcado/.test(await txt(".ba-quitar-cuenta")), "dentro del panel, los renglones marcados se pueden eliminar: " + await txt(".ba-quitar"));
await pg.click('.ba-quitar button:has-text("Eliminar renglón")');
ok(/¿Eliminar este renglón\?/.test(await txt(".ba-quitar")), "pide confirmar");
await pg.click('.ba-quitar button:has-text("Sí, eliminar")');
await pg.waitForFunction(() => window.__llamadas.some((c) => c.fn === "conteo_fefo_lineas_eliminar"));
ok((await llamadas("conteo_fefo_lineas_eliminar"))[0].args.p_lineas[0] === L3.id, "elimina el renglón que se ve");
await pg.click(".ba-adm");
ok(await pg.locator(".ba-admin").count() === 0, "⋯ Administrador se cierra");
ok(/Marca renglones para eliminarlos desde ⋯ Administrador/.test(await txt(".ba-pie")), "la pista del pie para el administrador");
await monta({ puede: true });
ok(/Marca renglones para dejarlos como PASADO/.test(await txt(".ba-pie")), "la pista del pie para quien marca");

/* ===== 12 · paginado ===== */
const muchas = Array.from({ length: 250 }, (_, i) => L("c3", "FEFO-20261001-03", "Z" + String(i).padStart(3, "0") + "_DER", "z" + i, "3128", "Águila RN 330cc X30", "PRODUCTO", 1, 10 + i));
await monta({ enviadas: muchas });
ok(await filas().count() === 100 && /^1–100 de 250/.test(await txt(".ba-pie")), "paginado: " + await txt(".ba-pie"));
await pg.click('.ba-pags button:has-text("Siguiente")');
ok(/^101–200 de 250/.test(await txt(".ba-pie")) && /Z100/.test((await celdas(0))[0]), "página 2: " + await txt(".ba-pie"));
await pg.click('.ba-pags button:has-text("Siguiente")');
ok(await filas().count() === 50 && await pg.locator('.ba-pags button:has-text("Siguiente")').isDisabled(), "última página");
await pg.fill(".ba-busca input", "águila");
ok(/^1–100 de 250/.test(await txt(".ba-pie")), "al filtrar vuelve a la página 1: " + await txt(".ba-pie"));
/* Sin nada enviado. */
await monta({ enviadas: [], pasados: [], conteos: [CONTEOS[5]] });
ok(await pg.locator(".ba-ctrl").count() === 0 && /Todavía no hay ningún recorrido enviado/.test(await txt(".ba-vacio")), "sin envíos: " + await txt(".ba-vacio"));
await monta({ tope: true });
ok(/Se llegó al tope/.test(await txt(".ba-tope")), "el tope se dice");

/* ===== 13 · cuatro anchos ===== */
console.log("\nancho   lado  tabla-desborda  táctil(min)  cabecera");
for (const [ancho, etiq] of [[1440, "pc"], [820, "tableta"], [390, "celular"], [360, "360"]]) {
  await monta({ manda: true, puede: true, ancho });
  await pg.click(".ba-adm");
  await pg.locator(".ba-t tbody .ba-chk input").nth(0).check();
  const m = await pg.evaluate(() => {
    const d = document.documentElement;
    const r = (e) => e.getBoundingClientRect();
    const toques = [...document.querySelectorAll(".ba-acc button, .ba-ch, .ba-cnt .ba-link, .ba-tabs button, .ba-seg button, .ba-sel select, .ba-busca, .ba-t thead button, .ba-th .ba-link, .ba-pasar .btn, .ba-t .ba-chk")]
      .filter((e) => r(e).width > 0).map((e) => ({ c: e.className || e.tagName, h: Math.round(r(e).height), w: Math.round(r(e).width) }));
    const marco = document.querySelector(".ba-marco"), tabla = document.querySelector(".ba-t");
    /* Texto cortado: ningún texto de botón/ficha sale de su caja. */
    const cortados = [...document.querySelectorAll(".ba button, .ba .ba-ch, .ba h1, .ba .ba-sub, .ba .ba-cnt")]
      .filter((e) => r(e).width > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible").map((e) => e.className || e.tagName);
    return { lado: d.scrollWidth - d.clientWidth, desborda: Math.round(tabla.scrollWidth - marco.clientWidth), ox: getComputedStyle(marco).overflowX,
             pegada: getComputedStyle(document.querySelector(".ba-t thead th")).position, toques, cortados,
             kp: [...document.querySelectorAll(".ba-kp > div")].map((e) => Math.round(r(e).width)), kpTops: [...document.querySelectorAll(".ba-kp > div")].map((e) => Math.round(r(e).top)) };
  });
  const minToque = Math.min(...m.toques.filter((t) => !/ba-chk/.test(t.c)).map((t) => t.h));
  console.log(String(ancho).padEnd(7), String(m.lado).padEnd(5), String(m.desborda).padEnd(15), String(minToque).padEnd(12), m.pegada);
  ok(m.lado <= 0, `${etiq}: la página se va ${m.lado}px de lado`);
  ok(m.ox === "auto" || m.ox === "scroll", `${etiq}: la tabla debe desplazarse dentro de su caja`);
  ok(m.pegada === "sticky", `${etiq}: la cabecera no se queda pegada`);
  ok(m.cortados.length === 0, `${etiq}: textos cortados: ${m.cortados.join(", ")}`);
  if (ancho <= 760) {
    const flojos = m.toques.filter((t) => t.h < 44 && !/ba-busca/.test(t.c)).map((t) => `${t.c}=${t.h}`);
    ok(flojos.length === 0, `${etiq}: tocables de menos de 44 px: ${[...new Set(flojos)].join(", ")}`);
    ok(m.desborda > 0 || ancho >= 900, `${etiq}: la tabla corta debería desbordar su caja en el celular`);
  } else {
    const flojos = m.toques.filter((t) => t.h < 32 && !/ba-chk/.test(t.c)).map((t) => `${t.c}=${t.h}`);
    ok(flojos.length === 0, `${etiq}: tocables de menos de 32 px: ${[...new Set(flojos)].join(", ")}`);
  }
  if (ancho >= 1440) ok(m.kp.every((w) => w > 250) && m.kpTops.every((t) => t === m.kpTops[0]), `${etiq}: las cuatro cifras deben ir en una sola fila`);
}

/* ===== 14 · contraste en los siete temas ===== */
const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number); return c.startsWith("color(") ? n.map((v) => v * 255) : n };
const razon = (a, b) => { const lum = (c) => { const [r, g, bl] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl };
  const L1 = lum(a), L2 = lum(b); return +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2) };
console.log("\ntema      ficha  pestaña  tipo  prim  pasado  porpasar  reempl  azul-kp  celda  rol");
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta({ puede: true, tema: t });
  const m = await pg.evaluate(() => {
    const sube = (e) => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255, 255, 255)" };
    const par = (sel) => { const e = document.querySelector(sel); return e ? { txt: getComputedStyle(e).color, fondo: sube(e) } : null };
    return {
      ficha: par(".ba-ch.on .ba-ch-cod"), fichaOff: null, pestania: par(".ba-tabs button.on"), tipo: par(".ba-seg button.on"), prim: par(".ba-prim"),
      pasado: par(".ba-t .ba-pas"), porPasar: par(".ba-t .ba-pen"), reempl: par(".ba-t .ba-reemplazo"), azul: par(".ba-kp .az b"), celda: par(".ba-t tbody tr td"),
      th: par(".ba-t thead button"), sub: par(".ba-sub"), cnt: par(".ba-cnt"), pie: par(".ba-pie"), dl: par(".ba-dl"),
    };
  });
  const nombre = t ?? "oficial";
  const c = {};
  for (const [k, v] of Object.entries(m)) { if (!v) { if (k !== "fichaOff") fallas.push(`tema ${nombre}: no se pinta «${k}»`); continue } c[k] = razon(v.txt, v.fondo) }
  console.log(nombre.padEnd(9) + ["ficha", "pestania", "tipo", "prim", "pasado", "porPasar", "reempl", "azul", "celda", "th"].map((k) => String(c[k]).padStart(6) + "  ").join(""));
  for (const [k, v] of Object.entries(c)) if (v < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo 4.5)`);
}

ok(roto.length === 0, "errores de la página: " + roto.join(" | "));
await nav.close();
if (fallas.length) { console.log("\n✗ " + fallas.length + " falla(s):\n - " + fallas.join("\n - ")); process.exit(1) }
console.log("\n✓ La base nueva: fichas, cruce, cifras, Estado, marcar PASADO, administrador, tabla corta/completa, Excel, consolidado, borradores, paginado, 4 anchos y 7 temas.");
