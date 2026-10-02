/* =====================================================================
   INVENTARIO · CORTE DE LÍNEAS — EL HISTORIAL DE LA DIFERENCIA
   Monta el componente REAL (solo supabase y next/navigation son dobles) y
   prueba lo que se ve: las listas, el análisis con su signo, el formulario
   (calle → módulo → lado, el lado que se pone solo, el final que arranca con
   lo del inicial), lo que se manda a la base y que nada se salga de la
   pantalla en 360/390/820/1440.

     node .arnes/inv-corte-historial.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e)); if (process.env.TRAZA) console.log(e.stack);
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_ic-cliente.ts"), `
const w = window as any;
w.__rpc = []; w.__refresh = 0; w.__rpcFalla = null;
export function createClient() {
  return { rpc: async (n: string, a: any) => {
    w.__rpc.push({ n, a });
    return w.__rpcFalla ? { data: null, error: { message: w.__rpcFalla } } : { data: "nuevo-id", error: null };
  } };
}`);
writeFileSync(R(".arnes/_ic-nav.ts"), `
export function useRouter() { return { refresh: () => { (window as any).__refresh++ }, push() {}, replace() {}, back() {} } }`);

writeFileSync(R(".arnes/_ic-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Corte } from "../src/app/(app)/inventario/corte/Corte";

const AHORA = "2026-09-30T17:30:00.000Z";
const lineas = [{ clave: "L1", nombre: "Línea 1" }, { clave: "L2", nombre: "Línea 2" }];
const ubis = [{ id: "uA01", calle: "A", modulo: "01", lado: "DER" }, { id: "uA02", calle: "A", modulo: "02", lado: "DER" },
              { id: "uB12I", calle: "B", modulo: "12", lado: "IZQ" }, { id: "uB12D", calle: "B", modulo: "12", lado: "DER" }];
const mats = [{ id: "m1", sku: "3500887", nombre: "Botella Flint 1000R", cajas_por_estiba: 60, unidades_por_caja: 12, tipo: "ENVASE" },
              { id: "m3", sku: "3128", nombre: "Águila RN 330cc X30", cajas_por_estiba: 36, unidades_por_caja: 30, tipo: "PRODUCTO" }];
const S = (u: string, cant: number) => ({ ubicacion_id: u, cant, unidad: "cajas" });
const R = (linea: string, depa: number, o: any, d: any) => ({ linea, cajas_depa: depa, material_id: "m3", envase_id: "m1", origenes: [o], destinos: [d], nota: null });
const dd = (n: number) => String(n).padStart(2, "0");

/* 20 pares, uno por día (1 al 20 de septiembre). La línea 1 va en todos; la 2, solo en los días pares.
   Los cortes siempre cuadran con la depa (baja 1.000 y sube 1.000); lo que cambia es el conteo del día:
   día % 3 == 1 cuadra, == 0 da 1.500 en el origen (no cuadra), == 2 no pasa por el destino (incompleto). */
const cortes: any[] = [];
const conteos: any[] = [];
const lineasConteo: any[] = [];
const LC = (conteo_id: string, producto_id: string, ubicacion_id: string, total_cajas: number) => ({ conteo_id, producto_id, ubicacion_id, total_cajas, averia: false, pnc: false });
for (let d = 1; d <= 20; d++) {
  const dia = "2026-09-" + dd(d);
  const r1 = [R("L1", 0, S("uA01", 2000), S("uB12I", 0))], r1f = [R("L1", 1000, S("uA01", 1000), S("uB12I", 1000))];
  if (d % 2 === 0) { r1.push(R("L2", 0, S("uA02", 500), S("uB12D", 0))); r1f.push(R("L2", 500, S("uA02", 0), S("uB12D", 500))); }
  cortes.unshift({ id: "f" + d, tipo: "final", inicial_id: "i" + d, cortado_en: dia + "T19:00:00.000Z", nota: null, creado_por: "u1", renglones: r1f });
  cortes.unshift({ id: "i" + d, tipo: "inicial", inicial_id: null, cortado_en: dia + "T13:00:00.000Z", nota: null, creado_por: "u1", renglones: r1 });
  conteos.unshift({ id: "k" + d, codigo: "CF-" + dd(d), fecha: dia, enviado_en: dia + "T22:00:00Z" });
  lineasConteo.push(LC("k" + d, "m1", "uA01", d % 3 === 0 ? 1500 : 1000));
  if (d % 3 !== 2) lineasConteo.push(LC("k" + d, "m3", "uB12I", 1000));
  if (d % 2 === 0) { lineasConteo.push(LC("k" + d, "m1", "uA02", 0), LC("k" + d, "m3", "uB12D", 500)); }
}
/* Los pares más recientes primero, como llegan de la base. */
/* Un inicial sin final (un corte que todavía espera su par): no es un par y no entra al historial. */
cortes.push({ id: "i99", tipo: "inicial", inicial_id: null, cortado_en: "2026-09-25T13:00:00.000Z", nota: null, creado_por: "u1", renglones: [R("L1", 0, S("uA01", 2000), S("uB12I", 0))] });
cortes.sort((a, b) => b.cortado_en.localeCompare(a.cortado_en));
const c = new URL(location.href).searchParams.get("c") ?? "todo";
/* Un par cuya línea 1 no cuadra y cuya línea 2 está incompleta: el par NO CUADRA (lo peor manda). */
const mixto: any[] = [
  { id: "fm", tipo: "final", inicial_id: "im", cortado_en: "2026-09-21T19:00:00.000Z", nota: null, creado_por: "u1", renglones: [R("L1", 1000, S("uA01", 1000), S("uB12I", 1000)), R("L2", 500, S("uA02", 0), S("uB12D", 500))] },
  { id: "im", tipo: "inicial", inicial_id: null, cortado_en: "2026-09-21T13:00:00.000Z", nota: null, creado_por: "u1", renglones: [R("L1", 0, S("uA01", 2000), S("uB12I", 0)), R("L2", 0, S("uA02", 500), S("uB12D", 0))] },
];
const kmix = [{ id: "km", codigo: "CF-21", fecha: "2026-09-21", enviado_en: "2026-09-21T22:00:00Z" }];
const lmix = [LC("km", "m1", "uA01", 1500), LC("km", "m3", "uB12I", 1000), LC("km", "m1", "uA02", 0)];
const uno = cortes.filter((x) => x.id === "i20" || x.id === "f20");
createRoot(document.getElementById("r")!).render(
  <Corte bodegaId="bod1" lineas={lineas} ubicaciones={ubis} materiales={mats} cortes={(c === "mixto" ? mixto : c === "uno" ? uno : cortes) as any}
    conteos={(c === "mixto" ? kmix : conteos) as any} lineasConteo={(c === "mixto" ? lmix : lineasConteo) as any} nombres={{ u1: "Cristian Padilla" }} puedeEditar={true} manda={c === "manda"} verDiferencia={c !== "sinanalisis"} ahora={AHORA} />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_ic-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_ic-cliente.ts"), "next/navigation": R(".arnes/_ic-nav.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/corte/corte.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = [];
pg.on("pageerror", (e) => roto.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") roto.push(m.text()) });
const monta = async (query, ancho = 1440, tema = "") => {
  await pg.unrouteAll();
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head>
      <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main">
      <div class="fe"><div id="r"></div></div></main></div></div><script>${js}<\/script></body></html>`,
  }));
  await pg.goto(`http://arnes.local/?${query}`);
  try { await pg.waitForSelector("#r > *", { timeout: 8000 }) }
  catch { throw new Error(`«${query}» no pintó nada. Errores: ${roto.slice(-3).join(" | ") || "ninguno"}`) }
};
const txt = () => pg.$eval("#r", (e) => e.textContent.replace(/\s+/g, " "));
const rpcs = () => pg.evaluate(() => window.__rpc);
const sitio = (n) => `fieldset.cl-sitio >> nth=${n}`;   // 0 origen L1, 1 destino L1, 2 origen L2 …
const eligeUbi = async (n, calle, modulo, lado) => {
  const f = pg.locator("fieldset.cl-sitio").nth(n);
  await f.locator("select").nth(0).selectOption(calle);
  await f.locator("select").nth(1).selectOption(modulo);
  if (lado !== undefined) await f.locator("select").nth(2).selectOption(lado);
};


if (process.env.SHOT) {
  const [qq, w, ruta, tocar] = process.env.SHOT.split("@");
  await monta(qq, Number(w), process.env.TEMA ?? "");
  if (tocar) await pg.click(`button:has-text("${tocar}")`);
  await pg.screenshot({ path: ruta, fullPage: true });
  await nav.close(); process.exit(0);
}

const filas = () => pg.locator(".dq-hist .dq-fila");
const resumen = () => pg.$eval(".dq-resumen", (e) => e.textContent.replace(/\s+/g, " ").trim());
const chips = () => pg.$$eval(".dq-fila .dq-chip", (x) => x.map((e) => e.textContent));
const titulos = () => pg.$$eval(".dq-fila-t b", (x) => x.map((e) => e.textContent));
const pulsa = (t) => pg.click(`.dq-est:text-is("${t}")`);

/* ---------- 1 · EL HISTORIAL: resumen, la primera abierta y el resto cerrado ---------- */
await monta("c=todo");
{
  ok(/^20 pares · 7 cuadran · 6 no cuadran · 7 incompletos$/.test(await resumen()), "el resumen: " + await resumen());
  ok(await filas().count() === 15, "debían verse 15 pares de entrada: " + await filas().count());
  ok(await pg.locator(".dq-mas").count() === 1 && /Ver más \(5\)/.test(await pg.locator(".dq-mas").textContent()), "el botón «Ver más»");
  const ab = await filas().evaluateAll((x) => x.map((e) => e.getAttribute("aria-expanded")));
  ok(ab[0] === "true" && ab.slice(1).every((v) => v === "false"), "solo el más reciente llega abierto: " + ab.join());
  ok(await pg.locator(".dq-card").count() === 2, "el más reciente (día 20, líneas 1 y 2) trae dos tarjetas: " + await pg.locator(".dq-card").count());
  ok((await titulos())[0] === "20/09/2026 08:00 → 20/09/2026 14:00" && (await titulos())[1] === "19/09/2026 08:00 → 19/09/2026 14:00", "el más reciente va primero: " + (await titulos()).slice(0, 2).join(" | "));
  const minis = await pg.$$eval(".dq-fila >> nth=0 >> .dq-mini", (x) => x.map((e) => e.textContent + ":" + e.className)).catch(() => null);
  const m0 = await pg.locator(".dq-fila").first().locator(".dq-mini").evaluateAll((x) => x.map((e) => e.textContent + ":" + e.className.replace("dq-mini ", "")));
  ok(m0.join() === "L1:incompleto,L2:cuadra", "las pastillas por línea del día 20: " + m0.join());
  ok((await chips())[0] === "INCOMPLETO" && (await chips())[1] === "CUADRA" && (await chips())[2] === "NO CUADRA", "el estado de los días 20, 19 y 18: " + (await chips()).slice(0, 3).join());
  /* Abrir y cerrar. */
  await filas().nth(1).click();
  ok(await filas().nth(1).getAttribute("aria-expanded") === "true" && await pg.locator(".dq-card").count() === 3, "al tocar el par 19 se abre su tarjeta (una sola línea)");
  await filas().nth(1).click();
  ok(await filas().nth(1).getAttribute("aria-expanded") === "false" && await pg.locator(".dq-card").count() === 2, "al volver a tocarlo se cierra");
  await filas().nth(0).click();
  ok(await pg.locator(".dq-card").count() === 0, "también se puede cerrar el más reciente");
  await filas().nth(0).click();
  /* Ver más. */
  await pg.click(".dq-mas");
  ok(await filas().count() === 20 && await pg.locator(".dq-mas").count() === 0, "«Ver más» trae los 5 que faltaban");
}

/* ---------- 2 · FILTROS ---------- */
{
  await pulsa("No cuadra");
  ok(/^6 pares de 20 · 0 cuadran · 6 no cuadran · 0 incompletos$/.test(await resumen()), "filtrar por estado: " + await resumen());
  ok((await chips()).every((x) => x === "NO CUADRA") && (await titulos()).length === 6, "todos NO CUADRA");
  ok(await pg.locator('.dq-est[aria-pressed="true"]').textContent() === "No cuadra", "el botón activo queda marcado");
  await pg.click('button:has-text("Quitar filtros")');
  ok(/^20 pares · /.test(await resumen()) && await pg.locator('.dq-est[aria-pressed="true"]').textContent() === "Todos", "«Quitar filtros» vuelve a todo");
  /* Por línea: solo los días pares, y la tarjeta es solo la de esa línea. */
  await pg.selectOption(".dq-filtros select", "L2");
  ok(/^10 pares de 20 · 10 cuadran · 0 no cuadran · 0 incompletos$/.test(await resumen()), "filtrar por línea 2: " + await resumen());
  ok((await chips()).every((x) => x === "CUADRA"), "el estado es el de la línea escogida");
  ok(await pg.locator(".dq-card").count() === 1 && await pg.locator(".dq-card").getAttribute("aria-label") === "Línea 2", "con una línea escogida solo se ve su tarjeta");
  ok(await pg.locator(".dq-fila").first().locator(".dq-mini").count() === 1, "y solo su pastilla");
  await pg.selectOption(".dq-filtros select", "");
  /* Por fecha. */
  await pg.fill('.dq-filtros input[type="date"] >> nth=0', "2026-09-05");
  await pg.fill('.dq-filtros input[type="date"] >> nth=1', "2026-09-07");
  ok(/^3 pares de 20/.test(await resumen()) && (await titulos()).join("|") === "07/09/2026 08:00 → 07/09/2026 14:00|06/09/2026 08:00 → 06/09/2026 14:00|05/09/2026 08:00 → 05/09/2026 14:00", "filtrar por fecha, el 5 al 7: " + await resumen() + " " + (await titulos()).join("|"));
  /* Sin resultados. */
  await pg.fill('.dq-filtros input[type="date"] >> nth=0', "2026-09-06");
  await pg.fill('.dq-filtros input[type="date"] >> nth=1', "2026-09-06");
  await pulsa("Cuadra");
  ok(/Ningún par con esos filtros/.test(await txt()), "sin resultados lo dice: " + (await txt()).slice(0, 200));
  await pg.click('.dq-hist .fe-vacio button:has-text("Quitar filtros")');
  ok(/^20 pares · /.test(await resumen()), "desde el mensaje vacío también se quitan los filtros");
}

/* ---------- 3 · CAMBIAR EL CONTEO DE UN PAR ACTUALIZA SU ESTADO Y EL RESUMEN ---------- */
await monta("c=todo");
{
  ok((await chips())[0] === "INCOMPLETO", "el día 20 arranca incompleto (su conteo no pasó por el destino)");
  await pg.selectOption(".dq select", "k16");
  ok((await chips())[0] === "CUADRA" && /^20 pares · 8 cuadran · 6 no cuadran · 6 incompletos$/.test(await resumen()), "con el conteo del 16 el par 20 cuadra y el resumen se actualiza: " + (await chips())[0] + " · " + await resumen());
  ok(await pg.locator(".dq-aviso").count() === 1, "y avisa que ese conteo es de otro día");
  const d = await pg.$$eval(".dq-fila", (x) => x.length);
  ok(d === 15, "cambiar de conteo no altera la lista");
}
await monta("c=todo");
{
  await pg.click(".dq-mas");
  ok(await pg.locator(".dq-fila").count() === 20, "«Ver más» muestra los 20");
  await pulsa("No cuadra"); await pulsa("Todos");
  ok(await pg.locator(".dq-fila").count() === 15, "al tocar un filtro la lista vuelve a la primera página: " + await pg.locator(".dq-fila").count());
  ok(/^20 pares · /.test(await resumen()) && !/21 pares/.test(await resumen()), "el corte inicial sin final no cuenta como par");
}
await monta("c=mixto");
{
  ok((await chips()).join() === "NO CUADRA", "línea 1 no cuadra + línea 2 incompleta = el par NO CUADRA: " + (await chips()).join());
}

/* ---------- 4 · UN SOLO PAR: SIN FILTROS NI RESUMEN; ELIMINAR VIVE DENTRO DEL PAR ABIERTO ---------- */
await monta("c=uno");
{
  ok(await pg.locator(".dq-filtros, .dq-resumen").count() === 0, "con un solo par no hacen falta filtros ni resumen");
  ok(await pg.locator(".dq-fila").count() === 1 && await pg.locator(".dq-card").count() === 2, "y el par llega abierto");
}
await monta("c=manda");
{
  ok(await pg.locator('.dq-cuerpo button:has-text("Eliminar el par")').count() === 1, "«Eliminar el par» está dentro del par abierto y solo de ese");
  await pg.click('.dq-cuerpo button:has-text("Eliminar el par")');
  ok(/¿Eliminar el inicial y el final\?/.test(await txt()), "pide confirmar");
  await pg.click('.cl-conf button:has-text("No")');
  await filas().nth(0).click();
  ok(await pg.locator('.dq-cuerpo button:has-text("Eliminar el par")').count() === 0, "cerrado el par no hay botón de eliminar");
}

/* ---------- 4b · TODOS LOS CORTES INICIALES, DEL PRIMERO AL ÚLTIMO (solo quien administra) ---------- */
await monta("c=todo");
ok(await pg.locator('button:has-text("Ver del primero al último")').count() === 0, "quien no administra no ve «Ver del primero al último»");
await monta("c=manda");
{
  ok(/Todos los cortes iniciales\s*21/.test(await txt()), "el título cuenta los 21 iniciales (20 con final y 1 esperando): " + (await txt()).match(/Todos los cortes iniciales\s*\d+/)?.[0]);
  ok(await pg.locator(".cl-todos article").count() === 0, "arranca cerrado");
  await pg.click('button:has-text("Ver del primero al último")');
  const t = await pg.$$eval(".cl-todos article", (x) => x.map((e) => e.querySelector(".cl-hora").textContent.replace(/\s+/g, " ").trim()));
  ok(t.length === 21, "salen los 21: " + t.length);
  ok(/EL PRIMERO/.test(t[0]) && /01\/09\/2026/.test(t[0]) && t.slice(1).every((x) => !/EL PRIMERO/.test(x)), "el primero es el del 1 de septiembre y solo ese lo dice: " + t[0]);
  const f = t.map((x) => x.match(/(\d\d)\/09\/2026/)?.[1]);
  ok(f.every((d, i) => i === 0 || d >= f[i - 1]), "van del más viejo al más nuevo: " + f.join(","));
  ok(/Ya tiene su corte final/.test(await pg.locator(".cl-todos article").first().textContent()) && /Esperando el corte final/.test(await pg.locator(".cl-todos article").last().textContent()), "dice cuáles ya tienen final y cuál espera");
  ok(await pg.locator(".cl-todos button").count() === 0, "es solo para mirar: sin botones");
  ok(/L1/.test(await pg.locator(".cl-todos article").first().textContent()) && /Tomando de A · 01 · DER: 2.?000 cajas/.test(await pg.locator(".cl-todos article").first().textContent()), "se ve lo que se anotó: " + (await pg.locator(".cl-todos article").first().textContent()).slice(0, 200));
  await pg.click('button:has-text("Esconder")');
  ok(await pg.locator(".cl-todos article").count() === 0, "se esconde");
}

/* ---------- 5 · NADA SE SALE, en cuatro anchos ---------- */
for (const w of [360, 390, 820, 1440]) {
  await monta("c=manda", w);
  await pg.click(".dq-mas");
  const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
    fuera: [...document.querySelectorAll("#r *")].filter((e) => { const t = e.closest(".tw"); return !(t && getComputedStyle(t).overflowX !== "visible") && e.getBoundingClientRect().right > window.innerWidth + 1 }).map((e) => e.className || e.tagName).slice(0, 4) }));
  ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
  const chico = await pg.evaluate(() => [...document.querySelectorAll("#r button, #r select, #r input")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43).length);
  ok(chico === 0, `a ${w} px hay ${chico} controles de menos de 44 px`);
}

ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Historial de la diferencia: una fila por par con su estado, el más reciente abierto, filtros por fecha, línea y estado, resumen, «Ver más», el conteo de cada par se cambia solo y nada se sale en 4 anchos.");
