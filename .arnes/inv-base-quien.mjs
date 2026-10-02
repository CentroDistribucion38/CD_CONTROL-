/* =====================================================================
   LA BASE · FILTRAR POR QUIÉN CONTÓ.
   «Quiero poder filtrar por todas las personas que están haciendo los conteos, una a una, o
   solo lo de una persona.» Cubre: un botón por persona (también la que tiene el recorrido
   abierto pero aún sin renglones, con «0»), «Todas», escoger una o varias, que los números
   sigan a los demás filtros, que el Excel baje lo que se ve, y 4 anchos sin arrastre lateral.
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_bq-cliente.ts"), `
const w = window as any;
w.__llamadas = [];
export function createClient() { return { rpc: async (fn: string, args: any) => { w.__llamadas.push({ fn, args });
  if (w.__falla && fn === w.__fallaFn) return { data: null, error: { message: w.__falla } };
  if (fn === "conteo_fefo_lineas_eliminar") return { data: [{ codigo: "FEFO-20261001-03", eliminados: args.p_lineas.length, quedan: 1 }], error: null };
  if (fn === "conteo_fefo_marcar_pasado") return { data: args.p_lineas.length, error: null };
  return { data: null, error: null } } } }`);
writeFileSync(R(".arnes/_bq-nav.ts"), `export const useRouter = () => ({ refresh() { (window as any).__refresh++ }, push() {}, replace() {} });`);
writeFileSync(R(".arnes/_bq-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Base } from "../src/app/(app)/inventario/base/Base";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Base enviadas={w.ENVIADAS} abiertas={w.ABIERTAS} conteos={w.CONTEOS} tope={!!w.TOPE}
  manda={w.MANDA} bodega="CD38" uxc={w.UXC} pasados={w.PASADOS} pasadosOk={w.PASADOS_OK !== false} puedeMarcar={w.PUEDE} />);`);
const js = buildSync({ entryPoints: [R(".arnes/_bq-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_bq-cliente.ts"), "next/navigation": R(".arnes/_bq-nav.ts"), "@": R("src") },
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
await pg.addInitScript(() => {
  window.__bajados = []; window.__pedidos = [];
  const crea = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { b.text().then((t) => window.__bajados.push({ tipo: b.type, texto: t })); return crea(b) };
  const f = window.fetch;
  window.fetch = async (u) => { window.__pedidos.push(String(u)); return new Response(new Blob(["x"]), { status: 200 }) };
});
const monta = async ({ conteos = CONTEOS, manda = false, puede = false, ancho = 1440, enviadas = ENVIADAS, abiertas = [AB], pasados = PASADOS, pasadosOk = true, tema = null, tope = false } = {}) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("about:blank");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}${css}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div>
    <script>window.CONTEOS=${JSON.stringify(conteos)};window.ENVIADAS=${JSON.stringify(enviadas)};window.ABIERTAS=${JSON.stringify(abiertas)};window.MANDA=${manda};window.PUEDE=${puede};window.UXC=${JSON.stringify(UXC)};window.PASADOS=${JSON.stringify(pasados)};window.PASADOS_OK=${pasadosOk};window.TOPE=${tope};window.__llamadas=[];window.__refresh=0;</script><script>${js}<\/script></body></html>`);
  await pg.waitForSelector(".ba");
};
/* El Excel que se baja: se atrapa la descarga de verdad y se abre con exceljs. */
const ExcelJS = (await import("exceljs")).default;
const bajaXlsx = async (sel) => {
  const [d] = await Promise.all([pg.waitForEvent("download", { timeout: 20000 }), pg.click(sel)]);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await d.path());
  const h = wb.worksheets[0];
  const filas = []; h.eachRow({ includeEmpty: false }, (r, n) => { if (n >= 6) filas.push(r.values.slice(1).map((v) => (v && typeof v === "object" && "result" in v ? v.result : v))) });
  return { nombre: d.suggestedFilename(), hoja: h, titulo: h.getCell(3, 1).value, sub: h.getCell(4, 1).value, filas };
};
const txt = async (sel) => ((await pg.locator(sel).first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
const filas = () => pg.locator(".ba-t tbody tr");
const celdas = async (i) => (await filas().nth(i).locator("td").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
const kp = async () => (await pg.locator(".ba-kp > div b").allTextContents());
const llamadas = (fn) => pg.evaluate((f) => window.__llamadas.filter((c) => c.fn === f), fn);


/* ===== los datos: cuatro personas con un recorrido abierto, una sin renglones todavía ===== */
const ABIERTOS = [
  C("a1", "FEFO-20261002-05", "en_proceso", "2026-10-02", null, "JeremyGriego", 3),
  C("a2", "FEFO-20261002-04", "en_proceso", "2026-10-02", null, "Cristian_A", 2),
  C("a3", "FEFO-20261002-03", "borrador", "2026-10-02", null, "Cañizares", 1),
  C("a4", "FEFO-20261002-06", "en_proceso", "2026-10-02", null, "YuranisCastro", 0),
  C("a5", "FEFO-20261002-07", "en_proceso", "2026-10-02", null, "JeremyGriego", 1),
];
const RA = (conteo, cod, ubic, uid, sku, mat, tipo, est, tot) => L(conteo, cod, ubic, uid, sku, mat, tipo, est, tot, { estado: "en_proceso" });
const ABIERTAS2 = [
  RA("a1", "FEFO-20261002-05", "A01_DER", "u1", "3500231", "Envase Costeñita 175R", "ENVASE", 4, 216),
  RA("a1", "FEFO-20261002-05", "A02_DER", "u2", "3500231", "Envase Costeñita 175R", "ENVASE", 5, 270),
  RA("a1", "FEFO-20261002-05", "A03_IZQ", "u3", "3128", "Águila RN 330cc X30", "PRODUCTO", 6, 324),
  RA("a2", "FEFO-20261002-04", "B01_DER", "u4", "3128", "Águila RN 330cc X30", "PRODUCTO", 2, 108),
  RA("a2", "FEFO-20261002-04", "B02_DER", "u5", "3500102", "Envase Águila 330R", "ENVASE", 3, 162),
  RA("a3", "FEFO-20261002-03", "C01_IZQ", "u6", "3128", "Águila RN 330cc X30", "PRODUCTO", 7, 378),
  RA("a5", "FEFO-20261002-07", "D01_DER", "u7", "3500887", "BOTELLA FLINT 1000R", "ENVASE", 9, 486),
];
const botones = async () => (await pg.locator(".ba-qn").evaluateAll((es) => es.map((e) => e.textContent.replace(/\s+/g, " ").trim())));
const on = async () => (await pg.locator(".ba-qn.on").evaluateAll((es) => es.map((e) => e.firstChild.textContent.trim())));
const nombres = async () => { const r = await pg.locator(".ba-t tbody tr").evaluateAll((es) => es.map((e) => e.querySelector(".ba-rec")?.textContent.replace(/\s+/g, " ").trim() ?? "")); return r; };

/* ===== 1 · en Borradores: un botón por persona, con su cuenta ===== */
await monta({ conteos: [...CONTEOS.filter((c) => c.estado === "cerrado"), ...ABIERTOS], abiertas: ABIERTAS2 });
ok(await pg.locator(".ba-quien").count() === 1, "la fila de personas sale");
await pg.click('.ba-tabs button:has-text("Borradores")');
ok(/Está contando/.test(await txt(".ba-quien")), "en Borradores dice «Está contando»: " + await txt(".ba-quien"));
let b = await botones();
ok(JSON.stringify(b) === JSON.stringify(["Todas7", "Cañizares1", "Cristian_A2", "JeremyGriego4"]), "un botón por persona (Jeremy junta sus dos recorridos; Yuranis, con el recorrido abierto pero sin renglones, NO sale): " + JSON.stringify(b));
ok(JSON.stringify(await on()) === JSON.stringify(["Todas"]), "arranca en «Todas»: " + JSON.stringify(await on()));
ok(await filas().count() === 7, "sin filtro hay 7 renglones: " + await filas().count());

/* ===== 2 · una persona ===== */
await pg.click('.ba-qn:has-text("Cristian_A")');
ok(await filas().count() === 2 && (await nombres()).every((t) => /Cristian_A/.test(t)), "solo lo de Cristian_A: " + JSON.stringify(await nombres()));
ok(JSON.stringify(await on()) === JSON.stringify(["Cristian_A"]) && /Mostrando 2 renglones de 7/.test(await txt(".ba-th")), "queda marcado solo él y la tabla lo dice: " + await txt(".ba-th"));
ok(/Quitar filtros/.test(await txt(".ba-barra")), "con una persona escogida aparece «Quitar filtros»");
/* Los números de cada persona NO cambian al escoger a otra (no se esconden los demás). */
b = await botones();
ok(JSON.stringify(b) === JSON.stringify(["Todas7", "Cañizares1", "Cristian_A2", "JeremyGriego4"]), "los botones siguen mostrando a todos: " + JSON.stringify(b));

/* ===== 3 · varias, una a una ===== */
await pg.click('.ba-qn:has-text("Cañizares")');
ok(await filas().count() === 3 && JSON.stringify(await on()) === JSON.stringify(["Cañizares", "Cristian_A"]), "dos personas juntas: " + JSON.stringify(await on()) + " " + await filas().count());
await pg.click('.ba-qn:has-text("Cristian_A")');
ok(await filas().count() === 1 && JSON.stringify(await on()) === JSON.stringify(["Cañizares"]), "se quita una y queda la otra");
await pg.click('.ba-qn:has-text("Cañizares")');
ok(await filas().count() === 7 && JSON.stringify(await on()) === JSON.stringify(["Todas"]), "sin ninguna escogida vuelven todas");

/* ===== 4 · un recorrido abierto SIN renglones no es un borrador: no sale en ningún lado ===== */
const aviso = await txt(".ba-dice.ojo");
ok(!/YuranisCastro|FEFO-20261002-06/.test(aviso) && /Cañizares/.test(aviso) && /JeremyGriego/.test(aviso), "el aviso no nombra a quien no tiene renglones: " + aviso);
const opciones = await pg.locator(".ba-sel select").first().locator("option").allTextContents();
ok(!opciones.some((t) => /-06/.test(t)) && opciones.some((t) => /-05/.test(t)), "el desplegable de recorridos no lista el vacío: " + JSON.stringify(opciones));
ok(!/Yuranis/.test(await txt(".ba-quien")), "tampoco hay botón de Yuranis");
await pg.click('.ba-qn:has-text("Cañizares")');
ok(/Quitar filtros/.test(await txt(".ba-barra")), "con una persona escogida aparece «Quitar filtros»");
await pg.click(".ba-sec:has-text('Quitar filtros')");
ok(await filas().count() === 7 && JSON.stringify(await on()) === JSON.stringify(["Todas"]), "«Quitar filtros» limpia también a las personas");

/* ===== 5 · los números siguen a los demás filtros ===== */
await pg.click('.ba-seg button:has-text("Envase")');
b = await botones();
ok(JSON.stringify(b) === JSON.stringify(["Todas4", "Cañizares0", "Cristian_A1", "JeremyGriego3"]), "con «Envase» cada persona cuenta solo sus envases: " + JSON.stringify(b));
await pg.click('.ba-seg button:has-text("Todo")');

/* ===== 6 · lo que se baja a Excel es lo que se ve ===== */
await pg.click('.ba-qn:has-text("JeremyGriego")');
const xl = await bajaXlsx('.ba-acc button:has-text("Bajar esta vista")');
const ubs = xl.filas.slice(1, -1).map((f) => f[xl.filas[0].indexOf("Ubicación")]).join(",");
ok(/A01_DER/.test(ubs) && /D01_DER/.test(ubs) && !/B01_DER/.test(ubs) && !/C01_IZQ/.test(ubs) && xl.filas.length === 1 + 4 + 1, "el Excel baja solo lo de Jeremy: " + ubs);
ok(/^conteo-borradores-.*\.xlsx$/.test(xl.nombre) && /Borradores/.test(String(xl.titulo)) && /sin enviar · hoy/.test(String(xl.sub)), "el Excel de borradores dice que son borradores: " + xl.nombre + " | " + xl.sub);

/* ===== 7 · al cambiar de pestaña se limpia, y en La base lee «Envió» ===== */
await pg.click('.ba-tabs button:has-text("La base")');
ok(/Envió/.test(await txt(".ba-quien")) && JSON.stringify(await on()) === JSON.stringify(["Todas"]), "en La base dice «Envió» y arranca en «Todas»: " + await txt(".ba-quien"));
b = await botones();
ok(b.includes("Contador B2") || b.some((t) => /Contador B/.test(t)), "en La base salen quienes ENVIARON: " + JSON.stringify(b));

/* ===== 8 · 4 anchos: sin arrastre y lo que se toca mide 44 en el celular ===== */
for (const ancho of [1440, 1024, 390, 360]) {
  await monta({ conteos: [...CONTEOS.filter((c) => c.estado === "cerrado"), ...ABIERTOS], abiertas: ABIERTAS2, ancho });
  await pg.click('.ba-tabs button:has-text("Borradores")');
  const m = await pg.evaluate(() => ({ d: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    min: Math.min(...[...document.querySelectorAll(".ba-qn")].map((e) => e.getBoundingClientRect().height)),
    fuera: [...document.querySelectorAll(".ba-qn")].some((e) => e.getBoundingClientRect().right > innerWidth + 1) }));
  ok(m.d <= 0 && !m.fuera, `a ${ancho}px la fila de personas no arrastra la página: ${JSON.stringify(m)}`);
  if (ancho <= 390) ok(m.min >= 44, `a ${ancho}px los botones de personas miden 44: ${m.min}`);
}

ok(roto.length === 0, "errores de la página: " + roto.join(" | "));
await nav.close();
if (fallas.length) { console.log("✗ " + fallas.length + " falla(s):\n - " + fallas.join("\n - ")); process.exit(1) }
console.log("✓ La base por persona: un botón por quien cuenta una o varias, sigue a los demás filtros, el Excel baja lo que se ve, y cabe en 4 anchos.");
