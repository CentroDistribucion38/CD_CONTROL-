/* =====================================================================
   T1/T2 · SALIDA EN DOS TIEMPOS — LAS PANTALLAS

   La base (`correr-sider-fichas.sh`) prueba las reglas. Esto prueba lo
   que solo se ve MONTANDO las pantallas de verdad:

   1. CERTIFICAR ESCOGE VARIOS MATERIALES y cada uno abre su casilla de
      estibas al tocarlo; «Seguir» dice qué falta; en «Carga» ya está todo
      calculado y solo se pide la placa (NO la factura); guarda con UNA
      llamada `sider_ficha_guardar` con todas las líneas, sin factura y sin
      crear viajes; «Mis fichas pendientes» descarta con confirmación.
   2. DAR SALIDA: el botón solo se enciende con factura; la factura se
      limpia a mayúsculas; llama `sider_ficha_dar_salida` con la ficha y la
      factura; la ficha con fotos incompletas no se puede sacar; sin el
      permiso no hay campo ni botón de salida (solo descartar las suyas).
   3. NADA SE SALE en 360/390/820/1440.

     node .arnes/sd-fichas.mjs
   ===================================================================== */
import { abrir } from "./ms-lib.mjs";

const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const { nav, ctx, pg, monta, err } = await abrir();
const rpcs = () => pg.evaluate(() => window.__rpc);
const limpia = () => pg.evaluate(() => { window.__rpc = [] });
const txt = () => pg.evaluate(() => document.querySelector("#r").innerText);
const desborda = () => pg.evaluate(() => {
  const d = document.documentElement; const r = document.querySelector("#r");
  return { doc: d.scrollWidth - d.clientWidth, r: r.scrollWidth - r.clientWidth };
});

/* ============ 1 · CERTIFICAR ============ */
await monta("m=certificar", 390, 900);
await pg.click("text=Activar mi ubicación"); await pg.waitForTimeout(700);
await pg.click("button:has-text('Seguir')");
await pg.click("button:has-text('Apartadó')");
ok(/uno o varios/i.test(await txt()), "el paso Material no dice que se pueden escoger varios");
ok(await pg.$$eval(".ct-est", (e) => e.length) === 0, "aparecen casillas de estibas sin tocar ningún material");
await pg.click("button:has-text('Botella marrón 250 cc')");
ok(await pg.$$eval(".ct-est input", (e) => e.length) === 1, "al tocar un material no aparece su casilla de estibas");
await pg.click("button:has-text('Costeñita Ámbar 330 cc')");
ok(await pg.$$eval(".ct-est input", (e) => e.length) === 2, "el segundo material no abre su propia casilla");
const seg = pg.locator(".ct-botones .btn").first();
ok(await seg.isDisabled(), "«Seguir» está activo con las estibas vacías");
ok(/Faltan las estibas de 2 materiales/.test(await seg.innerText()), "«Seguir» no dice cuántos materiales faltan: " + await seg.innerText());
await pg.fill('input[aria-label="Estibas de Botella marrón 250 cc"]', "40");
ok(/Faltan las estibas de un material/.test(await seg.innerText()), "con uno lleno no dice «un material»");
await pg.fill('input[aria-label="Estibas de Costeñita Ámbar 330 cc"]', "10");
ok(!(await seg.isDisabled()) && /Seguir con 2 materiales/.test(await seg.innerText()), "con las dos llenas no dice «Seguir con 2 materiales»");
/* tocar de nuevo quita el material */
await pg.click("button:has-text('Costeñita Ámbar 330 cc')");
ok(await pg.$$eval(".ct-est input", (e) => e.length) === 1, "tocar otra vez no quita el material");
await pg.click("button:has-text('Costeñita Ámbar 330 cc')");
await pg.fill('input[aria-label="Estibas de Costeñita Ámbar 330 cc"]', "10");
await seg.click();

/* CARGA */
const cargas = await pg.$$eval(".ct-cargas li", (l) => l.map((x) => x.innerText.replace(/\s+/g, " ")));
ok(cargas.length === 2, "Carga no lista los dos materiales, lista " + cargas.length);
ok(cargas.some((c) => /40/.test(c) && /1\.800|1800/.test(c)), "Carga no muestra las cajas de 40 estibas × 45: " + cargas.join(" | "));
const etiquetas = await pg.$$eval(".ct-campos label span", (l) => l.map((x) => x.innerText));
ok(etiquetas[0] === "Placa", "el primer campo de Carga no es la placa: " + etiquetas.join(","));
ok(!etiquetas.some((e) => /factura/i.test(e)), "Carga pide la factura: " + etiquetas.join(","));
ok(!etiquetas.some((e) => /lote/i.test(e)), "Carga pide el lote: " + etiquetas.join(","));
ok(/no se pide aquí/i.test(await txt()), "Carga no explica que la factura la pone el facturador");
const sigFotos = pg.locator("button:has-text('Seguir a las fotos')");
ok(await sigFotos.isDisabled(), "se puede seguir a las fotos sin placa");
await pg.fill('.ct-campos input[placeholder="JYN141"]', "jyn141");
ok(await pg.inputValue('.ct-campos input[placeholder="JYN141"]') === "JYN141", "la placa no se pone en mayúscula");
await sigFotos.click();

/* FOTOS */
const fi = await pg.$$(".ct-foto input[type=file]");
await fi[0].setInputFiles("manual-sider/foto/izq.jpg");
await fi[1].setInputFiles("manual-sider/foto/der.jpg");
await fi[2].setInputFiles("manual-sider/foto/placa.jpg");
await pg.waitForFunction(() => [...document.querySelectorAll(".ct-botones .btn")].some((b) => /Seguir a guardar/.test(b.innerText)), null, { timeout: 15000 });
await pg.click("button:has-text('Seguir a guardar')");

/* GUARDAR */
const rev = await txt();
ok(/JYN141/.test(rev) && /Botella marrón/.test(rev) && /Ámbar/.test(rev), "Guardar no resume placa y los dos materiales");
ok(/todavía no sale/i.test(rev), "Guardar no avisa que el camión todavía no sale");
await limpia();
await pg.click("button:has-text('Guardar la ficha')");
await pg.waitForSelector("text=Ficha guardada", { timeout: 8000 });
const r = await rpcs();
const g = r.find((x) => x.n === "sider_ficha_guardar");
ok(!!g, "no llamó sider_ficha_guardar");
ok(r.filter((x) => x.n === "sider_ficha_guardar").length === 1, "llamó más de una vez sider_ficha_guardar");
ok(g && g.a.p_placa === "JYN141" && g.a.p_planta === "APA", "placa/planta mal enviadas: " + JSON.stringify(g?.a));
ok(g && JSON.stringify(g.a.p_lineas) === JSON.stringify([{ sku: "3501226", estibas: 40 }, { sku: "3500901", estibas: 10 }]),
   "p_lineas mal: " + JSON.stringify(g?.a.p_lineas));
ok(g && !("p_factura" in g.a), "Certificar manda factura");
ok(g && g.a.p_lote == null, "Certificar manda lote: " + g?.a.p_lote);
ok(!r.some((x) => /viaje|certific/i.test(x.n) && x.n !== "sider_ficha_guardar"), "Certificar crea viajes/certificaciones: " + r.map((x) => x.n).join(","));
ok(await pg.$$eval("a[href='/sider/salida']", (a) => a.length) === 1, "el final no manda a Dar salida");
ok(/pendiente/i.test(await txt()), "el final no dice que queda pendiente");

/* MIS FICHAS PENDIENTES (solo las del creador) */
await monta("m=certificar&f=1", 390, 900);
ok(await pg.$$eval(".ct-fichas > ul > li", (l) => l.length) === 2, "«Mis fichas» debería tener 2 (las de u1)");
ok(!/KLM872/.test(await pg.locator(".ct-fichas").innerText()), "«Mis fichas» muestra la de otra persona");
ok(/Le faltan fotos/.test(await pg.locator(".ct-fichas").innerText()), "no avisa que a la de 2 fotos le faltan fotos");
await limpia();
await pg.locator(".ct-fichas li").first().locator("button:has-text('Descartar')").click();
ok((await rpcs()).length === 0, "descartó sin pedir confirmación");
await pg.locator(".ct-fichas li").first().locator("button:has-text('Sí, descartar')").click();
await pg.waitForTimeout(300);
const d = (await rpcs()).find((x) => x.n === "sider_ficha_descartar");
ok(d && d.a.p_ficha === "f1", "descartar manda otra ficha: " + JSON.stringify(d));

/* ============ 2 · DAR SALIDA ============ */
await monta("m=salida&c=facturador", 390, 900);
ok(await pg.$$eval(".ds-ficha", (l) => l.length) === 3, "Dar salida no muestra las 3 fichas");
ok(/3\s+fichas por dar salida/.test(await txt()), "el contador no dice «3 fichas por dar salida»");
const f1 = pg.locator(".ds-ficha").nth(0);
ok(/JYN141/.test(await f1.innerText()) && /Botella Costeña 175 cc/.test(await f1.innerText()) && /Botella marrón 250 cc/.test(await f1.innerText()),
   "la ficha 1 no lista sus dos materiales");
ok(/1\.440/.test(await f1.innerText()), "la ficha 1 no calcula las cajas de 20 estibas × 72");
const b1 = f1.locator("button:has-text('Dar salida')");
ok(await b1.isDisabled(), "«Dar salida» activo sin factura");
ok(/Sin el número de factura/.test(await f1.innerText()), "no explica por qué está apagado");
await f1.locator("input").fill("fe-76 87.01942999");
ok(await f1.locator("input").inputValue() === "7687019429", "la factura no queda en solo números y máximo 10: " + await f1.locator("input").inputValue());
ok(!(await b1.isDisabled()), "con factura el botón sigue apagado");
await limpia();
await b1.click(); await pg.waitForTimeout(300);
const s = (await rpcs()).find((x) => x.n === "sider_ficha_dar_salida");
ok(s && s.a.p_ficha === "f1" && s.a.p_factura === "7687019429", "dar salida manda mal: " + JSON.stringify(s));
ok(/2 viajes en tránsito/.test(await txt()), "el aviso no cuenta los 2 viajes");
/* la de las 2 fotos */
const f3 = pg.locator(".ds-ficha").nth(2);
ok(await f3.locator("input").count() === 0 && await f3.locator("button:has-text('Dar salida')").count() === 0, "a la ficha de 2 fotos se le puede dar salida");
ok(/Le faltan fotos/.test(await f3.innerText()), "no dice que le faltan fotos");
ok(/tarde/.test(await f3.getAttribute("class")), "la de 14 h no se marca como tarde");
ok(!/tarde/.test(await f1.getAttribute("class")), "la de 1,5 h se marca como tarde");
/* la que trae un material sin factores */
ok(/Sin factores en el maestro/.test(await f3.innerText()), "no avisa del material sin factores");
/* descartar pide confirmación */
await limpia();
await f1.locator("button:has-text('Descartar')").click();
ok((await rpcs()).length === 0, "descartó sin confirmar");
await f1.locator("button:has-text('No')").click();
ok(await f1.locator("button:has-text('Descartar')").count() === 1, "«No» no cancela");

/* SIN PERMISO: quien certificó ve lo suyo, sin salida */
await monta("m=salida&c=creador", 390, 900);
ok(await pg.$$eval(".ds-ficha", (l) => l.length) === 2, "el creador debería ver solo las suyas");
ok(await pg.$$eval(".ds-accion, .ds-accion input", (l) => l.length) === 0, "quien no tiene el permiso ve el campo de factura");
ok(!(await pg.$$eval("button", (b) => b.some((x) => /Dar salida/.test(x.innerText)))), "quien no tiene el permiso ve «Dar salida»");
ok(/falta el permiso/i.test(await txt()), "no explica la falta del permiso");
ok(await pg.$$eval("button", (b) => b.some((x) => /Descartar/.test(x.innerText))), "el creador no puede descartar lo suyo");
/* SIN PERMISO Y AJENAS: nada */
await monta("m=salida&c=sinpermiso", 390, 900);
const soloAjenas = await pg.$$eval(".ds-ficha", (l) => l.filter((x) => /Certificó Cristian|Certificó Muchacho/.test(x.innerText)).length);
ok(soloAjenas >= 1, "no muestra quién certificó");
const ajena = pg.locator(".ds-ficha", { hasText: "KLM872" });
ok(await ajena.locator("button:has-text('Descartar')").count() === 0, "quien no tiene permiso puede descartar una ficha ajena");
/* vacío */
await monta("m=salida&c=vacio", 390, 900);
ok(/No hay fichas por dar salida/.test(await txt()), "el vacío no dice nada");

/* ============ 3 · NADA SE SALE ============ */
for (const [q, w] of [["m=salida&c=facturador", 360], ["m=salida&c=facturador", 390], ["m=salida&c=facturador", 820], ["m=salida&c=facturador", 1440],
                      ["m=certificar&f=1", 360], ["m=certificar&f=1", 820], ["m=certificar&f=1", 1440]]) {
  await monta(q, w, 900);
  const o = await desborda();
  ok(o.doc <= 0 && o.r <= 0, `${q} a ${w}px se sale de la pantalla: ${JSON.stringify(o)}`);
}
/* Certificar en el paso 3 con dos materiales a 360 y 1440 */
for (const w of [360, 1440]) {
  await monta("m=certificar", w, 900);
  await pg.click("text=Activar mi ubicación"); await pg.waitForTimeout(600);
  await pg.click("button:has-text('Seguir')"); await pg.click("button:has-text('Apartadó')");
  await pg.click("button:has-text('Botella marrón 250 cc')"); await pg.click("button:has-text('Costeñita Ámbar 330 cc')");
  let o = await desborda();
  ok(o.doc <= 0 && o.r <= 0, `Material a ${w}px se sale: ${JSON.stringify(o)}`);
  await pg.fill('input[aria-label="Estibas de Botella marrón 250 cc"]', "40");
  await pg.fill('input[aria-label="Estibas de Costeñita Ámbar 330 cc"]', "10");
  await pg.locator(".ct-botones .btn").first().click();
  o = await desborda();
  ok(o.doc <= 0 && o.r <= 0, `Carga a ${w}px se sale: ${JSON.stringify(o)}`);
}

ok(err.filter((e) => !/nominatim|ERR_/.test(e)).length === 0, "errores en consola: " + err.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Certificar con varios materiales, guardar, Mis fichas y Dar salida: todo pasa.");
