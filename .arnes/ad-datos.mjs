/* =====================================================================
   BORRAR DATOS — la pantalla de verdad, en Chromium.

   Se empaqueta BorrarDatos.tsx tal cual, con la base de mentiras (cuenta
   lo que se le diga) y el fetch interceptado, y se recorre el camino:
   0. cada módulo entra PLEGADO; al abrirlo salen todos sus datos con casilla
      CUADRADA (no círculo) y se marcan uno, varios o todos, de varios módulos;
   1. sin elegir nada, no se puede bajar la copia ni borrar;
   2. al elegir un punto cuenta solo y dice cuánto se va;
   3. sin bajar la copia no se puede escribir; sin BORRAR no se borra;
   4. cambiar el rango vuelve a pedir copia y BORRAR;
   5. borrar manda la clave, el rango, BORRAR y el conteo visto;
   6. en 1200, 390 y 360 no se sale nada y todo se toca con el dedo;
   7. se lee en los siete temas.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-ad.ts"), `export const useRouter = () => ({ refresh() { (window as any).refrescos = ((window as any).refrescos ?? 0) + 1 } });`);
writeFileSync(R(".arnes/_supa-ad.ts"), `export const createClient = () => ({ rpc: async (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
  const n = a.p_desde ? 40 : 125;
  return { data: [{ filas: n, archivos: a.p_clave === "rotlinea.hojas" ? 3 : 0, primera: a.p_desde ?? "2026-01-02", ultima: a.p_hasta ?? "2026-09-21" }], error: null };
} });`);
writeFileSync(R(".arnes/_ad-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { BorrarDatos } from "../src/app/(app)/admin/datos/BorrarDatos";
const P = (clave: string, modulo: string, nombre: string) => ({ clave, modulo, nombre, detalle: "Detalle de " + nombre + " para ver cómo se parte en dos renglones en el celular.", bucket: null });
createRoot(document.getElementById("r")!).render(<BorrarDatos hoy="2026-09-21" hayLlave={true}
  puntos={[P("traspasos.plan","Traspasos","Plan de viajes"), P("traspasos.viajes","Traspasos","Viajes registrados"),
           P("rotlinea.registro","Rotura de línea","Pesadas registradas"), P("rotlinea.hojas","Rotura de línea","Hojas del día generadas"),
           P("quiebra.diario","Quiebra","Registro diario"), P("quiebra.bajas","Quiebra","Bajas importadas de SAP"), P("quiebra.cargas","Quiebra","Cargas de archivos (registro)")]}
  historial={[{ id: 1, nombre: "Traspasos · Viajes registrados", desde: "2026-09-01", hasta: "2026-09-10", filas: 1234, archivos: 0, borrado_nombre: "Cristian Padilla", borrado_en: "2026-09-20T15:00:00Z" }]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ad-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-ad.ts"), "@/lib/supabase/client": R(".arnes/_supa-ad.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/admin/roles/roles.css"), "utf8") + readFileSync(R("src/app/(app)/admin/datos/datos.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.route("**/*", (r) => r.request().url().includes("/api/admin/datos") && r.request().method() === "POST"
  ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ resultados: JSON.parse(r.request().postData()).claves.map((c) => ({ clave: c, filas: 40, archivos: 0, quedaron: 0 })) }) })
  : r.request().url().startsWith("https://control.prueba/") && !r.request().url().includes("/api/")
    ? r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" })
    : r.fulfill({ status: 200, body: "" }));
const monta = async (ancho, tema) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/admin/datos");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="rl bd" id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".bd-mod-cab");
};
const abre = (mod) => pg.click(`.bd-mod-cab:has-text("${mod}")`);
const estado = () => pg.evaluate(() => ({
  copiaOff: document.querySelector(".bd-copia").getAttribute("aria-disabled") === "true",
  escribeOff: document.querySelector(".bd-escribe input").disabled,
  borrarOff: document.querySelector(".bd-borrar").disabled,
  boton: document.querySelector(".bd-borrar").textContent,
  cuenta: document.querySelector(".bd-cuenta").textContent,
  href: document.querySelector(".bd-copia").getAttribute("href"),
}));

await monta(1200);
/* 0 · PLEGADOS, CASILLAS CUADRADAS, VARIOS A LA VEZ */
{
  const cab = await pg.$$eval(".bd-mod-cab", (x) => x.map((b) => [b.textContent, b.getAttribute("aria-expanded")]));
  ok(cab.length === 3 && cab.every(([, a]) => a === "false"), `los módulos no entran plegados: ${JSON.stringify(cab)}`);
  ok((await pg.$$(".bd-punto")).length === 0, "con todo plegado se ven los datos");
  if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }   // si entran abiertos, lo que sigue no tiene sentido
  await abre("Quiebra");
  ok((await pg.$$(".bd-punto")).length === 4, "al abrir Quiebra no salen todos sus datos (3 y «Marcar todo»)");
  ok((await pg.$$("input[type=radio]")).length === 0, "quedan círculos (radio)");
  const q = await pg.$eval(".bd-cuadro", (c) => { const r = c.getBoundingClientRect(), cs = getComputedStyle(c);
    return { t: c.type, w: Math.round(r.width), h: Math.round(r.height), radio: parseFloat(cs.borderTopLeftRadius) || 0, app: cs.appearance } });
  ok(q.t === "checkbox" && q.w === q.h && q.w >= 20 && q.radio <= 3 && q.app === "none", `la casilla no es un cuadrito: ${JSON.stringify(q)}`);
  await pg.click("text=Registro diario"); await pg.click("text=Cargas de archivos (registro)");
  ok(/2 de 3 marcados/.test(await pg.textContent(".bd-mod-cab:has-text('Quiebra')")), "el módulo no dice cuántos lleva marcados");
  ok(await pg.$eval(".bd-todos input", (c) => c.indeterminate), "«Marcar todo» no queda a medias con 2 de 3");
  await pg.click(".bd-todos");
  ok((await pg.$$eval(".bd-cuadro:checked", (x) => x.length)) === 4, "«Marcar todo» no marca los 3 datos");
  await abre("Traspasos"); await pg.click("text=Viajes registrados");
  await pg.waitForFunction(() => /Traspasos · Viajes/.test(document.querySelector(".bd-cuenta").textContent));
  const cu = await pg.textContent(".bd-cuenta");
  ok(/160 filas/.test(cu) && /Quiebra · Registro diario/.test(cu) && /Quiebra · Bajas importadas/.test(cu), `con 4 datos de 2 módulos no suma o no lista: «${cu}»`);
  ok(new URL(await pg.getAttribute(".bd-copia", "href"), "https://x").searchParams.get("claves") === "traspasos.viajes,quiebra.diario,quiebra.bajas,quiebra.cargas", "la copia no pide los 4 datos marcados");
  /* BORRAR VARIOS: una sola confirmación, cada dato con el conteo que se vio */
  await pg.evaluate(() => { document.querySelector(".bd-copia").addEventListener("click", (ev) => ev.preventDefault()) });
  await pg.click(".bd-copia"); await pg.fill(".bd-escribe input", "BORRAR");
  const [rq] = await Promise.all([pg.waitForRequest((r) => r.url().includes("/api/admin/datos") && r.method() === "POST"), pg.click(".bd-borrar")]);
  const cq = JSON.parse(rq.postData());
  ok(cq.claves.length === 4 && Object.keys(cq.esperadas).length === 4 && cq.esperadas["quiebra.bajas"] === 40, `borrar varios no manda los 4 datos con su conteo: ${rq.postData()}`);
  await pg.waitForSelector(".aviso.bien");
  ok(/se borraron 160 filas de .*Traspasos · Viajes registrados.*Quiebra · Registro diario/.test(await pg.textContent(".aviso")), "después de borrar varios no dice qué se fue");
  const Q = ".bd-mod:has(.bd-mod-cab:has-text('Quiebra'))";
  await pg.click(".bd-mod-cab:has-text('Quiebra')");
  ok((await pg.$$(Q + " .bd-todos")).length === 0 && /3 de 3 marcados/.test(await pg.textContent(".bd-mod-cab:has-text('Quiebra')")), "plegar un módulo borra lo marcado o no dice cuántos lleva");
  await pg.click(".bd-mod-cab:has-text('Quiebra')");
  await pg.click(Q + " .bd-todos");
  ok((await pg.$$eval(Q + " .bd-cuadro:checked", (x) => x.length)) === 0, "«Marcar todo» no desmarca cuando ya estaba todo");
  await pg.click("text=Viajes registrados");   // deja todo sin marcar
  await pg.click(".bd-mod-cab:has-text('Quiebra')");
  await pg.waitForTimeout(350);
}
let e = await estado();
ok(e.copiaOff && e.escribeOff && e.borrarOff, "sin elegir nada ya se puede bajar la copia o borrar");
const fondoBorrar = () => pg.evaluate(() => getComputedStyle(document.querySelector(".bd-borrar")).backgroundColor);
ok(await fondoBorrar() !== "rgb(228, 0, 43)", "el botón de borrar apagado se ve rojo, como si se pudiera tocar");
await pg.click("text=Viajes registrados");
await pg.waitForFunction(() => /40/.test(document.querySelector(".bd-cuenta").textContent));
e = await estado();
ok(/40 filas/.test(e.cuenta) && /Traspasos · Viajes registrados/.test(e.cuenta), `no dice cuánto se va: «${e.cuenta}»`);
ok(e.href === "/api/admin/datos?claves=traspasos.viajes&desde=2026-09-01&hasta=2026-09-21",
   `la copia no pide el punto y el rango elegidos: ${e.href}`);
ok(!e.copiaOff && e.escribeOff && e.borrarOff, "se puede escribir BORRAR sin haber bajado la copia");
await pg.evaluate(() => { document.querySelector(".bd-copia").addEventListener("click", (ev) => ev.preventDefault(), { capture: false }) });
await pg.click(".bd-copia");
e = await estado();
ok(!e.escribeOff && e.borrarOff, "después de bajar la copia no deja escribir, o ya deja borrar sin escribir");
await pg.fill(".bd-escribe input", "borrar");
ok((await estado()).borrarOff, "«borrar» en minúscula habilita el botón");
await pg.fill(".bd-escribe input", "BORRAR");
e = await estado();
ok(!e.borrarOff && /Borrar 40 filas/.test(e.boton), `con BORRAR el botón no dice cuántas filas: «${e.boton}»`);
ok(await fondoBorrar() === "rgb(228, 0, 43)", "listo para borrar, el botón no se pone rojo");

/* 4 · CAMBIAR EL RANGO REINICIA */
await pg.click(".bd-seg button:nth-child(2)");
try { await pg.waitForFunction(() => /125/.test(document.querySelector(".bd-cuenta").textContent), null, { timeout: 3000 }) }
catch { fallas.push("«Todo» no volvió a contar sin fechas") }
e = await estado();
ok(e.escribeOff && e.borrarOff, "al cambiar a «Todo» se quedó la copia y el BORRAR del conteo anterior");
ok(e.href === "/api/admin/datos?claves=traspasos.viajes", `con «Todo» la copia todavía manda fechas: ${e.href}`);
const ultima = await pg.evaluate(() => window.llamadas.at(-1));
ok(ultima.f === "admin_borrado_contar" && ultima.a.p_desde === null && ultima.a.p_hasta === null, "«Todo» no cuenta sin fechas");

/* 5 · BORRAR MANDA LO QUE SE VIO */
await pg.click(".bd-copia"); await pg.fill(".bd-escribe input", "BORRAR");
const [req] = await Promise.all([pg.waitForRequest((r) => r.url().includes("/api/admin/datos") && r.method() === "POST"), pg.click(".bd-borrar")]);
const cuerpo = JSON.parse(req.postData());
ok(JSON.stringify(cuerpo.claves) === '["traspasos.viajes"]' && cuerpo.desde === null && cuerpo.hasta === null && cuerpo.confirmacion === "BORRAR" && cuerpo.esperadas["traspasos.viajes"] === 125,
   `borrar no manda la clave, el rango, BORRAR y el conteo visto: ${req.postData()}`);
await pg.waitForSelector(".aviso.bien");
ok(/se borraron 40 filas de Traspasos · Viajes registrados/.test(await pg.textContent(".aviso")), "después de borrar no dice qué se borró");

/* rango al revés */
await pg.click(".bd-seg button:nth-child(1)");
await pg.fill(".bd-fechas label:nth-child(1) input", "2026-09-30");
await pg.waitForTimeout(100);
ok(await pg.isVisible(".bd-mal"), "un rango al revés no se avisa");

/* 6 · ANCHOS */
for (const ancho of [1200, 390, 360]) {
  await monta(ancho);
  await abre("Rotura de línea"); await pg.click("text=Hojas del día generadas");
  await pg.waitForFunction(() => /archivos/.test(document.querySelector(".bd-cuenta").textContent));
  const g = await pg.evaluate(() => {
    const alto = (s) => Math.min(...[...document.querySelectorAll(s)].map((x) => x.getBoundingClientRect().height));
    const fuera = [...document.querySelectorAll(".bd-paso *")].filter((x) => { const r = x.getBoundingClientRect(); return r.right > innerWidth + 0.5 && r.width > 0 && !x.closest(".bd-tabla-env") });
    return { lado: document.documentElement.scrollWidth - innerWidth, fuera: fuera.length,
             tocar: alto(".bd-mod-cab, .bd-punto, .bd-seg button, .bd-acciones .btn, .bd-fechas input, .bd-escribe input") };
  });
  ok(g.lado <= 0 && g.fuera === 0, `${ancho} px: algo se sale de la pantalla (${g.lado} px, ${g.fuera} elementos)`);
  ok(g.tocar >= 44, `${ancho} px: algo mide ${g.tocar} px de alto (mínimo 44)`);
}

/* 7 · TEMAS */
const lum = (c) => { const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * n[0] + .7152 * n[1] + .0722 * n[2] };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1200, t);
  await abre("Traspasos"); await pg.click("text=Viajes registrados");
  await pg.waitForFunction(() => /40/.test(document.querySelector(".bd-cuenta").textContent));
  const pares = await pg.evaluate(() => {
    const fondo = (e) => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s); return [getComputedStyle(e).color, fondo(e)] };
    return { "punto": par(".bd-punto b"), "detalle": par(".bd-punto i"), "módulo": par(".bd-mod-cab .nom"), "cuántos": par(".bd-mod-cab .cuantos"), "cifra": par(".bd-cifra b"),
             "copia": par(".bd-copia"), "borrar (apagado)": par(".bd-borrar"), "rango": par(".bd-seg button.on"), "tabla": par(".bd-tabla td"),
             "rótulo": par(".bd-escribe span") };
  });
  for (const [k, [a, b]] of Object.entries(pares)) {
    const r = razon(a, b);
    if (k.includes("apagado")) continue;
    ok(r >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${r.toFixed(2)}`);
  }
}
await pg.screenshot({ path: "/tmp/claude-0/ad-datos.png", fullPage: true });
await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Borrar datos: cuenta sola, pide copia y BORRAR en ese orden, se reinicia al cambiar el rango, manda lo que se vio, cabe en 360 y se lee en los siete temas.");
