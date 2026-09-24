import fs from 'fs';
const P='src/app/globals.css';
let css = fs.readFileSync(P,'utf8');
const bloques = fs.readFileSync('.arnes/bloques.css','utf8');

/* 1) Los tres bloques de paleta, justo antes del body:has(...) */
const marca1 = `/* El fondo del body, por el rebote del celular:`;
if (!css.includes('[data-tema="negro"]')) {
  css = css.replace(marca1, bloques + '\n\n' + marca1);
}

/* 2) El fondo del body */
css = css.replace(
  `body:has(.sh[data-tema="ambar"])   { background: #f7f7f3 }`,
  `body:has(.sh[data-tema="ambar"])   { background: #f7f7f3 }
body:has(.sh[data-tema="negro"])   { background: #f1f1f1 }
body:has(.sh[data-tema="gris"])    { background: #ededed }
body:has(.sh[data-tema="halo"])    { background: #f1f1f1 }`);

/* 3) Los acentos de módulo. Estos tres temas tienen DOS colores y nada
      más —tu ámbar y tu rojo—, así que los cuatro módulos se reparten
      la rampa entre ellos en vez de inventar tonos de otro mundo. */
css = css.replace(
`[data-tema="ambar"] {
  --c-mod-quiebra: #f72735;      --c-mod-quiebra-txt: #fff;
  --c-mod-sider: #f97d25;        --c-mod-sider-txt: #23262c;
  --c-mod-admin: #fcc231;        --c-mod-admin-txt: #23262c;
  --c-mod-inventario: #c6df32;   --c-mod-inventario-txt: #23262c;
}`,
`[data-tema="ambar"] {
  --c-mod-quiebra: #f72735;      --c-mod-quiebra-txt: #fff;
  --c-mod-sider: #f97d25;        --c-mod-sider-txt: #23262c;
  --c-mod-admin: #fcc231;        --c-mod-admin-txt: #23262c;
  --c-mod-inventario: #c6df32;   --c-mod-inventario-txt: #23262c;
}
/* Negro, gris y halo tienen DOS colores y nada más: tu #FFC000 y tu
   #FF0000. En vez de traerles verdes y azules de otro mundo, los cuatro
   módulos se reparten la rampa entre esos dos. Siguen distinguiéndose
   uno de otro y ninguno se sale del tema. */
[data-tema="negro"], [data-tema="gris"], [data-tema="halo"] {
  --c-mod-quiebra: #ff0000;      --c-mod-quiebra-txt: #fff;
  --c-mod-sider: #ff6a00;        --c-mod-sider-txt: #fff;
  --c-mod-admin: #ff9800;        --c-mod-admin-txt: #171717;
  --c-mod-inventario: #ffc000;   --c-mod-inventario-txt: #171717;
}`);

/* 4) La barra de cada tema, tal cual la dibujaste. */
const barras = `

/* 1 · Negro y ámbar — negro plano y rayas diagonales muy finas en ámbar,
   el filo en ámbar. Tal cual el mockup. */
.sh[data-tema="negro"] {
  --sh-barra-fondo: #0D0D0D;
  --sh-filo: #FFC000;
  --sh-trama: repeating-linear-gradient(116deg, rgba(255,192,0,.10) 0 2px, transparent 2px 18px);
  --sh-trama-op: .35;
  --sh-trama-tapa: none;
}

/* 2 · Gris claro y ámbar — LA ÚNICA BARRA CLARA de la plataforma.
   Por eso este tema es el que más piezas mueve: el texto de la barra
   estaba en blanco en duro y sobre #D9D9D9 no se veía nada. Las cinco
   variables --sh-barra-* existen para esto.
   El riel de la izquierda SIGUE oscuro, como en tu mockup: la barra se
   aclara, la navegación no. */
.sh[data-tema="gris"] {
  --sh-barra-fondo: #D9D9D9;
  --sh-barra-borde: 1px solid #C4C4C4;
  --sh-filo: #FFC000;
  --sh-filo-alto: 4px;
  --sh-trama: radial-gradient(rgba(0,0,0,.10) 1.1px, transparent 1.2px);
  --sh-trama-medida: 16px 16px;
  --sh-trama-op: .5;
  --sh-trama-tapa: none;

  --sh-barra-txt:   #141414;
  --sh-barra-txt-2: #5E5E5E;
  --sh-barra-wm:    #7A7A7A;
  --sh-barra-sep:   #9A9A9A;
  --sh-barra-filo:  #BFBFBF;
  --sh-avatar-filo: #D9D9D9;
}

/* 3 · Negro con halo ámbar y rojo — negro puro con dos resplandores, sin
   trama, y el filo en degradado de rojo a ámbar. */
.sh[data-tema="halo"] {
  --sh-barra-fondo:
    radial-gradient(520px 190px at 12% 130%, rgba(255,0,0,.30) 0%, transparent 70%),
    radial-gradient(700px 240px at 88% -30%, rgba(255,192,0,.35) 0%, transparent 72%),
    #000000;
  --sh-filo: linear-gradient(90deg, #FF0000 0%, #FFC000 100%);
  --sh-trama: none;
  --sh-trama-op: 0;
}`;
if (!css.includes('.sh[data-tema="negro"]')) {
  const i = css.indexOf('.sh[data-tema="ambar"] {');
  const j = css.indexOf('}', css.indexOf('#1B1D22;', i)) + 1;
  css = css.slice(0,j) + barras + css.slice(j);
}
fs.writeFileSync(P, css);
console.log('globals.css:', css.split('\n').length, 'líneas');
for (const t of ['negro','gris','halo'])
  console.log(t, 'paleta=', css.includes(`[data-tema="${t}"] {\n\n  /* Fondos`), 'barra=', css.includes(`.sh[data-tema="${t}"] {`), 'body=', css.includes(`body:has(.sh[data-tema="${t}"])`));
