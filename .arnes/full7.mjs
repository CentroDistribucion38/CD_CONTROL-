import { chromium } from 'playwright';
import { hojas } from './hojas.mjs';
import fs from 'fs';
const S='/home/claude/cd38-inventario/.arnes';
const links = hojas(['--c-marca:','cp-caja','--rl-titulo:','us-modulos']).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
fs.writeFileSync(S+'/full.html', `<!doctype html><html><head><meta charset="utf-8">${links}
<style>html,body{margin:0}.flex{display:flex}.min-h-screen{min-height:100vh}.flex-col{flex-direction:column}
#m{padding:24px}</style></head><body>
<div id="w" class="sh flex min-h-screen flex-col"><main id="m">
 <div class="rl us">
  <div class="cabeza"><div><p class="ojo">PLATAFORMA</p><h1>Usuarios</h1><p class="sub">Texto secundario de la cabeza.</p></div></div>
  <section class="tarjeta"><div class="cab"><div><h2>4 personas</h2><p>Quién entra y con qué rol.</p></div>
   <button class="btn">Crear usuario</button></div>
   <div class="us-marco"><table class="us-tabla"><thead><tr><th>Nombre</th><th>Rol</th><th>Extra</th><th>Estado</th></tr></thead>
   <tbody><tr><td>Cristian Pavi</td><td>Administrador</td><td><span class="us-chapa">Sider · Maestro <em>editar</em></span></td>
   <td><span class="us-estado bien">al día</span></td></tr>
   <tr><td>Luisa Rodríguez</td><td>Operador</td><td><span class="apagado">—</span></td><td><span class="us-estado ojo">clave provisional</span></td></tr>
   </tbody></table></div></section>
 </div>
 <div class="cp" style="height:auto;padding:24px 0"><section class="cp-caja"><p class="cp-ojo">PRIMER INGRESO</p>
  <h1>Cambia tu clave</h1><p class="cp-dice">Texto de apoyo. <b>Nadie más la ve.</b></p>
  <ul class="cp-reglas"><li class="ok">Mínimo 8</li><li>Una mayúscula</li></ul>
  <button class="cp-btn">Cambiar y entrar</button></section></div>
</main></div></body></html>`);

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const lum=(c)=>{const[r,g,bl]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*bl};
const rel=(a,bb)=>{const L1=lum(a),L2=lum(bb);return +((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2)};
const p = await b.newPage({viewport:{width:1280,height:900}});
await p.goto('file://'+S+'/full.html'); await p.waitForSelector('.cp-caja');
for (const t of [null,'tinta','pizarra','ambar','negro','gris','halo']) {
  await p.evaluate(x=>{const w=document.getElementById('w'); if(x)w.setAttribute('data-tema',x); else w.removeAttribute('data-tema')}, t);
  /* Chromium actualiza las variables antes que las propiedades que las
     usan: sin esta espera el arnés lee el --c-marca nuevo y el fondo
     viejo, y reporta contrastes que no existen. Ya me pasó. */
  /* .cp-btn tiene transition:background .12s: al cambiar de tema el
     fondo se ANIMA, y midiendo antes de que termine salen contrastes
     que no existen. 300ms > 120ms de la transición. */
  await p.waitForTimeout(300);
  const m = await p.evaluate(()=>{
    const fe=(el)=>{let n=el;while(n){const bg=getComputedStyle(n).backgroundColor;if(bg&&!/rgba\(0, 0, 0, 0\)/.test(bg))return bg;n=n.parentElement}return 'rgb(255,255,255)'};
    const g=(s,pr)=>getComputedStyle(document.querySelector(s)).getPropertyValue(pr);
    const par=(s)=>{const el=document.querySelector(s);return el?[g(s,'color'),fe(el)]:null};
    return { pares:{
      h1:par('.cabeza h1'), sub:par('.cabeza .sub'), h2:par('.tarjeta h2'), cabp:par('.tarjeta .cab p'),
      th:par('.us-tabla th'), td:par('.us-tabla td'), apagado:par('.apagado'),
      chapa:par('.us-chapa'), chapaEm:par('.us-chapa em'),
      estBien:par('.us-estado.bien'), estOjo:par('.us-estado.ojo'),
      btn:par('.btn'), cpOjo:par('.cp-ojo'), cpH1:par('.cp-caja h1'), cpDice:par('.cp-dice'),
      cpRegla:par('.cp-reglas li:not(.ok)'), cpBtn:par('.cp-btn'),
    }, pagina:g('body','background-color'), panel:g('.tarjeta','background-color') };
  });
  const c = Object.fromEntries(Object.entries(m.pares).filter(([,v])=>v).map(([k,[f,g2]])=>[k, rel(f,g2)]));
  const grande = new Set(['h1','cpH1','h2']);
  const bajo = Object.entries(c).filter(([k,v])=>v < (grande.has(k)?3:4.5));
  console.log(`${(t??'oficial').padEnd(8)} pagina=${m.pagina} panel=${m.panel} min=${Math.min(...Object.values(c))}${bajo.length?'   <<< BAJO: '+bajo.map(x=>x[0]+' '+x[1]).join(', '):'   ok'}`);
  if (['negro','gris','halo','oficial'].includes(t??'oficial')) await p.screenshot({path:`${S}/t-${t??'oficial'}.png`, clip:{x:0,y:0,width:1280,height:640}});
}
await b.close();
