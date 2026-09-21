/* =====================================================================
   EL ORDEN DE LOS ENVASES — la pantalla de verdad, en Chromium.

   «Que yo ubique primero lo que más van a usar, para que en la lista
   desplegable se vea de esa manera.» Se monta Maestro.tsx con una base
   de mentiras que anota cada upsert:
   1. cada envase tiene su asa ⋮⋮ y se arrastra con el dedo o el ratón;
   2. se guarda la lista renumerada 1, 2, 3… y SOLO los que cambiaron de
      puesto, con todos sus datos (no se pierde el peso ni el apagado);
   3. tocar el asa sin mover no escribe nada;
   4. «Ordenar por lo más usado» pone primero el de más registros;
   5. la lista para escoger al registrar (Rejilla › Escoger) sale en el
      orden del maestro: lo mismo que se ordena aquí;
   6. en 360 las flechas se tocan con el dedo y nada se sale.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-oe.ts"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-oe.ts"), `export const createClient = () => ({ from: (t: string) => ({
  upsert: async (filas: any) => { (window as any).escritos = [...((window as any).escritos ?? []), { t, filas }]; return { error: null } },
  update: () => ({ eq: async () => ({ error: null }) }), delete: () => ({ eq: async () => ({ error: null }) }),
}) });`);
writeFileSync(R(".arnes/_oe-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Maestro } from "../src/app/(app)/quiebra/rotura/maestro/Maestro";
const E = (material: string, descripcion: string, orden: number | null, activo = true) => ({ material, descripcion, peso_kg: 0.21, activo, orden });
const envases = [E("400733", "ENVASE MARRON 330NR CERVEZAS", 1), E("412644", "ENVASE MARRON 330NR NUEVO", 2),
                 E("3500005", "Envase Costeñita 175R", 3), E("3500162", "Envase Marron 330R", 4, false)];
const uso = [{ clase: "envase", clave: "400733", registros: 3, unidades: 1, ultima: "" }, { clase: "envase", clave: "412644", registros: 163, unidades: 1, ultima: "" },
             { clase: "envase", clave: "3500005", registros: 7717, unidades: 1, ultima: "" }, { clase: "envase", clave: "3500162", registros: 5390, unidades: 1, ultima: "" }];
createRoot(document.getElementById("r")!).render(<Maestro lineas={[]} maquinas={[]} envases={envases as any} skus={[]} uso={uso as any} puedeEditar={true} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_oe-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-oe.ts"), "@/lib/supabase/client": R(".arnes/_supa-oe.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/quiebra/rotura/rotura.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ancho, tema) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="rl" id="r"></div></main></div></div><script>${js}</script></body></html>`);
  await pg.waitForSelector(".rl-asa");
  await pg.evaluate(() => { window.escritos = [] });
};
const escrito = async () => (await pg.evaluate(() => window.escritos)).at(-1);

await monta(1200);
ok((await pg.$$(".rl-asa")).length === 4, "no hay un asa ⋮⋮ por envase");
/* ARRASTRAR: se toma el asa del tercero y se suelta encima del primero. */
const arrastra = async (de, a) => {
  const h = await pg.$$(".rl-asa"), filas = await pg.$$(".rl-caja-m .rl-item");
  const bh = await h[de].boundingBox(), bf = await filas[a].boundingBox();
  await pg.mouse.move(bh.x + bh.width / 2, bh.y + bh.height / 2);
  await pg.mouse.down();
  await pg.mouse.move(bh.x + bh.width / 2, bf.y + 4, { steps: 8 });
  await pg.mouse.up();
  await pg.waitForTimeout(100);
};
await arrastra(2, 0);
let e = await escrito();
ok(e?.t === "rotlinea_envases", "arrastrar no guarda en los envases");
ok(e && JSON.stringify(e.filas.map((f) => [f.material, f.orden])) === JSON.stringify([["3500005", 1], ["400733", 2], ["412644", 3]]),
   `arrastrar al primero no guarda la lista renumerada, solo los que cambian: ${JSON.stringify(e?.filas)}`);
ok(e && e.filas.every((f) => f.peso_kg === 0.21 && f.descripcion && f.activo === true), "al mover se pierde el peso, la descripción o el prendido");
const nombres = await pg.$$eval(".rl-caja-m .rl-item-nom b", (t) => t.map((x) => x.textContent));
ok(nombres[0] === "Envase Costeñita 175R", `la lista no se ve en el orden nuevo: ${nombres}`);

await monta(1200);
await pg.click(".rl-asa");
await pg.waitForTimeout(100);
ok(!(await escrito()), "tocar el asa sin mover escribe en la base");

await monta(1200);
await arrastra(3, 0);
e = await escrito();
ok(e && e.filas.find((f) => f.material === "3500162")?.orden === 1 && e.filas.find((f) => f.material === "3500162").activo === false,
   `mover uno apagado lo prende o no lo sube: ${JSON.stringify(e?.filas)}`);

await pg.evaluate(() => { window.escritos = [] });
await pg.click(".rl-por-uso");
e = await escrito();
ok(e && e.filas.find((f) => f.orden === 1)?.material === "3500005" && e.filas.find((f) => f.orden === 2)?.material === "3500162",
   `«por lo más usado» no pone primero lo de más registros: ${JSON.stringify(e?.filas)}`);

/* 5 · la lista para escoger respeta el orden del maestro */
const dat = readFileSync(R("src/modulos/rotlinea/datos.ts"), "utf8");
ok(/from\("rotlinea_envases"\)\.select\("\*"\)\.order\("orden", \{ nullsFirst: false \}\)/.test(dat), "el maestro no se lee en el orden guardado");
const rej = readFileSync(R("src/app/(app)/quiebra/rotura/Rejilla.tsx"), "utf8");
const esc = rej.slice(rej.indexOf("function Escoger("));
ok(!/\.sort\(/.test(esc.slice(0, esc.indexOf("return ("))), "la lista para escoger reordena por su cuenta y no respeta el maestro");

/* 6 · CELULAR Y TEMAS */
for (const ancho of [390, 360]) {
  await monta(ancho);
  const g = await pg.evaluate(() => ({
    lado: document.documentElement.scrollWidth - innerWidth,
    alto: Math.min(...[...document.querySelectorAll(".rl-asa")].map((b) => b.getBoundingClientRect().height)),
    tocar: getComputedStyle(document.querySelector(".rl-asa")).touchAction,
  }));
  ok(g.lado <= 0, `${ancho} px: la página se sale ${g.lado} px`);
  ok(g.alto >= 44, `${ancho} px: el asa mide ${g.alto} px`);
  ok(g.tocar === "none", `${ancho} px: arrastrar con el dedo haría rodar la página`);
}
const lum = (c) => { const v = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2] };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1200, t);
  const p = await pg.evaluate(() => {
    const fondo = (e) => { for (let q = e; q; q = q.parentElement) { const c = getComputedStyle(q).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s); return [getComputedStyle(e).color, fondo(e)] };
    return { "ordenar": par(".rl-por-uso"), "nombre": par(".rl-item-nom b") };
  });
  for (const [k, [a, b]] of Object.entries(p)) ok(razon(a, b) >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${razon(a, b).toFixed(2)}`);
}
await monta(1200); await (await pg.$(".rl-caja-m")).screenshot({ path: "/tmp/claude-0/rl-orden.png" });
await monta(360); await (await pg.$(".rl-caja-m")).screenshot({ path: "/tmp/claude-0/rl-orden-360.png" });
await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Orden de envases: arrastrar desde ⋮⋮ guarda la lista renumerada sin tocar lo demás, «por lo más usado» ordena, y la lista para escoger sigue ese orden.");
