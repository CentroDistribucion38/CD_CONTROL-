import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage();
p.on('pageerror', e=>console.log('ERROR:', e.message));
p.on('console', m=>{ if(m.type()==='error') console.log('CONSOLA:', m.text()) });
await p.goto('file:///home/claude/cd38-inventario/.arnes/vj.html');
await p.waitForTimeout(1200);
console.log('html:', (await p.innerHTML('#r')).slice(0,150) || '(vacío)');
await b.close();
