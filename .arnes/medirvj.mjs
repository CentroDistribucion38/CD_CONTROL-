import { chromium } from 'playwright';
import { hojas } from './hojas.mjs';
import fs from 'fs';
const S='/home/claude/cd38-inventario/.arnes';
const links = hojas(['--c-marca:', '.vj-filtros']).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
fs.writeFileSync(S+'/vj.html', `<!doctype html><html><head><meta charset="utf-8">${links}
<style>html,body{margin:0}.flex{display:flex}.min-h-screen{min-height:100vh}.flex-col{flex-direction:column}
#m{padding:26px 30px;height:100dvh;overflow:auto;box-sizing:border-box}</style></head><body>
<div id="w" class="sh flex min-h-screen flex-col"><main id="m"><div id="r"></div></main></div>
<script src="file://${S}/app3.js"></script></body></html>`);

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const lum=(c)=>{const[r,g,bl]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*bl};
const rel=(a,bb)=>{const L1=lum(a),L2=lum(bb);return +((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2)};

for (const t of [null,'pizarra','ambar','gris','halo']) {
 for (const v of [{n:'pc',w:1440,h:900},{n:'tablet',w:834,h:1112},{n:'cel',w:360,h:640}]) {
  const p = await b.newPage({viewport:{width:v.w,height:v.h}});
  await p.goto('file://'+S+'/vj.html'); await p.waitForSelector('.vj-cuerpo');
  if (t) await p.evaluate(x=>document.getElementById('w').setAttribute('data-tema',x), t);
  await p.waitForTimeout(320);
  /* En celular los filtros arrancan plegados: hay que abrirlos para
     tocarlos, y de paso se comprueba que el boton funciona. */
  const ab = await p.$('.vj-abrir');
  if (ab && await ab.isVisible()) { await ab.click(); await p.waitForTimeout(200) }

  /* ¿FILTRA DE VERDAD? Se cuenta antes y después, no se mira "se ve bien". */
  const antes = await p.$$eval('tbody tr:not(.vj-form)', r => r.length);
  await p.fill('.vj-buscar input', 'ABC10');
  await p.waitForTimeout(120);
  const porPlaca = await p.$$eval('tbody tr:not(.vj-form)', r => r.length);
  const placasOk = await p.$$eval('tbody tr:not(.vj-form) .placa', c => c.every(x=>x.textContent.includes('ABC10')));
  await p.fill('.vj-buscar input', '');
  await p.selectOption('.vj-filtros select >> nth=0', { index: 1 });
  await p.waitForTimeout(120);
  const porOrigen = await p.$$eval('tbody tr:not(.vj-form)', r => r.length);
  const unSoloCd = await p.$$eval('tbody tr:not(.vj-form) td:nth-child(2) > div:first-child',
    c => new Set(c.map(x=>x.textContent)).size);
  await p.selectOption('.vj-filtros select >> nth=2', 'anulado');
  await p.waitForTimeout(120);
  const anulados = await p.$$eval('tbody tr.vj-nulo', r => r.length);
  const soloAnulados = await p.$$eval('tbody tr:not(.vj-form)', r => r.length);
  await p.click('.vj-filtros .btn.plano');
  await p.waitForTimeout(120);
  const limpio = await p.$$eval('tbody tr:not(.vj-form)', r => r.length);

  const m = await p.evaluate(()=>{
    const fe=(el)=>{let n=el;while(n){const bg=getComputedStyle(n).backgroundColor;if(bg&&!/rgba\(0, 0, 0, 0\)/.test(bg))return bg;n=n.parentElement}return 'rgb(255,255,255)'};
    const par=(s)=>{const el=document.querySelector(s);return el?[getComputedStyle(el).color, fe(el)]:null};
    const doc=document.documentElement, main=document.getElementById('m');
    const marco=document.querySelector('.marco');
    return {
      pagRueda: doc.scrollHeight > doc.clientHeight,
      mainRuedaX: main.scrollWidth > main.clientWidth + 1,
      marcoRuedaX: marco.scrollWidth > marco.clientWidth + 1,
      pares: { cuenta:par('.vj-cuenta'), obs:par('.vj-obs'), motivo:par('.vj-motivo'),
               mini:par('.vj-mini'), rot:par('.vj-filtros label > span'), nulo:par('tr.vj-nulo td') },
      miniAlto: Math.round(document.querySelector('.vj-mini').getBoundingClientRect().height),
      miniAncho: Math.round(document.querySelector('.vj-mini').getBoundingClientRect().width),
    };
  });
  const c = Object.fromEntries(Object.entries(m.pares).filter(([,x])=>x).map(([k,[f,g]])=>[k, rel(f,g)]));
  const bajo = Object.entries(c).filter(([,x])=>x<4.5);
  console.log(`${(t??'oficial').padEnd(8)} ${v.n.padEnd(7)} filas ${antes}→placa ${porPlaca}(ok=${placasOk})→origen ${porOrigen}(cds=${unSoloCd})→anulados ${soloAnulados}/${anulados}→limpio ${limpio} | pagRueda=${m.pagRueda} xMain=${m.mainRuedaX} btn=${m.miniAncho}x${m.miniAlto}${bajo.length?'  <<< BAJO: '+bajo.map(x=>x[0]+' '+x[1]).join(', '):'  contraste ok'}`);
  if (v.n==='pc' && t===null) await p.screenshot({path:S+'/vj-pc.png', clip:{x:0,y:0,width:1440,height:760}});
  await p.close();
 }
}
await b.close();
