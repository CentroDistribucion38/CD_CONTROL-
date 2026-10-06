/* =====================================================================
   CONTAR · LA CAMARITA DE «DATOS ADICIONALES» — el componente de verdad.
   «Agrega la camarita por si quiero poner evidencia de un mixeo, lo que
   sea, para tener soporte.»
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_ft-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Contar } from "../src/app/(app)/inventario/conteo/Contar";
const w = window as any;
createRoot(document.getElementById("r")!).render(<div className="fe"><Contar bodegaId="b1" conteoInicial={{ id: "c1", codigo: "INV-1", estado: "en_proceso", iniciado_en: null }}
  renglonesIniciales={w.REN} materiales={w.MAT} ubicaciones={w.UBI} estados={[]} /></div>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ft-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_sb-foto.js"), "next/navigation": R(".arnes/stub-nav.js"), "@": R("src") },
  loader: { ".css": "empty" }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const MAT = [{ id: "m1", sku: "900", nombre: "Canasta 30", unidades_por_caja: 30, cajas_por_estiba: 40, unidades_por_estiba: 1200, contenido: null,
  familia: null, presentacion: null, vida_util: null, f_limite_desp: null, dias_minimo: 0, origen: null, foraneo: null, tipo_material: "ENVASE", activo: true }];
const U = (calle, modulo, lado) => ({ id: `${calle}${modulo}${lado ?? ""}`, bodega_id: "b1", clave: `${calle}${modulo}${lado ? "_" + lado : ""}`, calle, modulo, lado, familia: null, capacidad: 10, activa: true });
const UBI = [U("A", "01", "IZQ"), U("A", "01", "DER"), U("B", "02", null)];
const FILA = (id, extra = {}) => ({ id, conteo_id: "c1", conteo: "INV-1", estado: "en_proceso", codigo: "900", material: "Canasta 30", tipo_material: "ENVASE", familia: null,
  factor_estibado: 40, ubicacion: "A01_IZQ", ubicacion_id: "A01IZQ", calle: "A", modulo: "01", lado: "IZQ", estibas: 7, saldo: null, cajas: null,
  total_cajas: 280, venc_dia: null, venc_mes: null, venc_anio: null, rotacion: false, averia: false, pnc: false, estado_envase: null, nota: null,
  contado_en: new Date().toISOString(), dias_para_salir: null, ...extra });
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const css = readFileSync(R("src/app/globals.css"), "utf8") + readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8");
const JPG = R(".arnes/_foto.jpg");
async function nueva(ancho = 390, conFotos = {}) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: 900 } });
  const pg = await ctx.newPage();
  const REN = [FILA("r1"), FILA("r2", { ubicacion: "B02", ubicacion_id: "B02", calle: "B", modulo: "02", lado: null })];
  const HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${css}</style></head><body><div id="r"></div><script>window.MAT=${JSON.stringify(MAT)};window.UBI=${JSON.stringify(UBI)};window.REN=${JSON.stringify(REN)};window.__DATOS={v_conteo_fefo:${JSON.stringify(REN)},conteo_fotos:${JSON.stringify(conFotos)}};</script><script>${js}</script></body></html>`;
  await pg.route("http://t.local/**", (r) => r.fulfill({ contentType: "text/html", body: HTML }));
  await pg.goto("http://t.local/conteo"); await pg.waitForSelector(".fe-anotar");
  return { ctx, pg };
}
const ev = (pg) => pg.evaluate(() => window.__foto ?? []);
const escoger = async (pg, n, texto) => {
  const campo = pg.locator(".bs-campo").nth(n);
  await campo.click(); await campo.fill(texto);
  await pg.locator(".bs-lista [role=option]").first().dispatchEvent("mousedown");
};
const anota = async (pg, lado, cant) => {
  if (lado) await pg.click(`[aria-labelledby=fe-rot-lado] button:has-text("${lado}")`);
  await pg.fill('input[placeholder="Teclea el código"]', "900");
  /* EL FLUJO: un envase pide estado antes de «Cuánto». */
  await pg.locator(".fe-estenv:not(:has(button.on)) .fe-estados button").first().click({ timeout: 400 }).catch(() => {});
  await pg.locator(".fe-cuanto-campo input").first().fill(String(cant));
};

/* 1 · LA CAMARITA ESTÁ EN «DATOS ADICIONALES», no en el formulario principal. */
{
  const { ctx, pg } = await nueva();
  ok(await pg.locator("details.fe-mas .fe-foto").count() === 1, "la cámara no está dentro de «Datos adicionales»");
  ok(/foto/i.test(await pg.textContent("details.fe-mas > summary")), "el resumen de Datos adicionales no dice que trae foto");
  ok(await pg.locator(".fe-bloque .fe-foto").count() === 0, "la cámara salió fuera de Datos adicionales");
  await pg.click("details.fe-mas > summary");
  const inp = pg.locator('details.fe-mas input[type=file]').first();
  ok((await inp.getAttribute("capture")) === "environment" && /image/.test(await inp.getAttribute("accept")), "el input no abre la cámara trasera");
  const btn = pg.locator(".fe-foto-btn");
  ok(/Tomar foto/.test(await btn.textContent()) && (await btn.boundingBox()).height >= 44, "el botón no dice «Tomar foto» o mide menos de 44 px");
  ok((await btn.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)) === "0px", "el botón de la foto no es rectangular");

  /* 2 · SIN FOTO TODO SIGUE IGUAL: no se toca el bucket. */
  await escoger(pg, 0, "B"); await escoger(pg, 1, "02");
  await anota(pg, null, 3);
  await pg.click(".btn.grande"); await pg.waitForTimeout(300);
  ok((await ev(pg)).length === 0, "sin foto igual subió algo: " + JSON.stringify(await ev(pg)));
  ok((await pg.evaluate(() => window.__llamadas)).filter((l) => l.fn === "conteo_fefo_agregar").length === 1, "el renglón sin foto no se guardó");

  /* 3 · CON FOTO: se sella, se muestra, se sube después del renglón con el id de la línea. */
  await pg.evaluate(() => { window.__ultimo = "L-77" });
  await pg.click("details.fe-mas > summary");
  await pg.locator('details.fe-mas input[type=file]').first().setInputFiles(JPG);
  await pg.waitForSelector(".fe-foto-btn.con img");
  ok(/Tomar otra/.test(await pg.textContent(".fe-foto-btn")), "con foto el botón no dice «Tomar otra»");
  ok(/FOTO/.test(await pg.textContent(".fe-mas-marcas")), "la marca FOTO no sale en el resumen de Datos adicionales");
  await escoger(pg, 0, "B"); await escoger(pg, 1, "02");
  await anota(pg, null, 5);
  await pg.click(".btn.grande"); await pg.waitForFunction(() => (window.__foto ?? []).length >= 2, null, { timeout: 4000 }).catch(() => null);
  const e = await ev(pg);
  const sube = e.find((x) => x.t === "sube"), fila = e.find((x) => x.t === "fila");
  ok(sube && sube.b === "inventario" && sube.ruta === "c1/L-77.jpg" && sube.tipo === "image/jpeg" && sube.bytes > 1000, "la foto no subió al bucket «inventario» como c1/L-77.jpg: " + JSON.stringify(sube));
  ok(fila && fila.tabla === "conteo_fotos" && fila.fila.linea_id === "L-77" && fila.fila.conteo_id === "c1" && fila.fila.ruta === "c1/L-77.jpg" && fila.fila.ancho > 0, "no se registró la fila en conteo_fotos: " + JSON.stringify(fila));
  ok(sube && fila && e.indexOf(sube) < e.indexOf(fila), "la fila se registró antes de que subiera el archivo");
  ok(await pg.locator(".fe-foto-btn.con").count() === 0, "tras anotar, el formulario no soltó la foto para el siguiente renglón");

  /* 4 · LA FOTO NO SE PIERDE EL RENGLÓN SI EL BUCKET FALLA: se avisa. */
  await pg.evaluate(() => { window.__malSube = true; window.__foto = [] });
  await pg.click("details.fe-mas > summary");
  await pg.locator('details.fe-mas input[type=file]').first().setInputFiles(JPG);
  await pg.waitForSelector(".fe-foto-btn.con img");
  await escoger(pg, 0, "B"); await escoger(pg, 1, "02");
  await anota(pg, null, 6);
  await pg.click(".btn.grande"); await pg.waitForTimeout(500);
  ok(/quedó anotado, pero la foto no subió/.test(await pg.evaluate(() => document.body.innerText)), "si la foto falla no avisa que el renglón sí quedó");
  ok((await pg.evaluate(() => window.__llamadas)).filter((l) => l.fn === "conteo_fefo_agregar").length === 3, "el renglón se perdió por culpa de la foto");

  /* 5 · QUITAR LA FOTO ANTES DE ANOTAR. */
  await pg.evaluate(() => { window.__malSube = false; window.__foto = [] });
  await pg.click("details.fe-mas > summary");
  await pg.locator('details.fe-mas input[type=file]').first().setInputFiles(JPG);
  await pg.waitForSelector(".fe-foto-btn.con img");
  await pg.click(".fe-foto-quitar");
  ok(await pg.locator(".fe-foto-btn.con").count() === 0, "«Quitarla» no quita la foto");
  await ctx.close();
}

/* 6 · DESDE «EL BORRADOR»: poner foto a un renglón que ya está, ver la que tiene, borrar limpia el archivo. */
{
  const { ctx, pg } = await nueva(390, [{ linea_id: "r2", ruta: "c1/r2.jpg" }]);
  await pg.click('.fe-pes-conteo button:has-text("borrador")');
  const filas = pg.locator(".fe-fila");
  ok(await filas.nth(0).locator("button:has-text('Ver foto')").count() === 0, "r1 no tiene foto y dice «Ver foto»");
  ok(await filas.nth(1).locator("button:has-text('Ver foto')").count() === 1, "r2 tiene foto y no dice «Ver foto»");
  ok(/Otra foto/.test(await filas.nth(1).textContent()) && /Foto/.test(await filas.nth(0).textContent()), "los botones de foto de la fila no dicen Foto / Otra foto");
  await filas.nth(0).locator("button:text-is('Foto')").click({ trial: true });
  await pg.evaluate(() => { document.querySelector('.fe-lista').previousElementSibling });
  const [fc] = await Promise.all([pg.waitForEvent("filechooser"), filas.nth(0).locator("button:text-is('Foto')").click()]);
  await fc.setFiles(JPG);
  await pg.waitForFunction(() => (window.__foto ?? []).some((x) => x.t === "fila"), null, { timeout: 4000 }).catch(() => null);
  const e = await ev(pg);
  ok(e.some((x) => x.t === "sube" && x.ruta === "c1/r1.jpg") && e.some((x) => x.t === "fila" && x.fila.linea_id === "r1"), "la foto de la fila r1 no subió: " + JSON.stringify(e));
  ok(await filas.nth(0).locator("button:has-text('Ver foto')").count() === 1, "tras subirla la fila no dice «Ver foto»");
  await filas.nth(0).locator("button:has-text('Ver foto')").click();
  ok((await ev(pg)).some((x) => x.t === "firma" && x.ruta === "c1/r1.jpg"), "«Ver foto» no pidió el enlace firmado");
  /* Borrar el renglón limpia el archivo. */
  await filas.nth(1).locator("button:has-text('Borrar')").click();
  await pg.locator('[role=dialog] button:has-text("Borrarlo"), .dialogo button:has-text("Borrarlo")').first().click();
  await pg.waitForTimeout(400);
  ok((await ev(pg)).some((x) => x.t === "quita" && x.r[0] === "c1/r2.jpg"), "borrar el renglón no limpió su archivo del bucket");
  await ctx.close();
}

/* 7 · SIN SEÑAL: el renglón queda pendiente CON su foto y ambos suben al volver. */
{
  const { ctx, pg } = await nueva();
  await pg.evaluate(() => { window.__ultimo = "L-9" });
  await pg.click("details.fe-mas > summary");
  await pg.locator('details.fe-mas input[type=file]').first().setInputFiles(JPG);
  await pg.waitForSelector(".fe-foto-btn.con img");
  await ctx.setOffline(true); await pg.waitForSelector(".fe-cola.sin");
  await escoger(pg, 0, "B"); await escoger(pg, 1, "02");
  await anota(pg, null, 4);
  await pg.click(".btn.grande"); await pg.waitForTimeout(300);
  ok(/Su foto sube con él/.test(await pg.evaluate(() => document.body.innerText)), "sin señal no avisó que la foto viaja con el pendiente");
  ok((await ev(pg)).length === 0, "sin señal subió algo");
  await ctx.setOffline(false);
  await pg.waitForFunction(() => (window.__foto ?? []).some((x) => x.t === "fila"), null, { timeout: 5000 }).catch(() => null);
  const e = await ev(pg);
  ok(e.some((x) => x.t === "sube" && x.ruta === "c1/L-9.jpg"), "al volver la señal no subió la foto del pendiente: " + JSON.stringify(e));
  await ctx.close();
}

/* 8 · CUATRO ANCHOS: nada se sale. */
for (const w of [360, 390, 820, 1440]) {
  const { ctx, pg } = await nueva(w);
  await pg.click("details.fe-mas > summary");
  const sale = await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  const fuera = await pg.evaluate(() => { const a = document.documentElement.clientWidth; return [...document.querySelectorAll(".fe-foto *")].filter((e) => e.getBoundingClientRect().right > a + 1).length });
  ok(!sale && fuera === 0, `a ${w}px la cámara se sale de la pantalla`);
  if (w === 390) await pg.locator(".fe-foto").scrollIntoViewIfNeeded(); await pg.locator(".fe-foto").evaluate((e) => e.scrollIntoView({ block: "center" })); await pg.screenshot({ path: R(".arnes/inv-conteo-foto.png") });
  await ctx.close();
}
await nav.close();
if (fallas.length) { console.log("FALLAS:"); for (const f of fallas) console.log(" ·", f); process.exit(1) }
console.log("✓ Contar · foto: la camarita está en Datos adicionales, es opcional, sube con el id del renglón, no tumba el renglón si falla, funciona desde El borrador, sin señal viaja con el pendiente, borrar limpia el archivo, y nada se sale en cuatro anchos.");
