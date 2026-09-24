/* El paso "Certificado" con el + del siguiente. Se llega saltando el
   estado: se fuerza paso 6 desde el propio arnés no se puede, así que se
   comprueba el ENTRADO real recorriendo la pantalla. Aquí solo se mide
   el bloque, montándolo con las mismas clases. */
import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'pc',w:1440,h:900},{n:'cel',w:360,h:640}]) {
  const ctx=await b.newContext({viewport:{width:v.w,height:v.h},deviceScaleFactor:2});
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation({latitude:10.90,longitude:-74.88,accuracy:11});
  const p=await ctx.newPage();
  await p.goto('file://'+S+'/salida.html'); await p.waitForSelector('.ct-pasos'); await p.waitForTimeout(300);
  /* Se inyecta el bloque final con el marcado real para medirlo. */
  await p.evaluate(()=>{
    const caja=document.querySelector('.tarjeta');
    caja.innerHTML = `<div class="ct-paso ct-listo">
      <h2>Certificado</h2>
      <p class="ct-dice">JYN245 va en tránsito. Cuando llegue a Barranquilla se certifica la otra punta desde <b>En tránsito</b>.</p>
      <button type="button" class="ct-otro"><span aria-hidden="true">+</span><b>Certificar otro vehículo</b><em>La ubicación ya está tomada, empiezas por el origen</em></button>
      <div class="ct-botones"><a class="btn plano">Ver la fuente principal</a><a class="btn plano">Ver lo que va en camino</a></div></div>`;
  });
  await p.waitForTimeout(250);
  console.log(v.n, await p.evaluate(()=>{
    const o=document.querySelector('.ct-otro'), r=o.getBoundingClientRect();
    const cortado=[...o.children].some(c=>{const cr=c.getBoundingClientRect();
      return cr.right>r.right-2 || cr.bottom>r.bottom+1});
    const doc=document.documentElement;
    return {boton:Math.round(r.width)+'x'+Math.round(r.height), cortado,
      ruedaX:doc.scrollWidth>doc.clientWidth};
  }));
  await p.screenshot({path:`${S}/listo-${v.n}.png`});
  await ctx.close();
}
await b.close();
