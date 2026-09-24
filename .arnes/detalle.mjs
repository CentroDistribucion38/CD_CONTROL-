import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [f,listo,sels] of [
  ['tr.html','.tr-cuerpo',['.kpi .rot','.tr-cifras dt']],
  ['qd.html','.rj-marco',['.rj th.rot','.rj th.rot em','.rj-mas']]]) {
  const p=await b.newPage({viewport:{width:360,height:640}});
  await p.goto('file://'+S+'/'+f); await p.waitForSelector(listo); await p.waitForTimeout(300);
  console.log('\n### '+f);
  for (const s of sels) {
    const o = await p.evaluate((s)=>{const e=document.querySelector(s); if(!e) return null;
      const c=getComputedStyle(e), r=e.getBoundingClientRect();
      return {fs:c.fontSize, ls:c.letterSpacing, tt:c.textTransform, lh:c.lineHeight,
              alto:Math.round(r.height), txt:e.textContent.trim().slice(0,20)}}, s);
    console.log('  '+s.padEnd(18), JSON.stringify(o));
  }
  await p.close();
}
await b.close();
