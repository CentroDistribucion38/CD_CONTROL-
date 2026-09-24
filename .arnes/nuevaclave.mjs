import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const casos = [
  ['200 con la clave',        200, JSON.stringify({usuario:'operador', nombre:'Operador Patio', clave:'481907', digitos:6})],
  ['500 pero la clave cambio',500, JSON.stringify({error:'La clave de "operador" SÍ cambió, pero no se pudo marcar como provisional: x.', usuario:'operador', nombre:'Operador Patio', clave:'481907', digitos:6})],
  ['403 sin permiso',         403, JSON.stringify({error:'Generar claves requiere un rol que administre la plataforma.'})],
  ['200 cuerpo vacio',        200, ''],
];
for (const [que, status, body] of casos) {
  const p = await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('file://'+S+'/index2.html'); await p.waitForSelector('.us-tabla');
  await p.evaluate(([st,bd])=>{ window.fetch = async () => new Response(bd,{status:st,headers:{'Content-Type':'application/json'}}) }, [status, body]);
  /* La primera fila es "yo" (id 1) y no debe tener boton. La segunda sí. */
  const primeraEsYo = await p.$$eval('.us-tabla tbody tr td.us-acc', c => c[0].textContent.trim());
  await p.click('.us-tabla tbody tr:nth-child(2) .us-mini');
  await p.waitForTimeout(350);
  const v = await p.evaluate(()=>({
    clave: document.querySelector('.us-clave .num')?.textContent ?? null,
    mal: document.querySelector('.us-mal')?.textContent?.slice(0,60) ?? null,
    vivo: !!document.querySelector('.us-tabla'),
  }));
  console.log(`${que.padEnd(26)} ${errs.length?'REVIENTA: '+errs[0].slice(0,50):'ok'} | clave=${JSON.stringify(v.clave)} aviso=${JSON.stringify(v.mal)} pantalla viva=${v.vivo}`);
  if (que.startsWith('200 con')) console.log(`   (la fila de uno mismo dice: "${primeraEsYo}")`);
  await p.close();
}
await b.close();
