import { chromium } from "playwright";
import fs from "node:fs";
const css = fs.readFileSync("src/app/(app)/acciones/acciones.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8").split("\n").filter(l=>/^\s*--c-|^:root|^}/.test(l)).join("\n");
const mot = (c,n,a,crit,off) => `<div class="fila dos${off?" apagada":""}">
<div><div class="tit">${n}</div><div class="meta"><code class="clave">${c}</code><span>·</span><span>${a}</span>${crit?'<span>·</span><span class="eti alta">CRÍTICO</span>':''}${off?'<span>·</span><span class="eti anulada">DESACTIVADA</span>':''}<span>·</span><span>3 acciones</span></div></div>
<div class="der"><div class="par"><button class="btn">Editar</button><button class="btn">Desactivar</button><span class="nota-chica">no se puede borrar, ya se usó</span></div></div></div>`;
const html = `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;background:#F4F6F9;font:14px system-ui}
.marco{min-height:100vh;display:flex;flex-direction:column;padding:16px}${css}</style>
<div class="marco"><div class="ac">
<div class="filtros"><button class="btn si">Zonas (10)</button><button class="btn">Motivos (18)</button><button class="btn">Áreas (7)</button><button class="btn mas-chico">+  Agregar motivo</button></div>
<section class="caja"><div class="cab"><div><h2>Los motivos</h2><p>La lista cerrada de lo que se puede reportar.</p></div></div>
<div class="rueda">
${mot("apilado_incorrecto","Apilado incorrecto","Almacenamiento",false,false)}
${mot("pasillo_obstruido","Pasillo obstruido","Almacenamiento",true,false)}
${mot("envase_sin_separar","Envase sin separar por clase","Quiebra",false,true)}
${mot("demarcacion_borrada","Demarcación borrada","Seguridad",false,false)}
</div></section></div></div>`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [w,h,n] of [[1440,900,"mae-pc"],[390,844,"mae-cel"]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.setContent(html); await p.waitForTimeout(120);
  const m = await p.evaluate(() => {
    const de = document.documentElement;
    const titulos = [...document.querySelectorAll(".fila .tit")];
    const claves = [...document.querySelectorAll(".fila .clave")];
    // ¿alguna clave se monta encima de su título?
    const choques = titulos.filter((t,i) => {
      const a = t.getBoundingClientRect(), b2 = claves[i].getBoundingClientRect();
      return !(b2.top >= a.bottom - 1 || b2.bottom <= a.top + 1) && b2.left < a.right && b2.right > a.left;
    }).length;
    return { scrollH: de.scrollWidth > de.clientWidth + 1, choques,
             fuera: [...document.querySelectorAll(".ac *")].filter(e => e.getBoundingClientRect().right > de.clientWidth + .6).length };
  });
  console.log(n.padEnd(8), JSON.stringify(m));
  await p.screenshot({ path: `.arnes/${n}.png` });
  await p.close();
}
await b.close();
