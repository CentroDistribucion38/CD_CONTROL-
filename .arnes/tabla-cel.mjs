import { chromium } from 'playwright';
await import('./paginas.mjs');
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'360x640',w:360,h:640},{n:'390x844',w:390,h:844},{n:'1440x900',w:1440,h:900}]) {
  const p = await b.newPage({viewport:{width:v.w,height:v.h}});
  await p.goto('file://'+S+'/vj.html'); await p.waitForSelector('.marco'); await p.waitForTimeout(350);
  console.log(v.n.padEnd(10), await p.evaluate(()=>{
    const acc=document.querySelector('tbody .vj-acc-col');
    const filas=[...document.querySelectorAll('tbody tr:not(.vj-form)')].slice(0,6);
    const altos=filas.map(f=>Math.round(f.getBoundingClientRect().height));
    return `acciones ${getComputedStyle(acc).position} | alto de fila min=${Math.min(...altos)} max=${Math.max(...altos)} | tabla ${Math.round(document.querySelector('.marco').scrollWidth)} en ${Math.round(document.querySelector('.marco').clientWidth)}`;
  }));
  await p.close();
}
await b.close();
