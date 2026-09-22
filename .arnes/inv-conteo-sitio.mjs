/* =====================================================================
   CONTEO · EL SITIO DESPUÉS DE ANOTAR — en Chromium, con el componente
   de verdad.
   «Tanto la calle como el módulo igual al anterior registro, y ya empiezo
   con el lado; apenas escoja lado se sale al código.»
   ===================================================================== */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_cs-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Contar } from "../src/app/(app)/inventario/conteo/Contar";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Contar bodegaId="b1" conteoInicial={{ id: "c1", codigo: "INV-1", estado: "en_proceso", iniciado_en: null }}
  renglonesIniciales={[]} materiales={w.MAT} ubicaciones={w.UBI} estados={[]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_cs-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_sb-conteo.js"), "next/navigation": R(".arnes/stub-nav.js"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const MAT = [{ id: "m1", sku: "900", nombre: "Canasta 30", unidades_por_caja: 30, cajas_por_estiba: 40, unidades_por_estiba: 1200, contenido: null,
  familia: null, presentacion: null, vida_util: null, f_limite_desp: null, dias_minimo: 0, origen: null, foraneo: null, tipo_material: "ENVASE", activo: true }];
const U = (calle, modulo, lado) => ({ id: `${calle}${modulo}${lado ?? ""}`, bodega_id: "b1", clave: `${calle}${modulo}${lado ? "_" + lado : ""}`, calle, modulo, lado, familia: null, capacidad: 10, activa: true });
const UBI = [U("A", "01", "IZQ"), U("A", "01", "DER"), U("B", "02", null)];
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.setViewportSize({ width: 390, height: 900 });
await pg.setContent(`<!doctype html><html><body><div id="r"></div><script>window.MAT=${JSON.stringify(MAT)};window.UBI=${JSON.stringify(UBI)};</script><script>${js}</script></body></html>`);
await pg.waitForSelector(".fe-anotar");
const escoger = async (n, texto) => {
  const campo = pg.locator(".bs-campo").nth(n);
  await campo.click(); await campo.fill(texto);
  await pg.locator(".bs-lista [role=option]").first().dispatchEvent("mousedown");
};
const renglon = async (lado) => {
  if (lado) await pg.click(`[aria-labelledby=fe-rot-lado] button:has-text("${lado}")`);
  await pg.fill('input[placeholder="Teclea el código"]', "900");
  await pg.locator(".fe-cuanto-campo input").first().fill("3");
  await pg.click(".btn.grande");
  await pg.waitForTimeout(250);
};
await escoger(0, "A");
await escoger(1, "01");
await renglon("Izquierdo");
const calle = await pg.locator(".bs-campo").nth(0).inputValue();
const modulo = await pg.locator(".bs-campo").nth(1).inputValue();
ok(/A/.test(calle) && /01/.test(modulo), `después de anotar no quedan calle y módulo: «${calle}» «${modulo}»`);
ok(!(await pg.$("[aria-labelledby=fe-rot-lado] button.on")), "después de anotar el lado sigue escogido: hay que escogerlo en cada renglón");
ok(await pg.evaluate(() => document.activeElement?.closest("[aria-labelledby=fe-rot-lado]") != null), "después de anotar el cursor no está en el lado");
await pg.click('[aria-labelledby=fe-rot-lado] button:has-text("Derecho")');
await pg.waitForTimeout(50);
ok(await pg.evaluate(() => document.activeElement?.getAttribute("placeholder") === "Teclea el código"), "al escoger el lado el cursor no salta al código");
/* Módulo de UN solo lado: no se pregunta, y el cursor va derecho al código. */
await pg.fill('input[placeholder="Teclea el código"]', "900");
await pg.locator(".fe-cuanto-campo input").first().fill("2");
await pg.click(".btn.grande"); await pg.waitForTimeout(250);
await escoger(0, "B"); await escoger(1, "02");
await renglon(null);
ok(await pg.evaluate(() => document.activeElement?.getAttribute("placeholder") === "Teclea el código"), "con un solo lado, después de anotar el cursor no va al código");
ok((await pg.evaluate(() => window.__rpc)).filter((f) => f === "conteo_fefo_agregar").length === 3, `no se anotaron los 3 renglones: ${await pg.evaluate(() => JSON.stringify(window.__rpc))}`);
/* LA TARJETA DE LA ÚLTIMA VEZ: «Sigue igual» llena y NO guarda; «Cambió
   cantidad» deja todo igual —fecha incluida— y el cursor en la cantidad;
   «Otro SKU» deja el sitio y vacía lo demás. */
await pg.evaluate(() => { window.__DATOS = { v_conteo_ultimo_por_ubicacion: [{ linea_id: "p1", codigo: "900", material: "Canasta 30",
  contado_en: new Date(Date.now() - 864e5).toISOString(), estibas: 7, cajas: null, venc_dia: 5, venc_mes: 11, venc_anio: 26, rotacion: null,
  averia: false, pnc: false, estado_envase: null, nota: null, total_cajas: 280 }] }; window.__rpc = [] });
await escoger(0, "A"); await escoger(1, "01");
await pg.click('[aria-labelledby=fe-rot-lado] button:has-text("Izquierdo")');
await pg.waitForSelector(".fe-tarjeta", { timeout: 3000 }).catch(() => null);
ok((await pg.$$(".fe-tarjeta-pie button")).length === 3, "la tarjeta no trae las tres: sigue igual, cambió cantidad, otro SKU");
await pg.click(".fe-tarjeta-pie .fe-si");
await pg.waitForTimeout(150);
ok(!(await pg.evaluate(() => window.__rpc)).includes("conteo_fefo_agregar"), "«Sigue igual» guardó solo, sin que nadie le diera «Anotar»");
ok((await pg.inputValue('input[placeholder="Teclea el código"]')) === "900" && (await pg.locator(".fe-cuanto-campo input").first().inputValue()) === "7",
   "«Sigue igual» no llenó el renglón como la última vez");
ok(await pg.evaluate(() => document.activeElement?.classList.contains("grande")), "después de «Sigue igual» el cursor no queda en «Anotar renglón»");
ok(/Revísalo/.test(await pg.textContent(".fe-desde-tarjeta").catch(() => "")), "no dice que hay que revisar y darle Anotar");
await pg.click(".fe-tarjeta-pie button:has-text('Cambió cantidad')");
await pg.waitForTimeout(150);
ok((await pg.locator(".fe-cuanto-campo input").first().inputValue()) === "7" && (await pg.inputValue('input[placeholder="Teclea el código"]')) === "900"
   && await pg.evaluate(() => document.activeElement === document.querySelector(".fe-cuanto-campo input")), "«Cambió cantidad» no deja todo igual con el cursor en la cantidad");
await pg.click(".fe-tarjeta-pie button:has-text('Otro SKU')");
await pg.waitForTimeout(150);
ok((await pg.inputValue('input[placeholder="Teclea el código"]')) === "" && /A/.test(await pg.locator(".bs-campo").nth(0).inputValue())
   && await pg.evaluate(() => document.activeElement?.getAttribute("placeholder") === "Teclea el código"), "«Otro SKU» no vacía el renglón dejando el sitio y el cursor en el código");
await pg.screenshot({ path: (process.env.FOTO ?? "/tmp") + "/cs-tarjeta.png", fullPage: true });
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Conteo: la tarjeta de la última vez no guarda sola (sigue igual / cambió cantidad / otro SKU); después de anotar quedan calle y módulo, el cursor va al lado y al escoger lado salta al código; con un solo lado, derecho al código.");
