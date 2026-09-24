/* Lo que NO puede romperse al dar aire: la página no rueda y las cajas
   que ruedan por dentro caben en la pantalla. */
import { chromium } from 'playwright';
await import('./paginas.mjs');
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const CASOS = [
  ['Fuente principal','vj.html','.vj-cuerpo','.vj-cuerpo'],
  ['En tránsito','tr.html','.tr-cuerpo','.tr-cuerpo'],
  ['Usuarios','index2.html','.us-marco','.us-tabla'],
  ['Primer ingreso','index.html','.cp','.cp-caja'],
  ['Quiebra diaria','qd.html','.rj-marco','.rj-marco'],
];
for (const [n, f, caja, listo] of CASOS) {
 for (const v of [{n:'360x640',w:360,h:640},{n:'390x844',w:390,h:844},{n:'pc 1440x900',w:1440,h:900}]) {
  const p = await b.newPage({viewport:{width:v.w,height:v.h}});
  await p.goto('file://'+S+'/'+f); await p.waitForSelector(listo); await p.waitForTimeout(300);
  // en tránsito hay que abrir los filtros: es el caso peor
  /* Se abren los filtros si hay boton: es el caso PEOR, el que tiene
     que caber. Medir con ellos plegados seria medir el caso facil. */
  for (const sel of ['.tr-abrir', '.vj-abrir']) {
    const ab = await p.$(sel);
    if (ab && await ab.isVisible()) { await ab.click(); await p.waitForTimeout(250) }
  }
  const r = await p.evaluate((sel)=>{
    const doc=document.documentElement, c=document.querySelector(sel);
    const cr=c.getBoundingClientRect();
    return { pagRueda: doc.scrollHeight>doc.clientHeight, ruedaX: doc.scrollWidth>doc.clientWidth,
             fin: Math.round(cr.bottom), vh: innerHeight, cabe: cr.bottom <= innerHeight + 1 };
  }, caja);
  console.log(`${n.padEnd(17)} ${v.n.padEnd(12)} pagRueda=${r.pagRueda} ruedaX=${r.ruedaX} caja fin=${r.fin}/${r.vh} ${r.cabe?'CABE':'<<< SE SALE'}`);
  await p.close();
 }
}
await b.close();
