import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1100,height:420}});
await p.goto('file://'+S+'/index2.html'); await p.waitForSelector('.us-aviso');
const m = await p.evaluate(()=>{
  const av=document.querySelector('.us-aviso');
  const bs=[...av.querySelectorAll('b')];
  return {
    titulo: getComputedStyle(bs[0]).display,
    dentroDelParrafo: bs.slice(1).map(x=>getComputedStyle(x).display),
    // ¿cuántos renglones ocupa el primer párrafo?
    parrafoAlto: Math.round(av.querySelector('p').getBoundingClientRect().height),
    botonHab: !document.querySelector('.cab .btn').disabled,
  };
});
console.log(JSON.stringify(m));
await p.screenshot({path:S+'/aviso.png', clip:{x:20,y:110,width:1010,height:230}});
await b.close();
