import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1440,height:900}});
await p.goto('file://'+S+'/vj.html'); await p.waitForSelector('.vj-acc-col');
await p.waitForTimeout(300);
console.log(await p.evaluate(()=>{
  const marco=document.querySelector('.marco');
  const btn=document.querySelector('tbody .vj-mini').getBoundingClientRect();
  const m=marco.getBoundingClientRect();
  return `tabla ${Math.round(marco.scrollWidth)} en caja ${Math.round(marco.clientWidth)} | rueda en X = ${marco.scrollWidth>marco.clientWidth} | boton visible al abrir: ${btn.right <= m.right + 1 && btn.left >= m.left}`;
}));
// rodar la tabla a la derecha del todo y comprobar que el boton sigue ahi
await p.evaluate(()=>{ document.querySelector('.marco').scrollLeft = 9999 });
await p.waitForTimeout(200);
console.log('tras rodar al extremo:', await p.evaluate(()=>{
  const m=document.querySelector('.marco').getBoundingClientRect();
  const btn=document.querySelector('tbody .vj-mini').getBoundingClientRect();
  const fondo=getComputedStyle(document.querySelector('tbody .vj-acc-col')).backgroundColor;
  return `boton visible = ${btn.right <= m.right+1 && btn.left >= m.left} | fondo de la columna = ${fondo}`;
}));
await p.screenshot({path:S+'/vj-pegada.png', clip:{x:0,y:0,width:1440,height:520}});
await b.close();
