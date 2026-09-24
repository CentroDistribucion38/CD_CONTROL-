import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'pc',w:1440,h:900},{n:'cel',w:360,h:640}]) {
  const p=await b.newPage({viewport:{width:v.w,height:v.h},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  ERROR JS:',e.message.split('\n')[0]));
  await p.goto('file://'+S+'/index2.html'); await p.waitForSelector('.us-tabla'); await p.waitForTimeout(300);
  /* Se abre la edición de la 3a fila (Jorge Moreno Barraza) */
  const botones = await p.$$('.us-acc button');
  const editar = await p.$$eval('.us-acc button', bs=>bs.map(b=>b.textContent.trim()));
  console.log(`\n== ${v.n}  botones por fila:`, editar.slice(0,4).join(' | '));
  await p.$$eval('.us-tabla tbody tr:nth-child(3) .us-acc button',
                 bs=>bs.find(b=>b.textContent.trim()==='Editar').click());
  await p.waitForTimeout(300);
  const r = await p.evaluate(()=>{
    const fila=document.querySelector('.us-editando');
    const cs=[...document.querySelectorAll('.us-editando .us-campo')].map(e=>{
      const b=e.getBoundingClientRect(); return {v:e.value, w:Math.round(b.width), h:Math.round(b.height), fs:parseFloat(getComputedStyle(e).fontSize)}});
    const acc=[...document.querySelectorAll('.us-editando .us-acc button')].map(e=>{
      const b=e.getBoundingClientRect(); return `${e.textContent.trim()} ${Math.round(b.width)}x${Math.round(b.height)}`});
    const otros=[...document.querySelectorAll('.us-tabla tbody tr:not(.us-editando) .us-acc button')].filter(b=>!b.disabled).length;
    return {hayFila:!!fila, campos:cs, acciones:acc, otrosHabilitados:otros,
            ruedaX: document.documentElement.scrollWidth>document.documentElement.clientWidth};
  });
  console.log('   campos  ', JSON.stringify(r.campos));
  console.log('   acciones', r.acciones.join(' | '));
  console.log('   otras filas con botones vivos:', r.otrosHabilitados, ' ruedaX:', r.ruedaX);
  await p.screenshot({path:`${S}/us-editar-${v.n}.png`, fullPage:true});
  await p.close();
}
await b.close();
