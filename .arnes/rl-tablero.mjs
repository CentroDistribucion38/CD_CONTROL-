/* EL TABLERO, con cifras de verdad: las 24.243 filas de 2026 del Excel.
   Un tablero probado con datos inventados se ve bien y miente — los
   rótulos largos, las barras chiquitas y los números de siete cifras
   solo aparecen con los datos reales. */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";
const css  = fs.readFileSync("src/app/(app)/quiebra/rotura/rotura.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const TEMAS = ["oficial","tinta","pizarra","ambar","negro","gris","halo"];

/* Las cifras salen de Postgres, no de la imaginación. */
const sql = (q) => JSON.parse(execSync(
  `sudo -u postgres psql -d rl2 -tAc "select coalesce(json_agg(t),'[]') from (${q}) t"`,
  { encoding: "utf8", maxBuffer: 20e6 }).trim());

const MAQ = sql(`select m.nombre as rotulo, sum(r.und)::int as valor
  from public.rotlinea_registro r join public.rotlinea_maquinas m on m.item=r.maquina
  group by m.nombre order by 2 desc`);
const ENV = sql(`select e.descripcion as rotulo, sum(r.und)::int as valor
  from public.rotlinea_registro r join public.rotlinea_envases e on e.material=r.envase
  group by e.descripcion order by 2 desc limit 8`);
const LIN = sql(`select 'Línea '||l.linea||' · '||l.tren as rotulo, sum(r.und)::int as valor
  from public.rotlinea_registro r join public.rotlinea_lineas l on l.linea=r.linea
  group by 1 order by 2 desc`);
const DIA = sql(`select fecha::text, sum(und)::int as valor
  from public.rotlinea_registro group by fecha order by fecha`);
const TOT = MAQ.reduce((a,x)=>a+x.valor,0);
const f = (n) => Math.round(n).toLocaleString("es-CO");

const barras = (d, max) => `<div class="rl-barras">${d.slice(0,max).map(x=>{
  const tope = Math.max(...d.slice(0,max).map(y=>y.valor));
  const pct = x.valor*100/TOT;
  return `<div class="rl-barra"><span class="rl-barra-rot">${x.rotulo}</span>
<span class="rl-barra-pista"><i style="width:${Math.max(x.valor/tope*100,1.5)}%"></i></span>
<span class="rl-barra-val">${f(x.valor)}<i>${pct.toFixed(1)} %</i></span></div>`}).join("")}</div>`;

/* La serie, con la misma matemática del componente. */
const W=1000,H=220,P={arriba:14,abajo:26,izq:4,der:4};
const tope = Math.max(...DIA.map(p=>p.valor),1);
const prom = DIA.reduce((a,p)=>a+p.valor,0)/DIA.length;
const X = i => P.izq + i*(W-P.izq-P.der)/Math.max(DIA.length-1,1);
const Y = v => P.arriba + (1-v/tope)*(H-P.arriba-P.abajo);
const linea = DIA.map((p,i)=>`${i?"L":"M"}${X(i).toFixed(1)},${Y(p.valor).toFixed(1)}`).join("");
const area = `${linea}L${X(DIA.length-1).toFixed(1)},${H-P.abajo}L${X(0).toFixed(1)},${H-P.abajo}Z`;
const iMax = DIA.reduce((m,p,i)=>p.valor>DIA[m].valor?i:m,0);
const cada = Math.max(1, Math.ceil(DIA.length/8));
const dd = f2 => new Date(Date.parse(f2+"T12:00:00")).toLocaleDateString("es-CO",{day:"numeric",month:"short"});

const CUERPO = `
<div class="rl-periodo">
<div class="rl-atajos"><button class="on">Lo que va de 2026</button><button>Este mes</button>
<button>Últimos 30 días</button><button>Últimos 7 días</button><button>Todo 2025</button></div>
<div class="rl-fechas">
<label><span>Desde</span><input type="date" value="2026-01-01"></label>
<label><span>Hasta</span><input type="date" value="2026-09-13"></label>
<label><span>Línea</span><select><option>Todas las líneas</option></select></label></div></div>

<section class="rl-cabeza"><div>
<p class="rl-ojo">QUIEBRA · ROTURA DE LÍNEA · 1 ene a 13 sept</p>
<h1>Tablero</h1>
<p class="rl-sub">Todavía no hay producción cargada para este período, así que no hay contra qué
medir la rotura. Lo que se ve son <b>cantidades</b>; el porcentaje sale cuando entre el ZPREC de SAP.</p></div>
<div class="rl-panel"><div class="rl-corte"></div><div class="rl-rot">ROTAS EN EL PERÍODO</div>
<div class="rl-num">${f(TOT)}</div><div class="rl-pie">unidades · <b>349.212 kg</b></div></div></section>

<section class="rl-cifras">
<div class="rl-cifra"><div class="rl-c-rot">UNIDADES ROTAS</div><div class="rl-c-n">${f(TOT)}</div>
<div class="rl-c-u">349.212 kg de vidrio · ${DIA.length} días con registro</div></div>
<div class="rl-cifra"><div class="rl-c-rot">PROMEDIO AL DÍA</div><div class="rl-c-n">${f(TOT/DIA.length)}</div>
<div class="rl-c-u">unidades, solo contando los días que tienen registro</div></div>
<div class="rl-cifra ojo"><div class="rl-c-rot">TURNOS SIN FIRMAR</div><div class="rl-c-n">1.781</div>
<div class="rl-c-u">con <b>1.881.144</b> unidades que nadie ha dado por buenas</div></div>
<div class="rl-cifra ojo"><div class="rl-c-rot">SIN DAR DE BAJA</div><div class="rl-c-n">715</div>
<div class="rl-c-u">registros que todavía no han salido por SAP</div></div></section>

<section class="rl-tarj"><div class="rl-t-cab"><div>
<h2>¿Cuál máquina se come el envase?</h2>
<p>Unidades rotas por máquina en el período, de mayor a menor. Es la pregunta que se hace con
esto: no cuánto se rompió, sino <b>dónde</b>.</p></div>
<div class="rl-t-clave"><b>6</b><span>máquinas se comen la mitad de todo lo que se rompe</span></div></div>
${barras(MAQ,15)}
<p class="rl-t-pie">Las tres primeras suman <b>${f(MAQ.slice(0,3).reduce((a,x)=>a+x.valor,0))}</b>
unidades — <b>${(MAQ.slice(0,3).reduce((a,x)=>a+x.valor,0)*100/TOT).toFixed(1)} %</b> del total del
período. Ahí es donde una hora de mantenimiento rinde más que en las otras doce juntas.</p></section>

<section class="rl-tarj"><div class="rl-t-cab"><div><h2>Cómo viene, día por día</h2>
<p>Unidades rotas cada día del período, con el promedio marcado.</p></div></div>
<div class="rl-serie"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
${[0.25,0.5,0.75,1].map(k=>`<line x1="${P.izq}" x2="${W-P.der}" y1="${Y(tope*k)}" y2="${Y(tope*k)}" class="rl-g-rejilla"/>`).join("")}
<path d="${area}" class="rl-g-area"/><path d="${linea}" class="rl-g-linea"/>
<line x1="${P.izq}" x2="${W-P.der}" y1="${Y(prom)}" y2="${Y(prom)}" class="rl-g-prom"/>
<circle cx="${X(iMax)}" cy="${Y(DIA[iMax].valor)}" r="5" class="rl-g-pico"/></svg>
<div class="rl-serie-eje">${(()=>{const cl=new Set([0,Math.round(DIA.length/3),
  Math.round(DIA.length*2/3),DIA.length-1]);
  return DIA.map((p,i)=>(i%cada===0||i===DIA.length-1)
  ?`<span class="${cl.has(i)?"clave":""}" style="left:${X(i)/W*100}%">${dd(p.fecha)}</span>`:"").join("")})()}</div>
<p class="rl-serie-pie">Promedio del período <b>${f(prom)}</b> und al día · el día más alto fue
<b>${dd(DIA[iMax].fecha)}</b> con <b>${f(DIA[iMax].valor)}</b></p></div></section>

<div class="rl-dos">
<section class="rl-tarj"><div class="rl-t-cab"><div><h2>Por línea</h2>
<p>Cuál tren aporta más al total. Sin cruzar con su producción todavía.</p></div></div>
${barras(LIN,6)}</section>
<section class="rl-tarj"><div class="rl-t-cab"><div><h2>Por envase</h2>
<p>Cuál vidrio es el que se está yendo.</p></div></div>
${barras(ENV,8)}</section></div>`;

const pag = (t) => `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{padding:18px}${css}</style>
<div class="sh"${t==="oficial"?"":` data-tema="${t}"`}><div class="marco"><div class="rl">${CUERPO}</div></div></div>`;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malas = 0;
for (const [w,nom] of [[1440,"pc"],[820,"tab"],[390,"cel"],[360,"360"]]) {
  const p = await nav.newPage({ viewport:{width:w,height:1600}, deviceScaleFactor:2 });
  await p.setContent(pag("gris"),{waitUntil:"load"});
  const r = await p.evaluate(() => {
    const a = document.documentElement.clientWidth, fuera=[], mal=[];
    for (const el of document.querySelectorAll(".rl *")) {
      const b = el.getBoundingClientRect();
      if (b.width>0 && (b.right>a+.5||b.left<-.5)) fuera.push(el.className||el.tagName);
    }
    /* NINGUNA BARRA PUEDE SALIRSE DE SU PISTA. Es el error clásico de una
       gráfica hecha a mano: el porcentaje pasa de 100 y la barra se va. */
    for (const i of document.querySelectorAll(".rl-barra-pista i")) {
      const pista = i.parentElement.getBoundingClientRect(), barra = i.getBoundingClientRect();
      if (barra.width > pista.width + 0.5) mal.push("barra fuera de la pista");
      if (barra.width < 1) mal.push("barra invisible");
    }
    /* Y LOS RÓTULOS NO SE PUEDEN ENCIMAR EN EL EJE. */
    const ejes = [...document.querySelectorAll(".rl-serie-eje span")]
      .filter(s => getComputedStyle(s).display !== "none")
      .map(s => s.getBoundingClientRect());
    for (let k=1;k<ejes.length;k++) if (ejes[k].left < ejes[k-1].right + 2) mal.push("fechas encimadas");
    if (ejes.length < 2) mal.push("el eje se quedó sin fechas");
    return { scroll:document.documentElement.scrollWidth, ancho:a,
      barras: document.querySelectorAll(".rl-barra").length,
      fuera:[...new Set(fuera)].slice(0,4), mal:[...new Set(mal)] };
  });
  const problema = r.scroll>r.ancho+.5 || r.fuera.length || r.mal.length;
  if (problema) malas++;
  console.log(`${nom.padEnd(4)} ${String(w).padStart(5)}px  ${problema?"MAL":"bien"}   barras: ${r.barras}`);
  if (r.fuera.length) console.log("      DESBORDA:", r.fuera.join(" | "));
  if (r.mal.length)   console.log("      GRÁFICA:", r.mal.join(" | "));
  await p.screenshot({ path:`.arnes/rlt-${nom}.png`, fullPage:true });
  await p.close();
}

/* EL CONTRASTE DE LO QUE SE DIBUJA, en los siete temas. */
const lum=c=>{const[r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});
  return .2126*r+.7152*g+.0722*b};
const leer=s=>{const m=s.match(/[\d.]+/g).slice(0,3).map(Number);
  return s.startsWith("color(")?m.map(v=>v*255):m};
const raz=(a,b)=>{const L1=lum(leer(a)),L2=lum(leer(b));
  return (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)};
const p2 = await nav.newPage({ viewport:{width:1200,height:900} });
for (const t of TEMAS) {
  await p2.setContent(pag(t),{waitUntil:"load"});
  const c = await p2.evaluate(() => {
    const g=(s,p)=>getComputedStyle(document.querySelector(s))[p];
    return {
      barra: [g(".rl-barra-pista i","backgroundColor"), g(".rl-barra-pista","backgroundColor")],
      barraPapel: [g(".rl-barra-pista i","backgroundColor"), g(".rl-tarj","backgroundColor")],
      linea: [g(".rl-g-linea","stroke"), g(".rl-tarj","backgroundColor")],
      valor: [g(".rl-barra-val","color"), g(".rl-tarj","backgroundColor")],
      rotulo:[g(".rl-barra-rot","color"), g(".rl-tarj","backgroundColor")],
      clave: [g(".rl-t-clave b","color"), g(".rl-t-clave","backgroundColor")],
      cifra: [g(".rl-c-n","color"), g(".rl-cifra","backgroundColor")],
    };
  });
  /* La barra contra su pista es una separación de marcas, no texto: le
     basta 3. El texto va contra 4.5. */
  /* UNA MARCA NO ES TEXTO: le basta 3 contra lo que tiene detrás. El
     texto va contra 4.5, que es lo que exige leerlo. */
  const min = k => k.startsWith("barra") || k==="linea" ? 3 : 4.5;
  const filas = Object.entries(c).map(([k,[a,b]])=>[k,raz(a,b),min(k)]);
  const bad = filas.filter(([,r,m])=>r<m);
  if (bad.length) malas++;
  console.log(`${t.padEnd(8)} ${filas.map(([k,r])=>`${k}=${r.toFixed(1)}`).join("  ")}  ${bad.length?"MAL":"bien"}`);
  if (bad.length) console.log("        bajo el mínimo:", bad.map(([k,r,m])=>`${k} ${r.toFixed(1)}<${m}`).join(", "));
}
await p2.close(); await nav.close();
console.log(malas ? `\n${malas} problema(s)` : "\ntodo limpio");
