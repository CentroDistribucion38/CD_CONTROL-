/* La pantalla de rotura de línea, medida en los cuatro anchos y en los
   siete temas. Los colores salen de los tokens del tema, así que hay
   que comprobar que el texto sobre el acento se lea en TODOS — el acento
   es rojo en unos y ámbar en otros. */
import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/quiebra/rotura/rotura.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const TEMAS = ["oficial","tinta","pizarra","ambar","negro","gris","halo"];

const MAQS = [[9,"DESEMPACADORA"],[1,"DESEMPACADORA - LAVADORA"],[12,"LAVADORA"],
  [6,"SALIDA DE LAVADORA"],[2,"LAVADORA - LLENADORA"],[8,"OMNIVISION"],
  [11,"ENVASADORA"],[3,"LLENADORA - PASTEURITZADOR"],[13,"PASTEURIZADORA"],
  [4,"PASTEURIZADORA - ETIQUETADORA"],[7,"ETIQUETADORA"],[5,"ETIQUETADORA - EMPACADORA"],
  [10,"EMPACADORA"],[66,"CARGADOR"],[155,"PALE-DEPA"]];
const KG = {9:31,1:25,6:14,13:39,2:22};
const und = (k) => k ? Math.ceil(k/0.177) : 0;
const tot = Object.values(KG).reduce((a,b)=>a+b,0);
const totU = Object.values(KG).reduce((a,b)=>a+und(b),0);

const CUERPO = `
<div class="rl-dias">
<button><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
<label class="rl-fecha"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><span>lunes, 14 de septiembre</span></label>
<button><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
<button class="rl-hoy on">HOY</button></div>

<section class="rl-cabeza"><div>
<p class="rl-ojo">QUIEBRA · ROTURA DE LÍNEA · CD38 AG01</p>
<h1>Rotura de línea</h1>
<p class="rl-sub">El envase que se rompe mientras se envasa, máquina por máquina. Se pesa la
canastilla y se digita el kilo: <b>las unidades salen solas</b>, dividiendo por el peso de ese envase.</p></div>
<div class="rl-panel"><div class="rl-corte"></div><div class="rl-rot">ROTAS HOY</div>
<div class="rl-num">4.812</div><div class="rl-pie">unidades · <b>892 kg</b> · 6 pesadas</div></div>
</section>

<div class="rl-marco">
<div class="rl-rejilla">
<div class="rl-escoger">
<div class="rl-campo"><span class="rl-rot">Línea</span><div class="rl-seg">
<button class="on">1</button><button>2</button><button>4</button><button>6</button></div></div>
<div class="rl-campo"><span class="rl-rot">Turno</span><div class="rl-seg">
<button class="on">1</button><button>2</button><button>3</button></div></div>
<div class="rl-campo rl-ancho"><span class="rl-rot">Envase</span>
<div class="rl-sel"><button class="rl-disparo"><span class="rl-puesto"><b>Envase Costeñita 175R</b><i>3500005 · 0.177 kg</i></span>
<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></div></div>
</div>

<div class="rl-tomas"><span class="rl-rot">Ya lleva</span>
<button class="rl-toma"><b>Pesada 1</b><span>619 und · 109 kg</span></button>
<button class="rl-toma baja" disabled><b>Pesada 2</b><span>412 und · 73 kg</span><i>dada de baja</i></button>
<span class="rl-suma">Total del turno: <b>1.031</b> unidades</span></div>

<div class="rl-tabla-env"><table class="rl-tabla">
<thead><tr><th>Máquina</th><th class="cen">Kilos</th><th class="cen">Unidades</th></tr></thead>
<tbody>${MAQS.map(([it,n])=>`<tr class="${KG[it]?"con":""}">
<td class="rl-maq"><span class="rl-item">${it}</span>${n}</td>
<td class="cen"><input type="number" value="${KG[it]??""}" placeholder="0"></td>
<td class="cen rl-und">${KG[it]?und(KG[it]).toLocaleString("es-CO"):"—"}</td></tr>`).join("")}</tbody>
<tfoot><tr><td>TOTAL DE LA PESADA</td><td class="cen">${tot}</td><td class="cen">${totU.toLocaleString("es-CO")}</td></tr></tfoot>
</table></div>

<div class="rl-pie"><button class="rl-btn si">Guardar la pesada 3</button>
<span class="rl-nota">Peso del envase: <b>0.177 kg</b> por botella. Guardar <b>agrega</b> una pesada; no borra las anteriores.</span></div>
</div>

<aside class="rl-lado">
<div class="rl-caja"><div class="rl-cab"><h2>El día, por línea</h2></div>
${[[1,2140,100],[2,1380,64],[4,892,42],[6,400,19]].map(([l,n,p])=>
`<div class="rl-fila-linea"><span class="rl-etq">Línea ${l}</span>
<span class="rl-pista"><i style="width:${p}%"></i></span><span class="rl-v">${n.toLocaleString("es-CO")}</span></div>`).join("")}</div>
<div class="rl-caja ojo"><div class="rl-cab"><h2>Sin dar de baja</h2></div>
<div class="rl-grande">3</div>
<p class="rl-explica">pesadas de este día que todavía no han salido por SAP. Mientras no salgan,
el material sigue contando en el inventario.</p></div>
</aside></div>`;

const pag = (t) => `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{padding:18px}${css}</style>
<div class="sh"${t==="oficial"?"":` data-tema="${t}"`}><div class="marco"><div class="rl">${CUERPO}</div></div></div>`;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malas = 0;
for (const [w,nom] of [[1440,"pc"],[820,"tab"],[390,"cel"],[360,"360"]]) {
  const p = await nav.newPage({ viewport:{width:w,height:1400}, deviceScaleFactor:2 });
  await p.setContent(pag("gris"),{waitUntil:"load"});
  const r = await p.evaluate(() => {
    const a = document.documentElement.clientWidth, fuera=[], chicos=[];
    const recortado = (el) => { for (let q=el.parentElement;q;q=q.parentElement){
      const s=getComputedStyle(q); if(s.overflowX!=="visible"||s.overflowY!=="visible") return true } return false };
    for (const el of document.querySelectorAll(".rl *")) {
      const b = el.getBoundingClientRect();
      if (b.width>0 && (b.right>a+.5||b.left<-.5) && !recortado(el)) fuera.push(el.className||el.tagName);
      if ((el.tagName==="BUTTON"||el.tagName==="INPUT") && b.height>0 && b.height<34)
        chicos.push((el.className||el.tagName)+" h="+Math.round(b.height));
      /* Y LA PALABRA TIENE QUE CABER. Un botón más angosto que su propio
         texto se ve cortado sin que ninguna medida de alto lo note: es
         justo lo que le pasó a HOY por heredar un ancho fijo. */
      if (el.tagName==="BUTTON" && (el.textContent||"").trim().length>2
          && el.scrollWidth > Math.ceil(b.width)+1)
        chicos.push((el.className||"btn")+" texto cortado "+Math.round(b.width)+"<"+el.scrollWidth);
    }
    return { scroll:document.documentElement.scrollWidth, ancho:a,
      cols:getComputedStyle(document.querySelector(".rl-marco")).gridTemplateColumns,
      fuera:[...new Set(fuera)].slice(0,4), chicos:[...new Set(chicos)].slice(0,4) };
  });
  const mal = r.scroll>r.ancho+.5 || r.fuera.length || r.chicos.length;
  if (mal) malas++;
  console.log(`${nom.padEnd(4)} ${String(w).padStart(5)}px  ${mal?"MAL":"bien"}   columnas: ${r.cols}`);
  if (r.fuera.length)  console.log("      DESBORDA:", r.fuera.join(" | "));
  if (r.chicos.length) console.log("      CHICOS:", r.chicos.join(" | "));
  await p.screenshot({ path:`.arnes/rl-${nom}.png`, fullPage:true });
  await p.close();
}

/* EL CONTRASTE DEL PANEL Y DEL TOTAL, en los siete temas. */
const lum = (c)=>{const[r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});
  return .2126*r+.7152*g+.0722*b};
const leer = (s)=>{const m=s.match(/[\d.]+/g).slice(0,3).map(Number);
  return s.startsWith("color(")?m.map(v=>v*255):m};
const razon = (a,b)=>{const L1=lum(leer(a)),L2=lum(leer(b));
  return (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)};
const p2 = await nav.newPage({ viewport:{width:1200,height:900} });
for (const t of TEMAS) {
  await p2.setContent(pag(t),{waitUntil:"load"});
  const c = await p2.evaluate(() => {
    const g = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    return {
      num:  [g(".rl-num","color"),  g(".rl-panel","backgroundColor")],
      pie:  [g(".rl-pie","color"),  g(".rl-panel","backgroundColor")],
      tot:  [g(".rl-tabla tfoot td","color"), g(".rl-tabla tfoot td","backgroundColor")],
      rot:  [g(".rl-tabla tfoot td:first-child","color"), g(".rl-tabla tfoot td","backgroundColor")],
      btn:  [g(".rl-btn.si","color"), g(".rl-btn.si","backgroundColor")],
      seg:  [g(".rl-seg button.on","color"), g(".rl-seg button.on","backgroundColor")],
    };
  });
  const filas = Object.entries(c).map(([k,[a,b]]) => [k, razon(a,b)]);
  const mal = filas.filter(([,r]) => r < 4.5);
  if (mal.length) malas++;
  console.log(`${t.padEnd(8)} ${filas.map(([k,r])=>`${k}=${r.toFixed(1)}`).join("  ")}  ${mal.length?"MAL":"bien"}`);
}
await p2.close(); await nav.close();
console.log(malas ? `\n${malas} problema(s)` : "\ntodo limpio");
