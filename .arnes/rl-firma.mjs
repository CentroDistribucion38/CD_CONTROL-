/* =====================================================================
   LA FIRMA CON EL DEDO — el componente de verdad, en un navegador.

   Se empaqueta FirmaDedo.tsx tal cual, se monta con React y se firma
   moviendo el puntero, como lo haría un dedo o un mouse:
   1. un trazo entrega un PNG, recortado al trazo (no el lienzo entero);
   2. un toque solo —un punto— también cuenta como firma;
   3. «Borrar firma» la quita y avisa que ya no hay;
   4. la guía se va al firmar, y vuelve al borrar;
   5. el lienzo no deja que el dedo mueva la página (touch-action none).
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
const fallas = [];
const ok = (c, msg) => { if (!c) fallas.push(msg) };

writeFileSync(U("./_firma-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { FirmaDedo } from "../src/app/(app)/quiebra/rotura/FirmaDedo";
(window as any).firma = undefined; (window as any).avisos = 0;
createRoot(document.getElementById("r")!).render(
  <FirmaDedo alCambiar={(p) => { (window as any).firma = p; (window as any).avisos++; }} />);
`);
const js = buildSync({ entryPoints: [U("./_firma-entrada.tsx").pathname], bundle: true, write: false,
  format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } }).outputFiles[0].text;
const css = readFileSync(U("../src/app/(app)/quiebra/rotura/rotura.css"), "utf8");
const glob = readFileSync(U("../src/app/globals.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const ancho of [390, 1200]) {
  const pg = await nav.newPage({ viewport: { width: ancho, height: 700 } });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${css}</style></head>
    <body><div class="rl"><div class="rl-hoja-firma" style="padding:20px"><div id="r"></div></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".rl-firma-dedo canvas");
  const c = await pg.locator(".rl-firma-dedo canvas").boundingBox();
  const estado = () => pg.evaluate(() => ({
    firma: window.firma, guia: !!document.querySelector(".rl-firma-guia"),
    con: document.querySelector(".rl-firma-dedo").classList.contains("con"),
    borrar: document.querySelector(".rl-firma-borrar").disabled,
    lienzo: (() => { const k = document.querySelector(".rl-firma-dedo canvas"); return [k.width, k.height] })(),
    tocar: getComputedStyle(document.querySelector(".rl-firma-dedo canvas")).touchAction,
  }));
  const e0 = await estado();
  ok(!e0.firma && e0.guia && e0.borrar, `${ancho}: recién abierta ya dice que hay firma, o no muestra la guía`);
  ok(e0.tocar === "none", `${ancho}: el dedo movería la página en vez de firmar`);
  ok(e0.lienzo[0] === Math.round(c.width * 2), `${ancho}: el lienzo no está al doble de resolución (${e0.lienzo})`);

  /* 1 · UN TRAZO */
  await pg.mouse.move(c.x + 40, c.y + 90);
  await pg.mouse.down();
  for (let i = 1; i <= 20; i++) await pg.mouse.move(c.x + 40 + i * 6, c.y + 90 - Math.sin(i / 3) * 30);
  await pg.mouse.up();
  const e1 = await estado();
  ok(typeof e1.firma === "string" && e1.firma.startsWith("data:image/png;base64,"), `${ancho}: firmar no entrega la imagen`);
  ok(!e1.guia && e1.con && !e1.borrar, `${ancho}: después de firmar sigue la guía, o no se puede borrar`);
  if (e1.firma) {
    const tam = await pg.evaluate((src) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = src }), e1.firma);
    /* El trazo mide 120 × ~60 px de pantalla: al doble, ~240 × 120 más el borde. */
    ok(tam[0] < e1.lienzo[0] * 0.6 && tam[0] >= 240 && tam[1] <= 160 * 2,
       `${ancho}: la firma no se recortó al trazo (${tam} de un lienzo de ${e1.lienzo})`);
    const transparente = await pg.evaluate((src) => new Promise((r) => { const i = new Image(); i.onload = () => {
      const k = document.createElement("canvas"); k.width = i.width; k.height = i.height; const x = k.getContext("2d");
      x.drawImage(i, 0, 0); r(x.getImageData(0, 0, 1, 1).data[3]) }; i.src = src }), e1.firma);
    ok(transparente === 0, `${ancho}: la firma trae fondo: en el papel sería un recuadro pegado encima`);
  }

  /* 3 · BORRAR */
  await pg.click(".rl-firma-borrar");
  const e2 = await estado();
  ok(e2.firma === null && e2.guia && e2.borrar, `${ancho}: «Borrar firma» no la quita o no avisa que ya no hay`);
  const vacio = await pg.evaluate(() => { const k = document.querySelector(".rl-firma-dedo canvas");
    return !k.getContext("2d").getImageData(0, 0, k.width, k.height).data.some((v, i) => i % 4 === 3 && v) });
  ok(vacio, `${ancho}: borrar deja tinta en el lienzo`);

  /* 2 · UN TOQUE SOLO */
  await pg.mouse.click(c.x + 100, c.y + 60);
  const e3 = await estado();
  ok(typeof e3.firma === "string", `${ancho}: un toque solo no cuenta: la firma se pierde si no se arrastra`);

  /* NO SE BORRA SOLA si la ventana se redibuja sin cambiar de ancho. */
  await pg.evaluate(() => { document.body.style.paddingBottom = "3px" });
  await pg.waitForTimeout(100);
  const e4 = await estado();
  ok(typeof e4.firma === "string", `${ancho}: la firma se borró sola sin que cambiara el tamaño`);
  await pg.close();
}
await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Firma con el dedo: el trazo sale recortado y transparente, un toque cuenta, borrar la quita, y el dedo no mueve la página.");
