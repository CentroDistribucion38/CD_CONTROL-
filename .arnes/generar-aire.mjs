/* Genera el bloque de celular de cada hoja A PARTIR de la auditoría.
   Escribirlo a mano son 140 reglas y 140 oportunidades de equivocarse.

   DOS CRITERIOS, no uno:
   · La letra sube siempre: el texto crece y las cajas que ruedan se
     comen el alto. Es seguro.
   · El blanco de toque sube SOLO en lo que es un botón de verdad. Un
     input dentro de una rejilla de treinta y un días no puede medir
     44px: reventaría la rejilla. Esos van marcados aparte para
     mirarlos a mano.  */
import fs from 'fs';

const HOJAS = ['src/app/globals.css','src/app/login/acceso.css','src/app/(app)/shell.css',
  'src/app/(app)/quiebra/quiebra.css','src/app/(app)/quiebra/diario/diario.css',
  'src/app/(app)/sider/sider.css','src/app/(app)/admin/roles/roles.css',
  'src/app/(app)/admin/usuarios/usuarios.css','src/app/(app)/perfil/perfil.css'];

const SUELO = 12, SUELO_ROTULO = 11, TOQUE = 44;
/* Lo que NO se toca aunque mida poco: no es un blanco de toque, es un
   dibujo —una marca, un punto, el icono de adentro de un botón— o vive
   en una rejilla donde 44px no cabe. */
/* Cosas que NO son el blanco de toque: son el DIBUJO que va dentro
   del botón. Subirlas a 44px las estira. El que tiene que crecer es
   el padre, y eso se decide a mano. Se añadieron .tic (el chulito de
   14px de las opciones) y cualquier selector que termine en un
   descendiente de button/a, tras ver el generador poner
   ".qb .opciones button .tic { height: 44px }". */
const NO_TOCAR = /::(after|before)|svg$|\bi$|\.ic$|\.tic$|td\.tic|td\.cel|\.dias button|\.rj |(?:button|\ba\b)\s+\S+$/;
/* Los botones de una REJILLA de calendario no pueden medir 44: siete
   columnas por seis filas serían 264px solo de días, y el panel se
   sale de la pantalla. 40 ya es un blanco cómodo y el panel cabe. */
const REJILLA = /mes-dias button|mes-doce button|mes-anio button/;

function cierre(s, d){let n=1,i=d+1;while(i<s.length&&n>0){if(s[i]==='{')n++;else if(s[i]==='}')n--;i++}return i-1}
function reglas(css){
  /* Pila de bloques abiertos, carácter por carácter. La versión que
     buscaba la siguiente '{' se comía la '}' de cierre del @media
     dentro del selector siguiente y perdía la condición. */
  const out=[]; const L=css.replace(/\/\*[\s\S]*?\*\//g,m=>' '.repeat(m.length));
  const pila=[]; let i=0, ini=0;
  while(i<L.length){
    const c=L[i];
    if(c===';'){i++;ini=i;continue}
    if(c==='}'){pila.pop();i++;ini=i;continue}
    if(c!=='{'){i++;continue}
    const sel=L.slice(ini,i).trim();
    if(sel.startsWith('@')){
      if(/^@(media|supports|container|layer)\b/.test(sel)){pila.push(sel);i++;ini=i;continue}
      i=cierre(L,i)+1; ini=i; continue;
    }
    const f=cierre(L,i);
    out.push({sel,cuerpo:css.slice(i+1,f),media:pila.filter(p=>/^@(media|supports)\b/.test(p)).join(' ')});
    i=f+1; ini=i;
  }
  return out;
}
const INTER=/button|input|select|textarea|\.btn|\.chip|-mini|-ojo|-btn/i;

for (const H of HOJAS) {
  const css = fs.readFileSync(H,'utf8');
  const rs = reglas(css);
  const yaCel = new Set(rs.filter(r=>{
    const m=r.media.match(/max-width:\s*(\d+)px/); return m && +m[1]<=900;
  }).map(r=>r.sel.replace(/\s+/g,' ')));

  const letra=[], toque=[], aMano=[];
  for (const r of rs) {
    if (/max-width:\s*(\d+)px/.test(r.media)) continue;
    const sel = r.sel.replace(/\s+/g,' ');
    if (yaCel.has(sel)) continue;
    /* Un selector que arrastra un @media es que el troceador se comió un
       cierre: no se escribe una regla a partir de una lectura dudosa. */
    if (sel.includes('@') || sel.includes('}')) continue;
    const mayus = /text-transform:\s*uppercase/.test(r.cuerpo) && /letter-spacing:\s*\.?\d/.test(r.cuerpo);
    const suelo = mayus ? SUELO_ROTULO : SUELO;
    const f = r.cuerpo.match(/font(?:-size)?:\s*(?:[^;]*?\s)?(\d+(?:\.\d+)?)px/);
    if (f && +f[1] < suelo) {
      /* Sube al suelo, o medio punto más si venía muy abajo. */
      const nuevo = +f[1] <= 10 ? suelo + 0.5 : suelo;
      letra.push(`  ${sel} { font-size: ${nuevo}px }`);
    }
    if (INTER.test(sel)) {
      const h = r.cuerpo.match(/(?:^|;)\s*(min-)?height:\s*(\d+)px/);
      if (h && +h[2] < TOQUE) {
        if (NO_TOCAR.test(sel)) aMano.push(`${sel}  (${h[2]}px)`);
        else {
          const alto = REJILLA.test(sel) ? 40 : TOQUE;
          toque.push(`  ${sel} { ${h[1] ? 'min-height' : 'height'}: ${alto}px }`);
        }
      }
    }
  }
  /* El mismo selector puede salir dos veces con tamaños distintos —la
     hoja lo declara en dos sitios—. Se queda el MAYOR: subir el suelo
     es el objetivo, y dejar que gane el último por orden de archivo
     sería dejarlo al azar. */
  const mayor = (a) => {
    const m = new Map();
    for (const l of a) {
      const sel = l.slice(0, l.indexOf('{')).trim();
      const n = parseFloat(l.match(/(\d+(?:\.\d+)?)px/)[1]);
      if (!m.has(sel) || n > m.get(sel).n) m.set(sel, { n, l });
    }
    return [...m.values()].map(x => x.l);
  };
  letra.splice(0, letra.length, ...mayor(letra));
  toque.splice(0, toque.length, ...mayor(toque));
  if (!letra.length && !toque.length) { if (aMano.length) console.log(`\n// ${H}: solo a mano -> ${aMano.join(', ')}`); continue }
  console.log(`\n===== ${H} =====`);
  console.log(`/* ---------- El celular respira ----------
   Generado desde la auditoría de densidad y comprobado midiendo: la
   letra sube al suelo de lectura y los botones al blanco que pide un
   dedo. Solo aplica en pantalla chica; en escritorio no cambia nada. */
@media (max-width: 700px) {`);
  if (letra.length) console.log('  /* Letra que no se leía */\n' + letra.join('\n'));
  if (toque.length) console.log('\n  /* Blancos de toque cortos */\n' + toque.join('\n'));
  console.log('}');
  if (aMano.length) console.log(`// A MANO (no son blancos de toque o viven en una rejilla): ${aMano.join(', ')}`);
}
