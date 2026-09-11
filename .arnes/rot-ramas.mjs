import { chromium } from "playwright";
import fs from "node:fs";
const css = fs.readFileSync("src/app/(app)/roturas/roturas.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8").split("\n").filter(l=>/^\s*--c-|^:root|^}/.test(l)).slice(0,400).join("\n");
const rama = (rot,nom,des,n,u,pie,mal) => `
<a class="rama"><span class="corte"></span><span class="rot">${rot}</span><span class="nom">${nom}</span>
<span class="des">${des}</span>
<span class="cifra-rama ${mal?"mal":""}"><b>${n}</b><i>${u}</i><em>${pie}</em></span>
<span class="entrar">Entrar <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 7l5 5-5 5"/></svg></span></a>`;
const html = `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;background:#F4F6F9;font:14px system-ui}
.marco{min-height:100vh;padding:16px}${css}</style><div class="marco"><div class="rt">
<section class="cabeza"><div><p class="ojo">ROTURAS · VIDRIO Y PRODUCTO ROTO · CD38 AG01</p>
<h1>¿Qué vas a hacer?</h1><p class="sub">El módulo mide dos cosas y no se mezclan. Arriba se cuentan <b>unidades</b> por causa y por proceso; abajo se pesan <b>kilos</b> de vidrio.</p></div></section>
<div class="ramas">
${rama("UNIDADES","En sitio","Lo que se rompió en la bodega, contado por causa y por proceso. Contesta de quién fue y de dónde salió.","9","roturas","esperando visto bueno · 2 sin la foto que exige su causa",true)}
${rama("KILOS","Salida","El vidrio que sale por la puerta, pesado en tolvas y firmado por tres personas. Contesta cuánto salió.","3.276","kg","en 2 salidas abiertas · 1 esperando firma",true)}
</div></div></div>`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [nom,w,h] of [["pc",1440,900],["tab",820,1180],["cel",390,844],["360",360,780]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.setContent(html); await p.waitForTimeout(120);
  console.log(nom.padEnd(4), JSON.stringify(await p.evaluate(() => {
    const r=(s,i=0)=>{const e=document.querySelectorAll(s)[i];if(!e)return null;const b=e.getBoundingClientRect();return{w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.x)}};
    let fuera=0;
    for (const c of document.querySelectorAll(".rama")) { const cb=c.getBoundingClientRect();
      for (const k of c.querySelectorAll("*")) { const kb=k.getBoundingClientRect();
        if (kb.right>cb.right+1||kb.left<cb.left-1||kb.bottom>cb.bottom+1) fuera++; } }
    return { desborde: document.documentElement.scrollWidth-document.documentElement.clientWidth, fuera,
      r1:r(".rama",0), r2:r(".rama",1), nom:r(".rama .nom"), cif:r(".cifra-rama") };
  })));
  await p.screenshot({ path:`.arnes/rot-ramas-${nom}.png`, fullPage:true });
  await p.close();
}
await b.close();
