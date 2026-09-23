/* Elige los chunks de CSS por lo que CONTIENEN, no por su hash: el hash
   cambia en cada build y un <link> a un archivo borrado no da error
   visible — deja todos los tokens sin definir y las medidas mienten.

   SE CARGAN TODOS LOS QUE LA CONTENGAN, no exactamente uno.

   La primera versión exigía que la huella estuviera en UN solo chunk y
   reventaba si aparecía en dos. Y aparecer en dos es lo NORMAL: Next
   parte una hoja en varios trozos cuando la misma pantalla se pide
   desde rutas distintas, y el navegador se los pone todos. Exigiendo
   uno, el arnés se caía por algo que en la pantalla de verdad funciona.

   Cuando esto pasó, once arneses murieron de golpe —arriba, cabe,
   denso, foto, full7, gen, páginas, tabla-cel, obs-mide, qd-mide,
   quien-rot— y ninguno tenía nada que ver con el otro: todos pasaban
   por aquí. Un helper que se cae se lleva a sus once.

   LO QUE SÍ ES UN ERROR es que no esté en NINGUNO: eso significa que el
   build no tiene esa hoja, y entonces todo lo que se mida a partir de
   ahí son tokens sin definir y medidas inventadas. Eso sigue reventando
   —y con el nombre de la huella, para no tener que buscarla—. */
import fs from 'fs';
const D='/home/claude/cd38-inventario/.next/static/css';
export function hojas(huellas) {
  const files = fs.readdirSync(D).filter(f=>f.endsWith('.css'));
  const out=[];
  for (const h of huellas) {
    const m = files.filter(f=>fs.readFileSync(`${D}/${f}`,'utf8').includes(h));
    if (!m.length) throw new Error(
      `huella "${h}" no está en ningún chunk de ${D}. ` +
      `¿Se corrió "npx next build" después del último cambio?`);
    /* En el orden en que los da el sistema de archivos, que es estable
       dentro de un build. Los dos trozos de una misma hoja no se pisan:
       son partes distintas de lo mismo. */
    for (const f of m) if (!out.includes(f)) out.push(f);
  }
  return out.map(f=>`${D}/${f}`);
}
export function paginaCon(huellas, cuerpo, extra='') {
  const links = hojas(huellas).map(f=>`<link rel="stylesheet" href="file://${f}">`).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${links}
<style>.flex{display:flex}.min-h-screen{min-height:100vh}.flex-col{flex-direction:column}
html,body{margin:0}${extra}</style></head><body>${cuerpo}</body></html>`;
}
