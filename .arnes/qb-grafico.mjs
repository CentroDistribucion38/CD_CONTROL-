import { buildSync } from "esbuild"; import { readFileSync, writeFileSync } from "node:fs"; import { fileURLToPath } from "node:url"; import path from "node:path";
const R = (p) => path.join(path.dirname(fileURLToPath(import.meta.url)), "..", p);
const stub = `export function createClient(){return {from(){return {select(){return Promise.resolve({data:[],error:null})}}}, rpc(){return Promise.resolve({data:null,error:null})}, auth:{getUser(){return Promise.resolve({data:{user:null}})}}}}`;
writeFileSync(R(".arnes/_supa-qb.ts"), stub);
writeFileSync(R(".arnes/_nav-qb.tsx"), `import React from "react"; export const useRouter=()=>({push(){},refresh(){},replace(){}}); export default function Link(p:any){return <a href={p.href} {...p}>{p.children}</a>}`);
const js = buildSync({ entryPoints: [R(".arnes/_qb-pant.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_supa-qb.ts"), "next/link": R(".arnes/_nav-qb.tsx"), "next/navigation": R(".arnes/_nav-qb.tsx"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error" }).outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = ["src/app/globals.css", "src/app/(app)/quiebra/quiebra.css"].map((f) => readFileSync(R(f), "utf8")).join("\n");
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
for (const ancho of [1440, 1100, 700, 390]) {
  const pg = await nav.newPage({ viewport: { width: ancho, height: 900 } });
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style></head><body><div id="r"></div><script>${js}</script></body></html>`);
  await pg.waitForSelector(".g-mes", { timeout: 8000 }); await pg.waitForTimeout(400);
  const el = pg.locator(".tarjeta", { has: pg.locator(".g-mes") });
  await el.screenshot({ path: `/tmp/qb/g-${ancho}.png` });
  const r = await pg.evaluate(() => { const s = document.querySelector(".g-mes"), c = document.querySelector(".g-caja"); return { svg: s.getAttribute("width") + "x" + s.getAttribute("height"), caja: c.clientWidth + "x" + c.clientHeight, sobrante: document.documentElement.scrollWidth - innerWidth } });
  console.log(ancho, JSON.stringify(r));
}
if (errs.length) { console.log("ERRORES", errs.slice(0, 3)); process.exit(1) }
await nav.close();
