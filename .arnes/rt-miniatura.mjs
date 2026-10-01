/* =====================================================================
   LA MINIATURA DE LA FOTO EN DESACUERDOS Y VISTO BUENO.
   «Que aparezca la foto para que se vea mejor y no así en blanco.»
   Se prueba con el componente de verdad, en Chromium.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-min.ts"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-min.ts"), `export const createClient = () => ({ rpc: async () => ({ data: null, error: null }), storage: { from: () => ({ upload: async () => ({ error: null }) }) }, from: () => ({ insert: async () => ({ error: null }) }) });`);
const FILAS = `
const base = (i, o) => ({
  id: "00000000-0000-0000-0000-00000000000" + i, codigo: "RB-000" + i, material: "EER-AMBAR",
  material_nombre: "Envase retornable ámbar", tipo: "eer", color: "ambar",
  unidades: 10, contaminadas: null, botellas: null, unidades_liquido: 0, unidades_vidrio: 10,
  proceso: "lineas", proceso_nombre: "Líneas", area: "plazoleta", area_nombre: "Plazoleta",
  causa: "estibas_malas", causa_nombre: "Estibas en mal estado", grupo: "asumida", exige_foto: false,
  descripcion: "Se cayó una estiba", lat: null, lng: null, precision_m: null,
  estado: "esperando", esperando: true, cuenta: false, reportada_por: "u1", reportada_en: "2026-09-20T12:00:00Z",
  decidida_por: null, decidida_en: null, nota_decision: null, fotos: 1, le_falta_foto: false, minutos: 400,
  ol_respuesta: "rechaza", ol_por: "u2", ol_en: "2026-09-21T09:00:00Z", ol_nota: "No fue nuestra",
  etapa: "desacuerdo", cobro_por: null, fotos_descargo: 1, ...o });
const nombres = { u1: "Genesis Visbal", u2: "Easy OL" };`;
writeFileSync(R(".arnes/_min-des.tsx"), `
import { createRoot } from "react-dom/client";
import { Desacuerdos } from "../src/app/(app)/roturas/en-sitio/desacuerdos/Desacuerdos";
${FILAS}
const roturas = [base(1, { fotos: 2 }), base(2, { fotos: 0, fotos_descargo: 0 }), base(3, { fotos: 1 }), base(4, { fotos: 1 })];
createRoot(document.getElementById("r")!).render(<Desacuerdos roturas={roturas as any} nombres={nombres} puedeResolver cifras={{ porAcuerdo: 1, loSostuvoAbi: 1, noSeCobran: 1 }} />);`);
writeFileSync(R(".arnes/_min-vb.tsx"), `
import { createRoot } from "react-dom/client";
import { VistoBueno } from "../src/app/(app)/roturas/en-sitio/visto-bueno/VistoBueno";
${FILAS}
const roturas = [base(1, { etapa: "espera_ol", ol_respuesta: null, fotos: 1 })];
createRoot(document.getElementById("r")!).render(<VistoBueno roturas={roturas as any} nombres={nombres} puedeDecidir cifras={{ aCobro: 1, enDesacuerdo: 1, noSeCobran: 1 }} />);`);
const armar = (e) => buildSync({ entryPoints: [R(e)], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-min.ts"), "@/lib/supabase/client": R(".arnes/_supa-min.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const jsDes = armar(".arnes/_min-des.tsx"), jsVb = armar(".arnes/_min-vb.tsx");
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/roturas/roturas.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = []; pg.on("pageerror", (e) => roto.push(e.message));
const monta = async (js, ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style></head>
   <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="rt" id="r"></div></main></div></div>
   <script>window.__pidos=[];window.fetch=async(u)=>{const id=String(u).split("/").pop();window.__pidos.push(id);
     if(id.endsWith("3")) throw new Error("sin red");
     if(id.endsWith("4")) return new Response(JSON.stringify({fotos:[{ruta:"a",url:"data:image/png;base64,AAAA",tomada_en:null,lat:null,lng:null,precision_m:null,subida_en:"2026-09-20T12:00:00Z"}]}),{status:200});
     return new Response(JSON.stringify({fotos:[{ruta:"a",url:"${PNG}",tomada_en:null,lat:null,lng:null,precision_m:null,subida_en:"2026-09-20T12:00:00Z"}]}),{status:200});};</script>
   <script>${js}<\/script></body></html>`);
  await pg.waitForSelector(".rt .vb-foto");
};
const pidos = () => pg.evaluate(() => window.__pidos);

await monta(jsDes);
await pg.waitForSelector(".vb-foto .vb-miniatura img", { timeout: 4000 }).catch(() => {});
const fotos = pg.locator(".vb-foto");
ok(await fotos.count() === 4, "no salen las cuatro filas");
/* 1. LA FOTO SE VE, llena el cuadro y no es el gris de antes. */
const img = pg.locator(".vb-foto").nth(0).locator("img");
ok(await img.count() === 1, "la primera fila no muestra la foto: sigue el cuadro gris");
if (await img.count()) {
  ok((await img.getAttribute("src")) === PNG, "la foto que se ve no es la que trajo el servidor");
  const m = await pg.evaluate(() => { const b = document.querySelector(".vb-foto").getBoundingClientRect(), i = document.querySelector(".vb-foto img").getBoundingClientRect(); return { bw: b.width, bh: b.height, iw: i.width, ih: i.height } });
  ok(Math.abs(m.iw - m.bw) < 1 && Math.abs(m.ih - m.bh) < 1, `la foto no llena el cuadro: ${JSON.stringify(m)}`);
  ok(m.bw >= 90 && m.bh >= 66, `el cuadro quedó chico (${m.bw}×${m.bh}): era para verla mejor`);
}
/* 2. SIN FOTO NO SE PIDE NADA, y se ve vacío como antes. */
ok(await fotos.nth(1).locator("img").count() === 0, "una rotura sin fotos muestra una imagen");
ok((await pidos()).every((x) => !x.endsWith("2")), "se pidieron fotos de una rotura que no tiene: " + (await pidos()).join(","));
/* 3. SI LA FOTO NO LLEGA se queda el cuadro con su cuenta y se puede abrir. */
ok(await fotos.nth(2).locator("img").count() === 0, "con la red caída aparece una imagen");
ok(/1 foto/.test(await fotos.nth(2).textContent()), "con la foto caída ya no dice cuántas fotos hay");
/* 3b. SI LA FOTO LLEGA PERO NO SE PUEDE ABRIR (firma vencida, archivo roto) NO SE QUEDA UN ÍCONO ROTO. */
await pg.waitForFunction(() => window.__pidos.some((x) => x.endsWith("4")), null, { timeout: 4000 }).catch(() => {});
await pg.waitForTimeout(300);
ok(await fotos.nth(3).locator("img").count() === 0, "una foto que no carga deja el ícono de imagen rota en el cuadro");
/* 4. TOCARLA ABRE LAS FOTOS, como hoy. */
await fotos.nth(0).click();
await pg.waitForSelector(".vb-ev img", { timeout: 4000 }).catch(() => {});
ok(await pg.locator(".vb-ev img").count() >= 1, "tocar la miniatura ya no abre las fotos");
/* 5. LA ETIQUETA DE CUÁNTAS SIGUE ENCIMA, legible sobre la foto. */
ok(/2 fotos/.test(await fotos.nth(0).textContent()), "la miniatura ya no dice «2 fotos»");
/* 6. LA MISMA EN VISTO BUENO. */
await monta(jsVb);
await pg.waitForSelector(".vb-foto .vb-miniatura img", { timeout: 4000 }).catch(() => {});
ok(await pg.locator(".vb-foto img").count() === 1, "Visto bueno no muestra la foto en la miniatura");
/* 7. NADA SE SALE, EN CUATRO ANCHOS. */
for (const w of [360, 390, 820, 1440]) {
  await monta(jsDes, w);
  await pg.waitForSelector(".vb-foto img", { timeout: 4000 }).catch(() => {});
  const d = await pg.evaluate(() => ({ a: document.documentElement.scrollWidth, v: innerWidth }));
  ok(d.a <= d.v, `a ${w} px se sale: ${d.a}>${d.v}`);
}
if (process.env.FOTO) { await monta(jsDes, 1440); await pg.waitForSelector(".vb-foto img", { timeout: 4000 }).catch(() => {}); await pg.screenshot({ path: process.env.FOTO + "/miniatura-d.png" }); await monta(jsDes, 390); await pg.waitForSelector(".vb-foto img", { timeout: 4000 }).catch(() => {}); await pg.screenshot({ path: process.env.FOTO + "/miniatura-m.png", fullPage: true }) }
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 2).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Miniatura: se ve la foto de la rotura llenando el cuadro, no se piden fotos de lo que no tiene, si falla queda el cuadro con su cuenta, tocarla abre las fotos, igual en Visto bueno, y nada se sale en 4 anchos.");
