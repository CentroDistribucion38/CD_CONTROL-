import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'pc',w:1440,h:900},{n:'cel',w:360,h:640}]) {
  const ctx=await b.newContext({viewport:{width:v.w,height:v.h},deviceScaleFactor:2});
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation({latitude:10.9743,longitude:-74.7708,accuracy:12});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('  ERROR JS:',e.message.split('\n')[0]));
  await p.goto('file://'+S+'/tranca.html');
  await p.waitForSelector('.tr-vh, .tr-grupos, button'); await p.waitForTimeout(400);
  /* abrir "Certificar llegada" */
  const abrio = await p.evaluate(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/certificar llegada/i.test(x.textContent||''));
    if(!b) return false; b.click(); return true;
  });
  if(!abrio){ console.log(v.n,'no encontré el botón de certificar'); await ctx.close(); continue }
  await p.waitForTimeout(700);
  console.log(`\n== ${v.n}`);
  console.log(await p.evaluate(()=>{
    const t=document.querySelector('.tr-tranca');
    const btnCert=[...document.querySelectorAll('.ct-botones button')][0];
    return { hayTranca: !!t,
      dice: t? t.textContent.replace(/\s+/g,' ').trim().slice(0,150) : null,
      botonCertificar: btnCert? `"${btnCert.textContent.trim()}" ${btnCert.disabled?'GRIS':'vivo'}` : null };
  }));
  /* tocar "Completarlas aquí mismo" */
  /* activar la ubicación primero: sin ella los huecos van grises a
     propósito, porque es lo que prueba dónde se tomó la foto */
  await p.evaluate(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/activar mi ubicaci/i.test(x.textContent||''));
    if(b) b.click();
  });
  await p.waitForTimeout(1500);
  const hay = await p.evaluate(()=>{
    const b=[...document.querySelectorAll('.tr-tranca button')].find(x=>/completarlas/i.test(x.textContent||''));
    if(!b) return false; b.click(); return true;
  });
  await p.waitForTimeout(500);
  console.log('   tras abrir:', await p.evaluate(()=>{
    const h=[...document.querySelectorAll('.tr-huecos .ct-hueco button')];
    const doc=document.documentElement;
    return { huecos:h.length, vivos:h.filter(x=>!x.disabled).length,
      nombres:h.map(x=>x.querySelector('b')?.textContent),
      medida:h[0]? Math.round(h[0].getBoundingClientRect().width)+'x'+Math.round(h[0].getBoundingClientRect().height):null,
      ruedaX: doc.scrollWidth>doc.clientWidth };
  }));
  await p.screenshot({path:`${S}/tranca-${v.n}.png`, fullPage:true});
  await ctx.close();
}
await b.close();
