import { abrir, recorte } from "./ms-lib.mjs";
const { nav, ctx, pg, monta, err } = await abrir();
const O = "manual-sider/img/";
const fallas = [];
const paso = async (n, f) => { try { await f() } catch (e) { fallas.push(n + ": " + e.message.split("\n")[0]) } };
const vista = (n) => pg.screenshot({ path: O + n + ".png" });
const todo = (n) => recorte(pg, O + n + ".png");
const el = (n, sel) => pg.locator(sel).first().screenshot({ path: O + n + ".png" });
const esp = (ms = 350) => pg.waitForTimeout(ms);
const solo = process.env.SOLO;
const va = (k) => !solo || solo.split(",").includes(k);

/* ============ TRÁNSITO ============ */
if (va("tr")) {
await paso("t01", async () => { await monta("m=transito", 390, 4200); await todo("t01-lista") });
await paso("t02", async () => { await monta("m=transito", 390, 1300); await pg.click("text=Filtrar"); await esp(); await todo("t02-filtros") });
await paso("t09", async () => { await monta("m=transito", 390, 1300); await pg.click("text=Filtrar"); await esp();
  await pg.fill("input[placeholder^='Una placa']", "JYN141 KLM872 PQR305"); await esp(500); await todo("t09-pegar") });
await paso("t03", async () => { await monta("m=transito", 390, 900); await pg.click("button:has-text('Certificar llegada') >> nth=0"); await esp();
  await todo("t03-llegada-inicio");
  await pg.click("text=Activar mi ubicación"); await esp(900); await todo("t03-llegada-ubicacion");
  await pg.click("button:has-text('Seguir')"); await esp(); await todo("t04-llegada-fotos");
  const fi = await pg.$$("input[type=file]");
  await fi[0].setInputFiles("manual-sider/foto/izq.jpg"); await fi[1].setInputFiles("manual-sider/foto/der.jpg"); await fi[2].setInputFiles("manual-sider/foto/placa.jpg"); await esp(1500);
  await todo("t04-llegada-fotos-listas");
  });
await paso("t05", async () => { await monta("m=transito", 390, 860); await pg.click("button:has-text('Corregir') >> nth=0"); await esp(); await el("t05-corregir", ".vj-caja") });
await paso("t06", async () => { await monta("m=transito", 390, 860); await pg.click("button:has-text('Anular') >> nth=0"); await esp();
  await pg.fill("textarea, input[placeholder^='Se digit']", "Se digitó dos veces"); await esp(); await el("t06-anular", ".vj-caja") });
await paso("t07", async () => { await monta("m=transito", 390, 4200);
  await el("t07-pedir-ai", ".tr-vh:has-text('Pedir revisión AI') >> nth=2".replace(" >> nth=2","")); 
  await el("t07-quitar-ai", ".tr-vh:has-text('Quitar revisión AI')") });
await paso("t08", async () => { await monta("m=transito", 390, 800);
  await pg.click("text=Escoger >> nth=0"); await pg.click("text=Escoger >> nth=1"); await esp(); await vista("t08-escoger") });
}

/* ============ REVISIÓN AI ============ */
if (va("so")) {
await paso("s01", async () => { await monta("m=sorting", 390, 3200); await todo("s01-todo");
  await el("s01-cert", ".tr-vh.ai"); await el("s01-interno", ".tr-vh.so:has(.sello.interno)"); await el("s01-normal", ".tr-vh.so:not(:has(.sello.interno))");
  await el("s01-hechas", ".so-hechos") });
await paso("s02", async () => { await monta("m=sorting", 390, 3000); await pg.click("button:has-text('Hacer la revisión') >> nth=0"); await esp(); await todo("s02-form-vacia");
  await el("s02-cinta", ".ai-cinta"); await pg.locator(".ai-caja").nth(0).screenshot({ path: O + "s02-caja0.png" });
  await pg.locator(".ai-p-cab >> xpath=..").first().screenshot({ path: O + "s02-panel.png" }) });
await paso("s03", async () => { await monta("m=sorting", 390, 3000); await pg.click("button:has-text('Hacer la revisión') >> nth=0"); await esp();
  await pg.click(".ai-seg button:has-text('B')");
  await pg.fill("#ai-rev", "4104");
  for (let i = 0; i < 30; i++) await pg.click("button[aria-label='Sumar una de Rota o despicado']");
  for (let i = 0; i < 12; i++) await pg.click("button[aria-label='Sumar una de Faltante']");
  for (let i = 0; i < 6; i++) await pg.click("button[aria-label='Sumar una de Cemento o pintura']");
  for (let i = 0; i < 9; i++) await pg.click("button[aria-label='Sumar una de Hongo']");
  await pg.fill("textarea", "Rotas por mal estibado; el conductor lo confirmó."); await esp(); await todo("s03-form-llena");
  for (let i = 0; i < 4; i++) await pg.locator(".ai-caja").nth(i).screenshot({ path: O + "s03-caja" + i + ".png" }).catch(() => {});
  await pg.locator(".ai-p-cab >> xpath=..").first().screenshot({ path: O + "s03-panel.png" });
  await pg.setViewportSize({ width: 390, height: 900 });
  await pg.locator("text=Rota o despicado").first().scrollIntoViewIfNeeded(); await pg.evaluate(() => window.scrollBy(0, -80)); await esp(); await vista("s03-defectos");
  await pg.evaluate(() => window.scrollTo(0, 99999)); await esp(); await vista("s03-cierre") });
await paso("s04", async () => { await monta("m=sorting", 390, 3000); await pg.click("button:has-text('Hacer la revisión') >> nth=0"); await esp();
  await pg.fill("#ai-rev", "4104");
  for (let i = 0; i < 48; i++) await pg.click("button[aria-label='Sumar una de Rota o despicado']");
  await pg.click("button:has-text('Cerrar revisión')"); await esp(700); await vista("s04-cerrada") });
await paso("s06", async () => { await monta("m=sorting&c=manda", 390, 3200);
  await pg.click(".tr-vh >> nth=0 >> .tr-marca input"); await pg.click(".tr-vh >> nth=1 >> .tr-marca input"); await esp();
  await el("s06-escoger", ".tr-vh >> nth=0"); await pg.screenshot({ path: O + "s06-barra.png", clip: { x: 0, y: 0, width: 390, height: 3200 }, fullPage: false }).catch(() => {});
  await pg.click('.tr-barra button:has-text("Anular los 2")'); await esp(); await el("s06-anular", ".vj-caja") });
await paso("v01", async () => { await monta("m=sorting", 390, 900); await pg.evaluate(() => window.scrollTo(0, 400)); await esp(); await vista("v01-fab") });
await paso("v02", async () => { await monta("m=sorting", 390, 1500); await pg.click(".tr-fab"); await esp(); await el("v02-modal", ".vj-caja") });
await paso("v03", async () => { await monta("m=sorting", 390, 1500); await pg.click(".tr-fab"); await esp();
  await pg.fill("input[placeholder='ABC123']", "abc123");
  const sel = await pg.$$("select"); await sel[0].selectOption({ label: "Apartadó" });
  await pg.fill("input[placeholder^='Escribe el código']", "marrón"); await esp(200); await pg.click("button:has-text('Botella marrón 250 cc')");
  await pg.fill("input[placeholder='0']", "40"); await pg.click(".nv-canal-bot button:has-text('T1')");
  await pg.fill("input[placeholder='Número de factura']", "0071234"); await esp(); await el("v03-llena", ".vj-caja") });
await paso("v07", async () => { await monta("m=sorting", 390, 1700); await pg.click(".tr-fab"); await esp();
  await pg.click(".nv-canal-bot button:has-text('Socio')"); await esp(200); await el("v07-socio-vacio", ".vj-caja");
  await pg.selectOption(".nv-socio select", { label: "Logisinú" });
  await pg.fill("input[placeholder='ABC123']", "abc123");
  await pg.selectOption(".nv-campos label:has(> span:text('CD origen')) select", { label: "Apartadó" });
  await pg.fill("input[placeholder^='Escribe el código']", "marrón"); await esp(200); await pg.click("button:has-text('Botella marrón 250 cc')");
  await pg.fill("input[placeholder='0']", "40"); await esp(); await el("v07-socio-lleno", ".vj-caja");
  await pg.click(".nv-canal-bot button:has-text('T1')"); await esp(200); await el("v07-t1-vacio", ".vj-caja") });
await paso("s05", async () => { await monta("m=sorting", 390, 3000);
  await pg.click(".tr-vh.so:has(.sello.interno) button:has-text('Hacer la revisión')"); await esp(); await todo("s05-interno-form");
  await pg.locator(".ai-caja").nth(0).screenshot({ path: O + "s05-interno-caja0.png" });
  await pg.locator(".ai-p-cab >> xpath=..").first().screenshot({ path: O + "s05-interno-panel.png" });
  await pg.fill("#ai-rev", "4104"); await esp(); await pg.locator(".ai-p-cab >> xpath=..").first().screenshot({ path: O + "s05-interno-panel-lista.png" }) });
await paso("v06", async () => { await monta("m=sorting", 390, 2200); await pg.click(".tr-fab"); await esp();
  await pg.fill("input[placeholder='ABC123']", "abc123");
  const sel = await pg.$$("select"); await sel[0].selectOption({ label: "Apartadó" });
  await pg.click(".nv-canal-bot button:has-text('T1')");
  await pg.fill("input[placeholder='Número de factura']", "0071234");
  await pg.fill("input[placeholder^='Escribe el código']", "marrón"); await esp(200); await pg.click("button:has-text('Botella marrón 250 cc')");
  await pg.fill("input[placeholder='0']", "40");
  await pg.click(".nv-mas-mat"); await esp(200); await el("v06-mas", ".vj-caja");
  await pg.locator(".nv-linea >> nth=1 >> .nv-material input").fill("175"); await esp(200);
  await pg.locator(".nv-linea >> nth=1 >> .nv-lista button >> nth=0").click();
  await pg.locator(".nv-linea >> nth=1 >> input[placeholder='0']").fill("12"); await esp(); await el("v06-dos", ".vj-caja");
  await pg.setViewportSize({ width: 900, height: 1500 }); await esp(300); await el("v06-pc", ".vj-caja");
  await pg.setViewportSize({ width: 390, height: 2200 });
  await pg.locator('.nv-linea >> nth=1 >> button:has-text("Cambiar")').click(); await esp(200);
  await pg.locator(".nv-linea >> nth=1 >> .nv-material input").fill("azul"); await esp(200);
  await pg.locator(".nv-linea >> nth=1 >> .nv-lista button >> nth=0").click(); await esp(300); await el("v06-sin-factor", ".vj-caja") });
await paso("v04", async () => { await monta("m=sorting", 390, 1500); await pg.click(".tr-fab"); await esp();
  await pg.fill("input[placeholder='ABC123']", "abc"); await esp(); await el("v04-falta", ".vj-caja") });
await paso("v05", async () => { await monta("m=sorting&c=sincrear", 390, 900); await pg.evaluate(() => window.scrollTo(0, 400)); await esp(); await vista("v05-sin-mas") });
}

/* ============ FUENTE PRINCIPAL ============ */
if (va("fu")) {
await paso("f01", async () => { await monta("m=viajes", 1000, 1200); await todo("f01-tabla");
  await pg.evaluate(() => { document.querySelectorAll("*").forEach((e) => { if (e.scrollWidth > e.clientWidth + 40 && getComputedStyle(e).overflowX !== "visible") e.scrollLeft = 99999 }) }); await esp(); await todo("f01-tabla-der") });
await paso("f02", async () => { await monta("m=viajes", 390, 2600); await todo("f02-cel") });
await paso("f03", async () => { await monta("m=viajes", 1000, 1000); await pg.click("button:has-text('Anular') >> nth=0"); await esp(); await el("f03-anular", ".vj-caja") });
}

/* ============ INFORME AI ============ */
if (va("in")) {
await paso("i01", async () => { await monta("m=informe", 1000, 2400); await todo("i01-informe") });
await paso("i02", async () => { await monta("m=informe", 390, 3600); await todo("i02-cel") });
}

/* ============ SEGUIMIENTO ============ */
if (va("se")) {
await paso("g01", async () => { await monta("m=seguimiento", 1000, 1200); await todo("g01-informe");
  await pg.click("text=ZLDE"); await esp(); await todo("g02-zlde");
  await pg.click("text=Certificado"); await esp(); await todo("g03-certificado") });
await paso("g04", async () => { await monta("m=seguimiento", 390, 2600); await todo("g04-cel") });
await paso("g05", async () => { await monta("m=importar", 1000, 1200); await todo("g05-importar"); await monta("m=importar", 390, 1800); await todo("g05-importar-cel") });
}

/* ============ NOVEDADES ============ */
if (va("no")) {
await paso("n01", async () => { await monta("m=novedades", 390, 2400); await todo("n01-lista");
  await pg.click("button:has-text('Reportar novedad')"); await esp(); await todo("n02-form") });
await paso("n03", async () => { await monta("m=novedades", 1000, 1800); await todo("n03-pc") });
}

/* ============ MAESTRO ============ */
if (va("ma")) {
await paso("m01", async () => { await monta("m=maestro", 1000, 1800); await todo("m01-pc"); await monta("m=maestro", 390, 2800); await todo("m01-cel") });
}
console.log(fallas.join("\n") || "sin fallas", "\nerr:", err.slice(0, 5));
await nav.close();
