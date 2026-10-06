/* CONTEO · al tocar «Empezar a contar» se pide y se manda la ubicación (UNA vez), y si dicen que no también queda anotado.
     node .arnes/conteo-inicio-ubicacion.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
writeFileSync(R(".arnes/_ciu-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Contar } from "../src/app/(app)/inventario/conteo/Contar";
createRoot(document.getElementById("r")!).render(<Contar bodegaId="b1" conteoInicial={null} renglonesIniciales={[]} materiales={[]} ubicaciones={[]} estados={["PIROGRABADO"]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ciu-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_sb-conteo.js"), "next/navigation": R(".arnes/stub-nav.js"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const pagina = `<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div id="r" class="fe contando"></div></main></div></div><script>${js}</script></body></html>`;
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function caso(nombre, permisos, geo) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 800 }, permissions: permisos, geolocation: geo, baseURL: "https://control.test" });
  const pg = await ctx.newPage();
  const rotos = []; pg.on("pageerror", (e) => rotos.push(e.message));
  /* la ubicación se concede por ORIGEN: en about:blank no hay; se sirve la página desde un origen http falso */
  await pg.route("https://control.test/**", (r) => r.fulfill({ contentType: "text/html", body: pagina }));
  await pg.goto("https://control.test/");
  await pg.waitForSelector(".fe-arranque", { timeout: 8000 });
  ok(/registra\s+dónde estás/.test((await pg.textContent(".fe-arranque")).replace(/\s+/g, " ")), nombre + ": el aviso de que se registra la ubicación no está a la vista");
  await pg.click(".fe-arranque .btn");
  await pg.waitForFunction(() => (window.__llamadas ?? []).some((l) => l.fn === "conteo_fefo_posicion"), null, { timeout: 8000 }).catch(() => {});
  const ll = await pg.evaluate(() => window.__llamadas ?? []);
  ok(ll[0]?.fn === "conteo_fefo_abrir", nombre + ": primero se abre el conteo");
  const pos = ll.filter((l) => l.fn === "conteo_fefo_posicion");
  ok(pos.length === 1, nombre + ": la ubicación se manda UNA vez (" + pos.length + ")");
  ok(rotos.length === 0, nombre + ": error de página " + rotos[0]);
  await ctx.close();
  return pos[0]?.args;
}
const a = await caso("con permiso", ["geolocation"], { latitude: 10.9685, longitude: -74.7813, accuracy: 9 });
ok(a?.p_estado === "ok" && Math.abs(a.p_lat - 10.9685) < 1e-6 && Math.abs(a.p_lng + 74.7813) < 1e-6, "con permiso: debía mandar estado ok y las coordenadas: " + JSON.stringify(a));
const b = await caso("sin permiso", [], undefined);
ok(b?.p_estado === "denegada" && b.p_lat == null, "sin permiso: debía anotar «denegada» sin coordenadas: " + JSON.stringify(b));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ conteo: al empezar se pide y manda la ubicación una vez; si dicen que no, queda «denegada»; el aviso está a la vista");
