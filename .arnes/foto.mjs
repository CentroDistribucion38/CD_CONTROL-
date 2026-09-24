import { chromium } from 'playwright';
await import('./paginas.mjs');
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [n,f,listo] of [['vj','vj.html','.vj-cuerpo'],['tr','tr.html','.tr-cuerpo'],['us','index2.html','.us-tabla']]) {
  const p = await b.newPage({viewport:{width:390,height:844}, deviceScaleFactor:2});
  await p.goto('file://'+S+'/'+f); await p.waitForSelector(listo); await p.waitForTimeout(400);
  await p.screenshot({path:`${S}/cel-${n}.png`});
  await p.close();
}
await b.close();
