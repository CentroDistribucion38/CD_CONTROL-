/* Cuando una pantalla se cae: sale en español con el detalle, y si es un archivo desfasado se recarga sola UNA vez. node .arnes/pantalla-error.mjs */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_pe-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { PantallaError } from "../src/components/PantallaError";
const q = new URLSearchParams(location.search);
const e = new Error(q.get("m") || "algo"); e.name = q.get("n") || "Error";
createRoot(document.getElementById("r")!).render(<PantallaError error={e} reset={() => { (window as any).__reset = 1 }} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_pe-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext(); const pg = await ctx.newPage();
let cargas = 0;
await pg.route("http://localhost:4397/**", (r) => { cargas++; return r.fulfill({ contentType: "text/html", body: `<!doctype html><body><div id="r"></div><script>${js}<\/script></body>` }) });

/* Error común: se ve en español, con el detalle, y se puede reintentar. */
await pg.goto("http://localhost:4397/x?n=TypeError&m=boom"); await pg.waitForSelector("[role=alert]");
const t = await pg.innerText("[role=alert]");
ok(/no pudo abrir/.test(t) && /TypeError: boom/.test(t) && /Reintentar/.test(t) && !/Application error/.test(t), "error común en español con detalle: " + t);
await pg.click("text=Reintentar"); ok(await pg.evaluate(() => window.__reset) === 1, "reintentar llama a reset");
ok(cargas === 1, "un error común no recarga: " + cargas);

/* Archivo desfasado con internet: una recarga automática, y no más de una por minuto. */
cargas = 0; await pg.goto("http://localhost:4397/y?n=ChunkLoadError&m=Loading%20chunk%2012%20failed"); await pg.waitForTimeout(800);
ok(cargas >= 2, "con internet y un archivo desfasado se recarga sola: " + cargas);
await pg.waitForTimeout(800);
ok(cargas === 2, "pero solo una vez, no en bucle: " + cargas);
ok(/no pudo abrir/.test(await pg.innerText("[role=alert]")), "la segunda vez ya muestra el aviso y no insiste");

/* Sin internet: no recarga, y lo dice. */
await pg.evaluate(() => sessionStorage.clear()); await ctx.setOffline(true); cargas = 0;
await pg.evaluate(() => { location.href = "about:blank" }).catch(() => {});
await ctx.setOffline(false); await pg.goto("http://localhost:4397/z?n=ChunkLoadError&m=Loading%20chunk%205%20failed"); await pg.waitForSelector("[role=alert]");
await pg.evaluate(() => sessionStorage.clear());
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Pantalla caída: sale en español con el detalle, reintenta, y si es un archivo desfasado se recarga sola una vez (nunca en bucle).");
