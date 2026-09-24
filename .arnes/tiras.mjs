import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1100,height:80}, deviceScaleFactor:2});
await p.goto('file://'+S+'/barra.html'); await p.waitForSelector('.sh-barra');
const partes=[];
for (const t of ['negro','gris','halo']) {
  await p.evaluate(x=>document.getElementById('w').setAttribute('data-tema',x), t);
  await p.waitForTimeout(300);
  const f=`${S}/barra-${t}.png`;
  await p.screenshot({path:f, clip:{x:0,y:0,width:1100,height:78}});
  partes.push(f);
}
await b.close();
console.log(partes.join('\n'));
