import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'pc',w:1440,h:900},{n:'cel',w:360,h:700}]) {
  const p=await b.newPage({viewport:{width:v.w,height:v.h},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  ERROR JS:',e.message.split('\n')[0]));
  await p.goto('file://'+S+'/nov.html'); await p.waitForSelector('.nv-barra'); await p.waitForTimeout(400);
  console.log(`\n== ${v.n}`, await p.evaluate(()=>{
    const doc=document.documentElement;
    const cort=[...document.querySelectorAll('.nv-cab *, .nv-quien *, .nv-compromiso, .nv-hilo p')]
      .filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.slice(0,20));
    return { tarjetas: document.querySelectorAll('.nv').length,
      vencidas: document.querySelectorAll('.nv.vencida').length,
      cerradas: document.querySelectorAll('.nv.cerrada').length,
      hilos: document.querySelectorAll('.nv-hilo li').length,
      contadorVencidas: document.querySelector('.nv-cuenta.mala b')?.textContent ?? 'no sale',
      recortados: cort.length? cort : 'ninguno',
      ruedaX: doc.scrollWidth>doc.clientWidth };
  }));
  /* abrir el panel de responder de la primera */
  await p.evaluate(()=>{const b=[...document.querySelectorAll('.nv-pie button')][0]; b&&b.click()});
  await p.waitForTimeout(350);
  console.log('   al responder:', await p.evaluate(()=>{
    const r=document.querySelector('.nv-responder');
    if(!r) return 'no abrió';
    const cajas=[...r.querySelectorAll('input,textarea')].map(i=>({v:i.value.slice(0,22), h:Math.round(i.getBoundingClientRect().height)}));
    return {cajas, botones:[...r.querySelectorAll('button')].map(x=>x.textContent.trim()),
      ruedaX: document.documentElement.scrollWidth>document.documentElement.clientWidth};
  }));
  await p.screenshot({path:`${S}/nov-${v.n}.png`, fullPage:true});
  await p.close();
}
await b.close();
