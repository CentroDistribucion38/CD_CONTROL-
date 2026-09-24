import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const casos = [
  ['500 con la cuenta a medias', 500, JSON.stringify({error:'La cuenta de "gvisbal" quedó creada, pero su perfil no se pudo completar: x.', usuario:'gvisbal'})],
  ['403 sin permiso',            403, JSON.stringify({error:'Crear usuarios requiere un rol que administre la plataforma.'})],
  ['503 sin llave',              503, JSON.stringify({error:'Falta la variable SUPABASE_SERVICE_ROLE_KEY en el servidor.'})],
  ['200 pero sin nombre',        200, JSON.stringify({usuario:'gvisbal', clave:'0417'})],
  ['200 con cuerpo vacío',       200, ''],
  ['502 HTML de Vercel',         502, '<html><body>An error occurred</body></html>'],
];
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [que, status, body] of casos) {
  const p = await b.newPage({viewport:{width:1280,height:900}});
  const errores=[];
  p.on('pageerror', e => errores.push(e.message));
  await p.goto('file://'+S+'/index2.html'); await p.waitForSelector('.us-tabla');
  await p.evaluate(([st, bd]) => {
    window.fetch = async (u) => String(u).includes('/api/admin/usuarios')
      ? new Response(bd, { status: st, headers:{'Content-Type':'application/json'} })
      : new Response('{}');
  }, [status, body]);
  await p.click('.cab .btn');
  await p.fill('.us-campos .ancho input', 'Génesis Visbal');
  await p.waitForTimeout(450);
  await p.click('.us-acciones .btn');
  await p.waitForTimeout(400);
  const visto = await p.evaluate(() => {
    const mal = document.querySelector('.us-mal');
    const clave = document.querySelector('.us-clave');
    return { mal: mal?.textContent?.slice(0,70) ?? null, clave: clave?.textContent?.slice(0,40) ?? null,
             vivo: !!document.querySelector('.us-tabla') };
  });
  console.log(`${que.padEnd(28)} ${errores.length ? 'REVIENTA: '+errores[0].slice(0,80) : 'ok'}  | aviso=${JSON.stringify(visto.mal)} clave=${JSON.stringify(visto.clave)}`);
  await p.close();
}
await b.close();
