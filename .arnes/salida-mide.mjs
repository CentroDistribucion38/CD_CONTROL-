import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'pc',w:1440,h:900},{n:'cel',w:360,h:640}]) {
  const ctx=await b.newContext({viewport:{width:v.w,height:v.h},deviceScaleFactor:2});
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation({latitude:10.90,longitude:-74.88,accuracy:11});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('  ERROR JS:',e.message.split('\n')[0]));
  await p.goto('file://'+S+'/salida.html'); await p.waitForSelector('.ct-pasos'); await p.waitForTimeout(400);
  await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/activar mi ubicaci/i.test(x.textContent||'')); b&&b.click()});
  await p.waitForTimeout(1400);
  const r = await p.evaluate(()=>{
    const chicas=new Map(), gritan=[];
    for(const e of document.querySelectorAll('body *')){
      const bb=e.getBoundingClientRect(); if(!bb.width||!bb.height) continue;
      const cs=getComputedStyle(e), px=parseFloat(cs.fontSize);
      const propio=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      if(!propio) continue;
      const t=e.textContent.trim();
      const cl=e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\s+/)[0]:e.tagName.toLowerCase();
      const mayus = cs.textTransform==='uppercase' || (/[A-ZÁÉÍÓÚÑ]/.test(t)&&t===t.toUpperCase());
      const suelo = (mayus && parseFloat(cs.letterSpacing)>0.5) ? 11 : 12;
      if(px<suelo) chicas.set(cl, px);
      /* párrafos largos gritando en mayúscula: lo que acabo de quitar */
      if(mayus && t.length>60) gritan.push(cl+' '+t.slice(0,30));
    }
    const doc=document.documentElement;
    return {chicas:[...chicas], gritan, ruedaX:doc.scrollWidth>doc.clientWidth,
            pagRueda:doc.scrollHeight>doc.clientHeight};
  });
  console.log(`\n== ${v.n}`);
  console.log('   letra corta:', r.chicas.length? JSON.stringify(r.chicas):'ninguna');
  console.log('   párrafos en mayúscula:', r.gritan.length? r.gritan:'ninguno');
  console.log('   ruedaX:', r.ruedaX, ' pagRueda:', r.pagRueda);
  await p.screenshot({path:`${S}/salida-${v.n}.png`});
  await ctx.close();
}
await b.close();
