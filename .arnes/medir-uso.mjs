/* EL MEDIDOR DE USO: una visita por pantalla, latidos solo si la persona está ahí, mudo sin internet y si falla la base. */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_nav-mu.ts"), `import { useSyncExternalStore } from "react";
export const usePathname = () => useSyncExternalStore((f) => { window.addEventListener("ruta", f); return () => window.removeEventListener("ruta", f) }, () => (window as any).__ruta, () => "/");`);
writeFileSync(R(".arnes/_supa-mu.ts"), `export const createClient = () => ({ rpc: async (f: string, a: any) => {
  const w = window as any; w.llamadas = [...(w.llamadas ?? []), { f, a }];
  if (w.__falla) return { data: null, error: { message: "no existe" } };
  return { data: f === "uso_visita" ? (w.__n = (w.__n ?? 100) + 1) : null, error: null };
} });`);
writeFileSync(R(".arnes/_mu-entrada.tsx"), `import { createRoot } from "react-dom/client"; import { MedirUso } from "../src/components/MedirUso";
createRoot(document.getElementById("r")!).render(<MedirUso />);`);
const js = buildSync({ entryPoints: [R(".arnes/_mu-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-mu.ts"), "@/lib/supabase/client": R(".arnes/_supa-mu.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext(); const pg = await ctx.newPage();
await pg.route("**/*", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
await pg.goto("https://control.prueba/");
await pg.clock.install({ time: new Date("2026-10-05T15:00:00Z") });
await pg.evaluate(() => { window.__ruta = "/roturas/salida/123456?x=1" });
await pg.setContent(`<!doctype html><body><div id="r"></div><script>window.__ruta="/inventario/tablero";${js}</script></body>`);
const ll = () => pg.evaluate(() => window.llamadas ?? []);
const espera = async () => { for (let i = 0; i < 20; i++) await pg.waitForTimeout(25) };
await espera();
let l = await ll();
ok(l.length === 1 && l[0].f === "uso_visita" && l[0].a.p_ruta === "/inventario/tablero" && l[0].a.p_modulo === "inventario", "al abrir anota la visita con ruta y módulo: " + JSON.stringify(l));
/* quieta 30 s tras el primer toque: sí suma */
await pg.mouse.move(5, 5); await pg.mouse.move(40, 40);
await pg.clock.runFor(30_000); await espera();
l = await ll();
ok(l.filter((x) => x.f === "uso_latido").length === 1 && l[1].a.p_id === 101 && l[1].a.p_seg === 30, "a los 30 s con movimiento suma un latido a SU visita: " + JSON.stringify(l.slice(1)));
/* sin moverse más de un minuto: no suma */
await pg.clock.runFor(120_000); await espera();
const nLat = (await ll()).filter((x) => x.f === "uso_latido").length;
ok(nLat <= 3, "quieto más de un minuto deja de sumar (latidos: " + nLat + ")");
const antes = nLat;
await pg.clock.runFor(120_000); await espera();
ok((await ll()).filter((x) => x.f === "uso_latido").length === antes, "y sigue sin sumar mientras no se mueva");
/* pestaña oculta no suma */
await pg.mouse.move(60, 60);
await pg.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }) });
const a2 = (await ll()).length; await pg.clock.runFor(30_000); await espera();
ok((await ll()).length === a2, "con la pestaña oculta no suma");
await pg.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }) });
/* cambio de pantalla */
await pg.evaluate(() => { window.__ruta = "/roturas/salida/123456?x=1"; window.dispatchEvent(new Event("ruta")) }); await espera();
l = await ll(); const v = l.filter((x) => x.f === "uso_visita");
ok(v.length === 2 && v[1].a.p_ruta === "/roturas/salida/:id" && v[1].a.p_modulo === "quiebra", "otra pantalla = otra visita, con el id normalizado: " + JSON.stringify(v[1]));
/* sin internet */
await ctx.setOffline(true); await pg.evaluate(() => { window.dispatchEvent(new Event("offline")) });
const a3 = (await ll()).length;
await pg.evaluate(() => { window.__ruta = "/admin/uso"; window.dispatchEvent(new Event("ruta")) }); await espera();
ok((await ll()).length === a3, "sin internet no llama a la base");
await ctx.setOffline(false);
/* la base sin el archivo: una sola vez y se apaga */
await pg.evaluate(() => { window.__falla = true; window.__ruta = "/inventario/kardex"; window.dispatchEvent(new Event("ruta")) }); await espera();
const a4 = (await ll()).length;
await pg.evaluate(() => { window.__ruta = "/inventario/ubicaciones"; window.dispatchEvent(new Event("ruta")) }); await espera();
await pg.mouse.move(80, 80); await pg.clock.runFor(60_000); await espera();
ok((await ll()).length === a4, "si falta el archivo en la base, no insiste");
await nav.close();
if (fallas.length) { console.log("FALLAS (" + fallas.length + "):\n - " + fallas.join("\n - ")); process.exit(1) }
console.log("✓ Medidor de uso: una visita por pantalla, latido solo con la persona presente, mudo sin internet o sin el archivo.");
