import { chromium } from 'playwright';
import { hojas } from './hojas.mjs';
import fs from 'fs';
const S='/home/claude/cd38-inventario/.arnes';
const links = hojas(['.cf-velo']).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
fs.writeFileSync(S+'/conf.html', `<!doctype html><html><head><meta charset="utf-8">${links}
<style>html,body{margin:0}.flex{display:flex}.min-h-screen{min-height:100vh}.flex-col{flex-direction:column}</style>
</head><body><div id="w" class="sh flex min-h-screen flex-col"><div id="r"></div></div>
<script src="file://${S}/app6.js"></script></body></html>`);
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const lum=(c)=>{const[r,g,bl]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*bl};
const rel=(a,bb)=>{const L1=lum(a),L2=lum(bb);return +((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2)};
for (const t of [null,'tinta','pizarra','ambar','negro','gris','halo']) {
 for (const v of [{n:'pc',w:1440,h:900},{n:'cel',w:360,h:640}]) {
  const p = await b.newPage({viewport:{width:v.w,height:v.h}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+S+'/conf.html'); await p.waitForSelector('#peligro');
  if (t) await p.evaluate(x=>document.getElementById('w').setAttribute('data-tema',x), t);
  await p.click('#peligro'); await p.waitForTimeout(300);
  const m = await p.evaluate(()=>{
    const g=(s,pr)=>getComputedStyle(document.querySelector(s)).getPropertyValue(pr);
    const caja=document.querySelector('.cf-caja').getBoundingClientRect();
    return {
      hay: !!document.querySelector('.cf-caja'),
      foco: document.activeElement?.textContent?.trim(),
      filo: g('.cf-caja','border-top-color'),
      cabe: caja.bottom <= innerHeight && caja.top >= 0,
      pagRueda: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      pares: { titulo:[g('.cf-caja h2','color'), g('.cf-caja','background-color')],
               dice:[g('.cf-dice','color'), g('.cf-caja','background-color')],
               mal:[g('.cf-btn.mal','color'), g('.cf-btn.mal','background-color')],
               plano:[g('.cf-btn.plano','color'), g('.cf-caja','background-color')] },
    };
  });
  const c = Object.fromEntries(Object.entries(m.pares).map(([k,[f,g]])=>[k, rel(f,g)]));
  const bajo = Object.entries(c).filter(([k,x])=> x < (k==='titulo'?3:4.5));
  // Escape cancela
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const cerro = await p.evaluate(()=>({ sinCaja: !document.querySelector('.cf-caja'), r: window.ultimo }));
  // y el botón normal confirma
  await p.click('#normal'); await p.waitForTimeout(200);
  await p.click('.cf-btn:not(.plano)'); await p.waitForTimeout(200);
  const confirmo = await p.evaluate(()=>window.ultimo);
  console.log(`${(t??'oficial').padEnd(8)} ${v.n.padEnd(4)} filo=${m.filo} foco="${m.foco}" cabe=${m.cabe} pagRueda=${m.pagRueda} escape→${cerro.r} confirmar→${confirmo}${bajo.length?'  <<< BAJO: '+bajo.map(x=>x[0]+' '+x[1]).join(', '):'  contraste ok'}${errs.length?' ERR:'+errs[0]:''}`);
  if (v.n==='pc'&&t==='ambar') { await p.click('#peligro'); await p.waitForTimeout(250); await p.screenshot({path:S+'/conf.png', clip:{x:400,y:200,width:640,height:340}}) }
  await p.close();
 }
}
await b.close();
