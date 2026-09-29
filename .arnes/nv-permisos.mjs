/* =====================================================================
   «LE HABILITO SOLO CONTAR A UNA PERSONA Y IGUAL LE SALE EL INFORME.»

   Se monta el Marco (riel + cuerpo) tal cual, con la ruta y las rutas
   permitidas que se le digan, y se comprueba:
   1. quien solo tiene «Contar»: el riel le ofrece Contar y NO el Tablero;
      «Conteos» (la rama) lo lleva a Contar y no al Tablero; y si teclea
      /inventario/tablero ve «no es para tu rol» y NO el informe;
   2. quien tiene Contar y Tablero entra a las dos, y Conteos lo lleva al
      Tablero de siempre;
   3. quien no tiene nada de Conteos pero sí Averías no ve la rama Conteos;
   4. una dirección más honda sin registrar NO se cierra (no era su permiso);
   5. la portada del módulo (/inventario) no se cierra: ahí se escoge rama.
   ===================================================================== */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-nv.ts"), `import { createElement } from "react";
export const usePathname = () => (window as any).__ruta;
export const useRouter = () => ({ prefetch() {}, push() {}, replace() {}, refresh() {} });`);
writeFileSync(R(".arnes/_link-nv.tsx"), `import { createElement } from "react";
export default function Link({ href, children, prefetch, ...r }: any) { return createElement("a", { href, ...r }, children) }`);
writeFileSync(R(".arnes/_nv-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Marco } from "../src/components/Marco";
const w = window as any;
createRoot(document.getElementById("r")!).render(
  <Marco permitidas={w.__permitidas}><div id="contenido">EL INFORME</div></Marco>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_nv-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-nv.ts"), "next/link": R(".arnes/_link-nv.tsx"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ruta, permitidas) => {
  await pg.setContent(`<!doctype html><html><body><div id="r"></div>
    <script>window.__ruta=${JSON.stringify(ruta)};window.__permitidas=${JSON.stringify(permitidas)};</script>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".sh-marco");
};
const enlaces = () => pg.$$eval(".sh-lado a", (s) => s.map((a) => [(a.querySelector(".texto") ?? a).textContent.trim(), a.getAttribute("href")]));
const hay = (sel) => pg.$$eval(sel, (s) => s.length > 0);

const SOLO_CONTAR = ["/inventario/conteo"];
const CONTAR_Y_TABLERO = ["/inventario/conteo", "/inventario/tablero"];
const SOLO_AVERIAS = ["/inventario/averias"];

/* 1 · SOLO CONTAR, tecleando la dirección del informe. */
await monta("/inventario/tablero", SOLO_CONTAR);
ok(await hay(".sh-cerrada"), "quien solo tiene Contar y abre el Tablero no ve «no es para tu rol»");
ok(!(await hay("#contenido")), "quien solo tiene Contar VE EL INFORME del Tablero");
ok(/no es para tu rol/i.test(await pg.textContent(".sh-cerrada h1")), "el aviso no dice que no es para su rol");
ok(/Inventario · Tablero/.test(await pg.textContent(".sh-cerrada")), "el aviso no dice qué pantalla es");
ok(await pg.$eval(".sh-cerrada-botones a", (a) => a.getAttribute("href")) === "/inventario/conteo",
   "el aviso no lo lleva a la pantalla que sí tiene (Contar)");
let e = await enlaces();
ok(!e.some(([, h]) => h === "/inventario/tablero"), `el riel le ofrece el Tablero: ${JSON.stringify(e)}`);
ok(e.some(([t, h]) => t === "Conteos" && h === "/inventario/conteo"),
   `«Conteos» no lo lleva a Contar: ${JSON.stringify(e)}`);
ok(e.some(([t, h]) => t === "Contar" && h === "/inventario/conteo"), "el riel no ofrece Contar");

/* 1b · Y en Contar, entra. */
await monta("/inventario/conteo", SOLO_CONTAR);
ok(await hay("#contenido") && !(await hay(".sh-cerrada")), "quien tiene Contar no puede entrar a Contar");

/* 2 · CONTAR Y TABLERO: el Tablero abre y Conteos va al Tablero de siempre. */
await monta("/inventario/tablero", CONTAR_Y_TABLERO);
ok(await hay("#contenido") && !(await hay(".sh-cerrada")), "quien tiene el Tablero no puede abrirlo");
e = await enlaces();
ok(e.some(([t, h]) => t === "Conteos" && h === "/inventario/tablero"), `«Conteos» ya no va al Tablero: ${JSON.stringify(e)}`);

/* 3 · SOLO AVERÍAS: la rama Conteos ni se ofrece (desde la portada). */
await monta("/inventario", SOLO_AVERIAS);
e = await enlaces();
ok(!e.some(([t]) => t === "Conteos") && e.some(([t]) => t === "Averías"), `con solo Averías el riel dice ${JSON.stringify(e)}`);

/* 3b · Con las dos ramas, la de Conteos apunta a la pantalla que sí tiene. */
await monta("/inventario", [...SOLO_CONTAR, ...SOLO_AVERIAS]);
e = await enlaces();
ok(e.some(([t, h]) => t === "Conteos" && h === "/inventario/conteo"), `desde la portada, Conteos va a ${JSON.stringify(e)}`);

/* 4 · UNA DIRECCIÓN MÁS HONDA SIN REGISTRAR no se cierra por un permiso que no era el suyo. */
await monta("/inventario/tablero/detalle-que-no-existe", SOLO_CONTAR);
ok(await hay("#contenido") && !(await hay(".sh-cerrada")), "una dirección honda sin registrar se cerró");

/* 5 · LA PORTADA DEL MÓDULO nunca se cierra. */
await monta("/inventario", SOLO_CONTAR);
ok(await hay("#contenido") && !(await hay(".sh-cerrada")), "la portada de Inventario se cerró: ahí se escoge rama");

/* 6 · Administración: quien no tiene Roles no lo abre tecleando. */
await monta("/admin/roles", []);
ok(await hay(".sh-cerrada") && !(await hay("#contenido")), "quien no tiene Roles abre /admin/roles");

await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Permisos en el riel y en el cuerpo: quien solo tiene Contar no ve el Tablero ni por el menú, ni por Conteos, ni tecleando; " +
            "el que sí lo tiene entra; la portada y las direcciones sin registrar no se cierran.");
