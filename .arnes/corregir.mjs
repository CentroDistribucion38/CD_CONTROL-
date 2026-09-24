import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto('file://'+S+'/vj.html'); await p.waitForSelector('.vj-mini');
await p.waitForTimeout(250);
// la primera fila que NO esté anulada
await p.click('tbody tr:nth-child(2) .vj-mini');
await p.waitForTimeout(300);
console.log('errores:', errs.length?errs:'ninguno');
console.log(await p.evaluate(()=>{
  const fila=document.querySelector('tr.vj-form');
  if(!fila) return 'LA FILA DEL EDITOR NO EXISTE EN EL DOM';
  const r=fila.getBoundingClientRect();
  const ed=document.querySelector('.vj-editor');
  const er=ed?ed.getBoundingClientRect():null;
  return JSON.stringify({
    filaAlto: Math.round(r.height), filaTop: Math.round(r.top),
    editorAlto: er?Math.round(er.height):null,
    display: getComputedStyle(fila).display,
    campos: document.querySelectorAll('.vj-campos input, .vj-campos select').length,
    opcionesOrigen: document.querySelectorAll('.vj-campos select')[0]?.options.length,
    opcionesSku: document.querySelectorAll('.vj-campos select')[1]?.options.length,
    visible: er ? er.height > 10 : false,
  },null,1);
}));
await p.screenshot({path:S+'/corregir.png', clip:{x:0,y:200,width:1440,height:600}});
await b.close();
