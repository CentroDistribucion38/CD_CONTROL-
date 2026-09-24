import { chromium } from "playwright";
import fs from "node:fs";
const css = fs.readFileSync("src/app/(app)/acciones/acciones.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8").split("\n").filter(l=>/^\s*--c-|^:root|^}/.test(l)).join("\n");
const html = `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;background:#F4F6F9;font:14px system-ui}
.marco{min-height:100vh;display:flex;flex-direction:column;padding:16px}${css}</style>
<div class="marco"><div class="ac"><section class="caja"><div class="rueda">
<div class="fila vencida"><div class="cod">AC-0141</div>
<div><div class="tit">Estibas mal apiladas en el pasillo de picking 3</div>
<div class="meta"><span class="eti alta">ALTA</span><span>Almacenamiento</span></div></div>
<div class="der"><span class="plazo mal">vencida hace 9 días</span>
<div class="par"><button class="btn bien">Fue efectiva</button><button class="btn mal">No fue efectiva</button></div></div></div>
</div></section></div></div>`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport:{width:390,height:844} });
await p.setContent(html); await p.waitForTimeout(100);
console.log(await p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect();
    return { w: Math.round(b.width), x: Math.round(b.x), y: Math.round(b.y) }; };
  return { der: r(".der"), envoltura: r(".der div"),
    b1: r(".btn.bien"), b2: r(".btn.mal") };
}));
await b.close();
