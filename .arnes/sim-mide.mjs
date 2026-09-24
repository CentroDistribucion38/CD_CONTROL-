import { chromium } from 'playwright';
import fs from 'fs';
import { hojas } from './hojas.mjs';
const S='/home/claude/cd38-inventario/.arnes';
const links = hojas(['--c-marca:','--qb-texto:']).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
const marca = (n) => new Intl.NumberFormat('es-CO').format(n);
const cuerpo = `
<div class="qb"><section class="tarjeta sim">
  <div class="cab">
    <div><h2>Cuánto me queda</h2>
      <p>El CONA y el % se escriben; la proyección y el disponible se calculan contra la quiebra de <b>septiembre</b>.</p></div>
    <p class="sim-firma">Guardado por Cristian Pavi<em>10 sept, 03:42 p. m.</em></p>
  </div>
  <div class="sim-cuerpo">
    <div class="sim-filas">
      <label class="sim-fila"><span>CONA</span><input value="85166358"><em>unidades a producir</em></label>
      <label class="sim-fila"><span>% Quiebra</span><input value="2,65"><em>el tope del mes</em></label>
      <div class="sim-fila calc"><span>Proyección und</span><b>${marca(2256908)}</b><em>CONA × %</em></div>
      <label class="sim-fila"><span>Quiebra de septiembre</span><input value="1760984"><em>la plataforma calcula ${marca(2494333)}</em></label>
    </div>
    <div class="sim-total"><span>Disponible</span><b>${marca(495924)}</b>
      <em>unidades de quiebra antes de pasarse</em></div>
  </div>
  <div class="sim-pie">
    <button type="button" class="btn">Sin cambios por guardar</button>
    <p>Se guarda para septiembre y lo ve todo el mundo igual. Mientras no guardes, lo de arriba es solo tuyo para tantear.</p>
  </div>
</section>
<section class="tarjeta sim" style="margin-top:18px">
  <div class="cab"><div><h2>Cuánto me queda en agosto</h2>
    <p>El CONA y el % se escriben; la proyección y el disponible se calculan contra la quiebra de <b>agosto de 2026</b>, que es donde termina el filtro de arriba.</p></div></div>
  <div class="sim-cuerpo">
    <div class="sim-filas">
      <label class="sim-fila"><span>CONA</span><input value="85166358"><em>unidades a producir</em></label>
      <label class="sim-fila"><span>% Quiebra</span><input value="2,65"><em>el tope del mes</em></label>
      <div class="sim-fila calc"><span>Proyección und</span><b>${marca(2256908)}</b><em>CONA × %</em></div>
      <label class="sim-fila"><span>Quiebra de agosto</span><input value="" placeholder="${marca(2494333)}"><em>en blanco usa la de la plataforma: ${marca(2494333)}</em></label>
    </div>
    <div class="sim-total pasado"><span>Pasado del tope</span><b>${marca(237425)}</b>
      <em>unidades por encima de lo proyectado</em></div>
  </div>
  <div class="sim-pie"><button type="button" class="btn">Guardar agosto</button>
    <p>Se guarda para <b>agosto de 2026</b> y lo ve todo el mundo igual. Cada mes lleva su propio CONA: cambiar el filtro cambia el mes del que habla esta tarjeta.</p></div>
</section></div>`;
fs.writeFileSync(S+'/sim.html', `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
${links}<style>html,body{margin:0;background:#EEF2F6}#m{padding:22px}</style></head>
<body><div id="m">${cuerpo}</div></body></html>`);

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const v of [{n:'pc',w:1440,h:900},{n:'cel',w:360,h:700}]) {
  const p=await b.newPage({viewport:{width:v.w,height:v.h},deviceScaleFactor:2});
  await p.goto('file://'+S+'/sim.html'); await p.waitForSelector('.sim-total'); await p.waitForTimeout(400);
  console.log(v.n, await p.evaluate(()=>{
    const r=e=>{const b=e.getBoundingClientRect();return Math.round(b.width)+'x'+Math.round(b.height)};
    const cortado=[...document.querySelectorAll('.sim-fila > span, .sim-fila > em, .sim-fila > b, .sim-total > b')]
      .filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.slice(0,18));
    const inp=document.querySelector('.sim-fila input');
    const doc=document.documentElement;
    return {total:r(document.querySelector('.sim-total')), caja:r(inp),
      letraCaja:parseFloat(getComputedStyle(inp).fontSize),
      recortados: cortado.length? cortado : 'ninguno',
      ruedaX: doc.scrollWidth>doc.clientWidth};
  }));
  await p.screenshot({path:`${S}/sim-${v.n}.png`, fullPage:true});
  await p.close();
}
await b.close();
