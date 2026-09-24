import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1440,height:900}});
await p.goto('file://'+S+'/qd.html'); await p.waitForSelector('.rj-marco'); await p.waitForTimeout(300);
console.log('hojas ligadas:', await p.evaluate(()=>[...document.querySelectorAll('link')].map(l=>l.href.split('/').pop())));
const cdp = await p.context().newCDPSession(p);
await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
const {root} = await cdp.send('DOM.getDocument');
for (const sel of ['.rj td.cel input', '.rj-mas']) {
  const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector: sel});
  if (!nodeId) { console.log(sel, 'no está'); continue }
  const m = await cdp.send('CSS.getMatchedStylesForNode', {nodeId});
  console.log('\n### ' + sel);
  for (const r of m.matchedCSSRules) {
    const t = r.rule.style.cssProperties.filter(x=>/^font/.test(x.name));
    if (t.length) console.log('  ', r.rule.selectorList.text, '=>', t.map(x=>x.name+':'+x.value).join('; '),
      r.rule.media ? ' @' + r.rule.media.map(x=>x.text).join(',') : '');
  }
}
await b.close();
