/* Genera TODAS las páginas del arnés contra el build actual. Se llama
   al principio de cada medición: reusar la de la corrida anterior
   apunta a un chunk que el build ya borró, no aplica ninguna regla, y
   las medidas salen basura con cara de dato. Van tres veces. */
import fs from 'fs';
import { hojas } from './hojas.mjs';
const S='/home/claude/cd38-inventario/.arnes';
const marco = (huellas, cuerpo, extra='') => {
  const links = hojas(huellas).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
${links}
<style>html,body{margin:0}.flex{display:flex}.min-h-screen{min-height:100vh}.flex-col{flex-direction:column}${extra}</style>
</head><body><div id="w" class="sh flex min-h-screen flex-col"><main id="m"><div id="r"></div></main></div>
<script src="file://${S}/APP"></script></body></html>`;
};
const PAD = `#m{padding:26px 30px;height:100dvh;overflow:auto;box-sizing:border-box}`;
const PADX = `#m{padding:18px 18px 30px;height:100dvh;overflow:hidden;box-sizing:border-box}`;

fs.writeFileSync(S+'/vj.html', marco(['--c-marca:','.vj-filtros'], '', PAD).replace('APP','app3.js'));
fs.writeFileSync(S+'/tr.html', marco(['--c-marca:','.tr-grupos'], '', PADX).replace('APP','app4.js'));
fs.writeFileSync(S+'/index2.html', marco(['--c-marca:','--rl-titulo:','us-modulos'], '', PAD).replace('APP','app2.js'));
fs.writeFileSync(S+'/index.html', marco(['--c-marca:','.cp-caja'], '', '').replace('APP','app.js')
  .replace('<main id="m"><div id="r"></div></main>','<div id="r"></div>'));
fs.writeFileSync(S+'/exp.html', marco(['--c-marca:','.ex-todo'], '', PAD).replace('APP','app5.js'));
fs.writeFileSync(S+'/conf.html', marco(['.cf-velo'], '', '').replace('APP','app6.js')
  .replace('<main id="m"><div id="r"></div></main>','<div id="r"></div>'));
fs.writeFileSync(S+'/qd.html', marco(['--c-marca:','--qb-texto:','.rj-marco'], '', PADX).replace('APP','app7.js'));
fs.writeFileSync(S+'/pf.html', marco(['--c-marca:','.pf-switch'], '', PAD).replace('APP','app8.js'));
fs.writeFileSync(S+'/obs.html', marco(['--c-marca:','.ct-obs'], '', PAD).replace('APP','app9.js'));
fs.writeFileSync(S+'/ojo.html', marco(['--c-marca:','.ev-hoja'], '', '').replace('APP','app10.js'));
fs.writeFileSync(S+'/tranca.html', marco(['--c-marca:','.tr-tranca'], '', PAD).replace('APP','app11.js'));
fs.writeFileSync(S+'/salida.html', marco(['--c-marca:','.ct-pasos'], '', PAD).replace('APP','app12.js'));
fs.writeFileSync(S+'/qbsim.html', marco(['--c-marca:','--qb-texto:'], '', PAD).replace('APP','app13.js'));
fs.writeFileSync(S+'/nov.html', marco(['--c-marca:','.nv-barra'], '', PAD).replace('APP','app14.js'));
console.log('doce páginas del arnés regeneradas contra el build actual ✓');
