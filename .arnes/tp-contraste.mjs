/* CONTRASTE REAL DE LOS PANELES, en los siete temas.
   Chrome devuelve rgb() para los colores planos y color(srgb 0-1) para
   lo que sale de color-mix: si se leen igual, el medidor miente. */
import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const TEMAS = ["oficial","tinta","pizarra","ambar","negro","gris","halo"];
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malos = 0;
for (const tema of TEMAS) {
  const HTML = `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;padding:18px;background:#f1f1f1}${css}</style>
<div ${tema==="oficial"?"":`data-tema="${tema}"`}><div class="tp">
<div class="panel-ojo"><div class="corte"></div><div class="rot">REGISTRADOS HOY</div>
<div class="num">2</div><div class="pie">de <b>11 planeados</b></div></div>
<div class="kpi"><div class="rot">PLAN</div><div class="num">6</div>
<div class="pie">de <b>11 viajes</b></div></div>
<form class="agregar-m"><input><button>Agregar</button></form>
<div class="fecha-nav"><button class="hoy">HOY</button></div>
<div class="par-dup"><span class="tx gana">Ag01</span></div>
<div class="seg"><button class="on">Viaje con carga</button></div>
<div class="caja"><div class="fila"><div class="placa">WGX418</div><div>
<div class="ruta">Ag01 → Planta</div>
<div class="meta"><span class="doc-eti">4500123456</span>
<span class="eti sin-doc">SIN DOCUMENTO</span>
<span class="eti corregido">CORREGIDO</span></div></div></div></div>
</div></div>`;
  const pg = await nav.newPage({ viewport:{width:420,height:420}, deviceScaleFactor:2 });
  await pg.setContent(HTML,{waitUntil:"load"});
  const r = await pg.evaluate(() => {
    const leer = (s) => {
      const m = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
      if (m) return [1,2,3].map(i => Number(m[i]) * 255);
      const n = s.match(/(\d+(?:\.\d+)?)/g) || [];
      return [0,1,2].map(i => Number(n[i] || 0));
    };
    const lum = (c) => { const [r,g,b] = c.map(v => {
      const x = v/255; return x <= .03928 ? x/12.92 : Math.pow((x+.055)/1.055, 2.4); });
      return .2126*r + .7152*g + .0722*b; };
    const razon = (a,b) => { const [A,B] = [lum(leer(a)), lum(leer(b))].sort((x,y)=>y-x);
      return Math.round(((A+.05)/(B+.05))*10)/10; };
    const out = {};
    /* El tercer valor es CONTRA QUÉ se mide. Una etiqueta de fondo
       transparente no se puede medir contra sí misma: el lector
       devolvería negro para «transparent» y daría un contraste
       inventado. Se mide contra la fila, que es lo que de verdad hay
       detrás. */
    for (const [nom, sel, cajaSel] of [
        ["ojo-pie",".panel-ojo .pie"],["ojo-b",".panel-ojo .pie b"],
        ["ojo-rot",".panel-ojo .rot"],["kpi-pie",".kpi .pie b"],
        ["agregar",".agregar-m button", "propio"],["hoy",".fecha-nav .hoy", "propio"],
        ["gana",".par-dup .tx.gana", "propio"],["seg",".seg button.on", "propio"],
        ["doc",".fila .meta .doc-eti", ".fila"],
        ["sin-doc",".fila .meta .eti.sin-doc", ".fila"],
        ["corregido",".fila .meta .eti.corregido", "propio"]]) {
      const el = document.querySelector(sel);
      let caja = cajaSel === "propio" ? el
               : cajaSel ? el.closest(cajaSel)
               : el.closest(".panel-ojo, .kpi");

      /* Y SI ESA CAJA NO PINTA NADA, SE SIGUE SUBIENDO. Un elemento sin
         fondo no es negro: deja ver el de atrás. Medir contra él
         devuelve un contraste inventado — la primera versión de esto
         daba 1,3 y 2,2 para dos etiquetas perfectamente legibles, y el
         error estaba en el medidor, no en la pantalla. */
      const pinta = (n) => {
        const c = getComputedStyle(n).backgroundColor;
        return c && c !== "transparent" && !/rgba\([^)]*,\s*0\s*\)/.test(c);
      };
      while (caja && caja !== document.documentElement && !pinta(caja)) caja = caja.parentElement;
      if (!caja) caja = document.body;
      const cs = getComputedStyle(el), cp = getComputedStyle(caja);
      /* La opacidad mezcla con el fondo antes de pintar: medir el color
         escrito y no el que se ve dejaría pasar un texto apagado. */
      const op = Number(cs.opacity);
      const f = (() => { const [r,g,b] = (() => { const m = cp.backgroundColor;
        const mm = m.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
        if (mm) return [1,2,3].map(i => Number(mm[i])*255);
        const n = m.match(/(\d+(?:\.\d+)?)/g)||[]; return [0,1,2].map(i=>Number(n[i]||0)); })();
        return `rgb(${r},${g},${b})`; })();
      const t = (() => { const m = cs.color;
        const mm = m.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
        const c = mm ? [1,2,3].map(i=>Number(mm[i])*255)
                     : (m.match(/(\d+(?:\.\d+)?)/g)||[]).slice(0,3).map(Number);
        const fb = (f.match(/(\d+(?:\.\d+)?)/g)||[]).map(Number);
        return `rgb(${c.map((v,i)=>Math.round(v*op + fb[i]*(1-op))).join(",")})`; })();
      out[nom] = razon(t, f);
    }
    return out;
  });
  /* 4,5 para texto normal; 3,0 para las cifras grandes. El .rot y el
     .pie son texto chico: van al 4,5. */
  const mal = Object.entries(r).filter(([,v]) => v < 4.5);
  if (mal.length) malos++;
  console.log(tema.padEnd(9), JSON.stringify(r), mal.length ? "  MAL: "+mal.map(([k])=>k).join(",") : "  ok");
  await pg.close();
}
await nav.close();
console.log(malos ? `\n${malos} tema(s) por debajo de 4,5` : "\nlos siete temas por encima de 4,5");
