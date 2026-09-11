import { chromium } from "playwright";
import fs from "node:fs";
const css = fs.readFileSync("src/app/(app)/roturas/roturas.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const TEMAS = ["oficial","tinta","pizarra","ambar","negro","gris","halo"];
const cuerpo = `<div class="rt">
<section class="cabeza"><div><p class="ojo">ROTURAS · SALIDA</p><h1>Salida SR-0248</h1>
<p class="sub">Vidrio pesado en tolvas.</p></div>
<div class="kpi"><span class="corte"></span><div class="rot">NETO DE LA SALIDA</div>
<div class="num">1.102<span class="u">kg</span></div><div class="pie">kg en <b>3 tolvas</b></div></div></section>
<div class="cadena"><div class="eslabon aqui"><div class="n">9</div><div class="r">POR REVISAR</div></div>
<div class="flecha">›</div><div class="eslabon"><div class="n">34</div><div class="r">CUENTAN</div></div></div>
<section class="comomide"><div><div class="rot">CÓMO SE MIDE</div><h2>Bruto menos tolva</h2>
<div class="formula"><span class="chip">BRUTO</span><span class="signo">−</span><span class="chip tara">TARA 111</span><span class="signo">=</span><span class="chip neto">NETO</span></div></div>
<div class="dibujo"><div class="tara-sello"><div class="r">TARA</div><div class="v">111 kg</div></div></div></section>
<section class="totales"><div class="t"><div class="r">ÁMBAR</div><div class="v">799 kg</div></div>
<div class="t neto"><div class="r">TOTAL NETO</div><div class="v">1.102 kg</div></div></section>
<div class="filas"><div class="fila"><div class="izq"><div class="cod">SR-0248</div></div>
<div><div class="tit"><span class="placa">ABC123</span>3 tolvas · 1.102 kg netos</div>
<div class="meta"><span class="eti asumida">Asumida por el OL</span><span class="eti no_asumida">No asumida</span></div></div>
<div class="der"><div class="par"><button class="btn">Ver</button><button class="btn si">Verificar</button></div></div></div></div>
<section class="caja"><div style="padding:12px"><div class="firmas">
<div class="firma turno"><div class="cab-f"><span class="n">2</span><div><div class="quien">Verificador</div><div class="hace">revisa</div></div></div><div class="cuando">Esperando</div></div>
</div></div></section></div>`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
/* Chrome devuelve rgb(0-255) para los colores planos y color(srgb 0-1)
   para lo que sale de color-mix. La primera version leia los dos como si
   fueran 0-255 y daba contrastes inventados: la banda "fallaba" cuando
   el CSS estaba bien. */
const lum = (c) => { let m=c.match(/[\d.]+/g).map(Number);
  if (c.startsWith("color(")) m = m.map(v => v*255);
  const f=(v)=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};
  return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2]) };
const ratio=(a,b)=>{const L1=lum(a),L2=lum(b);const [h,l]=L1>L2?[L1,L2]:[L2,L1];return (h+.05)/(l+.05)};

for (const t of TEMAS) {
  const p = await b.newPage({ viewport:{width:1280,height:900} });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;background:#F1F1F1;font:14px system-ui}
.marco{padding:20px}${css}</style>
<div class="sh"${t==="oficial"?"":` data-tema="${t}"`}><div class="marco">${cuerpo}</div></div>`);
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => {
    const g=(s,prop)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[prop]:null};
    return {
      kpiBg:g(".kpi","backgroundColor"), kpiFg:g(".kpi .num","color"),
      netoBg:g(".chip.neto","backgroundColor"), netoFg:g(".chip.neto","color"),
      btnBg:g(".btn.si","backgroundColor"), btnFg:g(".btn.si","color"),
      bandaBg:g(".totales","backgroundColor"), bandaFg:g(".totales .t.neto .v","color"),
      placaBg:g(".placa","backgroundColor"), placaFg:g(".placa","color"),
      ojo:g(".cabeza .ojo","color"), papel:g(".fila","backgroundColor"),
    };
  });
  const par=(a,b)=>ratio(r[a],r[b]).toFixed(2);
  console.log(t.padEnd(8),
    "kpi",par("kpiFg","kpiBg"), "neto",par("netoFg","netoBg"),
    "btn",par("btnFg","btnBg"), "banda",par("bandaFg","bandaBg"),
    "placa",par("placaFg","placaBg"), "ojo",ratio(r.ojo,r.papel).toFixed(2));
  await p.screenshot({ path:`.arnes/tema-${t}.png`, fullPage:true });
  await p.close();
}
await b.close();
