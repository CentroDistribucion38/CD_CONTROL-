import { chromium } from 'playwright';
import { hojas } from './hojas.mjs';
import fs from 'fs';
const S='/home/claude/cd38-inventario/.arnes';
const links = hojas(['--c-marca:', '.ex-todo']).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
fs.writeFileSync(S+'/exp.html', `<!doctype html><html><head><meta charset="utf-8">${links}
<style>html,body{margin:0}.flex{display:flex}.min-h-screen{min-height:100vh}.flex-col{flex-direction:column}
#m{padding:26px 30px;height:100dvh;overflow:auto;box-sizing:border-box}</style></head><body>
<div id="w" class="sh flex min-h-screen flex-col"><main id="m"><div id="r"></div></main></div>
<script src="file://${S}/app5.js"></script></body></html>`);
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto('file://'+S+'/exp.html'); await p.waitForSelector('.ex-caja');
await p.waitForTimeout(300);

console.log('ya no hay <select> de meses:', await p.$$eval('.ex-caja select', s=>s.length) === 0);
const url0 = await p.getAttribute('.ex-btn', 'href');
console.log('enlace al abrir:', url0);

// abrir el calendario
const disparo = await p.$('.ex-mes button') || await p.$('.ex-mes [role=button]');
await p.click('.ex-mes > *:not(.ex-rot)');
await p.waitForTimeout(300);
const abierto = await p.$$eval('[class*=cal], [class*=mes-], .sg-mes', e=>e.length);
console.log('panel del calendario abierto:', abierto > 0);
await p.screenshot({path:S+'/exp.png', clip:{x:0,y:0,width:1000,height:620}});

// "todo el historico"
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.click('.ex-todo');
await p.waitForTimeout(200);
console.log('enlace con "todo":', await p.getAttribute('.ex-btn','href'));
console.log('errores:', errs.length?errs:'ninguno');
await b.close();
