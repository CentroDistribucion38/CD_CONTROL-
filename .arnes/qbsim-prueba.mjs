import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1440,height:900}});
p.on('pageerror',e=>console.log('  ERROR JS:',e.message.split('\n')[0]));
await p.goto('file://'+S+'/qbsim.html');
await p.waitForSelector('.sim-total',{timeout:10000}); await p.waitForTimeout(400);

const estado = () => p.evaluate(()=>{
  const v=[...document.querySelectorAll('.sim-fila input')].map(i=>i.value);
  return { mes: document.querySelector('.sim .cab h2').textContent.replace('Cuánto me queda en ',''),
    cona:v[0], pct:v[1], baja:v[2],
    disp: document.querySelector('.sim-total b').textContent,
    boton: document.querySelector('.sim-pie .btn').textContent.trim() };
});
/* Elige un rango tocando dos días del calendario. iMes: 0 = el de la
   izquierda (agosto), 1 = el de la derecha (septiembre). */
async function rango(iMes1, d1, iMes2, d2) {
  await p.evaluate(()=>{ const b=[...document.querySelectorAll('.qb .disparo')].find(x=>x.querySelector('.ico')); b&&b.click() });
  await p.waitForSelector('.qb .calendario .panel'); await p.waitForTimeout(200);
  const toca = (im, d) => p.evaluate(([im, d])=>{
    const mes = document.querySelectorAll(".qb .calendario .mes")[im];
    const b = [...mes.querySelectorAll('.dias button')].find(x=>!x.classList.contains('fuera') && x.textContent.trim()===String(d));
    b && b.click();
  }, [im, d]);
  await toca(iMes1, d1); await p.waitForTimeout(200);
  await toca(iMes2, d2); await p.waitForTimeout(250);
  /* El calendario no aplica al tocar los días: hay un botón Aplicar. */
  await p.evaluate(()=>{ const b=[...document.querySelectorAll('.qb .cal-pie button')].find(x=>/aplicar/i.test(x.textContent||'')); b&&b.click() });
  await p.waitForTimeout(450);
}
async function escribir(i, texto) {
  const c = (await p.$$('.sim-fila input'))[i];
  await c.click({clickCount:3}); await c.press('Backspace');
  await c.type(texto, {delay:10}); await p.waitForTimeout(150);
}

await rango(0, 10, 0, 31);                       // 1–31 de agosto
console.log('1) filtro hasta agosto ->', JSON.stringify(await estado()));

await escribir(0,'85166358'); await escribir(1,'2,65'); await escribir(2,'1760984');
await p.click('.sim-pie .btn'); await p.waitForTimeout(700);
console.log('2) agosto guardado     ->', JSON.stringify(await estado()));

await rango(1, 1, 1, 5);                        // 1–5 de septiembre
console.log('3) me voy a septiembre ->', JSON.stringify(await estado()));

await rango(0, 10, 0, 31);                       // vuelvo a agosto
const fin = await estado();
console.log('4) vuelvo a agosto     ->', JSON.stringify(fin));

const bien = fin.mes==='agosto' && fin.cona==='85.166.358' && fin.pct==='2,65'
          && fin.baja==='1.760.984' && fin.disp==='495.924' && /Sin cambios/.test(fin.boton);
console.log(bien ? '\nOK: agosto sobrevivió al ir y volver'
                 : '\nMAL: se perdió lo guardado de agosto');
await p.screenshot({path:S+'/qbsim.png'});
await b.close();
