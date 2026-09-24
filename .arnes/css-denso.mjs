/* AUDITORÍA DE DENSIDAD SOBRE LAS HOJAS ENTERAS.
   Hidratar dieciséis pantallas cuesta dieciséis arneses. Esto lee el
   CSS y encuentra lo mismo en todas de una: letra por debajo del suelo
   y blancos de toque cortos, y —lo que importa— si la regla del celular
   los corrige o no.
   No reemplaza medir en el navegador: encuentra lo DECLARADO, que es
   donde va el arreglo. Lo heredado se mide aparte. */
import fs from 'fs';
import path from 'path';

const HOJAS = ['src/app/globals.css','src/app/login/acceso.css','src/app/(app)/shell.css',
  'src/app/(app)/quiebra/quiebra.css','src/app/(app)/quiebra/diario/diario.css',
  'src/app/(app)/sider/sider.css','src/app/(app)/admin/roles/roles.css',
  'src/app/(app)/admin/usuarios/usuarios.css','src/app/(app)/perfil/perfil.css'];

const SUELO_LETRA = 12;      // texto de corrido
const SUELO_ROTULO = 11;     // MAYÚSCULA con espaciado: dos palabras, no un párrafo
const SUELO_TOQUE = 44;      // lo que pide un dedo con guante

/* Parte la hoja en reglas, sabiendo dentro de qué media query está.
   Va carácter por carácter con una pila de bloques abiertos. La versión
   anterior buscaba la siguiente '{' desde donde terminó la regla previa,
   y al salir de un @media se comía la '}' de cierre dentro del selector
   siguiente ("} .rl-manda"), además de perder la pila: las reglas que yo
   mismo había metido dentro de @media (max-width:700px) salían contadas
   como si fueran de escritorio. De ahí que la auditoría bajara de 140 a
   129 reportando MIS valores nuevos. */
function reglas(css) {
  const out = [];
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
  const pila = [];              // condiciones (@media/@supports) abiertas
  let i = 0, ini = 0;
  while (i < limpio.length) {
    const c = limpio[i];
    if (c === ';') { i++; ini = i; continue }        // @import, @layer a,b;
    if (c === '}') { pila.pop(); i++; ini = i; continue }
    if (c !== '{') { i++; continue }
    const sel = limpio.slice(ini, i).trim();
    if (sel.startsWith('@')) {
      /* Contenedor: sus hijos son reglas de verdad y heredan la condición. */
      if (/^@(media|supports|container|layer)\b/.test(sel)) {
        pila.push(sel); i++; ini = i; continue;
      }
      i = cierre(limpio, i) + 1; ini = i; continue;  // @theme, @keyframes…
    }
    const fin = cierre(limpio, i);                   // aguanta anidamiento
    out.push({
      sel,
      cuerpo: css.slice(i + 1, fin),
      media: pila.filter(p => /^@(media|supports)\b/.test(p)).join(' '),
    });
    i = fin + 1; ini = i;
  }
  return out;
}
function cierre(s, desde) {
  let n = 1, i = desde + 1;
  while (i < s.length && n > 0) { if (s[i] === '{') n++; else if (s[i] === '}') n--; i++ }
  return i - 1;
}

const INTERACTIVO = /button|input|select|textarea|\ba\b|\.btn|\.chip|-mini|-ojo|-btn|\[role="?button/i;
/* Un svg de 17px dentro de un botón de 44 no es un blanco de toque
   corto: es el DIBUJO del botón. Subirlo a 44 lo estira. Estos se
   cuentan aparte —el que tiene que medir 44 es el padre, y eso se
   revisa a mano una vez, no en cada corrida—. */
const DIBUJO = /::(after|before)|svg$|\bi$|\.ic$|\.tic$|(?:button|\ba\b)\s+\S+$/;
/* Casillas que NO son el blanco de toque, porque el blanco es la
   etiqueta que las envuelve:
     · td.tic input  — lleva pointer-events:none, se toca la fila.
     · .pf-switch input — es la pastilla 44x26 del interruptor; el
       <label> .pf-switch, con 15px de relleno arriba y abajo, ya pasa
       de 44. Estirarla a 44 la deja redonda y descuadra la perilla. */
const NO_ES_BLANCO = /td\.tic input|\.pf-switch input/;
let total = 0, dibujos = 0;
for (const H of HOJAS) {
  const css = fs.readFileSync(H, 'utf8');
  const rs = reglas(css);
  /* Qué selectores tienen ya una regla dentro de un @media de celular. */
  const arreglados = new Set(rs.filter(r => /max-width:\s*(\d+)px/.test(r.media)
      && Number(r.media.match(/max-width:\s*(\d+)px/)[1]) <= 900)
    .map(r => r.sel.replace(/\s+/g,' ')));
  const malos = [];
  for (const r of rs) {
    if (/max-width:\s*(\d+)px/.test(r.media)) continue;          // ya es regla de celular
    const clave = r.sel.replace(/\s+/g,' ');
    const mayus = /text-transform:\s*uppercase/.test(r.cuerpo)
               && /letter-spacing:\s*\.?\d/.test(r.cuerpo);
    const suelo = mayus ? SUELO_ROTULO : SUELO_LETRA;
    const f = r.cuerpo.match(/font(?:-size)?:\s*(?:[^;]*?\s)?(\d+(?:\.\d+)?)px/);
    if (f && Number(f[1]) < suelo && !arreglados.has(clave))
      malos.push(`letra ${f[1]}px  ${clave}`);
    if (INTERACTIVO.test(r.sel)) {
      const h = r.cuerpo.match(/(?:^|;)\s*(?:min-)?height:\s*(\d+)px/);
      if (h && Number(h[1]) < SUELO_TOQUE && !arreglados.has(clave)) {
        if (DIBUJO.test(clave) || NO_ES_BLANCO.test(clave)) dibujos++;
        else malos.push(`toque ${h[1]}px  ${clave}`);
      }
    }
  }
  if (malos.length) {
    console.log(`\n### ${path.basename(path.dirname(H))}/${path.basename(H)}  (${malos.length})`);
    for (const m of malos.slice(0, 14)) console.log('  ' + m);
    if (malos.length > 14) console.log(`  … y ${malos.length - 14} más`);
    total += malos.length;
  }
}
console.log(`\nTOTAL sin corregir para celular: ${total}`);
console.log(`(${dibujos} dibujos dentro de un botón, no cuentan: el padre es el blanco)`);
