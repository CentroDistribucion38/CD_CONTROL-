/* Deriva los 68 tokens de cada tema nuevo a partir de las ANCLAS del
   mockup. Los tres temas son escala de gris + ámbar + rojo, así que:
     - croma a 0 (gris puro), como en los mockups
     - la lightness NO se copia: se REMAPEA con una curva monótona que
       pasa por tus anclas. Copiarla dejaría, por ejemplo, el fondo de
       una tarjeta más oscuro que el de la página, porque tu #F1F1F1 es
       más oscuro que el #f4f7fb oficial pero #f2f5f9 no se movería.
       Con el remapeo se conserva el ORDEN y con él el contraste. */
import fs from 'fs';

const srgb=(v)=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
const lin=(v)=>v<=0.0031308?12.92*v:1.055*v**(1/2.4)-0.055;
function hex2ok(h){
  const n=parseInt(h.slice(1),16);
  const r=srgb(((n>>16)&255)/255), g=srgb(((n>>8)&255)/255), b=srgb((n&255)/255);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return { L:.2104542553*l+.7936177850*m-.0040720468*s,
           a:1.9779984951*l-2.4285922050*m+.4505937099*s,
           b:.0259040371*l+.7827717662*m-.8086757660*s };
}
const Lde=(h)=>hex2ok(h).L;
function gris(L){ // OKLab con a=b=0 -> gris puro
  const l=L**3, r=lin(l), c=Math.round(Math.min(1,Math.max(0,r))*255);
  return '#'+[c,c,c].map(x=>x.toString(16).padStart(2,'0')).join('');
}

/* La curva: pares (L oficial -> L nueva), ordenados. */
function curva(anclas){
  const p=[[0,0],...anclas.map(([o,n])=>[Lde(o),Lde(n)]).sort((x,y)=>x[0]-y[0]),[1,1]];
  return (L)=>{
    for(let i=0;i<p.length-1;i++){
      const [x0,y0]=p[i],[x1,y1]=p[i+1];
      if(L>=x0&&L<=x1) return x1===x0?y0:y0+(y1-y0)*(L-x0)/(x1-x0);
    }
    return L;
  };
}

const TEMAS = {
  negro: { tinta:'#0D0D0D', hueso:'#F1F1F1', azul:'#4D4D4D', velo:'13,13,13' },
  gris:  { tinta:'#141414', hueso:'#EDEDED', azul:'#575757', velo:'20,20,20' },
  halo:  { tinta:'#111111', hueso:'#F1F1F1', azul:'#4D4D4D', velo:'17,17,17' },
};

/* Los --c-XXXXXX del bloque :root oficial. */
const css=fs.readFileSync('src/app/globals.css','utf8');
const raiz=css.slice(css.indexOf('\n:root {'), css.indexOf('\n/* --- Tinta y ámbar'));
const toks=[...raiz.matchAll(/(--c-([0-9a-f]{6}))\s*:\s*(#[0-9a-f]{6})/g)].map(m=>({n:m[1],v:m[3]}));
console.log('tokens oficiales:', toks.length);

const salida={};
for (const [id,t] of Object.entries(TEMAS)) {
  const f = curva([
    [ '#f4f7fb', t.hueso ],   // fondo de la página
    [ '#eef1f5', t.hueso ],   // el hueso del cascarón
    [ '#d5dce5', '#D9D9D9' ], // línea
    [ '#5b6b7f', '#6B6B6B' ], // gris de texto
    [ '#0b4ea2', t.azul    ], // el azul
    [ '#04203f', t.tinta   ], // la tinta
  ]);
  salida[id] = toks.map(x=>({ n:x.n, v:gris(f(Lde(x.v))).toUpperCase(), viejo:x.v }));
}
fs.writeFileSync('.arnes/temas.json', JSON.stringify(salida,null,1));

/* Comprobación: el orden de claridad no se puede haber invertido. */
for (const [id,lista] of Object.entries(salida)) {
  const orden = [...toks.keys()].sort((a,b)=>Lde(toks[a].v)-Lde(toks[b].v));
  let malo=0;
  for(let i=1;i<orden.length;i++){
    const A=lista[orden[i-1]], B=lista[orden[i]];
    if (Lde(A.v) > Lde(B.v)+1e-9) malo++;
  }
  console.log(`${id}: inversiones de orden = ${malo}  | f4f7fb->${lista.find(x=>x.n==='--c-f4f7fb').v} 04203f->${lista.find(x=>x.n==='--c-04203f').v} 5b6b7f->${lista.find(x=>x.n==='--c-5b6b7f').v} d5dce5->${lista.find(x=>x.n==='--c-d5dce5').v}`);
}
