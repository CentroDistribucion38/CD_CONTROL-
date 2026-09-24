import fs from 'fs';
import { paginaCon } from './hojas.mjs';
const S='/home/claude/cd38-inventario/.arnes';
// globals (tokens de tema), shell.css (la puerta), roles.css, usuarios.css
fs.writeFileSync(S+'/index.html', paginaCon(
  ['--c-marca:','.cp-caja'],
  `<div id="w" class="sh flex min-h-screen flex-col"><div id="r"></div></div><script src="file://${S}/app.js"></script>`));
fs.writeFileSync(S+'/index2.html', paginaCon(
  ['--c-marca:','--rl-titulo:','us-modulos'],
  `<div id="w" class="sh flex min-h-screen flex-col"><main id="m"><div id="r"></div></main></div><script src="file://${S}/app2.js"></script>`,
  `#m{padding:26px 30px;overflow:auto;height:100dvh;box-sizing:border-box}`));
console.log('hojas de index.html / index2.html resueltas por contenido ✓');
