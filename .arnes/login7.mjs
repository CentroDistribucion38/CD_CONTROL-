import { chromium } from 'playwright';
import { hojas } from './hojas.mjs';
import fs from 'fs';
const S='/home/claude/cd38-inventario/.arnes';
const links = hojas(['--c-marca:', '.acc-entrar{']).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
fs.writeFileSync(S+'/acc.html', `<!doctype html><html><head><meta charset="utf-8">${links}
<style>html,body{margin:0}</style></head><body>
<div class="acc" id="a">
 <div class="acc-escena"><div class="acc-hero">
  <div class="acc-fondo"><div class="acc-izq"></div><div class="acc-banda"></div>
   <div class="acc-filo a"></div><div class="acc-filo b"></div></div>
  <div class="acc-marca"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><span class="nombre">CONTROL</span></div>
  <div class="acc-discurso"><h1><span class="l1">ENVASE</span><span class="l2">EN <span class="acc-baq"><span>BAQ</span></span></span></h1>
   <p class="acc-firma">CD38 · AG01</p>
   <div class="acc-modulos"><span class="activo">Quiebra</span><span>Sider</span><span>Inventario</span></div></div>
  <div class="acc-tarjeta"><div class="acc-cabeza"><h2>Entrar</h2><p class="sub">Con tu usuario de CONTROL.</p></div>
   <div class="acc-caja"><label>Usuario</label><input value="gvisbal"><button class="acc-entrar">Entrar</button></div></div>
 </div></div></div></body></html>`);
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const lum=(c)=>{const[r,g,bl]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*bl};
const rel=(a,bb)=>{const L1=lum(a),L2=lum(bb);return +((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2)};
const p = await b.newPage({viewport:{width:1440,height:900}});
await p.goto('file://'+S+'/acc.html'); await p.waitForSelector('.acc-entrar');
for (const t of [null,'tinta','pizarra','ambar','negro','gris','halo']) {
  await p.evaluate(x=>{const a=document.getElementById('a'); if(x)a.setAttribute('data-tema',x); else a.removeAttribute('data-tema')}, t);
  await p.waitForTimeout(300);
  const m = await p.evaluate(()=>{
    const g=(s,pr)=>getComputedStyle(document.querySelector(s)).getPropertyValue(pr);
    return {
      izq: g('.acc-izq','background-image').includes('gradient') ? g('.acc-izq','background-color') : g('.acc-izq','background-color'),
      izqImg: g('.acc-izq','background-image').slice(0,60),
      baqFondo:g('.acc-baq','background-color'), baqTxt:g('.acc-baq span','color'),
      entFondo:g('.acc-entrar','background-color'), entTxt:g('.acc-entrar','color'),
      modFondo:g('.acc-modulos span.activo','background-color'), modTxt:g('.acc-modulos span.activo','color'),
      firma:g('.acc-firma','color'),
      filo:g('.acc-tarjeta','background-color'),
      nombre:g('.acc-marca .nombre','color'),
    };
  });
  const c = { baq:rel(m.baqTxt,m.baqFondo), entrar:rel(m.entTxt,m.entFondo), modulo:rel(m.modTxt,m.modFondo) };
  const bajo=Object.entries(c).filter(([,v])=>v<4.5);
  console.log(`${(t??'oficial').padEnd(8)} izq=${m.izq} acento=${m.entFondo} ${JSON.stringify(c)}${bajo.length?'  <<< BAJO':'  ok'}`);
  if (['gris','negro','oficial'].includes(t??'oficial')) await p.screenshot({path:`${S}/acc-${t??'oficial'}.png`});
}
await b.close();
