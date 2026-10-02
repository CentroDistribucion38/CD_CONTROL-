/* =====================================================================
   EN TRÁNSITO · UN CAMIÓN CON VARIOS MATERIALES = UNA SOLA TARJETA

   Al dar salida a una ficha con dos materiales nacen dos viajes con la
   misma placa, factura y hora. Aquí se prueba, montando la pantalla real:

   1. Se ve UNA tarjeta, con los dos materiales adentro y el total sumado;
      el camión suelto sigue siendo otra tarjeta; el CD cuenta camiones.
   2. La revisión AI se pide POR MATERIAL: el botón de cada uno llama a
      `sider_ai_marcar` con el viaje de ESE material, y la tarjeta dice
      «1 DE 2 MATERIALES».
   3. La llegada se certifica UNA vez y se aplica a los dos viajes.
   4. «Anular todo» anula los dos, con un solo motivo.
   5. Quien no administra no ve botones de AI, corregir ni anular.
   6. Nada se sale en 360/390/820/1440.

     node .arnes/sd-transito-multi.mjs
   ===================================================================== */
import { abrir } from "./ms-lib.mjs";
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const { nav, ctx, pg, monta, err } = await abrir();
const rpcs = () => pg.evaluate(() => window.__rpc);
const txt = () => pg.evaluate(() => document.querySelector("#r").innerText);
const desborda = () => pg.evaluate(() => {
  const d = document.documentElement; const r = document.querySelector("#r");
  return { doc: d.scrollWidth - d.clientWidth, r: r.scrollWidth - r.clientWidth };
});

/* 1 · UNA TARJETA */
await monta("m=transito&c=multi", 1100, 1000);
ok(await pg.locator("article.tr-vh").count() === 2, "debería haber 2 tarjetas (el camión de 2 materiales y el suelto), hay " + await pg.locator("article.tr-vh").count());
const camion = pg.locator("article.tr-vh", { hasText: "ABC569" });
ok(await camion.count() === 1, "ABC569 sale en " + await camion.count() + " tarjetas");
ok(await camion.locator(".tr-mats li").count() === 2, "la tarjeta no lista sus dos materiales");
const t = await camion.innerText();
ok(/BOTELLA FLINT 250 CC/.test(t) && /Envase Costeñita 175R/.test(t), "faltan los nombres de los materiales");
ok(/7687019429/.test(t) && /2 materiales/.test(t), "no dice la factura ni «2 materiales»");
const tot = await camion.locator(".tr-cifras dd").allInnerTexts();
ok(tot[0] === "45" && tot[2] === "2.250", "el total no suma los dos materiales: " + tot.join("|"));
ok(/2 vehículos/.test(await txt()), "el CD no cuenta camiones (2): " + (await txt()).match(/\d+ vehículos?/)?.[0]);
ok(await camion.locator("button:has-text('Certificar llegada')").count() === 1, "más de un «Certificar llegada» en el mismo camión");
ok(await camion.locator("button:has-text('Anular todo')").count() === 1, "no hay «Anular todo»");

/* 1b · NADA SE QUEDA PEGADO ARRIBA: el encabezado del CD rueda con la página (pegado, tapaba el borde de la tarjeta). */
for (const ancho of [1100, 390]) {
  await monta("m=transito&c=multi", ancho, 700);
  const pos = await pg.evaluate(() => getComputedStyle(document.querySelector(".tr-grupo-cab")).position);
  ok(pos === "static", `${ancho} px: el encabezado del CD está ${pos} y no rueda con la página`);
  const quedo = await pg.evaluate(async () => {
    const cab = document.querySelector(".tr-grupo-cab"); const y0 = cab.getBoundingClientRect().top;
    window.scrollBy(0, 200); await new Promise((r) => setTimeout(r, 50));
    return { y0, y1: cab.getBoundingClientRect().top, rodo: window.scrollY };
  });
  ok(quedo.rodo === 0 || quedo.y1 < quedo.y0, `${ancho} px: al bajar, el encabezado se queda en su sitio (${quedo.y0} → ${quedo.y1})`);
}

/* 1c · EN EL CELULAR RUEDA LA PÁGINA ENTERA: lo de arriba (en camino, atención, filtrar) no se queda fijo
   y las tarjetas no van en una ventanita con su propio scroll. */
await monta("m=transito&c=multi", 390, 600);
{
  const r = await pg.evaluate(async () => {
    const cuerpo = document.querySelector(".tr-cuerpo"), cs = getComputedStyle(cuerpo);
    const kpi = document.querySelector(".cabeza, h1"); const y0 = kpi.getBoundingClientRect().top;
    window.scrollTo(0, 300); await new Promise((r) => setTimeout(r, 80));
    return { maxH: cs.maxHeight, ov: cs.overflowY, interno: cuerpo.scrollHeight - cuerpo.clientHeight,
             y0, y1: kpi.getBoundingClientRect().top, rodo: window.scrollY, docAlto: document.documentElement.scrollHeight, vista: innerHeight };
  });
  ok(r.maxH === "none" && r.ov === "visible", `390 px: el cuerpo de tránsito rueda por dentro (max-height ${r.maxH}, overflow ${r.ov})`);
  ok(r.interno <= 1, `390 px: las tarjetas van en una caja con scroll propio (${r.interno} px de más)`);
  ok(r.rodo === 0 || r.y1 < r.y0, `390 px: lo de arriba se queda fijo al bajar (${r.y0} → ${r.y1})`);
}

/* 2 · REVISIÓN AI POR MATERIAL */
await monta("m=transito&c=multi", 390, 1400);
await pg.evaluate(() => { window.__rpc = [] });
const fila2 = pg.locator(".tr-mats li", { hasText: "Costeñita 175R" });
await fila2.locator("button:has-text('Pedir revisión AI')").click();
await pg.locator("button:has-text('Solicitar revisión')").click();
await pg.waitForTimeout(300);
const m = (await rpcs()).find((x) => x.n === "sider_ai_marcar");
ok(m && m.a.p_viaje === "t2" && m.a.p_marcar === true, "pedir AI del 2.º material manda otro viaje: " + JSON.stringify(m));
ok((await rpcs()).filter((x) => x.n === "sider_ai_marcar").length === 1, "pidió AI de más de un material");
await monta("m=transito&c=multi-ai", 390, 1400);
const c2 = pg.locator("article.tr-vh", { hasText: "ABC569" });
ok(/1 DE 2 MATERIALES/.test(await c2.innerText()), "no dice «1 DE 2 MATERIALES»: " + (await c2.locator("header").innerText()));
ok(await c2.locator(".tr-mats li.ai").count() === 1, "debería marcar UN material con AI");
ok(await c2.locator(".tr-mats li:not(.ai) button:has-text('Pedir revisión AI')").count() === 1, "el otro material no ofrece pedirla");
ok(await c2.locator(".tr-mats li.ai button:has-text('Quitar revisión AI')").count() === 1, "el marcado no ofrece quitarla");

/* 3 · UNA LLEGADA PARA LOS DOS */
await monta("m=transito&c=multi", 390, 900);
await pg.evaluate(() => { window.__rpc = [] });
await pg.locator("article.tr-vh", { hasText: "ABC569" }).locator("button:has-text('Certificar llegada')").click();
ok(/BOTELLA FLINT 250 CC \(20 estibas\) \+ Envase Costeñita 175R \(25 estibas\)/.test(await txt()), "la pantalla de llegada no nombra los dos materiales: " + (await txt()).slice(0, 300));
await pg.click("text=Activar mi ubicación"); await pg.waitForTimeout(800);
await pg.click("button:has-text('Seguir')");
const fi = await pg.$$("input[type=file]");
await fi[0].setInputFiles("manual-sider/foto/izq.jpg"); await fi[1].setInputFiles("manual-sider/foto/der.jpg"); await fi[2].setInputFiles("manual-sider/foto/placa.jpg");
await pg.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Certificar la llegada/.test(b.innerText) && !b.disabled), null, { timeout: 15000 });
await pg.click("button:has-text('Certificar la llegada')");
await pg.waitForTimeout(1200);
const ll = (await rpcs()).filter((x) => x.n === "sider_certificar_llegada");
ok(ll.length === 2 && ll.map((x) => x.a.p_viaje_id).sort().join() === "t1,t2", "la llegada no se aplicó a los dos viajes: " + JSON.stringify(ll.map((x) => x.a.p_viaje_id)));
ok(ll.length === 2 && ll[0].a.p_lat === ll[1].a.p_lat, "los dos viajes no llevan la misma ubicación");
ok(/ABC569 \(2 materiales\) quedó recibido/.test(await txt()), "el aviso final no dice «2 materiales»: " + (await txt()).slice(0, 200));

/* 4 · ANULAR TODO */
await monta("m=transito&c=multi", 390, 1400);
await pg.evaluate(() => { window.__rpc = [] });
await pg.locator("article.tr-vh", { hasText: "ABC569" }).locator("button:has-text('Anular todo')").click();
ok(/ANULAR 2 VIAJES/.test(await txt()), "el cuadro no dice «ANULAR 2 VIAJES»");
ok(!/ABC569, ABC569/.test(await txt()), "el cuadro repite la placa");
await pg.fill("input[placeholder^='Se digit'], textarea", "Se digitó dos veces");
await pg.locator(".vj-caja button:has-text('Anular los 2')").click();
await pg.waitForTimeout(500);
const an = (await rpcs()).filter((x) => x.n === "sider_viaje_anular");
ok(an.length === 2 && an.map((x) => x.a.p_id).sort().join() === "t1,t2", "no anuló los dos viajes: " + JSON.stringify(an));

/* 5 · SIN PERMISO */
await monta("m=transito&c=multi-lectura", 390, 1400);
ok(await pg.locator("button:has-text('Revisión AI'), button:has-text('Anular'), button:has-text('Corregir')").count() === 0, "quien no administra ve botones de administrador");
ok(await pg.locator("article.tr-vh", { hasText: "ABC569" }).locator("button:has-text('Certificar llegada')").count() === 1, "el que certifica no ve «Certificar llegada»");

/* 6 · NADA SE SALE */
for (const c of ["multi", "multi-ai"]) for (const w of [360, 390, 820, 1440]) {
  await monta("m=transito&c=" + c, w, 1200);
  const o = await desborda();
  ok(o.doc <= 0 && o.r <= 0, `${c} a ${w}px se sale: ${JSON.stringify(o)}`);
}

ok(err.filter((e) => !/nominatim|ERR_/.test(e)).length === 0, "errores en consola: " + err.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ En tránsito: un camión con varios materiales es UNA tarjeta; la AI se pide por material; la llegada y la anulación se aplican a todos.");
