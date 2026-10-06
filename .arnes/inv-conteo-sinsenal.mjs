/* =====================================================================
   CONTAR SIN SEÑAL — el componente de verdad, en Chromium, con la señal
   cayéndose y volviendo.
   «Si estoy contando y se va la señal, ¿se me borra todo? Que se vaya
   guardando y cuando tenga señal lo pueda enviar.»
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_ss-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Contar } from "../src/app/(app)/inventario/conteo/Contar";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Contar bodegaId="b1" conteoInicial={{ id: "c1", codigo: "INV-1", estado: "en_proceso", iniciado_en: null }}
  renglonesIniciales={w.REN} materiales={w.MAT} ubicaciones={w.UBI} estados={[]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ss-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_sb-sinsenal.js"), "next/navigation": R(".arnes/stub-nav.js"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const PROD = (id, sku) => ({ id, sku, nombre: "Águila " + sku, unidades_por_caja: 30, cajas_por_estiba: 80, unidades_por_estiba: 2400, contenido: null,
  familia: null, presentacion: null, vida_util: 180, f_limite_desp: null, dias_minimo: 30, origen: null, foraneo: null, tipo_material: "PRODUCTO", activo: true });
const MAT = [PROD("m2", "3128"), { id: "m1", sku: "900", nombre: "Canasta 30", unidades_por_caja: 30, cajas_por_estiba: 40, unidades_por_estiba: 1200, contenido: null,
  familia: null, presentacion: null, vida_util: null, f_limite_desp: null, dias_minimo: 0, origen: null, foraneo: null, tipo_material: "ENVASE", activo: true }];
const U = (calle, modulo, lado) => ({ id: `${calle}${modulo}${lado ?? ""}`, bodega_id: "b1", clave: `${calle}${modulo}${lado ? "_" + lado : ""}`, calle, modulo, lado, familia: null, capacidad: 10, activa: true });
const UBI = [U("A", "01", "IZQ"), U("A", "01", "DER"), U("B", "02", null), U("C", "03", "IZQ")];
const FILA = { id: "r1", conteo_id: "c1", conteo: "INV-1", estado: "en_proceso", codigo: "900", material: "Canasta 30", tipo_material: "ENVASE", familia: null,
  factor_estibado: 40, ubicacion: "A01_IZQ", ubicacion_id: "A01IZQ", calle: "A", modulo: "01", lado: "IZQ", estibas: 7, saldo: null, cajas: null,
  total_cajas: 280, venc_dia: null, venc_mes: null, venc_anio: null, rotacion: false, averia: false, pnc: false, estado_envase: null, nota: null,
  contado_en: new Date().toISOString(), dias_para_salir: null };
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ viewport: { width: 390, height: 900 } });
const pg = await ctx.newPage();
const CSS = process.env.FOTO ? readFileSync(R("src/app/globals.css"), "utf8") + readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8") + ".av-pila{display:none!important}" : "";
const HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${CSS}</style></head><body><div id="r"></div><script>window.MAT=${JSON.stringify(MAT)};window.UBI=${JSON.stringify(UBI)};window.REN=${JSON.stringify([FILA])};window.__DATOS={v_conteo_fefo:${JSON.stringify([FILA])}};</script><script>${js}</script></body></html>`;
await pg.route("http://t.local/**", (r) => r.fulfill({ contentType: "text/html", body: HTML }));
await pg.addInitScript(() => { try { if (localStorage.getItem("__test_red")) window.__red = true } catch {} });
const abrir = async () => { await pg.goto("http://t.local/conteo"); await pg.waitForSelector(".fe-anotar") };
const llamadas = () => pg.evaluate(() => window.__llamadas ?? []);
const agregadas = async (soloOk = true) => (await llamadas()).filter((l) => l.fn === "conteo_fefo_agregar" && (!soloOk || !l.red));
const colaGuardada = () => pg.evaluate(() => { try { return JSON.parse(localStorage.getItem("fefo.cola.c1") ?? "null") } catch { return "rota" } });
const escoger = async (n, texto) => {
  const campo = pg.locator(".bs-campo").nth(n);
  await campo.click(); await campo.fill(texto);
  await pg.locator(".bs-lista [role=option]").first().dispatchEvent("mousedown");
};
const renglon = async (lado, cant) => {
  if (lado) await pg.click(`[aria-labelledby=fe-rot-lado] button:has-text("${lado}")`);
  await pg.fill('input[placeholder="Teclea el código"]', "900");
  /* EL FLUJO: un envase pide estado antes de «Cuánto». */
  await pg.locator(".fe-estenv:not(:has(button.on)) .fe-estados button").first().click({ timeout: 400 }).catch(() => {});
  await pg.locator(".fe-cuanto-campo input").first().fill(String(cant));
  await pg.click(".btn.grande"); await pg.waitForTimeout(300);
};
const texto = () => pg.evaluate(() => document.body.innerText);
const nCola = async () => { const c = await colaGuardada(); return Array.isArray(c) ? c.length : c === null ? 0 : -1 };

/* 1 · CON SEÑAL TODO SIGUE COMO SIEMPRE: se guarda de una y no hay aviso. */
await abrir();
await escoger(0, "A"); await escoger(1, "01");
await renglon("Izquierdo", 3);
ok((await agregadas()).length === 1, "con señal el renglón no se guardó en la base");
ok(!(await pg.$(".fe-cola")), "con señal y nada pendiente aparece el aviso de cola");
ok((await nCola()) === 0, "con señal quedó algo guardado en el teléfono");

/* 2 · SE VA LA SEÑAL: seguir anotando no se bloquea y nada se manda. */
await ctx.setOffline(true);
await pg.waitForSelector(".fe-cola.sin");
ok(/Sin señal/.test(await pg.textContent(".fe-cola")), "sin señal no avisa que está sin señal");
await escoger(0, "B"); await escoger(1, "02");
await renglon(null, 5);
ok((await agregadas(false)).length === 1, "sin señal intentó mandar el renglón en vez de guardarlo en el teléfono");
ok((await nCola()) === 1, `sin señal el renglón no quedó guardado en el teléfono (${await nCola()})`);
ok(/1\s*renglón sin enviar/.test(await pg.textContent(".fe-cola")), "el aviso no dice «1 renglón sin enviar»");
ok(/\+1/.test(await pg.textContent(".fe-pes-conteo")), "la pestaña del borrador no lleva el «+1»");
ok((await pg.inputValue('input[placeholder="Teclea el código"]')) === "", "después de dejarlo pendiente el formulario no queda limpio para el siguiente");
await escoger(0, "A"); await escoger(1, "01");
await renglon("Derecho", 4);
ok((await nCola()) === 2, "el segundo renglón sin señal no quedó guardado");
ok(/2\s*renglones sin enviar/.test(await pg.textContent(".fe-cola")), "el aviso no dice «2 renglones sin enviar»");
ok(!(await pg.$(".fe-cola button:has-text('Enviar ahora')")), "sin señal ofrece «Enviar ahora»");
const g = await colaGuardada();
ok(g[0]?.sku === "900" && g[0]?.lugar === "B02" && g[1]?.lugar === "A01_DER", `lo guardado no está en orden o sin su lugar: ${JSON.stringify(g?.map?.((x) => x.lugar))}`);
if (process.env.FOTO) { await pg.evaluate(() => window.scrollTo(0, 0)); await pg.screenshot({ path: process.env.FOTO + "/cs-sinsenal.png" }); await pg.locator(".fe-cola").screenshot({ path: process.env.FOTO + "/cs-cola.png" }) }

/* 3 · CORREGIR UN RENGLÓN QUE YA ESTÁ EN LA BASE NECESITA SEÑAL: se avisa y no se encola. */
await pg.click('.fe-pes-conteo button:has-text("borrador")');
await pg.click(".fe-fila .fe-mini:has-text('Corregir')");
await pg.locator(".fe-estenv:not(:has(button.on)) .fe-estados button").first().click({ timeout: 400 }).catch(() => {});
await pg.fill(".fe-cuanto-campo input >> nth=0", "9");
await pg.click(".btn.grande"); await pg.waitForTimeout(300);
ok(/corregir un renglón que ya está en la base necesita conexión/i.test(await texto()), "corregir sin señal no explicó que necesita señal");
ok((await nCola()) === 2, "corregir sin señal se metió en la cola");
ok(!(await llamadas()).some((l) => l.fn === "conteo_fefo_editar"), "corregir sin señal llamó a la base");
await pg.click(".fe-anotar-cab .fe-mini:has-text('Dejarlo como estaba')");

/* 4 · CON PENDIENTES NO SE DEJA ENVIAR EL CONTEO (firmaría sin ellos). */
await pg.click('.fe-pes-conteo button:has-text("borrador")');
await pg.click(".fe-enviar .btn.grande");
await pg.waitForTimeout(200);
ok(/2 renglones sin enviar en este teléfono/.test(await texto()), "con pendientes dejó enviar el conteo o no explicó por qué");
ok(!(await pg.$(".dialogo, [role=dialog], [role=alertdialog]")), "con pendientes abrió la confirmación de enviar");

/* 5 · SE CIERRA Y SE ABRE LA PÁGINA: lo pendiente sigue ahí. Vuelve la
       señal pero el servidor no contesta (la señal «existe» y no sirve):
       no se pierde nada ni se manda en desorden. */
await pg.evaluate(() => { localStorage.setItem("__test_red", "1"); window.__red = true });
await ctx.setOffline(false);
await pg.waitForTimeout(400);
ok((await nCola()) === 2, "al volver la señal con el servidor caído se perdió algo de la cola");
await abrir();
await pg.waitForTimeout(500);
ok((await nCola()) === 2, `al recargar la página se perdieron los pendientes (${await nCola()})`);
ok(/2\s*renglones sin enviar/.test(await pg.textContent(".fe-cola")), "al recargar no vuelve el aviso de pendientes");
ok((await agregadas(false)).length >= 1 && (await agregadas(true)).length === 0, "con el servidor caído el envío no se cortó en el primero");
ok((await agregadas(false)).length === 1, `con la red caída insistió con más de un renglón: ${(await agregadas(false)).length}`);
ok(!!(await pg.$(".fe-cola button:has-text('Enviar ahora')")), "con señal y pendientes no hay botón «Enviar ahora»");

/* 6 · VUELVE EL SERVIDOR: «Enviar ahora» los sube de a uno y EN ORDEN. */
await pg.evaluate(() => { localStorage.removeItem("__test_red"); window.__red = false; window.__llamadas = [] });
await pg.click(".fe-cola button:has-text('Enviar ahora')");
await pg.waitForTimeout(500);
const a = await agregadas();
ok(a.length === 2, `«Enviar ahora» no subió los dos (${a.length})`);
ok(a[0]?.args.p_ubicacion === "B02" && a[1]?.args.p_ubicacion === "A01DER", `subió en otro orden: ${a.map((x) => x.args.p_ubicacion)}`);
ok(a[0]?.args.p_estibas === 5 && a[1]?.args.p_estibas === 4 && a[0]?.args.p_sku === "900" && a[0]?.args.p_conteo === "c1", "los renglones subieron con otras cantidades o sin conteo");
ok((await nCola()) === 0 && !(await pg.$(".fe-cola")), "después de subir siguen pendientes o el aviso");
ok(await pg.evaluate(() => localStorage.getItem("fefo.cola.c1") === null), "la cola vacía dejó basura en el teléfono");

/* 7 · VUELVE LA SEÑAL SOLA: sin tocar nada se sube (evento «online»). */
await pg.evaluate(() => { window.__llamadas = [] });
await ctx.setOffline(true); await pg.waitForSelector(".fe-cola.sin");
await escoger(0, "A"); await escoger(1, "01");
await renglon("Derecho", 6);
ok((await nCola()) === 1, "el renglón sin señal no quedó pendiente");
await ctx.setOffline(false);
await pg.waitForFunction(() => !document.querySelector(".fe-cola"), null, { timeout: 4000 }).catch(() => null);
ok((await agregadas()).length === 1 && (await agregadas())[0].args.p_estibas === 6, "al volver la señal no se envió solo");
ok((await nCola()) === 0, "al volver la señal el pendiente no salió de la cola");

/* 7b · CON SEÑAL, LA BASE DICE «YA EXISTE UNO IGUAL»: se explica en claro (mismo estado del envase)
        y no se vuelve un pendiente. */
await pg.evaluate(() => { window.__dup = true });
await escoger(0, "A"); await escoger(1, "01");
await renglon("Derecho", 5);
ok(/MISMO estado del envase/.test(await texto()), "un repetido con señal no explicó lo del estado del envase");
ok(!/duplicate key|conteo_lineas_unico/.test(await texto()), "un repetido con señal enseñó el error técnico de la base");
ok((await nCola()) === 0, "un repetido con señal quedó como pendiente");
await pg.evaluate(() => { window.__dup = false; window.__llamadas = [] });

/* 8 · SE CAYÓ LA SEÑAL DESPUÉS DE QUE EL RENGLÓN LLEGÓ: el reenvío rebota
       por «ya existe». Si es el MISMO renglón, se quita solo; si la
       cantidad es otra, se queda con su aviso y NO se duplica. */
await pg.evaluate(() => { window.__llamadas = [] });
await ctx.setOffline(true); await pg.waitForSelector(".fe-cola.sin");
await escoger(0, "A"); await escoger(1, "01");
await renglon("Izquierdo", 7);             /* igual al de la base (r1: 7 estibas en A01_IZQ) */
await renglon(null, 9).catch(() => null);  /* ya sin lado escogido: no debe anotar nada */
await pg.evaluate(() => { while (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); break } });
await escoger(0, "A"); await escoger(1, "01");
await pg.click('[aria-labelledby=fe-rot-lado] button:has-text("Izquierdo")');
await pg.fill('input[placeholder="Teclea el código"]', "900");
/* EL FLUJO: un envase pide estado antes de «Cuánto». */
await pg.locator(".fe-estenv:not(:has(button.on)) .fe-estados button").first().click({ timeout: 400 }).catch(() => {});
await pg.locator(".fe-cuanto-campo input").first().fill("9");   /* cantidad distinta a la de la base */
await pg.click(".btn.grande"); await pg.waitForTimeout(300);
ok((await nCola()) >= 2, `no quedaron los dos pendientes del caso de duplicados (${await nCola()})`);
/* la base (otro teléfono, o este mismo antes de caerse) ya tiene el renglón de 7 con el estado que se escogió */
await pg.evaluate(() => { window.__DATOS.v_conteo_fefo[0].estado_envase = "RETORNO"; window.__dup = true });
await ctx.setOffline(false);
await pg.waitForTimeout(800);
const quedan = await colaGuardada();
ok(Array.isArray(quedan) && quedan.length === 1 && /OTRA cantidad/.test(quedan[0].error ?? "") && /mismo estado del envase/.test(quedan[0].error ?? ""), `el duplicado con otra cantidad no quedó con su aviso: ${JSON.stringify(quedan)}`);
ok(Array.isArray(quedan) && quedan[0]?.bb.estibas === "9", "quedó el renglón equivocado (debía quedar el de 9, no el igual al de la base)");
ok(/OTRA cantidad/.test(await texto()) && !!(await pg.$(".fe-cola details[open]")), "el aviso del duplicado no se muestra abierto");
/* «Quitar» lo descarta, y solo a ese. */
await pg.click(".fe-cola li button:has-text('Quitar')");
ok((await nCola()) === 0 && !(await pg.$(".fe-cola")), "«Quitar» no dejó la cola vacía");

/* 9 · LA BASE RECHAZA POR OTRA RAZÓN (no es la señal): se queda con su error, no se pierde. */
await pg.evaluate(() => { window.__dup = false; window.__rechaza = true });
await ctx.setOffline(true); await pg.waitForSelector(".fe-cola.sin");
await escoger(0, "A"); await escoger(1, "01");
await renglon("Derecho", 2);
await ctx.setOffline(false);
await pg.waitForTimeout(800);
const r = await colaGuardada();
ok(Array.isArray(r) && r.length === 1 && /Falta decir si rota/.test(r[0].error ?? "") && !r[0].duplicado, `un rechazo de la base no se quedó con su error: ${JSON.stringify(r)}`);

/* 10 · CON «SEÑAL» PERO LA RED CAÍDA, UN RENGLÓN NUEVO TAMBIÉN SE GUARDA; UNA CORRECCIÓN, NO. */
await pg.click(".fe-cola li button:has-text('Quitar')");
await pg.evaluate(() => { window.__rechaza = false; window.__red = true; window.__llamadas = [] });
await escoger(0, "A"); await escoger(1, "01");
await renglon("Derecho", 8);
ok((await nCola()) === 1, "con la red caída (aunque el navegador diga que hay señal) el renglón no quedó pendiente");
ok(!(await pg.$(".fe-cola.sin")) && !!(await pg.$(".fe-cola")), "con señal y pendientes el aviso debía ser el de pendientes, no el de «sin señal»");
await pg.click('.fe-pes-conteo button:has-text("borrador")');
await pg.click(".fe-fila .fe-mini:has-text('Corregir')");
await pg.locator(".fe-estenv:not(:has(button.on)) .fe-estados button").first().click({ timeout: 400 }).catch(() => {});
await pg.fill(".fe-cuanto-campo input >> nth=0", "11");
await pg.click(".btn.grande"); await pg.waitForTimeout(300);
ok((await nCola()) === 1, "una corrección con la red caída entró a la cola");
ok(/necesita conexión/.test(await texto()), "una corrección con la red caída no avisó que necesita señal");

/* 11 · UN MÓDULO QUE EL MAESTRO TODAVÍA NO TIENE (C03, lado derecho): hay que
        pedirle a la base que lo cree, y ESE pedido también puede caerse. */
await pg.click('.fe-pes-conteo button:has-text("Anotar")');
if (await pg.$(".fe-anotar-cab .fe-mini")) await pg.click(".fe-anotar-cab .fe-mini:has-text('Dejarlo como estaba')");
await pg.click(".fe-cola li button:has-text('Quitar')", { timeout: 1500 }).catch(() => null);
if (await pg.$(".fe-cola details:not([open]) summary")) await pg.click(".fe-cola summary");
await pg.click(".fe-cola li button:has-text('Quitar')").catch(() => null);
ok((await nCola()) === 0, "no se pudo dejar la cola vacía para el caso del módulo nuevo");
await pg.evaluate(() => { window.__llamadas = [] });
await escoger(0, "C"); await escoger(1, "03");
await renglon("Derecho", 2);
const ll = await llamadas();

ok(ll.some((l) => l.fn === "conteo_ubicacion_asegurar" && l.red), "no intentó crear el módulo nuevo");
ok((await nCola()) === 1, "si se cae la red al crear el módulo nuevo, el renglón no quedó pendiente");
const q = await colaGuardada();
ok(q?.[0]?.ubicacionId === null && q?.[0]?.lugar === "C03_DER", `el pendiente de un módulo nuevo no recuerda que falta crearlo: ${JSON.stringify(q?.[0] && { u: q[0].ubicacionId, l: q[0].lugar })}`);
/* corregir un renglón llevándolo a ese módulo nuevo: no se encola, se avisa. */
await pg.click('.fe-pes-conteo button:has-text("borrador")');
await pg.click(".fe-fila .fe-mini:has-text('Corregir')");
await escoger(0, "C"); await escoger(1, "03");
await pg.click('[aria-labelledby=fe-rot-lado] button:has-text("Derecho")');
await pg.click(".btn.grande"); await pg.waitForTimeout(300);
ok((await nCola()) === 1, "corregir hacia un módulo nuevo con la red caída entró a la cola");
await pg.click(".fe-anotar-cab .fe-mini:has-text('Dejarlo como estaba')");
/* ...y al volver el servidor el pendiente crea el módulo y sube. */
await pg.evaluate(() => { window.__red = false; window.__llamadas = [] });
await pg.click(".fe-cola button:has-text('Enviar ahora')");
await pg.waitForTimeout(500);
const ll2 = await llamadas();
const iu = ll2.findIndex((l) => l.fn === "conteo_ubicacion_asegurar"), ia = ll2.findIndex((l) => l.fn === "conteo_fefo_agregar");
ok(iu >= 0 && ia > iu && ll2[iu].args.p_calle === "C" && ll2[iu].args.p_modulo === "03" && ll2[iu].args.p_lado === "DER", "el pendiente no creó primero el módulo nuevo");
ok(ll2[ia]?.args.p_ubicacion === "id-conteo_ubicacion_asegurar", "el renglón no se subió con el id del módulo recién creado");
ok((await nCola()) === 0, "después de crear el módulo y subir quedó algo pendiente");

/* 12 · «ENVIAR AHORA» MIENTRAS SE ENVÍA NO SE PUEDE PULSAR OTRA VEZ, y si el
        navegador dice que no hay señal sin haberlo gritado, no manda nada. */
await escoger(0, "A"); await escoger(1, "01");
await pg.evaluate(() => { window.__red = true });
await renglon("Izquierdo", 1);
await pg.evaluate(() => { window.__red = false; window.__llamadas = []; window.__lento = 700 });
await pg.click(".fe-cola button:has-text('Enviar ahora')");
await pg.waitForTimeout(150);
ok(await pg.evaluate(() => { const b = document.querySelector(".fe-cola button.fe-mini"); return !!b && b.disabled && /Enviando/.test(b.textContent) }), "mientras envía el botón no queda deshabilitado con «Enviando…»");
await pg.waitForTimeout(1200);
ok((await agregadas()).length === 1, "el envío con el botón pulsado dos veces subió el renglón más de una vez");
await pg.evaluate(() => { window.__lento = 0; window.__llamadas = []; window.__red = true });
await renglon("Izquierdo", 2);
await pg.evaluate(() => { window.__red = false; window.__llamadas = []; Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true }) });
ok((await nCola()) === 1, "no quedó el pendiente para probar el botón sin señal");
await pg.click(".fe-cola button:has-text('Enviar ahora')");
await pg.waitForTimeout(200);
ok(/Todavía no hay señal/.test(await texto()), "«Enviar ahora» con el navegador sin señal no avisó que todavía no hay");
ok((await agregadas(false)).length === 0 && (await nCola()) === 1, "«Enviar ahora» sin señal mandó algo o vació la cola");
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Contar sin señal: los renglones nuevos quedan en el teléfono, sobreviven a recargar, suben solos y en orden al volver la señal, no se duplican ni se pierden; corregir pide señal y el conteo no se envía con pendientes.");
