/* =====================================================================
   ROTURA · VARIAS LÍNEAS EN UN SOLO ENVÍO.

   «Relaciono la línea 1 y cuando pase a la 2 y vuelva a la 1 no se
   borre, y cuando le dé a enviar todo se genere en un solo informe.»

   SE COMPRUEBA, con la pantalla de verdad en Chromium:
   1. lo escrito en la línea 1 sigue ahí al volver de la línea 4;
   2. cambiar de envase o de turno tampoco borra lo de la combinación
      anterior, y cada una guarda lo suyo;
   3. abajo se ve lo que está escrito y sin enviar, de todas las líneas,
      con su total, y la × lo bota;
   4. «Enviar todo (N)» manda una pesada por combinación —con su línea,
      su turno, su envase y sus máquinas— y después abre la hoja del día
      UNA sola vez (?hoja=1);
   5. un turno firmado no se envía: avisa y no manda nada;
   6. en 1200, 390 y 360 nada se sale y lo que se toca mide ≥ 44.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-rv.ts"), `export const useRouter = () => ({ refresh() {}, push() {},
  replace(u: string) { (window as any).idas = [...((window as any).idas ?? []), u] } });
export const useSearchParams = () => new URLSearchParams("");`);
writeFileSync(R(".arnes/_supa-rv.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).rpcs = [...((window as any).rpcs ?? []), { f, a }];
    return { error: (window as any).falla?.(a) ?? null };
  },
});`);
writeFileSync(R(".arnes/_rv-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Rejilla } from "../src/app/(app)/quiebra/rotura/Rejilla";
const L = (linea: number) => ({ linea, tren: "", centro_coste: "", activo: true, orden: linea });
const M = (item: number, nombre: string, orden: number) => ({ item, nombre, activo: true, orden });
const maquinas = [M(9,"DESEMPACADORA",1), M(12,"LAVADORA",2), M(13,"PASTEURIZADORA",3), M(10,"EMPACADORA",4)];
const envases = [{ material: "3500005", descripcion: "Envase Costeñita 175R", peso_kg: 0.2, activo: true, orden: 1 },
                 { material: "400733", descripcion: "Envase Marron 330NR", peso_kg: 0.25, activo: true, orden: 2 }];
const firmas = [{ linea: 6, turno: 2, firmado_nombre: "Ana", firmado_en: "2026-09-21T10:00:00Z",
                  firmadas: 100, unidades_hoy: 100, cambio_despues: false, nota: null }];
createRoot(document.getElementById("r")!).render(
  <div className="rl-marco">
    <Rejilla fecha="2026-09-21" lineas={[L(1),L(2),L(4),L(6)] as any} maquinas={maquinas as any}
             envases={envases as any} pesadas={[] as any} firmas={firmas as any} turnoAhora={2}
             puedeEditar={true} esAdmin={false} />
  </div>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_rv-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-rv.ts"), "@/lib/supabase/client": R(".arnes/_supa-rv.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/quiebra/rotura/rotura.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ancho = 1200) => {
  await pg.setViewportSize({ width: ancho, height: 820 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="rl" id="r"></div></main></div></div><script>${js}</script></body></html>`);
  await pg.waitForSelector(".rl-escoger");
  await pg.evaluate(() => { window.rpcs = []; window.idas = [] });
};
const linea = (n) => pg.click(`.rl-escoger .rl-seg:not(.turnos) button:text-is("${n}")`);
const turno = (l) => pg.click(`.rl-seg.turnos button:has(b:text-is("${l}"))`);
const envase = async (i) => { await pg.click(".rl-disparo"); await pg.click(`.rl-rollo button:nth-child(${i})`) };
const kg = (maq, v) => pg.fill(`.rl-tabla input[aria-label="Kilos en ${maq}"]`, v);
const lee = (maq) => pg.$eval(`.rl-tabla input[aria-label="Kilos en ${maq}"]`, (i) => i.value);
const chips = () => pg.$$eval(".rl-borr-chip", (l) => l.map((c) => c.textContent.replace(/\s+/g, " ").trim()));
const boton = () => pg.textContent(".rl-pie-reg .rl-btn.si");

/* 1 · LA 1, LA 4, Y DE VUELTA A LA 1 */
await monta();
await envase(1);
await kg("DESEMPACADORA", "10");
await kg("LAVADORA", "5,5");
await linea(4);
ok(await lee("DESEMPACADORA") === "", "al pasar a la línea 4 la rejilla llega con lo de la 1");
await envase(2);
await kg("PASTEURIZADORA", "20");
await linea(1);
ok(await lee("DESEMPACADORA") === "10" && await lee("LAVADORA") === "5,5",
   `lo de la línea 1 se borró al volver: ${await lee("DESEMPACADORA")} · ${await lee("LAVADORA")}`);
await linea(4);
ok(await lee("PASTEURIZADORA") === "20", "lo de la línea 4 se borró");

/* 2 · OTRO TURNO DE LA MISMA LÍNEA ES OTRA PESADA */
await turno("C");
ok(await lee("PASTEURIZADORA") === "", "el turno C llega con los kilos del turno B");
await kg("EMPACADORA", "8");
await turno("B");
ok(await lee("PASTEURIZADORA") === "20", "volver al turno B perdió lo escrito");

/* 3 · LO QUE ESTÁ ESCRITO Y SIN ENVIAR */
let c = await chips();
ok(c.length === 3, `el borrador enseña ${c.length} pesadas y son 3: ${c.join(" | ")}`);
ok(c.some((x) => /Línea 1 · B/.test(x) && /78 und/.test(x)), `falta la de la línea 1 con sus unidades: ${c.join(" | ")}`);
ok(c.some((x) => /Línea 4 · C/.test(x)), `falta la del turno C: ${c.join(" | ")}`);
ok(/3 pesadas · líneas 1, 4/.test(await pg.textContent(".rl-pie-cuenta")), `la barra no resume las líneas: ${await pg.textContent(".rl-pie-cuenta")}`);
ok(/Enviar todo \(3\)/.test(await boton()), `el botón no dice cuántas van: ${await boton()}`);

/* la × bota solo esa */
await pg.click('.rl-borr-chip:has-text("Línea 4 · C") .rl-borr-x');
c = await chips();
ok(c.length === 2 && !c.some((x) => /· C/.test(x)), `la × no botó la del turno C: ${c.join(" | ")}`);

/* 4 · ENVIAR TODO: una pesada por combinación y UNA sola hoja */
await pg.click(".rl-pie-reg .rl-btn.si");
await pg.waitForFunction(() => (window.rpcs ?? []).length >= 2);
const r = await pg.evaluate(() => window.rpcs);
ok(r.length === 2 && r.every((x) => x.f === "rotlinea_guardar"), `se mandaron ${r.length} llamadas: ${JSON.stringify(r).slice(0, 200)}`);
const uno = r.find((x) => x.a.p_linea === 1), cuatro = r.find((x) => x.a.p_linea === 4);
ok(uno && uno.a.p_turno === 2 && uno.a.p_envase === "3500005" && uno.a.p_kilos.length === 2,
   `la de la línea 1 no lleva lo suyo: ${JSON.stringify(uno?.a)}`);
ok(cuatro && cuatro.a.p_envase === "400733" && cuatro.a.p_kilos[0].kg === 20,
   `la de la línea 4 no lleva lo suyo: ${JSON.stringify(cuatro?.a)}`);
const idas = await pg.evaluate(() => window.idas);
ok(idas.length === 1 && /hoja=1/.test(idas[0]), `la hoja del día no se abre una sola vez: ${JSON.stringify(idas)}`);
ok(!(await pg.$(".rl-borr")), "después de enviar sigue el borrador en pantalla");

/* 5 · UN TURNO FIRMADO NO SE ENVÍA */
await monta();
await linea(6); await turno("B");
ok(await pg.isVisible(".rl-firmado"), "la línea 6 turno B debería salir firmada");
await linea(1); await envase(1); await kg("DESEMPACADORA", "4");
await linea(6); await turno("C");
await envase(1); await kg("LAVADORA", "9");
await turno("B");
/* con el turno firmado la rejilla no se puede llenar, pero lo del C sigue pendiente */
ok((await chips()).length === 2, `el borrador no guarda lo de la línea 6 turno C: ${(await chips()).join(" | ")}`);

/* 6 · ANCHOS */
for (const ancho of [1200, 390, 360]) {
  await pg.setViewportSize({ width: ancho, height: 820 });
  await pg.waitForTimeout(60);
  const m = await pg.evaluate(() => {
    const caja = document.querySelector(".rl").getBoundingClientRect();
    const salen = [...document.querySelectorAll(".rl-borr *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
    }).map((e) => (e.className || e.tagName).toString().split(" ")[0]);
    const chicos = [...document.querySelectorAll(".rl-borr button")]
      .map((e) => [Math.round(e.getBoundingClientRect().height), (e.textContent || "").trim().slice(0, 12)])
      .filter(([h]) => h < 44);
    return { lado: document.documentElement.scrollWidth - document.documentElement.clientWidth, salen: [...new Set(salen)], chicos };
  });
  ok(m.lado <= 0, `${ancho}: la página se arrastra ${m.lado} px de lado`);
  ok(!m.salen.length, `${ancho}: del borrador se sale ${m.salen.join(", ")}`);
  ok(!m.chicos.length, `${ancho}: en el borrador se toca y mide menos de 44: ${JSON.stringify(m.chicos)}`);
  if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/rl-varias-${ancho}.png`, fullPage: ancho !== 1200 });
}
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Rotura, varias líneas: lo escrito se queda al cambiar de línea, turno o envase; el borrador las enseña todas con su total; «Enviar todo» manda una pesada por combinación y abre una sola hoja del día; un turno firmado avisa; 1200/390/360.");
