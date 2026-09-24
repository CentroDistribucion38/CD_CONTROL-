import { chromium } from 'playwright';
await import('./paginas.mjs');
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [f,sel] of [['tr.html','.tr-cuerpo'],['qd.html','.rj-marco']]) {
  const p=await b.newPage({viewport:{width:360,height:640}});
  await p.goto('file://'+S+'/'+f); await p.waitForSelector(sel); await p.waitForTimeout(300);
  const r=await p.evaluate(()=>{
    const out=[];
    for(const e of document.querySelectorAll('body *')){
      const bb=e.getBoundingClientRect(); if(!bb.width||!bb.height) continue;
      const cs=getComputedStyle(e), px=parseFloat(cs.fontSize);
      const lh=parseFloat(cs.lineHeight)/px;
      const propio=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      if(!propio) continue;
      if(px<12 || (lh<1.3 && !Number.isNaN(lh))){
        const cad=[]; let x=e; for(let i=0;i<4&&x&&x!==document.body;i++,x=x.parentElement)
          cad.unshift(x.tagName.toLowerCase()+(x.className&&typeof x.className==='string'?'.'+x.className.trim().split(/\s+/).join('.'):''));
        out.push(`${px}px lh${lh.toFixed(2)}  ${cad.join(' > ')}  «${e.textContent.trim().slice(0,26)}»`);
      }
    }
    return [...new Set(out)];
  });
  console.log('\n### '+f); r.forEach(x=>console.log('  '+x));
  await p.close();
}
await b.close();
