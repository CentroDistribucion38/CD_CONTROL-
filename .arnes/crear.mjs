import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1280,height:900}});
const errores=[];
p.on('pageerror', e => errores.push('PAGEERROR: '+e.message));
p.on('console', m => { if (m.type()==='error') errores.push('CONSOLA: '+m.text()) });

await p.goto('file://'+S+'/index2.html'); await p.waitForSelector('.us-tabla');

/* Se intercepta el fetch con LA RESPUESTA REAL del API, campo por campo:
   { usuario, nombre, rol, clave, digitos }. */
await p.route('**/api/admin/usuarios', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ usuario:'gvisbal', nombre:'Génesis Visbal', rol:'supervisor', clave:'0417', digitos:4 }),
}));
await p.evaluate(() => {
  const orig = window.fetch;
  window.fetch = async (u, o) => {
    if (String(u).includes('/api/admin/usuarios'))
      return new Response(JSON.stringify({ usuario:'gvisbal', nombre:'Génesis Visbal', rol:'supervisor', clave:'0417', digitos:4 }),
        { status:200, headers:{'Content-Type':'application/json'} });
    return orig(u, o);
  };
});

await p.click('.cab .btn');                    // abre el formulario
await p.fill('.us-campos .ancho input', 'Génesis Visbal');
await p.waitForTimeout(500);                   // el debounce de usuario_libre
await p.click('.us-acciones .btn');            // "Crear y generar la clave"
await p.waitForTimeout(600);

console.log('errores:', errores.length ? errores : 'ninguno');
console.log('tarjeta de la clave:', await p.evaluate(() => {
  const el = document.querySelector('.us-clave');
  return el ? el.textContent.replace(/\s+/g,' ').slice(0,110) : 'NO SE DIBUJÓ';
}));
await p.screenshot({path:S+'/crear.png', clip:{x:0,y:0,width:1280,height:400}});
await b.close();
