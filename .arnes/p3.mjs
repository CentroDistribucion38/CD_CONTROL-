import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1280,height:900}});
await p.goto('file:///home/claude/cd38-inventario/.arnes/full.html');
await p.waitForSelector('.cp-btn');
await p.evaluate(()=>document.getElementById('w').setAttribute('data-tema','pizarra'));
const cdp = await p.context().newCDPSession(p);
await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
const {root}=await cdp.send('DOM.getDocument');
const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.cp-btn'});
const ms=await cdp.send('CSS.getMatchedStylesForNode',{nodeId});
for (const r of ms.matchedCSSRules) {
  const props=r.rule.style.cssProperties.filter(x=>/^background/.test(x.name)&&x.value);
  if (props.length) console.log(r.rule.selectorList.text, '||', props.map(x=>x.name+':'+x.value).join('; '), '|| origen', r.rule.origin, 'hoja', r.rule.styleSheetId);
}
await b.close();
