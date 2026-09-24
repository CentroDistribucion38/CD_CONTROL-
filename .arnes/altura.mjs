import { chromium } from 'playwright';
import { hojas } from './hojas.mjs';
import fs from 'fs';
const S='/home/claude/cd38-inventario/.arnes';
/* Se REGENERA la página: si se reusa la de la corrida anterior, apunta
   a un chunk que el build ya borró, ninguna regla aplica y las medidas
   son basura que parece un dato. Ya me pasó dos veces. */
const links = hojas(['--c-marca:', '.tr-grupos']).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
fs.writeFileSync(S+'/tr.html', `<!doctype html><html><head><meta charset="utf-8">${links}
<style>html,body{margin:0}.flex{display:flex}.min-h-screen{min-height:100vh}.flex-col{flex-direction:column}
#m{padding:26px 30px;height:100dvh;overflow:hidden;box-sizing:border-box}</style></head><body>
<div id="w" class="sh flex min-h-screen flex-col"><main id="m"><div id="r"></div></main></div>
<script src="file://${S}/app4.js"></script></body></html>`);
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'cel 360x640',w:360,h:640},{n:'cel 390x844',w:390,h:844},{n:'pc 1440x900',w:1440,h:900}]) {
  const p = await b.newPage({viewport:{width:v.w,height:v.h}});
  await p.goto('file://'+S+'/tr.html'); await p.waitForSelector('.tr-grupos');
  await p.waitForTimeout(250);
  const abrir = await p.$('.tr-abrir');
  const visible = abrir && await abrir.isVisible();
  for (const estado of visible ? ['cerrados','abiertos'] : ['siempre']) {
    if (estado === 'abiertos') { await abrir.click(); await p.waitForTimeout(200) }
  console.log(v.n.padEnd(13), estado.padEnd(9), await p.evaluate(()=>{
    const alto=(s)=>{const e=document.querySelector(s); return e?Math.round(e.getBoundingClientRect().height):0};
    const botonFiltrar = alto('.tr-abrir');
    const rueda = getComputedStyle(document.querySelector('.tr-cuerpo')).overflowY === 'auto';
    const caja=(rueda ? document.querySelector('.tr-cuerpo') : document.querySelector('.tr-grupos')).getBoundingClientRect();
    return `cabeza=${alto('.cabeza')} alertas=${alto('.tr-alertas')} botonFiltrar=${botonFiltrar} filtros=${alto('.tr-filtros')} | caja arranca en ${Math.round(caja.top)} y mide ${Math.round(caja.height)} -> termina en ${Math.round(caja.bottom)} de ${innerHeight}  ${caja.bottom > innerHeight ? '<<< SE SALE' : 'CABE'}`;
  })); }
  await p.close();
}
await b.close();
