import { chromium } from 'playwright';
import { hojas } from './hojas.mjs';
import fs from 'fs';
const S='/home/claude/cd38-inventario/.arnes';
const links = hojas(['--c-marca:','cp-caja']).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
fs.writeFileSync(S+'/barra.html', `<!doctype html><html><head><meta charset="utf-8">${links}
<style>html,body{margin:0}.flex{display:flex}.min-h-screen{min-height:100vh}.flex-col{flex-direction:column}</style></head><body>
<div id="w" class="sh flex min-h-screen flex-col">
 <header class="sh-barra">
  <div class="esquina"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>
  <div class="ruta"><span class="wm">CONTROL</span>
   <svg class="sep" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
   <span class="modulo">Seguimiento</span>
   <svg class="sep" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
   <span class="hoja">ZLDE</span></div>
  <div class="der"><span class="turno">Turno 2 · 21:24</span><a class="sh-avatar" href="#">GV</a></div>
 </header>
 <main style="padding:20px"><p>texto normal</p></main>
</div></body></html>`);

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const lum=(c)=>{const[r,g,bl]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*bl};
const rel=(a,bb)=>{const L1=lum(a),L2=lum(bb);return +((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2)};
const ESP={ // lo que dice tu mockup, para comparar contra lo que pinta
  negro:{fondo:'rgb(13, 13, 13)', filo:'rgb(255, 192, 0)', filoAlto:'3px'},
  gris: {fondo:'rgb(217, 217, 217)', filo:'rgb(255, 192, 0)', filoAlto:'4px'},
  halo: {filo:null, filoAlto:'3px'},
};
const p = await b.newPage({viewport:{width:1280,height:300}});
await p.goto('file://'+S+'/barra.html'); await p.waitForSelector('.sh-barra');
for (const t of [null,'tinta','pizarra','ambar','negro','gris','halo']) {
  await p.evaluate(x=>{const w=document.getElementById('w'); if(x)w.setAttribute('data-tema',x); else w.removeAttribute('data-tema')}, t);
  const m = await p.evaluate(()=>{
    const g=(s,pr,ps)=>getComputedStyle(document.querySelector(s),ps).getPropertyValue(pr);
    const barra=document.querySelector('.sh-barra');
    const fondo=g('.sh-barra','background-color');
    return {
      fondo, imagen: g('.sh-barra','background-image').slice(0,28),
      filo: g('.sh-barra','background-color','::after'), filoImg: g('.sh-barra','background-image','::after').slice(0,22),
      filoAlto: g('.sh-barra','height','::after'),
      borde: g('.sh-barra','border-bottom-width')+' '+g('.sh-barra','border-bottom-color'),
      tramaOp: g('.sh-barra','opacity','::before'), tramaMed: g('.sh-barra','background-size','::before'),
      wm: g('.sh-barra .wm','color'), modulo: g('.sh-barra .modulo','color'),
      hoja: g('.sh-barra .hoja','color'), der: g('.sh-barra .der','color'),
      sep: g('.sh-barra .sep','stroke'),
      avFondo: g('.sh-avatar','background-color'), avTxt: g('.sh-avatar','color'), avFilo: g('.sh-avatar','border-top-color'),
      esquina: g('.sh-barra .esquina','border-right-color'),
      pagina: getComputedStyle(document.body).backgroundColor,
    };
  });
  // la barra clara: el fondo efectivo para contraste es el color, no el gradiente
  const F = m.fondo === 'rgba(0, 0, 0, 0)' ? 'rgb(0,0,0)' : m.fondo;
  const c = { wm:rel(m.wm,F), modulo:rel(m.modulo,F), hoja:rel(m.hoja,F), der:rel(m.der,F), avatar:rel(m.avTxt,m.avFondo) };
  const bajo = Object.entries(c).filter(([k,v])=>v < (k==='modulo'?3:4.5));
  const e = ESP[t];
  const ok = !e ? '' : (e.fondo && m.fondo!==e.fondo ? ` FONDO≠${e.fondo}` : '') + (m.filoAlto!==e.filoAlto ? ` FILO_ALTO=${m.filoAlto}≠${e.filoAlto}` : '') + (e.filo && m.filo!==e.filo ? ` FILO≠${e.filo}`:'');
  console.log(`${(t??'oficial').padEnd(8)} fondo=${m.fondo} filo=${m.filo}/${m.filoImg} ${m.filoAlto} borde=${m.borde} tramaOp=${m.tramaOp} med=${m.tramaMed}`);
  console.log(`         contraste ${JSON.stringify(c)}${bajo.length?'  <<< BAJO':''}${ok?'  <<< NO COINCIDE:'+ok:''}`);
}
await b.close();
