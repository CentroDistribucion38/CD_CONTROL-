import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage();
p.on('console', m=>console.log('CONSOLA:', m.text()));
p.on('pageerror', e=>console.log('ERROR:', e.message));
await p.goto('file:///home/claude/cd38-inventario/.arnes/index.html');
await p.waitForTimeout(1500);
console.log('html de #r:', (await p.innerHTML('#r')).slice(0,200));
await b.close();
