/* Densidad REAL de la rejilla del diario a 360px: lo que mide el
   navegador después de aplicar las siete hojas, no lo que dice el CSS. */
import { chromium } from 'playwright';
await import('./paginas.mjs');
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'360x640',w:360,h:640},{n:'pc 1440x900',w:1440,h:900}]) {
  const p = await b.newPage({viewport:{width:v.w,height:v.h}});
  await p.goto('file://'+S+'/qd.html'); await p.waitForSelector('.rj-marco'); await p.waitForTimeout(350);
  const r = await p.evaluate(()=>{
    const px = s => parseFloat(s);
    const mide = (sel, q) => { const e=document.querySelector(sel); if(!e) return null;
      const c=getComputedStyle(e), b=e.getBoundingClientRect();
      return {letra:+px(c.fontSize).toFixed(1), alto:Math.round(b.height), ancho:Math.round(b.width), n:q}; };
    const m=document.querySelector('.rj-marco');
    return {
      marco:{ruedaX:m.scrollWidth>m.clientWidth+1, ruedaY:m.scrollHeight>m.clientHeight+1},
      celda: mide('.rj td.cel input'),
      dia:   mide('.rj thead th button b'),
      mesito:mide('.rj thead th button span'),
      rot:   mide('.rj th.rot'),
      rotEm: mide('.rj th.rot em'),
      mas:   mide('.rj-mas'),
      total: mide('.rj td.total'),
      calc:  mide('.rj tr.calc td.num'),
    };
  });
  console.log('\n== ' + v.n, JSON.stringify(r.marco));
  for (const [k,o] of Object.entries(r)) if(k!=='marco')
    console.log('  '+k.padEnd(7), o ? `letra ${o.letra}px  ${o.ancho}x${o.alto}` : 'no está');
  await p.close();
}
await b.close();
