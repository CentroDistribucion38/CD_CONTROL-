/* =====================================================================
   ACCIONES · CORREGIR Y ELIMINAR (solo quien administra) — el panel de
   evidencia de verdad, en Chromium.

   «Que el súper admin pueda eliminar alguna que generó, editar, y así.»

   SE COMPRUEBA:
   1. sin ser administrador no aparece nada de esto;
   2. «Corregir la acción» abre el formulario con lo que hoy dice la
      acción, y guardar manda accion_editar con lo que se cambió;
   3. «Anular» pide el motivo y sin motivo no deja; manda accion_anular;
   4. «Eliminar» pide motivo, pregunta antes, y manda accion_eliminar;
   5. si el SQL no se ha corrido, lo dice con el nombre del archivo;
   6. en 1200 y 390 nada se sale y lo que se toca mide ≥ 42.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-ad.ts"), `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });
export const useSearchParams = () => new URLSearchParams("");`);
writeFileSync(R(".arnes/_supa-ad.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).rpcs = [...((window as any).rpcs ?? []), { f, a }];
    return { error: (window as any).falla ? { message: (window as any).falla } : null };
  },
});`);
writeFileSync(R(".arnes/_ad-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Evidencia } from "../src/app/(app)/acciones/Evidencia";
const accion = {
  id: "a1", codigo: "AC-0007", tipo: "correctiva", titulo: "Pasillo obstruido",
  descripcion: "Estibas en la mitad del pasillo 3", motivo: "orden", motivo_nombre: "Orden y aseo",
  motivo_critico: false, area: "almacenamiento", area_nombre: "Almacenamiento", zona: null, zona_nombre: null,
  zona_proceso: null, ubicacion: "pasillo 3", lat: null, lng: null, precision_m: null, prioridad: "media",
  plazo: null, vence_en: "2026-09-20T12:00:00Z", estado: "abierta", viva: true, vencida: true,
  horas_restantes: -50, dias: 2, equipo: null, responsable: null, reportada_por: "u1",
  reportada_en: "2026-09-18T12:00:00Z", fotos: 0,
};
const areas = [{ clave: "almacenamiento", nombre: "Almacenamiento" }, { clave: "despacho", nombre: "Despacho" }];
createRoot(document.getElementById("r")!).render(
  <div className="ac">
    <Evidencia accion={accion as any} puedeEditar={true} manda={(window as any).MANDA} areas={areas} />
  </div>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ad-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-ad.ts"), "@/lib/supabase/client": R(".arnes/_supa-ad.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/acciones/acciones.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
/* La evidencia se pide por HTTP: se contesta con fotos y un hilo vacíos. */
await pg.route("**/*", (r) => r.request().url().includes("/api/acciones/evidencia/")
  ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fotos: [], hilo: [], nombres: {} }) })
  : r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }));
const monta = async (ancho = 1200, manda = true) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/acciones");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main" id="m"><div id="r"></div></main></div></div>
    <script>window.MANDA=${manda};window.rpcs=[];</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".ev");
};
const rpcs = () => pg.evaluate(() => window.rpcs);

/* 1 · SIN SER ADMINISTRADOR */
await monta(1200, false);
ok(!(await pg.$(".ev-admin")), "sin administrar aparece el bloque de administración");

/* 2 · CORREGIR */
await monta();
ok(await pg.isVisible(".ev-admin"), "el administrador no ve el bloque");
await pg.click('.ev-admin button:has-text("Corregir la acción")');
ok(await pg.inputValue('.ev-ed input') === "Pasillo obstruido", "el formulario no llega con el título de hoy");
await pg.fill(".ev-ed input", "Pasillo obstruido en el 3");
await pg.selectOption('.ev-ed select >> nth=0', "despacho");
await pg.selectOption('.ev-ed select >> nth=1', "alta");
await pg.click('.ev-ed button:has-text("Guardar la corrección")');
await pg.waitForFunction(() => (window.rpcs ?? []).length > 0);
let r = (await rpcs()).at(-1);
ok(r.f === "accion_editar" && r.a.p_titulo === "Pasillo obstruido en el 3" && r.a.p_area === "despacho" && r.a.p_prioridad === "alta",
   `corregir no manda lo que se cambió: ${JSON.stringify(r)}`);

/* 3 · ANULAR */
await monta();
await pg.click('.ev-admin button:has-text("Anular")');
ok(await pg.isDisabled('.ev-motivo button.si'), "se puede anular sin motivo");
await pg.fill(".ev-motivo input", "se reportó por error");
await pg.click('.ev-motivo button.si');
await pg.waitForFunction(() => (window.rpcs ?? []).length > 0);
r = (await rpcs()).at(-1);
ok(r.f === "accion_anular" && r.a.p_motivo === "se reportó por error", `anular: ${JSON.stringify(r)}`);

/* 4 · ELIMINAR: pregunta antes */
await monta();
await pg.click('.ev-admin button:has-text("Eliminar")');
await pg.fill(".ev-motivo input", "era una prueba");
await pg.click('.ev-motivo button.mal');
await pg.waitForSelector(".cf-caja");
ok(/no se puede deshacer/i.test(await pg.textContent(".cf-caja")), "no advierte que no hay vuelta atrás");
await pg.click(".cf-caja .cf-btn:not(.plano)");
await pg.waitForFunction(() => (window.rpcs ?? []).length > 0);
r = (await rpcs()).at(-1);
ok(r.f === "accion_eliminar" && r.a.p_ids.length === 1 && r.a.p_motivo === "era una prueba", `eliminar: ${JSON.stringify(r)}`);

/* 5 · SIN EL SQL, LO DICE */
await monta();
await pg.evaluate(() => { window.falla = "Could not find the function public.accion_eliminar in the schema cache" });
await pg.click('.ev-admin button:has-text("Anular")');
await pg.fill(".ev-motivo input", "por error");
await pg.click('.ev-motivo button.si');
await pg.waitForSelector(".av.mal");
ok(/2026-09-acciones-depurar\.sql/.test(await pg.textContent("#r")), "no dice qué SQL falta");

/* 6 · ANCHOS */
for (const ancho of [1200, 390]) {
  await monta(ancho);
  await pg.click('.ev-admin button:has-text("Corregir la acción")');
  const m = await pg.evaluate(() => {
    const caja = document.querySelector("#r").getBoundingClientRect();
    const salen = [...document.querySelectorAll(".ev-admin *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
    }).map((e) => (e.className || e.tagName).toString().split(" ")[0]);
    const chicos = [...document.querySelectorAll(".ev-admin button, .ev-admin input, .ev-admin select")]
      .map((e) => [Math.round(e.getBoundingClientRect().height), (e.textContent || e.tagName).trim().slice(0, 14)])
      .filter(([h]) => h < 42);
    return { lado: document.documentElement.scrollWidth - document.documentElement.clientWidth, salen: [...new Set(salen)], chicos };
  });
  ok(m.lado <= 0, `${ancho}: la página se arrastra ${m.lado} px`);
  ok(!m.salen.length, `${ancho}: se sale ${m.salen.join(", ")}`);
  ok(!m.chicos.length, `${ancho}: se toca y mide menos de 42: ${JSON.stringify(m.chicos)}`);
  if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/ac-depurar-${ancho}.png` });
}
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Acciones: quien administra corrige la acción, la anula con motivo y la elimina preguntando antes; el resto no ve nada; 1200/390.");
