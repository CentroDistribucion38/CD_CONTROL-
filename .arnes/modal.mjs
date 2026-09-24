import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/acciones/acciones.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const tokens = glob.split("\n").filter(l=>/^\s*--c-|^:root|^}|^\s*--bv-|^\s*--sombra/.test(l)).join("\n");
const avisos = glob.slice(glob.indexOf(".av-pila"));

const html = `<!doctype html><meta charset="utf-8"><style>${tokens}
*{box-sizing:border-box}body{margin:0;background:#F4F6F9;font:14px system-ui}
.marco{min-height:100vh;padding:16px}${css}${avisos}</style>
<div class="marco"><div class="ac">
<section class="caja"><div class="cab"><div><h2>3 esperando verificación</h2></div></div></section>

<div class="ac-modal"><div class="fondo"></div><div class="ventana">
<div class="cabezal"><span class="rot">TERCERA VEZ EN EL MISMO SITIO</span><h2>Aquí ya no va otra correctiva</h2></div>
<div class="cuerpo">
<p class="guia">“Apilado incorrecto” en Pasillo 3 lleva <b>3 apariciones</b> en la ventana que mira el sistema. Se cerraron y el problema volvió igual.</p>
<p class="guia">Abrir una cuarta corrección repite el ciclo. Toca pasar a <b>acción preventiva</b>, que obliga a nombrar la causa raíz y tiene un responsable de proceso, no de turno.</p>
<div class="campo"><label>¿Por qué vuelve a pasar? (causa raíz)</label><textarea rows="4" placeholder="Ejemplo: el pasillo 3 recibe producto de dos líneas al mismo tiempo."></textarea></div>
<div class="campo"><label>Responsable del proceso</label><select><option>C. Padilla · Jefe de bodega</option></select></div>
<div class="aviso rojo">Al abrir la preventiva, <b>AC-0142</b> queda verificada como no efectiva.</div>
</div>
<div class="pie"><button class="si">Abrir acción preventiva</button><button class="plano">Atrás</button></div>
</div></div></div>

<div class="av-pila">
<div class="av bien"><span class="av-icono"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="av-txt">AC-0142 queda verificada como efectiva. Cuenta para el indicador del mes.</span><button class="av-x">✕</button></div>
<div class="av mal"><span class="av-icono"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6.5"/></svg></span><span class="av-txt">Tu usuario no tiene permiso para esto. Se necesita rol de supervisor o administrador.</span><button class="av-x">✕</button></div>
</div></div>`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [w,h,n] of [[1440,900,"mod-pc"],[390,844,"mod-cel"]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.setContent(html); await p.waitForTimeout(150);
  console.log(n.padEnd(8), JSON.stringify(await p.evaluate(() => {
    const de = document.documentElement;
    const v = document.querySelector(".ventana").getBoundingClientRect();
    const pila = document.querySelector(".av-pila").getBoundingClientRect();
    return {
      ventanaDentro: v.top >= -1 && v.bottom <= de.clientHeight + 1 && v.left >= -1 && v.right <= de.clientWidth + 1,
      ventanaAncho: Math.round(v.width),
      avisosDentro: pila.right <= de.clientWidth + 1 && pila.left >= -1,
      scrollH: de.scrollWidth > de.clientWidth + 1,
    };
  })));
  await p.screenshot({ path: `.arnes/${n}.png` });
  await p.close();
}
await b.close();
