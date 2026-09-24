import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1440,height:900}});
const fallos=[]; p.on('requestfailed', r=>fallos.push(r.url().split('/').pop()));
p.on('response', r=>{ if(r.status()>=400) fallos.push(r.status()+' '+r.url().split('/').pop()) });
await p.goto('file:///home/claude/cd38-inventario/.arnes/index2.html');
await p.waitForSelector('.us-tabla');
console.log('peticiones fallidas:', fallos.length?fallos:'ninguna');
console.log(await p.evaluate(()=>{
  const rl=document.querySelector('.rl'), tj=document.querySelector('.tarjeta');
  const btn=document.querySelector('.cab .btn');
  const g=(el,p)=>getComputedStyle(el).getPropertyValue(p);
  return JSON.stringify({
    rl_linea: g(rl,'--rl-linea'), rl_gris: g(rl,'--rl-gris'), rl_papel: g(rl,'--rl-papel'),
    c_d5dce5: g(rl,'--c-d5dce5'), c_5b6b7f: g(rl,'--c-5b6b7f'), c_f7f9fc: g(rl,'--c-f7f9fc'),
    c_f2f1fc: g(rl,'--c-f2f1fc'), c_edf1f6: g(rl,'--c-edf1f6'), c_fafbfd: g(rl,'--c-fafbfd'),
    tarjetaBorde: g(tj,'border-top-width')+' '+g(tj,'border-top-color'),
    btnExiste: !!btn, btnFondo: btn?g(btn,'background-color'):null, btnAlto: btn?Math.round(btn.getBoundingClientRect().height):null,
    rlDisplay: g(rl,'display'), rlFont: g(rl,'font-family').slice(0,40),
  },null,1);
}));
await b.close();
