/* =====================================================================
   TRASPASOS · QUÉ CUENTA EN EL CUMPLIMIENTO — la pantalla de registrar,
   de verdad, en Chromium.

   «Validación en los viajes de estibas: solo para Arenosa cuenta en el
   % cumplimiento. Tolvas de vidrio que no cuente.»

   SE COMPRUEBA:
   1. con Estibas escogido sale la pregunta «¿de Arenosa?» y sin
      contestarla no se puede registrar;
   2. «Sí» viaja como p_arenosa true; «No», false, y la pantalla dice
      que ese viaje no cuenta;
   3. con un tipo que no mide (Tolvas de vidrio) lo dice antes de
      registrar, y ese tipo no pregunta por Arenosa;
   4. al quitar Estibas, la pregunta se va y la respuesta no viaja;
   5. con un tipo cualquiera (Casco) no aparece nada de esto;
   6. en 1200, 390 y 360 no se sale nada y lo que se toca mide ≥ 44.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-ta.ts"), `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });
export const useSearchParams = () => new URLSearchParams("");`);
writeFileSync(R(".arnes/_supa-ta.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => { (window as any).rpcs = [...((window as any).rpcs ?? []), { f, a }]; return { error: null, data: null } },
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
});`);
writeFileSync(R(".arnes/_ta-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Registrar } from "../src/app/(app)/traspasos/Registrar";
const tipos = [
  { clave: "casco_vidrio", nombre: "Casco vidrio", activo: true, orden: 1, cuenta_plan: true, pregunta_arenosa: false },
  { clave: "estibas", nombre: "Estibas", activo: true, orden: 3, cuenta_plan: true, pregunta_arenosa: true },
  { clave: "tolvas_vidrio", nombre: "Tolvas de Vidrio", activo: true, orden: 10, cuenta_plan: false, pregunta_arenosa: false },
];
const puntos = [
  { clave: "fabrica", nombre: "FABRICA", externo: false, activo: true, orden: 1, descripcion: "Planta" },
  { clave: "bodega38", nombre: "BODEGA 38", externo: false, activo: true, orden: 2, descripcion: "Bodega propia" },
];
createRoot(document.getElementById("r")!).render(
  <Registrar tipos={tipos as any} puntos={puntos as any} placas={[{ placa: "FSV898", veces: 9 }]}
             placasM={[{ placa: "FSV898", nota: null, activo: true, orden: 1 }] as any}
             fecha="2026-09-22" turnoSugerido="A" planTurno={{ A: 10 }} hechosTurno={{ A: 6 }}
             planPorTipo={{}} viajes={[] as any} nombres={{}} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ta-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-ta.ts"), "@/lib/supabase/client": R(".arnes/_supa-ta.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/traspasos/traspasos.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ancho = 1200) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="tp" id="r"></div></main></div></div><script>${js}</script></body></html>`);
  await pg.waitForSelector(".tp .chips button");
  await pg.evaluate(() => { window.rpcs = [] });
};
const tipo = (n) => pg.click(`.tp .chips button:text-is("${n}")`);
const texto = () => pg.textContent(".tp");
const puedeRegistrar = async () => !(await pg.$eval(".tp .btn.si, .tp button.si", (b) => b.disabled).catch(() => true));
const llenarRuta = async () => {
  await pg.click('.tp [aria-label="De dónde sale"]');
  await pg.click(".tp .desple .rollo button:first-child");
  await pg.click('.tp [aria-label="A dónde va"]');
  await pg.click(".tp .desple .rollo button:first-child");
};

/* 1 · ESTIBAS PREGUNTA, Y SIN RESPUESTA NO SE REGISTRA */
await monta();
await tipo("Estibas");
ok(await pg.isVisible(".tr-arenosa"), "con Estibas no sale la pregunta de Arenosa");
ok(/salen de Arenosa o van para Arenosa/i.test(await texto()), "no dice por qué se pregunta");
await pg.click(`.tp .recientes button:text-is("FSV898")`);
await llenarRuta();
ok(!(await puedeRegistrar()), "se puede registrar sin contestar lo de Arenosa");

/* 2 · SÍ Y NO */
await pg.click('.tr-arenosa button:has-text("No ·")');
ok(/no cuenta/i.test(await texto()), "con «No» no avisa que ese viaje no cuenta");
ok(await puedeRegistrar(), "con la respuesta puesta sigue bloqueado el registro");
await pg.click('.tr-arenosa button:has-text("Sí ·")');
ok(/Cuenta en el/i.test(await texto()), "con «Sí» no dice que cuenta");
await pg.click(".tp .btn.si, .tp button.si");
await pg.waitForFunction(() => (window.rpcs ?? []).length > 0);
let r = (await pg.evaluate(() => window.rpcs)).at(-1);
ok(r.f === "traspaso_registrar_varios" && r.a.p_arenosa === true, `el «Sí» no viaja: ${JSON.stringify(r.a)}`);

/* 3 · UN TIPO QUE NO MIDE */
await monta();
await tipo("Tolvas de Vidrio");
ok(!(await pg.isVisible(".tr-arenosa")), "las tolvas preguntan por Arenosa y no deben");
ok(/no cuenta.*en el plan ni en el % de cumplimiento/is.test(await texto()),
   "no avisa que las tolvas no cuentan en el cumplimiento");

/* 4 · QUITAR ESTIBAS BORRA LA RESPUESTA */
await monta();
await tipo("Estibas");
await pg.click('.tr-arenosa button:has-text("Sí ·")');
await tipo("Estibas");
ok(!(await pg.isVisible(".tr-arenosa")), "sin Estibas sigue la pregunta");
await tipo("Casco vidrio");
await pg.click(`.tp .recientes button:text-is("FSV898")`);
await llenarRuta();
await pg.click(".tp .btn.si, .tp button.si");
await pg.waitForFunction(() => (window.rpcs ?? []).length > 0);
r = (await pg.evaluate(() => window.rpcs)).at(-1);
ok(r.a.p_arenosa === false, `sin estibas viaja la respuesta vieja: ${JSON.stringify(r.a)}`);

/* 5 · UN TIPO CUALQUIERA NO ENSEÑA NADA DE ESTO */
await monta();
await tipo("Casco vidrio");
ok(!(await pg.isVisible(".tr-arenosa")) && !/no cuenta/i.test(await texto()),
   "con Casco vidrio aparece algo del cumplimiento y no debería");

/* 6 · ANCHOS */
await monta();
await tipo("Estibas");
for (const ancho of [1200, 390, 360]) {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.waitForTimeout(60);
  const m = await pg.evaluate(() => {
    const caja = document.querySelector(".tp").getBoundingClientRect();
    const salen = [...document.querySelectorAll(".tr-arenosa, .tr-arenosa *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
    }).map((e) => (e.className || e.tagName).toString().split(" ")[0]);
    const chicos = [...document.querySelectorAll(".tr-arenosa button")]
      .map((e) => [Math.round(e.getBoundingClientRect().height), (e.textContent || "").trim().slice(0, 14)])
      .filter(([h]) => h < 44);
    return { lado: document.documentElement.scrollWidth - document.documentElement.clientWidth, salen: [...new Set(salen)], chicos };
  });
  ok(m.lado <= 0, `${ancho}: la página se arrastra ${m.lado} px de lado`);
  ok(!m.salen.length, `${ancho}: se sale ${m.salen.join(", ")}`);
  ok(!m.chicos.length, `${ancho}: se toca y mide menos de 44: ${JSON.stringify(m.chicos)}`);
  if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/tp-arenosa-${ancho}.png` });
}
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Traspasos: Estibas pregunta si es de Arenosa y sin contestar no se registra; solo el «Sí» cuenta; las tolvas de vidrio avisan que no miden; 1200/390/360.");
