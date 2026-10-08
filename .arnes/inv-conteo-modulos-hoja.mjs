/* =====================================================================
   CONTEO · LOS MÓDULOS DE LA HOJA — en Chromium, con el componente de verdad.
   «No están completas las ubicaciones, o sea, porque no salen»: PASILLO, TANDEM,
   DEPA, PALE, H, TUNEL y los módulos 01–36 de cada calle. Lo que ya estaba sale igual.
   ===================================================================== */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_mh-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Contar } from "../src/app/(app)/inventario/conteo/Contar";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Contar bodegaId="b1" conteoInicial={{ id: "c1", codigo: "INV-1", estado: "en_proceso", iniciado_en: null }}
  renglonesIniciales={w.REN} materiales={w.MAT} ubicaciones={w.UBI} estados={[]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_mh-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_sb-conteo.js"), "next/navigation": R(".arnes/stub-nav.js"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const PROD = (id, sku) => ({ id, sku, nombre: "Águila " + sku, unidades_por_caja: 30, cajas_por_estiba: 80, unidades_por_estiba: 2400, contenido: null,
  familia: null, presentacion: null, vida_util: 180, f_limite_desp: null, dias_minimo: 30, origen: null, foraneo: null, tipo_material: "PRODUCTO", activo: true });
const MAT = [PROD("m2", "3128"), PROD("m3", "3129"), { id: "m1", sku: "900", nombre: "Canasta 30", unidades_por_caja: 30, cajas_por_estiba: 40, unidades_por_estiba: 1200, contenido: null,
  familia: null, presentacion: null, vida_util: null, f_limite_desp: null, dias_minimo: 0, origen: null, foraneo: null, tipo_material: "ENVASE", activo: true }];
const U = (calle, modulo, lado) => ({ id: `${calle}${modulo}${lado ?? ""}`, bodega_id: "b1", clave: `${calle}${modulo}${lado ? "_" + lado : ""}`, calle, modulo, lado, familia: null, capacidad: 10, activa: true });
const UBI = [U("A", "01", "IZQ"), U("A", "01", "DER"), U("B", "02", null), U("C", "01", "IZQ"), U("C", "01", "DER"), U("C", "18A", null), U("EST", "07", null)];
/* Ya hay un RETORNO del 900 en la línea L2 de fábrica y otro en A05: en fábrica se puede volver a poner, en A05 no. */
const RR = (id, ubicacion, estado = "RETORNO") => ({ id, conteo_id: "c1", conteo: "INV-1", estado: "en_proceso", codigo: "900", material: "Canasta 30", tipo_material: "ENVASE",
  ubicacion, estibas: 2, cajas: null, saldo: null, total_cajas: 80, total_estibas: 2, estado_envase: estado, contado_en: "2026-10-06T12:00:00Z" });
const REN = [RR("r1", "FABRICAL2"), RR("r3", "FABRICAL2", "LAVADO"), RR("r2", "A05_IZQ"), RR("r4", "A05_IZQ", "LAVADO")];
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.setViewportSize({ width: 390, height: 900 });
await pg.setContent(`<!doctype html><html><body><div id="r"></div><script>window.MAT=${JSON.stringify(MAT)};window.UBI=${JSON.stringify(UBI)};window.REN=${JSON.stringify(REN)};window.__DATOS={v_conteo_fefo:window.REN};</script><script>${js}</script></body></html>`);
await pg.waitForSelector(".fe-anotar");

const escoger = async (n, texto) => {
  const campo = pg.locator(".bs-campo").nth(n);
  await campo.click(); await campo.fill(texto);
  /* La opción que se llama exactamente así (si no, «D» escogería «Todas»). */
  const exacta = pg.locator(".bs-lista [role=option]").filter({ has: pg.locator("b", { hasText: new RegExp("^" + texto + "$") }) });
  await (await exacta.count() ? exacta : pg.locator(".bs-lista [role=option]")).first().dispatchEvent("mousedown");
};
const opciones = async (n) => {
  const campo = pg.locator(".bs-campo").nth(n);
  await campo.click();
  const t = await pg.locator(".bs-lista [role=option] b").allTextContents();
  await pg.keyboard.press("Escape"); await campo.evaluate((e) => e.blur());
  return t;
};
/* Las calles: las del maestro y las de la hoja. */
const calles = await opciones(0);
ok(["Todas", "A", "B", "C", "D", "E", "EST", "P", "ALAR"].every((c) => calles.includes(c)), "las calles de la hoja no salen: " + calles.join(","));
/* Calle C: del 01 al 36, más PASILLO, TANDEM, DEPA, PALE, H y lo que ya tenía el maestro (18A). */
await escoger(0, "C");
let mods = await opciones(1);
ok(mods.length === 36 + 5 + 1, "la calle C debe ofrecer 36 numerados + 5 especiales + el 18A del maestro = 42: " + mods.length);
ok(["PASILLO", "TANDEM", "DEPA", "PALE", "H", "01", "19", "36", "18A"].every((m) => mods.includes(m)), "faltan módulos de la calle C: " + mods.slice(-8).join(","));
ok(mods.indexOf("01") < mods.indexOf("36") && mods.indexOf("36") < mods.indexOf("H"), "el orden: los números primero y los especiales después");
ok(mods.filter((m) => m === "01").length === 1 && mods.filter((m) => m === "18A").length === 1, "un módulo que ya estaba sale repetido");
/* Cada calle con lo suyo: la D no tiene PASILLO ni TANDEM; la P llega a 49. */
await escoger(0, "D");
mods = await opciones(1);
ok(!mods.includes("PASILLO") && !mods.includes("TANDEM") && mods.includes("TUNEL") && mods.length === 40, "la calle D no ofrece lo de su hoja (36 + DEPA, PALE, H, TUNEL): " + mods.length);
await escoger(0, "P");
mods = await opciones(1);
ok(mods.length === 49 && mods.includes("49"), "la calle P no llega al 49: " + mods.length);
/* La calle H: módulos 01 a 04, con izquierdo y derecho. */
ok(calles.includes("H"), "la calle H no sale: " + calles.join(","));
await escoger(0, "H");
mods = await opciones(1);
ok(mods.join(",") === "01,02,03,04", "la calle H debe ofrecer 01, 02, 03 y 04: " + mods.join(","));
await escoger(1, "03");
ok(await pg.locator("[aria-labelledby=fe-rot-lado] button").count() === 2, "un módulo de la calle H debe ofrecer izquierdo y derecho");
/* FABRICA es una calle y sus módulos son las líneas L2, L4 y L6, sin lados. */
ok(calles.includes("FABRICA"), "la calle FABRICA no sale: " + calles.join(","));
await escoger(0, "FABRICA");
mods = await opciones(1);
ok(mods.length === 3 && ["L2", "L4", "L6"].every((m) => mods.includes(m)), "FABRICA debe ofrecer L2, L4 y L6: " + mods.join(","));
await escoger(1, "L4");
ok(/no tiene lados/i.test(await pg.locator(".fe-lado").textContent()), "una línea de fábrica ofrece izquierdo y derecho: " + await pg.locator(".fe-lado").textContent());
/* Sin calle, cada módulo dice su calle. */
await escoger(0, "Todas");
const todos = await pg.locator(".bs-campo").nth(1).click().then(() => pg.locator(".bs-lista [role=option]").count());
ok(todos > 200, "sin calle no se ofrecen todos los módulos: " + todos);
await pg.keyboard.press("Escape"); await pg.locator(".bs-campo").nth(1).evaluate((e) => e.blur());

/* Escoger un módulo de la hoja sin haber escogido calle pone su calle. */
await escoger(0, "Todas"); await escoger(1, "TANDEM");
ok((await pg.locator(".bs-campo").nth(0).inputValue()) === "A", "escoger TANDEM sin calle no pone la calle (la A, la primera que lo tiene): «" + await pg.locator(".bs-campo").nth(0).inputValue() + "»");
/* PASILLO: no tiene lados, se anota como una sola posición y la base lo da de alta. */
await escoger(0, "C"); await escoger(1, "PASILLO");
ok(/no tiene lados/i.test(await pg.locator(".fe-lado").textContent()), "un pasillo ofrece izquierdo y derecho: " + await pg.locator(".fe-lado").textContent());
await pg.fill('input[placeholder="Teclea el código"]', "900");
/* EL FLUJO: un envase pide estado antes de «Cuánto». */
await pg.locator(".fe-estenv:not(:has(button.on)) .fe-estados button").first().click({ timeout: 400 }).catch(() => {});
await pg.locator(".fe-cuanto-campo input").first().fill("3");
await pg.click(".btn.grande"); await pg.waitForTimeout(250);
const ll = await pg.evaluate(() => window.__llamadas);
const aseg = ll.find((x) => x.fn === "conteo_ubicacion_asegurar");
ok(aseg && aseg.args.p_calle === "C" && aseg.args.p_modulo === "PASILLO" && aseg.args.p_lado === null, "no pide dar de alta C·PASILLO sin lado: " + JSON.stringify(aseg));
ok(ll.some((x) => x.fn === "conteo_fefo_agregar"), "no anotó el renglón");
/* Un numerado que el maestro no tiene (C19): sí tiene los dos lados. */
await escoger(0, "C"); await escoger(1, "19");
ok(await pg.locator("[aria-labelledby=fe-rot-lado] button").count() === 2, "un módulo numerado de la hoja debe ofrecer izquierdo y derecho");
/* Lo que el maestro dice que no tiene lados (EST07) sigue igual. */
await escoger(0, "EST"); await escoger(1, "07");
ok(/no tiene lados/i.test(await pg.locator(".fe-lado").textContent()), "EST07 dejó de ser un solo sitio");
/* FÁBRICA · RETORNO: aunque ya se contó para este código, el botón sigue y avisa que se suma. */
await escoger(0, "FABRICA"); await escoger(1, "L2");
await pg.fill('input[placeholder="Teclea el código"]', "900");
let est = await pg.locator(".fe-estados button").allTextContents();
ok(est.includes("RETORNO"), "en FABRICA el RETORNO ya contado se oculta: " + est.join(","));
/* Y TODOS los estados: el de otro código tampoco se oculta, y un estado nuevo no avisa suma. */
ok(est.length === 7 && est.includes("LAVADO"), "en FABRICA deben salir los siete estados: " + est.join(","));
await pg.locator(".fe-estados button", { hasText: /^LAVADO$/ }).click();
ok(/ya lo anotaste aquí/i.test(await pg.locator(".fe-estenv").textContent()), "LAVADO ya contado en FABRICA no avisa que se suma");
await pg.locator(".fe-estados button", { hasText: /^LAVADO$/ }).click();
await pg.locator(".fe-estados button", { hasText: /^RETORNO$/ }).click();
ok(/ya lo anotaste aquí/i.test(await pg.locator(".fe-estenv").textContent()), "no avisa que el RETORNO se suma al anterior");
/* Y en A05 también: el mismo código se puede volver a poner en cualquier módulo. */
await escoger(0, "A"); await escoger(1, "05");
await pg.locator("[aria-labelledby=fe-rot-lado] button", { hasText: /Izq/i }).first().click().catch(() => {});
await pg.fill('input[placeholder="Teclea el código"]', "");
await pg.fill('input[placeholder="Teclea el código"]', "900");
est = await pg.locator(".fe-estados button").allTextContents();
ok(est.length === 7 && est.includes("RETORNO") && est.includes("LAVADO"), "en cualquier calle los estados ya contados deben seguir saliendo: " + est.join(","));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Conteo: cada calle ofrece los módulos de la hoja (01–36 y PASILLO, TANDEM, DEPA, PALE, H, TUNEL según la calle), lo que ya estaba sale igual y una sola vez, los especiales no tienen lados y se dan de alta al anotar.");
