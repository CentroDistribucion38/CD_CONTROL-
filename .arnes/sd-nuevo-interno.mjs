/* =====================================================================
   CREAR UN VH INTERNO · LA CANTIDAD SE ESCRIBE EN UNIDADES

   «Déjalo mejor solo en unidades e internamente haces la conversión para
    tener los dos datos.»

   Se monta el formulario real (maestro de pruebas: 3500887 trae 72 cajas
   por estiba × 24 unidades por caja = 1.728 unidades por estiba; 3500901
   trae 60 × 24 = 1.440; 3500999 no trae factores) y se prueba:

   1. Un solo campo, «Unidades»: no hay selector de Estibas.
   2. 25.920 unidades → «= 15 estibas», y al guardar viaja p_estibas = 15
      (la base guarda estibas, no 25920). Las cifras de cajas y Sider salen.
   3. Unidades que no completan cajas enteras → aviso (no bloquea).
   4. Material sin factores: no se puede crear y dice cuál falta.
   5. Varios materiales: cada uno en unidades, enviados ya convertidos.
   6. Nada se sale en 360/390/820/1440.

     node .arnes/sd-nuevo-interno.mjs
   ===================================================================== */
import { abrir } from "./ms-lib.mjs";
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const { nav, pg, monta, err } = await abrir();
const rpcs = () => pg.evaluate(() => window.__rpc);
const lineaN = (i) => pg.locator(".nv-linea").nth(i);
const cant = (i) => lineaN(i).locator(".nv-est input");
const crear = () => pg.locator("button:has-text('Crear Vh Interno')");
const desborda = () => pg.evaluate(() => {
  const d = document.documentElement; const r = document.querySelector("#r");
  return { doc: d.scrollWidth - d.clientWidth, r: r.scrollWidth - r.clientWidth };
});

async function base() {
  await monta("m=interno", 390, 1400);
  await pg.evaluate(() => { window.__rpc = [] });
  await pg.locator(".nv-canal-bot button", { hasText: "T1" }).click();
  await pg.locator(".nv-doc input").fill("7687019429");
  await pg.locator(".nv-placa input").fill("ABC123");
  await pg.locator("select").filter({ hasText: "escoge el CD" }).selectOption({ label: "Apartadó" });
}
const escoge = async (i, texto) => { await lineaN(i).locator(".nv-lista button", { hasText: texto }).first().click() };

/* 1 · UN SOLO CAMPO, EN UNIDADES */
await base();
await escoge(0, "Costeña 175");
ok(await lineaN(0).locator(".nv-modo").count() === 0, "sigue el selector Estibas/Unidades");
ok(await lineaN(0).locator("button", { hasText: /^Estibas$/ }).count() === 0, "queda un botón «Estibas»");
ok((await lineaN(0).locator(".nv-est span").innerText()) === "Unidades", "la etiqueta del campo no dice Unidades");
ok(await lineaN(0).locator(".nv-est input").count() === 1, "debe haber un solo campo de cantidad");
ok(await lineaN(0).locator(".nv-conv").count() === 0, "sin escribir nada no debería salir la conversión");
ok(await crear().isDisabled(), "con la cantidad vacía el botón debe estar apagado");
ok(/las unidades/.test(await pg.locator(".vj-falta").innerText()), "no dice que faltan las unidades: " + await pg.locator(".vj-falta").innerText());

/* 2 · UNIDADES → ESTIBAS EN LA BASE */
await cant(0).fill("25920");
const conv = lineaN(0).locator(".nv-conv");
ok(await conv.count() === 1 && /=\s*15\s+estibas/.test(await conv.innerText()), "no dice «= 15 estibas»: " + (await conv.count() ? await conv.innerText() : "(nada)"));
ok(await conv.locator(".nv-aviso").count() === 0, "avisa de cajas sueltas cuando 25.920 completa cajas (1.080)");
const cif = (await pg.locator(".nv-cifras").innerText()).replace(/\s+/g, " ");
ok(/sider\s*0,42/i.test(cif) && /cajas\s*1\.080/i.test(cif) && /unidades\s*25\.920/i.test(cif), "las cifras no cuadran (15 estibas = 0,42 siders, 1.080 cajas, 25.920 unidades): " + cif);
await crear().click();
await pg.waitForTimeout(200);
let r = await rpcs();
ok(r.length === 1 && r[0].n === "sider_viaje_interno_crear", "no llamó a sider_viaje_interno_crear: " + JSON.stringify(r.map((x) => x.n)));
ok(Math.abs(r[0]?.a.p_estibas - 15) < 1e-9, "viaja p_estibas=" + r[0]?.a.p_estibas + " (esperaba 15, no 25920)");
await cant(0).fill("1000,5");
ok(/=\s*0,579\s+estibas/.test(await lineaN(0).locator(".nv-conv").innerText()), "la coma decimal no convierte: " + await lineaN(0).locator(".nv-conv").innerText());

/* 3 · UNIDADES QUE NO COMPLETAN CAJAS: AVISO, NO BLOQUEO */
await base();
await escoge(0, "Costeña 175");
await cant(0).fill("25925"); // 25.925 / 24 = 1080,2 cajas
ok(await lineaN(0).locator(".nv-aviso").count() === 1, "no avisa que 25.925 unidades no completan cajas");
ok(await crear().isEnabled(), "el aviso de cajas no debe bloquear el botón");

/* 4 · SIN FACTORES: NO SE PUEDE CONVERTIR */
await base();
await escoge(0, "Caja plástica");
await cant(0).fill("1728");
ok(await lineaN(0).locator(".nv-conv").count() === 0, "sin factores no se puede decir a cuántas estibas equivale");
ok(await crear().isDisabled(), "se puede crear con un material sin factores (no hay cómo pasar a estibas)");
const falta = await pg.locator(".vj-falta").innerText();
ok(/factor de estiba/.test(falta) && /Maestro/.test(falta), "no dice qué factor falta ni dónde: " + falta);
ok(await pg.locator(".nv-lin-cif.no").count() === 1, "la línea no avisa que le falta el factor");

/* 5 · VARIOS MATERIALES, TODOS EN UNIDADES */
await base();
await escoge(0, "Costeña 175");
await cant(0).fill("17280");                   // = 10 estibas
await pg.locator(".nv-mas-mat").click();
await escoge(1, "Costeñita Ámbar");           // 60 × 24 = 1.440 unidades por estiba
await cant(1).fill("2880");                    // = 2 estibas
ok(/=\s*10\s+estibas/.test(await lineaN(0).locator(".nv-conv").innerText()), "la línea 1 no dice «= 10 estibas»");
ok(/=\s*2\s+estibas/.test(await lineaN(1).locator(".nv-conv").innerText()), "la línea 2 no dice «= 2 estibas»");
await crear().click();
await pg.waitForTimeout(200);
r = await rpcs();
ok(r.length === 1 && r[0].n === "sider_viaje_interno_crear_varios", "no llamó al de varios: " + JSON.stringify(r.map((x) => x.n)));
const ls = r[0]?.a.p_lineas ?? [];
ok(ls.length === 2 && ls[0].sku === "3500887" && Math.abs(ls[0].estibas - 10) < 1e-9, "línea 1 mal: " + JSON.stringify(ls[0]));
ok(ls[1]?.sku === "3500901" && Math.abs(ls[1].estibas - 2) < 1e-9, "línea 2 mal: " + JSON.stringify(ls[1]));

/* 6 · NADA SE SALE */
for (const ancho of [360, 390, 820, 1440]) {
  await monta("m=interno", ancho, 1300);
  await pg.locator(".nv-lista button").first().click();
  await cant(0).fill("25925");
  const d = await desborda();
  ok(d.doc <= 0 && d.r <= 0, `${ancho} px: se sale ${JSON.stringify(d)}`);
  const caja = await lineaN(0).locator(".nv-cant").boundingBox();
  const cab = await pg.locator(".vj-caja").boundingBox();
  ok(caja && cab && caja.x >= cab.x - 1 && caja.x + caja.width <= cab.x + cab.width + 1, `${ancho} px: la cantidad se sale de la caja`);
}

ok(err.length === 0, "errores de consola: " + err.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { console.log("FALLA:\n - " + fallas.join("\n - ")); process.exit(1) }
console.log("✓ Vh Interno: la cantidad va en unidades y se convierte a estibas por dentro");
