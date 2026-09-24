import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'cel',w:360,h:640},{n:'pc',w:1440,h:900}]) {
  const p=await b.newPage({viewport:{width:v.w,height:v.h},deviceScaleFactor:2});
  await p.goto('file://'+S+'/qd.html'); await p.waitForSelector('.rj-marco'); await p.waitForTimeout(400);
  await p.screenshot({path:`${S}/qd-${v.n}.png`});
  await p.close();
}
await b.close(); console.log('ok');
