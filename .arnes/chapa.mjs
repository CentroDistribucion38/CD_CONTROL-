import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1440,height:900}});
await p.goto('file:///home/claude/cd38-inventario/.arnes/index2.html');
await p.waitForSelector('.us-chapa');
for (const t of [null,'tinta','pizarra','ambar']) {
  if (t) await p.evaluate(x=>document.getElementById('w').setAttribute('data-tema',x),t);
  else await p.evaluate(()=>document.getElementById('w').removeAttribute('data-tema'));
  console.log((t??'oficial').padEnd(9), await p.evaluate(()=>{
    const rl=document.querySelector('.rl'), ch=document.querySelector('.us-chapa');
    const g=(e,p)=>getComputedStyle(e).getPropertyValue(p);
    return `--c-5b6b7f=${g(rl,'--c-5b6b7f')} --c-f2f1fc=${g(rl,'--c-f2f1fc')} chapaBg=${g(ch,'background-color')} emColor=${g(ch.querySelector('em'),'color')} chapaColor=${g(ch,'color')}`;
  }));
}
await b.close();
