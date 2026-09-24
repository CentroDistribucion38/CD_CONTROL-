import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [i,n] of [[1,'seguridad'],[2,'preferencias']]) {
  const p=await b.newPage({viewport:{width:360,height:640},deviceScaleFactor:2});
  await p.goto('file://'+S+'/pf.html'); await p.waitForSelector('.pf-nav button');
  await p.$$eval('.pf-nav button',(bs,i)=>bs[i].click(),i); await p.waitForTimeout(350);
  await p.screenshot({path:`${S}/pf-${n}.png`, fullPage:true});
  /* densidad de ESTA sección */
  const r = await p.evaluate(()=>{
    const chicas=new Set(), toques=new Set();
    for (const e of document.querySelectorAll('body *')) {
      const bb=e.getBoundingClientRect(); if(!bb.width||!bb.height) continue;
      const cs=getComputedStyle(e), px=parseFloat(cs.fontSize);
      const t=e.textContent.trim();
      const propio=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      const mayus = cs.textTransform==='uppercase' || (/[A-ZÁÉÍÓÚÑ]/.test(t)&&t===t.toUpperCase());
      const suelo = (mayus && parseFloat(cs.letterSpacing)>0.5) ? 11 : 12;
      const cl = e.className && typeof e.className==='string' ? '.'+e.className.trim().split(/\s+/).slice(0,2).join('.') : e.tagName.toLowerCase();
      if (propio && px<suelo) chicas.add(`${cl} ${px}px`);
      if (['BUTTON','A','SELECT','INPUT','LABEL'].includes(e.tagName) && cs.cursor!=='default' && bb.height<44)
        toques.add(`${cl} ${Math.round(bb.height)}px`);
    }
    return {chicas:[...chicas], toques:[...toques],
            ruedaX: document.documentElement.scrollWidth>document.documentElement.clientWidth};
  });
  console.log(`\n### ${n}  ruedaX=${r.ruedaX}`);
  console.log('  letra:', r.chicas.join(', ') || 'ok');
  console.log('  toque:', r.toques.join(', ') || 'ok');
  await p.close();
}
await b.close();
