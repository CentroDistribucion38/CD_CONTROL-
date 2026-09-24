import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:360,height:640}});
await p.goto('file://'+S+'/qd.html'); await p.waitForSelector('.rj-marco'); await p.waitForTimeout(400);
console.log(await p.evaluate(()=>{
  const r=e=>{const b=e.getBoundingClientRect();return `${Math.round(b.left)}..${Math.round(b.right)} (${Math.round(b.width)})`};
  const tr=document.querySelector('.rj thead tr');
  const marco=document.querySelector('.rj-marco');
  return {
    marco: r(marco),
    rot: r(tr.children[0]),
    dia1: r(tr.children[1]),
    dia2: r(tr.children[2]),
    total: r(tr.children[tr.children.length-1]),
    inp1: r(document.querySelector('.rj td.cel input')),
    tabla: Math.round(document.querySelector('.rj').getBoundingClientRect().width),
  };
}));
await b.close();
