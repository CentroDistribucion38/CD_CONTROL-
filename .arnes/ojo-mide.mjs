import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'pc',w:1440,h:900},{n:'cel',w:360,h:640}]) {
  const ctx = await b.newContext({viewport:{width:v.w,height:v.h}, deviceScaleFactor:2});
  const p = await ctx.newPage();
  p.on('pageerror',e=>console.log('  ERROR JS:',e.message.split('\n')[0]));
  await p.goto('file://'+S+'/ojo.html'); await p.waitForSelector('.ev-ojo'); await p.waitForTimeout(200);
  await p.click('.ev-ojo'); await p.waitForSelector('.ev-hoja'); await p.waitForTimeout(400);

  const antes = await p.evaluate(()=>{
    const barra=document.querySelector('.ev-completar');
    const huecos=[...document.querySelectorAll('.ev-tomar')];
    return {barra: barra? barra.className+' | '+barra.textContent.trim().slice(0,60):'no está',
      huecos: huecos.map(h=>({txt:h.textContent.trim().slice(0,20), off:h.disabled})),
      pies: [...document.querySelectorAll('figure.falta figcaption')].map(f=>f.textContent.trim())};
  });
  console.log(`\n== ${v.n} SIN ubicación`);
  console.log('   barra   ', antes.barra);
  console.log('   huecos  ', JSON.stringify(antes.huecos));
  console.log('   pies    ', antes.pies.join(' / '));

  /* Se concede el GPS y se toca "Activar mi ubicación" */
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation({latitude:10.9743, longitude:-74.7708, accuracy:12});
  await p.click('.ev-completar .btn'); await p.waitForTimeout(1200);

  const despues = await p.evaluate(()=>{
    const barra=document.querySelector('.ev-completar');
    const huecos=[...document.querySelectorAll('.ev-tomar')];
    const doc=document.documentElement, hoja=document.querySelector('.ev-hoja');
    return {barra: barra? barra.className+' | '+barra.textContent.trim().slice(0,70):'no está',
      huecosVivos: huecos.filter(h=>!h.disabled).length,
      alto: Math.round(hoja.getBoundingClientRect().height), vh: innerHeight,
      pagRueda: doc.scrollHeight>doc.clientHeight,
      obsAparte: !!document.querySelector('figure.obs')};
  });
  console.log(`   -- CON ubicación`);
  console.log('   barra   ', despues.barra);
  console.log('   huecos tocables:', despues.huecosVivos, ' hoja', despues.alto+'/'+despues.vh,
              ' pagRueda:', despues.pagRueda, ' obs aparte:', despues.obsAparte);
  await p.screenshot({path:`${S}/ojo-${v.n}.png`});
  await ctx.close();
}
await b.close();
