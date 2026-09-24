import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const f of ['vj.html','tr.html']) {
  const p = await b.newPage({viewport:{width:360,height:640}});
  await p.goto('file://'+S+'/'+f); await p.waitForTimeout(600);
  console.log(f, await p.evaluate(()=>[...document.querySelectorAll('input')]
    .map(e=>({tipo:e.type, clase:e.className||'(sin clase)', padre:e.parentElement?.className,
              alto:Math.round(e.getBoundingClientRect().height)}))
    .filter(x=>x.alto>0 && x.alto<44)));
  await p.close();
}
await b.close();
