import { chromium } from 'playwright';
await import('./paginas.mjs');
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [n,f,caja] of [['Fuente principal','vj.html','.vj-cuerpo'],['Usuarios','index2.html','.us-marco']]) {
 for (const v of [{n:'360x640',w:360,h:640},{n:'390x844',w:390,h:844},{n:'834x1112',w:834,h:1112},{n:'1440x900',w:1440,h:900},{n:'1280x700',w:1280,h:700}]) {
  const p = await b.newPage({viewport:{width:v.w,height:v.h}});
  await p.goto('file://'+S+'/'+f); await p.waitForSelector(caja); await p.waitForTimeout(300);
  console.log(n.padEnd(17), v.n.padEnd(10), await p.evaluate((sel)=>{
    const c=document.querySelector(sel).getBoundingClientRect();
    return `la caja arranca en ${Math.round(c.top)} de ${innerHeight} -> le quedan ${innerHeight - Math.round(c.top) - 30}px`;
  }, caja));
  await p.close();
 }
}
await b.close();
