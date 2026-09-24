import { chromium } from 'playwright';
await import('./paginas.mjs');
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'360x640',w:360,h:640},{n:'390x844',w:390,h:844},{n:'pc 1440x900',w:1440,h:900}]) {
  const p=await b.newPage({viewport:{width:v.w,height:v.h},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  ERROR JS:',e.message.split('\n')[0]));
  await p.goto('file://'+S+'/obs.html'); await p.waitForSelector('.ct-obs'); await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
    const m=s=>{const e=document.querySelector(s); if(!e) return null;
      const b=e.getBoundingClientRect(), c=getComputedStyle(e);
      return {w:Math.round(b.width),h:Math.round(b.height),fs:parseFloat(c.fontSize)}};
    const doc=document.documentElement;
    return {
      ruedaX: doc.scrollWidth>doc.clientWidth,
      area: m('.ct-obs'), nota: m('.ct-obs textarea'),
      mas: m('.ct-obs-foto button'), rot: m('.ct-obs > label > span'),
      tres: [...document.querySelectorAll('.ct-fotos .ct-foto button')].map(e=>Math.round(e.getBoundingClientRect().width)),
    };
  });
  console.log(`\n== ${v.n}  ruedaX=${r.ruedaX}`);
  console.log('   caja obs ', JSON.stringify(r.area));
  console.log('   nota     ', JSON.stringify(r.nota));
  console.log('   botón +  ', JSON.stringify(r.mas));
  console.log('   rótulo   ', JSON.stringify(r.rot));
  console.log('   3 ranuras', r.tres.join(' / '));
  await p.screenshot({path:`${S}/obs-${v.w}.png`, fullPage:true});
  await p.close();
}
await b.close();
