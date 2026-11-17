/* TRASPASOS · SKU + ESTIBAS DEL CASCO al registrar. */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_nav-tcs.ts"), `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });
export const useSearchParams = () => new URLSearchParams("");`);
writeFileSync(R(".arnes/_supa-tcs.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    const w = window as any; w.rpcs = [...(w.rpcs ?? []), { f, a }];
    if (f === "traspaso_casco_disponible") return { error: null, data: w.disp ?? [] };
    if (f === "traspaso_registrar_varios") return { error: null, data: [{ id: "viaje-1" }] };
    if (f === "traspaso_materiales_guardar") return { error: null, data: a.p_filas.length };
    return { error: null, data: null };
  },
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
});`);
writeFileSync(R(".arnes/_tcs-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Registrar } from "../src/app/(app)/traspasos/Registrar";
(window as any).disp = [
  { sku: "3500162", descripcion: "Envase Marron 330R", inventario: 32, apartado: 12, disponible: 20, hl_estiba: 44.55 },
  { sku: "3500888", descripcion: "Botella Marron 1000CC", inventario: 6, apartado: 0, disponible: 6, hl_estiba: 46.8 },
  { sku: "3500213", descripcion: "Envase Flint 330R", inventario: 4, apartado: 4, disponible: 0, hl_estiba: 44.55 },
];
const tipos = [
  { clave: "casco_vidrio", nombre: "Casco vidrio", activo: true, orden: 1, cuenta_plan: true, pregunta_arenosa: false, materiales: "casco" },
  { clave: "pet", nombre: "PET", activo: true, orden: 2, cuenta_plan: true, pregunta_arenosa: false, materiales: "pet" },
];
const puntos = [
  { clave: "bodega38", nombre: "BODEGA 38", externo: false, activo: true, orden: 1, descripcion: "AG22", casco_ubicacion: "BODEGA 38" },
  { clave: "carnaval", nombre: "CARNAVAL", externo: false, activo: true, orden: 2, descripcion: "AG07", casco_ubicacion: "CARNAVAL" },
  { clave: "arenosa", nombre: "ARENOSA", externo: true, activo: true, orden: 3, descripcion: "Externo", casco_ubicacion: null },
];
createRoot(document.getElementById("r")!).render(
  <Registrar tipos={tipos as any} puntos={puntos as any} placas={[{ placa: "FSV898", veces: 9 }]}
             placasM={[{ placa: "FSV898", nota: null, activo: true, orden: 1 }] as any}
             fecha="2026-11-17" turnoSugerido="A" planTurno={{ A: 10 }} hechosTurno={{ A: 6 }}
             planPorTipo={{}} viajes={[] as any} nombres={{}} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_tcs-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-tcs.ts"), "@/lib/supabase/client": R(".arnes/_supa-tcs.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/traspasos/traspasos.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
pg.on("pageerror", (e) => fallas.push("error: " + e.message));
const monta = async (ancho = 1200) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="tp" id="r"></div></main></div></div><script>${js}</script></body></html>`);
  await pg.waitForSelector(".tp .chips button");
  await pg.evaluate(() => { window.rpcs = [] });
};
const tipo = (n) => pg.click(`.tp .chips button:text-is("${n}")`);
const texto = () => pg.textContent(".tp");
const puede = async () => !(await pg.$eval(".tp .pie-reg .btn.si", (b) => b.disabled).catch(() => true));
const escoger = async (aria, txt) => { await pg.click(`.tp [aria-label="${aria}"]`); await pg.click(`.tp .desple .rollo button:has-text("${txt}")`) };

await monta();
await tipo("Casco vidrio");
await pg.click(`.tp .recientes button:text-is("FSV898")`);
ok(/Escoge primero de dónde sale/.test(await texto()), "sin origen no pide escoger el origen");
await escoger("De dónde sale", "BODEGA 38");
await escoger("A dónde va", "CARNAVAL");
await pg.waitForSelector(".tp .tp-mat-fila");
ok(!(await puede()), "deja registrar sin SKU");
await pg.click('.tp [aria-label="SKU del casco"]');
const ops = await pg.$$eval(".tp .desple .rollo button", (bs) => bs.map((b) => b.textContent));
ok(ops.some((o) => o.includes("3500162")) && ops.some((o) => o.includes("3500888")), "faltan SKU con inventario: " + ops.join("|"));
ok(!ops.some((o) => o.includes("3500213")), "sale un SKU sin nada para despachar");
await pg.click('.tp .desple .rollo button:has-text("3500162")');
await pg.fill('.tp [aria-label="Estibas"]', "25");
ok(await pg.isVisible(".tp .tp-mat-fila.mal"), "25 > 20 no sale en rojo");
ok(!(await puede()), "con 25 de 20 deja registrar");
await pg.screenshot({ path: "/tmp/tc-rojo.png", fullPage: true });
await pg.fill('.tp [aria-label="Estibas"]', "20");
ok(!(await pg.isVisible(".tp .tp-mat-fila.mal")), "20 de 20 sigue en rojo");
ok(/891 HL/.test(await texto()), "no muestra el HL (20 × 44,55 = 891)");
await pg.click(".tp .tp-mat-mas");
await pg.locator('.tp [aria-label="SKU del casco"]').nth(1).click();
const ops2 = await pg.$$eval(".tp .desple .rollo button", (bs) => bs.map((b) => b.textContent));
ok(!ops2.some((o) => o.includes("3500162")), "el SKU ya escogido se ofrece otra vez");
await pg.click('.tp .desple .rollo button:has-text("3500888")');
await pg.locator('.tp [aria-label="Estibas"]').nth(1).fill("2,5");
ok(await puede(), "con todo bien no deja registrar");
ok(!(await pg.isVisible('.tp [aria-label="Cuánto lleva de Casco vidrio"]')), "pide la cantidad del casco dos veces");
await pg.screenshot({ path: "/tmp/tc-bien.png", fullPage: true });
await pg.click(".tp .pie-reg .btn.si");
await pg.waitForFunction(() => (window.rpcs ?? []).some((r) => r.f === "traspaso_materiales_guardar"));
const rp = await pg.evaluate(() => window.rpcs);
const g = rp.find((r) => r.f === "traspaso_materiales_guardar");
ok(g.a.p_viaje === "viaje-1", "no amarra al viaje registrado");
ok(JSON.stringify(g.a.p_filas) === JSON.stringify([{ tipo: "casco_vidrio", sku: "3500162", estibas: 20 }, { tipo: "casco_vidrio", sku: "3500888", estibas: 2.5 }]), "filas mal: " + JSON.stringify(g.a.p_filas));
const orden = rp.map((r) => r.f);
ok(orden.indexOf("traspaso_registrar_varios") < orden.indexOf("traspaso_materiales_guardar"), "orden de llamadas: " + orden.join(","));
ok(orden.filter((f) => f === "traspaso_casco_disponible").length >= 1, "no relee el disponible antes de registrar");
const rv = rp.find((r) => r.f === "traspaso_registrar_varios");
ok(rv.a.p_tipos[0].cantidad === 23, "la cantidad del tipo no sale del material: " + JSON.stringify(rv.a.p_tipos));

/* otro supervisor apartó entre tanto: relee y no deja */
await monta();
await tipo("Casco vidrio");
await pg.click(`.tp .recientes button:text-is("FSV898")`);
await escoger("De dónde sale", "BODEGA 38"); await escoger("A dónde va", "CARNAVAL");
await pg.waitForSelector(".tp .tp-mat-fila");
await pg.click('.tp [aria-label="SKU del casco"]'); await pg.click('.tp .desple .rollo button:has-text("3500162")');
await pg.fill('.tp [aria-label="Estibas"]', "20");
await pg.evaluate(() => { window.disp[0].disponible = 8 });
await pg.click(".tp .pie-reg .btn.si");
await pg.waitForTimeout(300);
const rp2 = await pg.evaluate(() => window.rpcs.map((r) => r.f));
ok(!rp2.includes("traspaso_registrar_varios"), "registró aunque otro ya había apartado");
ok(/solo se pueden despachar 8/.test(await pg.textContent("body")), "no avisa cuánto queda");
await pg.evaluate(() => { window.disp[0].disponible = 20 });

/* origen sin casco → se registra sin SKU */
await monta();
await tipo("Casco vidrio");
await pg.click(`.tp .recientes button:text-is("FSV898")`);
await escoger("De dónde sale", "ARENOSA"); await escoger("A dónde va", "CARNAVAL");
ok(/no tiene inventario de casco/.test(await texto()), "origen sin casco no lo dice");
ok(await puede(), "origen sin casco bloquea el registro");

/* PET no pide casco */
await monta();
await tipo("PET");
ok(!(await pg.isVisible(".tp .tp-mat")), "PET muestra el bloque del casco");

/* celular */
await monta(390);
await tipo("Casco vidrio");
await pg.click(`.tp .recientes button:text-is("FSV898")`);
await escoger("De dónde sale", "BODEGA 38"); await escoger("A dónde va", "CARNAVAL");
await pg.waitForSelector(".tp .tp-mat-fila");
await pg.click('.tp [aria-label="SKU del casco"]'); await pg.click('.tp .desple .rollo button:has-text("3500162")');
await pg.fill('.tp [aria-label="Estibas"]', "25");
const sale = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
ok(!sale, "en 390 se sale de ancho");
await pg.locator(".tp .tp-mat").screenshot({ path: "/tmp/tc-cel.png" });
await nav.close();
console.log(fallas.length ? "FALLAS:\n- " + fallas.join("\n- ") : "TODO OK");
