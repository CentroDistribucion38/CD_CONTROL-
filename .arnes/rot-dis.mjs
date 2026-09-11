import { chromium } from "playwright";
import fs from "node:fs";
const css = fs.readFileSync("src/app/(app)/roturas/roturas.css","utf8");
const head = `<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">`;
const tolva = (n,col,b,t) => `<div class="tolva-card"><div class="arriba"><span class="nom">${n}</span><button class="quitar">Quitar</button></div>
<label>Vidrio</label><div class="vidrio" style="padding:12px 0;font-size:15px"><i style="background:${col==='ambar'?'#C8801F':col==='flint'?'#E7EBE7':'#2F6B3C'};width:18px;height:18px;border:1px solid rgba(0,0,0,.18);display:inline-block"></i>${col==='ambar'?'Ámbar':col==='flint'?'Flint':'Green'}</div>
<div class="resta"><div class="l"><span>Bruto</span><span>${b} kg</span></div><div class="l menos"><span>− Tara de la tolva</span><span>${t} kg</span></div><div class="l neto"><span>Neto</span><span>${b-t} kg</span></div></div>
<div class="pie-t">G. Visbal · 11 sep, 08:14</div></div>`;
const html = `<!doctype html><meta charset="utf-8">${head}<style>
*{box-sizing:border-box}body{margin:0;background:#F1F1F1;font:14px 'IBM Plex Sans',system-ui}
.marco{min-height:100vh;padding:20px}${css}</style><div class="marco"><div class="rt">
<section class="cabeza"><div><p class="ojo">ROTURAS · SALIDA DE MATERIAL · CD38 AG01</p>
<h1>Salida SR-0248</h1><p class="sub">Vidrio pesado en tolvas. Cada tolva tara 111 kg y la resta se muestra tolva por tolva, no al final.</p></div>
<div class="kpi"><span class="corte"></span><div class="rot">NETO DE LA SALIDA</div><div class="num">1.102<span class="u">kg</span></div><div class="pie">kg en <b>3 tolvas</b></div></div></section>

<section class="comomide"><div><div class="rot">CÓMO SE MIDE</div><h2>Bruto menos tolva</h2>
<p>Se pesa la tolva llena en la báscula y el sistema descuenta los 111 kg del recipiente. Si mañana entra una tolva de otro modelo, se cambia la tara en el maestro, no a mano en cada salida.</p>
<div class="formula"><span class="chip">BRUTO</span><span class="signo">−</span><span class="chip tara">TARA 111</span><span class="signo">=</span><span class="chip neto">NETO</span></div></div>
<div class="tara-sello"><div class="r">TARA</div><div class="v">111 kg</div></div></section>

<section class="caja"><div class="cab"><div><h2>Tolvas de esta salida</h2><p>Una salida puede llevar varios vidrios. Cada tolva guarda la tara que tenía el día en que se pesó.</p></div></div>
<div class="tolvas">${tolva("TOLVA 1","ambar",523,111)}${tolva("TOLVA 2","ambar",498,111)}${tolva("TOLVA 3","flint",414,111)}
<button class="agregar"><span><b>+</b> Agregar tolva</span></button></div></section>

<section class="totales"><div class="t"><div class="r">ÁMBAR</div><div class="v">799 kg</div></div>
<div class="t"><div class="r">FLINT</div><div class="v">303 kg</div></div>
<div class="t"><div class="r">GREEN</div><div class="v">0 kg</div></div>
<div class="t neto" style="flex:1 1 auto"><div class="r">TOTAL NETO · 3 TOLVAS</div><div class="v">1.102 kg</div></div></section>

<section class="caja"><div class="cab"><div><h2>Firmas</h2><p>Tres personas, tres momentos. Nadie firma por otro.</p></div></div>
<div style="padding:18px"><div class="firmas">
<div class="firma lista"><div class="cab-f"><span class="n">✓</span><div><div class="quien">G. Visbal</div><div class="hace">Supervisora</div></div></div><div class="cuando">11 sep, 21:04</div></div>
<div class="firma turno"><div class="cab-f"><span class="n">2</span><div><div class="quien">Verificador</div><div class="hace">revisa lo que va a salir</div></div></div><div class="cuando">Esperando</div></div>
<div class="firma"><div class="cab-f"><span class="n">3</span><div><div class="quien">Validación</div><div class="hace">da el aval de salida</div></div></div><div class="cuando">Espera la firma anterior</div></div>
</div></div></section>

<div class="filas">
<div class="fila roja"><div class="izq"><div class="cod">RS-0412</div><div class="ev">EV<br>FOTO</div></div>
<div><div class="tit">Envase Costeñita 175R <span class="vidrio ambar"><i></i>Ámbar</span></div>
<div class="meta"><span class="cant">48</span><span>unidades</span><span>Proceso T1</span><span class="eti no_asumida">No asumida · falla de máquina</span><span>J. Pérez · hace 12 min</span></div></div>
<div class="der"><div class="par"><button class="btn">Ver · 1 foto</button><button class="btn bien">Cuenta</button><button class="btn mal">No cuenta</button></div></div></div>
<div class="fila"><div class="izq"><div class="cod">RS-0409</div><div class="sinfoto">Sin foto</div></div>
<div><div class="tit">Envase Marrón 330R <span class="vidrio ambar"><i></i>Ámbar</span></div>
<div class="meta"><span class="cant">26</span><span>unidades</span><span>Proceso Sorting</span><span class="eti asumida">Asumida por el OL</span><span>J. Pérez · hace 1 h</span></div></div>
<div class="der"><div class="par"><button class="btn">Ver</button><button class="btn bien">Cuenta</button><button class="btn mal">No cuenta</button></div></div></div>
</div>
<div class="aviso"><b>Unidades, no kilos.</b> Lo que se aprueba aquí alimenta el conteo por proceso y por causal. El peso del vidrio que sale de la bodega se mide aparte.</div>
</div></div>`;

const rep = `<!doctype html><meta charset="utf-8">${head}<style>
*{box-sizing:border-box}body{margin:0;background:#F1F1F1;font:14px 'IBM Plex Sans',system-ui}${css}</style>
<div class="rt-rep"><div class="barra"><span class="t">ROTURA EN SITIO</span><button>✕</button></div>
<div class="pasos"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i></div>
<div class="cuerpo"><h2>¿De qué proceso viene?</h2>
<div class="chips" style="margin-top:18px"><button>Líneas</button><button class="on">T1</button><button>Traspaso</button><button>Maquila</button><button>Sorting</button><button>Sin identificar</button></div>
<span class="rotulo">Causa</span>
<div class="opciones"><button><span class="p conpunto"><i class="punto"></i>Mal estibado</span><span class="h">Asumida por el OL</span></button>
<button class="on roja"><span class="p conpunto"><i class="punto"></i>Falla de máquina</span><span class="h">No asumida — se dice que no fue del OL · exige foto</span></button></div>
<div class="exige"><b>Esta causa exige foto.</b> Es lo que sostiene que la rotura no es del OL. Sin evidencia, ABI la va a devolver.</div>
<div class="foto"><div class="lienzo"><span>FOTO DE LA NOVEDAD</span></div><div class="sello">8 sep 2026 · 21:24 · T1 · precisión 6 m</div></div>
<button class="otra">Tomar la foto</button>
<div class="campo"><label>Qué pasó</label><textarea rows="3"></textarea></div></div>
<div class="pie"><button>Atrás</button><button class="si">Enviar a ABI</button></div></div>`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [nom,w,h] of [["pc",1440,1000],["cel",390,844],["360",360,780]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.setContent(html); await p.waitForTimeout(700);
  console.log(nom.padEnd(4), JSON.stringify(await p.evaluate(() => {
    const r=(s,i=0)=>{const e=document.querySelectorAll(s)[i];if(!e)return null;const b=e.getBoundingClientRect();return{w:Math.round(b.width),h:Math.round(b.height)}};
    let fuera=0;
    for (const c of document.querySelectorAll(".fila,.tolva-card,.firma")) { const cb=c.getBoundingClientRect();
      for (const k of c.querySelectorAll("*")) { const kb=k.getBoundingClientRect();
        if (kb.right>cb.right+1||kb.left<cb.left-1) fuera++; } }
    return { desborde: document.documentElement.scrollWidth-document.documentElement.clientWidth, fuera,
      kpi:r(".kpi"), comomide:r(".comomide"), tolva:r(".tolva-card"), totales:r(".totales"), firma:r(".firma"), fila:r(".fila") };
  })));
  await p.screenshot({ path:`.arnes/rotd-${nom}.png`, fullPage:true }); await p.close();
}
const p = await b.newPage({ viewport:{width:390,height:844} });
await p.setContent(rep); await p.waitForTimeout(700);
console.log("rep", JSON.stringify(await p.evaluate(() => ({
  desborde: document.documentElement.scrollWidth-document.documentElement.clientWidth,
  pie: Math.round(document.querySelector(".pie").getBoundingClientRect().bottom - innerHeight) }))));
await p.screenshot({ path:".arnes/rotd-rep.png" }); await p.close();
await b.close();
