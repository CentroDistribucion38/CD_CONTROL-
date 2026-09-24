import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1280,height:900}});
await p.goto('file:///home/claude/cd38-inventario/.arnes/full.html');
await p.waitForSelector('.cp-btn');
await p.evaluate(()=>document.getElementById('w').setAttribute('data-tema','pizarra'));
console.log(await p.evaluate(()=>{
  const cad=[];
  let n=document.querySelector('.cp-btn');
  while(n && n!==document.documentElement.parentElement){
    cad.push(`${n.tagName}.${n.className||''} --c-marca=${getComputedStyle(n).getPropertyValue('--c-marca')} bg=${getComputedStyle(n).backgroundColor}`);
    n=n.parentElement;
  }
  return cad.join('\n');
}));
await b.close();
