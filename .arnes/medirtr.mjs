import { chromium } from 'playwright';
import { hojas } from './hojas.mjs';
import fs from 'fs';
const S='/home/claude/cd38-inventario/.arnes';
const links = hojas(['--c-marca:', '.tr-grupos']).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
fs.writeFileSync(S+'/tr.html', `<!doctype html><html><head><meta charset="utf-8">${links}
<style>html,body{margin:0}.flex{display:flex}.min-h-screen{min-height:100vh}.flex-col{flex-direction:column}
#m{padding:26px 30px;height:100dvh;overflow:hidden;box-sizing:border-box}</style></head><body>
<div id="w" class="sh flex min-h-screen flex-col"><main id="m"><div id="r"></div></main></div>
<script src="file://${S}/app4.js"></script></body></html>`);

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const lum=(c)=>{const[r,g,bl]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*bl};
const rel=(a,bb)=>{const L1=lum(a),L2=lum(bb);return +((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2)};

for (const t of [null,'pizarra','ambar','gris','halo']) {
 for (const v of [{n:'pc',w:1440,h:900},{n:'tablet',w:834,h:1112},{n:'cel',w:360,h:640},{n:'bajo',w:1280,h:700}]) {
  const p = await b.newPage({viewport:{width:v.w,height:v.h}});
  await p.goto('file://'+S+'/tr.html'); await p.waitForSelector('.tr-cuerpo');
  if (t) await p.evaluate(x=>document.getElementById('w').setAttribute('data-tema',x), t);
  await p.waitForTimeout(320);
  /* En celular los filtros arrancan plegados: hay que abrirlos para
     poder tocarlos, y de paso se comprueba que el botón funciona. */
  const abrir = await p.$('.tr-abrir');
  if (abrir && await abrir.isVisible()) { await abrir.click(); await p.waitForTimeout(200) }

  const g0 = await p.$$eval('.tr-grupo', g => g.length);
  const tarjetas0 = await p.$$eval('.tr-vh', c => c.length);
  await p.fill('.tr-placa input', 'ABC10');
  await p.waitForTimeout(120);
  const trasPlaca = await p.$$eval('.tr-vh', c => c.length);
  await p.fill('.tr-placa input', '');
  await p.selectOption('.tr-filtros select', { index: 1 });
  await p.waitForTimeout(120);
  const gOrigen = await p.$$eval('.tr-grupo', g => g.length);
  const tarjOrigen = await p.$$eval('.tr-vh', c => c.length);
  await p.selectOption('.tr-filtros select', '');
  /* La fecha: se pone un "desde" de mañana, que no puede casar con nada. */
  const manana = new Date(Date.now()+86400000).toISOString().slice(0,10);
  await p.fill('.tr-filtros input[type=date] >> nth=0', manana);
  await p.waitForTimeout(150);
  const trasFecha = await p.$$eval('.tr-vh', c => c.length);
  const hayVacio = await p.$$eval('.tr-vacio', d => d.length);
  await p.click('.tr-filtros .btn.plano');
  await p.waitForTimeout(150);
  const limpio = await p.$$eval('.tr-vh', c => c.length);

  const m = await p.evaluate(()=>{
    const fe=(el)=>{let n=el;while(n){const bg=getComputedStyle(n).backgroundColor;if(bg&&!/rgba\(0, 0, 0, 0\)/.test(bg))return bg;n=n.parentElement}return 'rgb(255,255,255)'};
    const par=(s)=>{const el=document.querySelector(s);return el?[getComputedStyle(el).color, fe(el)]:null};
    const doc=document.documentElement, main=document.getElementById('m');
    const cuerpo=document.querySelector('.tr-cuerpo');
    const rueda=getComputedStyle(cuerpo).overflowY==='auto';
    const caja=rueda?cuerpo:document.querySelector('.tr-grupos');
    const cab=document.querySelector('.tr-grupo-cab');
    return {
      pagRueda: doc.scrollHeight > doc.clientHeight,
      mainRueda: main.scrollHeight > main.clientHeight + 1,
      cajaRueda: caja.scrollHeight > caja.clientHeight + 1,
      cajaAbajo: Math.round(caja.getBoundingClientRect().bottom), vh: innerHeight,
      cabPegada: getComputedStyle(cab,'').position,
      cabFondo: getComputedStyle(cab).backgroundColor,
      pares: { cab:par('.tr-grupo-cab b'), sub:par('.tr-grupo-cab span'),
               rot:par('.tr-filtros label > span'), tarde:par('.tr-tarde') },
    };
  });
  const c = Object.fromEntries(Object.entries(m.pares).filter(([,x])=>x).map(([k,[f,g]])=>[k, rel(f,g)]));
  const bajo = Object.entries(c).filter(([,x])=>x<4.5);
  console.log(`${(t??'oficial').padEnd(8)} ${v.n.padEnd(7)} grupos=${g0} tarj ${tarjetas0}→placa ${trasPlaca}→origen ${tarjOrigen}(g=${gOrigen})→fechaFutura ${trasFecha}(vacio=${hayVacio})→limpio ${limpio} | pagRueda=${m.pagRueda} mainRueda=${m.mainRueda} cajaRueda=${m.cajaRueda} fin=${m.cajaAbajo}/${m.vh} pegada=${m.cabPegada}${bajo.length?'  <<< BAJO: '+bajo.map(x=>x[0]+' '+x[1]).join(', '):'  ok'}`);
  if (v.n==='pc' && t===null) await p.screenshot({path:S+'/tr-pc.png', clip:{x:0,y:0,width:1440,height:820}});
  await p.close();
 }
}
await b.close();
