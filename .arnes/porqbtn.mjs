import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1280,height:900}});
await p.goto('file:///home/claude/cd38-inventario/.arnes/full.html');
await p.waitForSelector('.cp-btn');
const cdp = await p.context().newCDPSession(p);
await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
for (const t of [null,'pizarra','negro']) {
  await p.evaluate(x=>{const w=document.getElementById('w'); if(x)w.setAttribute('data-tema',x); else w.removeAttribute('data-tema')}, t);
  console.log((t??'oficial').padEnd(8), await p.evaluate(()=>{
    const el=document.querySelector('.cp-btn'), s=getComputedStyle(el);
    const r=getComputedStyle(document.querySelector('.cp'));
    return `color=${s.color} bg=${s.backgroundColor} | --c-marca=${r.getPropertyValue('--c-marca')} --c-marca-txt=${r.getPropertyValue('--c-marca-txt')}`;
  }));
}
const {root}=await cdp.send('DOM.getDocument');
const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.cp-btn'});
const ms=await cdp.send('CSS.getMatchedStylesForNode',{nodeId});
for (const r of ms.matchedCSSRules) {
  const col=r.rule.style.cssProperties.find(x=>x.name==='background'||x.name==='background-color');
  if (col) console.log('REGLA', r.rule.selectorList.text, '-> bg:', col.value);
}
await b.close();
