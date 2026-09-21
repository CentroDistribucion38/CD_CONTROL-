/* =====================================================================
   EL ORDEN DE LOS ENVASES — la pantalla de verdad, en Chromium.

   «Que yo ubique primero lo que más van a usar, para que en la lista
   desplegable se vea de esa manera.» Se monta Maestro.tsx con una base
   de mentiras que anota cada upsert:
   1. cada envase dice su puesto; ▲ ▼ y «1º» lo mueven;
   2. se guarda la lista renumerada 1, 2, 3… y SOLO los que cambiaron de
      puesto, con todos sus datos (no se pierde el peso ni el apagado);
   3. el primero no sube y el último no baja;
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
  await pg.waitForSelector(".rl-orden");
  await pg.evaluate(() => { window.escritos = [] });
};
const escrito = async () => (await pg.evaluate(() => window.escritos)).at(-1);

await monta(1200);
const n = await pg.$$eval(".rl-orden-n", (t) => t.map((x) => x.textContent));
ok(n.join(",") === "1,2,3,4", `cada envase no dice su puesto: ${n}`);
ok(await pg.isDisabled('button[aria-label="Subir ENVASE MARRON 330NR CERVEZAS"]') && await pg.isDisabled('button[aria-label="Bajar Envase Marron 330R"]'),
   "el primero sube o el último baja");

await pg.click('button[aria-label="Subir Envase Costeñita 175R"]');
let e = await escrito();
ok(e?.t === "rotlinea_envases", "subir no guarda en los envases");
ok(e && JSON.stringify(e.filas.map((f) => [f.material, f.orden])) === JSON.stringify([["3500005", 2], ["412644", 3]]),
   `subir no guarda solo los dos que cambian de puesto con su número nuevo: ${JSON.stringify(e?.filas)}`);
ok(e && e.filas.every((f) => f.peso_kg === 0.21 && f.descripcion && f.activo === true), "al mover se pierde el peso, la descripción o el prendido");

await pg.evaluate(() => { window.escritos = [] });
await pg.click('button[aria-label="Poner Envase Marron 330R de primero"]');
e = await escrito();
ok(e && JSON.stringify(e.filas.map((f) => [f.material, f.orden])) === JSON.stringify([["3500162", 1], ["400733", 2], ["412644", 3], ["3500005", 4]]),
   `«1º» no lo sube de primero y corre a los demás: ${JSON.stringify(e?.filas)}`);
ok(e && e.filas.find((f) => f.material === "3500162").activo === false, "mover uno apagado lo prende");

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
    alto: Math.min(...[...document.querySelectorAll(".rl-orden button")].map((b) => b.getBoundingClientRect().height)),
  }));
  ok(g.lado <= 0, `${ancho} px: la página se sale ${g.lado} px`);
  ok(g.alto >= 44, `${ancho} px: las flechas miden ${g.alto} px`);
}
const lum = (c) => { const v = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2] };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1200, t);
  const p = await pg.evaluate(() => {
    const fondo = (e) => { for (let q = e; q; q = q.parentElement) { const c = getComputedStyle(q).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s); return [getComputedStyle(e).color, fondo(e)] };
    return { "número": par(".rl-orden-n"), "flecha": par(".rl-orden button:not(:disabled)"), "ordenar": par(".rl-por-uso") };
  });
  for (const [k, [a, b]] of Object.entries(p)) ok(razon(a, b) >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${razon(a, b).toFixed(2)}`);
}
await monta(1200); await (await pg.$(".rl-caja-m")).screenshot({ path: "/tmp/claude-0/rl-orden.png" });
await monta(360); await (await pg.$(".rl-caja-m")).screenshot({ path: "/tmp/claude-0/rl-orden-360.png" });
await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Orden de envases: ▲ ▼ y 1º guardan la lista renumerada sin tocar lo demás, «por lo más usado» ordena, y la lista para escoger sigue ese orden.");
