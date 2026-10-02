/* =====================================================================
   CREAR UN VH INTERNO · LA CANTIDAD EN ESTIBAS O EN UNIDADES

   «Está perfecto en estibas pero que también tenga la opción de colocar
    unidades, y luego haces la conversión a estibas, o viceversa: la
    persona elige.»

   Se monta el formulario real (con el maestro de pruebas: 3500887 trae
   72 cajas por estiba × 24 unidades por caja = 1.728 unidades por estiba;
   3500999 no trae factores) y se prueba:

   1. Arranca en Estibas, como siempre; el RPC lleva las estibas escritas.
   2. En Unidades: 25.920 unidades → «= 15 estibas» y al guardar viaja
      p_estibas = 15 (no 25920).
   3. Cambiar de modo convierte lo escrito (15 estibas ↔ 25.920 unidades)
      y no pierde nada si se ida y vuelve.
   4. Unidades que no completan cajas enteras → aviso (no bloquea).
   5. Material sin factores: Unidades deshabilitado y dice cuál falta; si
      ya estaba en unidades y se cambia a ese material, no se puede crear
      y lo dice por su nombre.
   6. Varios materiales: cada uno con su modo; el RPC de varios lleva las
      estibas ya convertidas de cada uno.
   7. Las cifras (cajas, unidades, Sider) son las mismas en los dos modos.
   8. Nada se sale en 360/390/820/1440.

     node .arnes/sd-nuevo-interno.mjs
   ===================================================================== */
import { abrir } from "./ms-lib.mjs";
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const { nav, pg, monta, err } = await abrir();
const rpcs = () => pg.evaluate(() => window.__rpc);
const lineaN = (i) => pg.locator(".nv-linea").nth(i);
const modo = (i, nombre) => lineaN(i).locator(`.nv-modo button`, { hasText: nombre });
const cant = (i) => lineaN(i).locator(".nv-est input");
const desborda = () => pg.evaluate(() => {
  const d = document.documentElement; const r = document.querySelector("#r");
  return { doc: d.scrollWidth - d.clientWidth, r: r.scrollWidth - r.clientWidth };
});

async function base({ canal = "t1" } = {}) {
  await monta("m=interno", 390, 1400);
  await pg.evaluate(() => { window.__rpc = [] });
  await pg.locator(".nv-canal-bot button", { hasText: canal === "t1" ? "T1" : "Socio" }).click();
  if (canal === "t1") await pg.locator(".nv-doc input").fill("7687019429");
  else await pg.locator(".nv-socio select").selectOption({ index: 1 });
  await pg.locator(".nv-placa input").fill("ABC123");
  await pg.locator("select").filter({ hasText: "escoge el CD" }).selectOption({ label: "Apartadó" });
}
const escoge = async (i, texto) => { await lineaN(i).locator(".nv-lista button", { hasText: texto }).first().click() };

/* 1 · ESTIBAS, COMO SIEMPRE */
await base();
await escoge(0, "Costeña 175");
ok(await modo(0, "Estibas").getAttribute("aria-checked") === "true", "no arranca en Estibas");
ok(await modo(0, "Unidades").getAttribute("aria-checked") === "false", "Unidades marcado de arranque");
ok((await lineaN(0).locator(".nv-est span").innerText()) === "Estibas", "la etiqueta del campo no dice Estibas");
await cant(0).fill("15");
ok(await lineaN(0).locator(".nv-conv").count() === 0, "en Estibas no debería salir la conversión");
await pg.locator("button:has-text('Crear Vh Interno')").click();
await pg.waitForTimeout(200);
let r = await rpcs();
ok(r.length === 1 && r[0].n === "sider_viaje_interno_crear", "no llamó a sider_viaje_interno_crear: " + JSON.stringify(r.map((x) => x.n)));
ok(r[0]?.a.p_estibas === 15, "en estibas viaja " + r[0]?.a.p_estibas + " y no 15");
const cifrasEst = await pg.locator(".nv-cifras").innerText();

/* 2 · UNIDADES → ESTIBAS */
await base();
await escoge(0, "Costeña 175");
await modo(0, "Unidades").click();
ok((await lineaN(0).locator(".nv-est span").innerText()) === "Unidades", "la etiqueta del campo no dice Unidades");
await cant(0).fill("25920");
const conv = lineaN(0).locator(".nv-conv");
ok(await conv.count() === 1 && /=\s*15\s+estibas/.test(await conv.innerText()), "no dice «= 15 estibas»: " + (await conv.count() ? await conv.innerText() : "(nada)"));
ok(await conv.locator(".nv-aviso").count() === 0, "avisa de cajas sueltas cuando 25.920 completa cajas (1.080)");
const cifrasUni = await pg.locator(".nv-cifras").innerText();
ok(cifrasUni === cifrasEst, `las cifras difieren entre modos:\n  estibas: ${cifrasEst.replace(/\n/g, " ")}\n  unidades: ${cifrasUni.replace(/\n/g, " ")}`);
await pg.locator("button:has-text('Crear Vh Interno')").click();
await pg.waitForTimeout(200);
r = await rpcs();
ok(r.length === 1 && Math.abs(r[0]?.a.p_estibas - 15) < 1e-9, "en unidades viaja p_estibas=" + r[0]?.a.p_estibas + " (esperaba 15, no 25920)");

/* 3 · CAMBIAR DE MODO CONVIERTE, IDA Y VUELTA */
await base();
await escoge(0, "Costeña 175");
await cant(0).fill("15");
await modo(0, "Unidades").click();
ok(await cant(0).inputValue() === "25920", "15 estibas no pasó a 25920 unidades: " + await cant(0).inputValue());
await modo(0, "Estibas").click();
ok(await cant(0).inputValue() === "15", "volver a estibas no dejó 15: " + await cant(0).inputValue());
await cant(0).fill("0,5");
await modo(0, "Unidades").click();
ok(await cant(0).inputValue() === "864", "0,5 estibas no pasó a 864 unidades: " + await cant(0).inputValue());
await cant(0).fill("");
await modo(0, "Estibas").click();
ok(await cant(0).inputValue() === "", "un campo vacío no debe inventar un valor al cambiar de modo");

/* 4 · UNIDADES QUE NO COMPLETAN CAJAS: AVISO, NO BLOQUEO */
await base();
await escoge(0, "Costeña 175");
await modo(0, "Unidades").click();
await cant(0).fill("25925"); // 25.925 / 24 = 1080,2 cajas
ok(await lineaN(0).locator(".nv-aviso").count() === 1, "no avisa que 25.925 unidades no completan cajas");
ok(await pg.locator("button:has-text('Crear Vh Interno')").isEnabled(), "el aviso de cajas no debe bloquear el botón");

/* 5 · SIN FACTORES */
await base();
await escoge(0, "Caja plástica");
ok(await modo(0, "Unidades").isDisabled(), "Unidades debería estar deshabilitado sin factores");
ok(/factor de estiba/.test(await modo(0, "Unidades").getAttribute("title") ?? ""), "el título no dice qué factor falta");
ok(await modo(0, "Estibas").isEnabled(), "Estibas debería poder escogerse");
/* ya en unidades y luego un material sin factores: no se crea y lo dice */
await base();
await escoge(0, "Costeña 175");
await modo(0, "Unidades").click();
await cant(0).fill("1728");
await lineaN(0).locator("button", { hasText: "Cambiar" }).click();
await escoge(0, "Caja plástica");
ok(await pg.locator("button:has-text('Crear Vh Interno')").isDisabled(), "se puede crear en unidades con un material sin factores");
const falta = await pg.locator(".vj-falta").innerText();
ok(/factor de estiba/.test(falta), "no dice qué factor falta: " + falta);
await modo(0, "Estibas").click();
ok(await cant(0).inputValue() === "1728", "sin factores no se puede convertir: el número escrito debe quedar tal cual, quedó " + await cant(0).inputValue());
await cant(0).fill("3");
ok(await pg.locator("button:has-text('Crear Vh Interno')").isEnabled(), "con estibas debería poder crear aunque no haya factores");

/* 6 · VARIOS MATERIALES, CADA UNO CON SU MODO */
await base();
await escoge(0, "Costeña 175");
await cant(0).fill("10");
await pg.locator(".nv-mas-mat").click();
await escoge(1, "Costeñita Ámbar");           // 60 × 24 = 1.440 unidades por estiba
await modo(1, "Unidades").click();
await cant(1).fill("2880");                    // = 2 estibas
ok(/=\s*2\s+estibas/.test(await lineaN(1).locator(".nv-conv").innerText()), "la línea 2 no dice «= 2 estibas»");
await pg.locator("button:has-text('Crear Vh Interno')").click();
await pg.waitForTimeout(200);
r = await rpcs();
ok(r.length === 1 && r[0].n === "sider_viaje_interno_crear_varios", "no llamó al de varios: " + JSON.stringify(r.map((x) => x.n)));
const ls = r[0]?.a.p_lineas ?? [];
ok(ls.length === 2 && ls[0].sku === "3500887" && ls[0].estibas === 10, "línea 1 mal: " + JSON.stringify(ls[0]));
ok(ls[1]?.sku === "3500901" && Math.abs(ls[1].estibas - 2) < 1e-9, "línea 2 mal: " + JSON.stringify(ls[1]));

/* 8 · NADA SE SALE */
for (const ancho of [360, 390, 820, 1440]) {
  await monta("m=interno", ancho, 1300);
  await pg.locator(".nv-lista button").first().click();
  await modo(0, "Unidades").click();
  await cant(0).fill("25925");
  const d = await desborda();
  ok(d.doc <= 0 && d.r <= 0, `${ancho} px: se sale ${JSON.stringify(d)}`);
  const caja = await lineaN(0).locator(".nv-cant").boundingBox();
  const cab = await pg.locator(".vj-caja").boundingBox();
  ok(caja && cab && caja.x >= cab.x - 1 && caja.x + caja.width <= cab.x + cab.width + 1, `${ancho} px: la cantidad se sale de la caja`);
  const h = await modo(0, "Unidades").boundingBox();
  ok(h && h.height >= 40, `${ancho} px: los botones de modo miden ${h?.height} px (se tocan con guante: ≥ 40)`);
}

ok(err.length === 0, "errores de consola: " + err.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { console.log("FALLA:\n - " + fallas.join("\n - ")); process.exit(1) }
console.log("✓ Vh Interno: estibas o unidades, con conversión");
