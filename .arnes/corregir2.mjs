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
const p = await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto('file://'+S+'/vj.html'); await p.waitForSelector('.vj-mini');
await p.waitForTimeout(250);

for (const n of [2, 8, 30]) {
  const fila = await p.$(`tbody tr:nth-child(${n})`);
  const btn = await fila.$('.vj-mini');
  if (!btn) { console.log(`fila ${n}: anulada, sin Corregir`); continue }
  await btn.click(); await p.waitForTimeout(250);
  const r = await p.evaluate((n)=>{
    const filas=[...document.querySelectorAll('tbody tr')];
    const i=filas.findIndex(f=>f.classList.contains('vj-form'));
    const suya=filas[i-1];
    const placaSuya=suya?.querySelector('.placa')?.textContent;
    const enCampo=document.querySelector('.vj-campos input')?.value;
    const ed=document.querySelector('.vj-editor').getBoundingClientRect();
    const propia=filas[n-1].getBoundingClientRect();
    return { justoDebajo: Math.abs(ed.top - propia.bottom) < 4, placaSuya, enCampo,
             coinciden: placaSuya === enCampo, alto: Math.round(ed.height) };
  }, n);
  console.log(`fila ${n}: editor justo debajo=${r.justoDebajo} | placa de la fila="${r.placaSuya}" en el campo="${r.enCampo}" coinciden=${r.coinciden} alto=${r.alto}`);
  await p.click('.vj-botones .btn.plano'); await p.waitForTimeout(150);
}
console.log('errores:', errs.length?errs:'ninguno');
await p.click('tbody tr:nth-child(2) .vj-mini'); await p.waitForTimeout(250);
await p.screenshot({path:S+'/corregir.png', clip:{x:0,y:230,width:1440,height:640}});
await b.close();
