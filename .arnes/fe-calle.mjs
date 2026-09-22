/* =====================================================================
   EL MAESTRO, BUSCANDO UNA CALLE — el componente de verdad, en Chromium.

   «FILTRO P Y NO ME SALE LA P.»  Lo que pasaba: escribir «P» buscaba la
   letra p DENTRO de la clave y de la familia, daban 331 filas, se
   dibujaban las primeras 60 y las 60 eran de la calle A. La calle P
   existía y no se veía nunca.

   SE COMPRUEBA, con 430 ubicaciones de mentira repartidas como las de
   verdad (la A primero, la P de última):

   1. escribir «P» deja SOLO ubicaciones de la calle P;
   2. y las deja TODAS, no las primeras 60;
   3. el selector de calle se pone solo en P, para que se vea por qué;
   4. escribir «P_4» —que no es una calle— sigue buscando por clave, y
      lo que empieza por «P_4» sale de primero;
   5. escoger otra calle en el selector manda sobre lo escrito;
   6. nada de esto se sale a 390 px.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-fc.ts"), `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });
export const useSearchParams = () => new URLSearchParams("");`);
writeFileSync(R(".arnes/_supa-fc.ts"), `export const createClient = () => ({
  rpc: async () => ({ error: null }),
  from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
});`);
writeFileSync(R(".arnes/_fc-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Maestro } from "../src/app/(app)/inventario/maestro/Maestro";
const w = window as any;
createRoot(document.getElementById("r")!).render(
  <div className="fe"><Maestro materiales={[]} ubicaciones={w.UBI} bodegas={w.BOD} esEditor={false} /></div>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_fc-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-fc.ts"), "@/lib/supabase/client": R(".arnes/_supa-fc.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

/* EL ALMACÉN, COMO ES: calles de una letra con módulos y dos lados. La
   P va de última en el abecedario, que es justo el problema. */
const CALLES = ["A", "B", "C", "D", "E", "F", "G", "H", "P"];
const UBI = [];
let n = 0;
for (const c of CALLES) {
  const mods = c === "P" ? 49 : 24;
  for (let m = 1; m <= mods; m++) for (const lado of ["IZQ", "DER"]) {
    UBI.push({ id: "u" + ++n, bodega_id: "b1", clave: `${c}_${String(m).padStart(2, "0")}_${lado}`,
      calle: c, modulo: String(m), lado, familia: "RB/CAJAS/ESTIBAS", capacidad: 68, activa: true });
  }
}
const enP = UBI.filter((u) => u.calle === "P").length;
const BOD = [{ id: "b1", codigo: "CD38", nombre: "CD Barranquilla", direccion: null, activo: true }];

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.route("**/*", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }));

const monta = async (ancho = 1300) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/inventario/maestro");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main" id="m"><div id="r"></div></main></div></div>
    <script>window.UBI=${JSON.stringify(UBI)};window.BOD=${JSON.stringify(BOD)};</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".fe-busca input");
  await pg.click('[role="tab"]:has-text("Ubicaciones")');
  await pg.waitForSelector(".fe-filtro-calle select");
};

const claves = () => pg.$$eval(".fe-fila .clave, .fe-fila b, .fe-clave",
  (ns) => ns.map((x) => x.textContent.trim()).filter((t) => /^[A-Z]+_\d/.test(t)));

await monta();

/* 1 y 2 · ESCRIBIR «P» ES BUSCAR LA CALLE P, Y SALEN TODAS */
await pg.fill(".fe-busca input", "P");
await pg.waitForTimeout(120);
{
  const cs = await claves();
  ok(cs.length > 0, "escribiendo «P» no se dibuja ninguna ubicación");
  ok(cs.every((c) => c.startsWith("P_")), `escribiendo «P» salen calles que no son la P: ${cs.filter((c) => !c.startsWith("P_")).slice(0, 4).join(", ")}`);
  ok(cs.length === enP, `la calle P tiene ${enP} posiciones y se dibujan ${cs.length} — se está cortando en 60 otra vez`);
  const cuenta = await pg.textContent(".fe-cuenta");
  ok(/Calle\s*P/.test(cuenta), `la cuenta no dice de qué calle es: «${cuenta.trim()}»`);
}

/* 3 · EL SELECTOR SE PONE SOLO */
ok(await pg.inputValue(".fe-filtro-calle select") === "P",
   "el selector de calle no se pone en P cuando se escribe P");

/* 4 · «P_4» NO ES UNA CALLE: SIGUE SIENDO BÚSQUEDA POR CLAVE */
await pg.fill(".fe-busca input", "P_4");
await pg.waitForTimeout(120);
{
  const cs = await claves();
  ok(cs.length > 0 && cs[0].startsWith("P_4"),
     `buscando «P_4» lo primero es ${cs[0] ?? "nada"} — lo que empieza por lo escrito va primero`);
  ok(cs.every((c) => c.includes("P_4")), "buscando «P_4» sale algo que no lo contiene");
}

/* 5 · EL SELECTOR MANDA SOBRE LO ESCRITO */
await pg.fill(".fe-busca input", "P");
await pg.waitForTimeout(80);
await pg.selectOption(".fe-filtro-calle select", "B");
await pg.waitForTimeout(120);
{
  const cs = await claves();
  ok(cs.length > 0 && cs.every((c) => c.startsWith("B_")),
     "escogiendo la calle B en el selector siguen saliendo otras calles");
  ok(await pg.inputValue(".fe-busca input") === "",
     "al escoger una calle en el selector, lo escrito debería quedar limpio");
}

/* 6 · EN EL CELULAR NO SE SALE NADA */
await monta(390);
await pg.fill(".fe-busca input", "P");
await pg.waitForTimeout(150);
{
  const sale = await pg.evaluate(() => {
    const m = document.getElementById("m");
    return m.scrollWidth - m.clientWidth;
  });
  ok(sale <= 1, `a 390 px la pantalla se sale ${sale} px de lado`);
}

await nav.close();
console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log(`✓ Maestro · buscar «P» trae la calle P entera (${enP} posiciones), «P_4» sigue buscando por clave, y a 390 no se sale.`);
