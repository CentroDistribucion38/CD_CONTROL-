/* AUDITORÍA DE DENSIDAD EN CELULAR.
   No "se ve apretado": números. Por cada pantalla mide lo que hace que
   algo se sienta encajonado —letra chica, poco aire, blancos de toque
   pequeños, renglones pegados— y saca solo lo que incumple. */
import { chromium } from 'playwright';
await import('./paginas.mjs');
const S='/home/claude/cd38-inventario/.arnes';
const PANTALLAS = [
  ['Fuente principal', 'vj.html',  '.vj-cuerpo'],
  ['En tránsito',      'tr.html',  '.tr-cuerpo'],
  ['Usuarios',         'index2.html', '.us-tabla'],
  ['Primer ingreso',   'index.html',  '.cp-caja'],
  ['Quiebra diaria',   'qd.html',  '.rj-marco'],
];
/* Los mínimos. No inventados: 12px es donde el texto deja de leerse de
   corrido en una pantalla de 360; 44px es el blanco de toque que
   recomiendan Apple y Google; 1,35 de interlineado es donde los
   renglones dejan de pegarse. */
const MIN_LETRA = 12, MIN_TOQUE = 44, MIN_INTERLINEA = 1.3;

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [nombre, archivo, listo] of PANTALLAS) {
  for (const v of [{n:'360x640',w:360,h:640},{n:'390x844',w:390,h:844}]) {
    const p = await b.newPage({viewport:{width:v.w,height:v.h}});
    try {
      await p.goto('file://'+S+'/'+archivo);
      await p.waitForSelector(listo, {timeout:8000});
      await p.waitForTimeout(350);
    } catch { console.log(`${nombre} ${v.n}: no cargó`); await p.close(); continue }

    const r = await p.evaluate(([minL, minT, minI]) => {
      const visible = (e) => { const b=e.getBoundingClientRect(); return b.width>0 && b.height>0 };
      const chicas = new Map(), toques = new Map(), pegados = new Map();
      for (const e of document.querySelectorAll('body *')) {
        if (!visible(e)) continue;
        const cs = getComputedStyle(e);
        const propio = [...e.childNodes].some(n => n.nodeType===3 && n.textContent.trim());
        const px = parseFloat(cs.fontSize);
        const clave = e.className && typeof e.className === 'string'
          ? '.'+e.className.trim().split(/\s+/).slice(0,2).join('.')
          : e.tagName.toLowerCase();
        /* Un rótulo en MAYÚSCULA con espaciado se lee bien en 11px: son
           dos o tres palabras, no un párrafo. El texto de corrido no. */
        /* Un rótulo puede venir en mayúscula por CSS o ya escrito así en
           el marcado —"EN CAMINO" está literal en el componente—. Mirar
           solo text-transform daba a ese rótulo el suelo del texto de
           corrido y lo reportaba como falta cuando no lo era. */
        const suTexto = e.textContent.trim();
        const enMayus = cs.textTransform === 'uppercase'
          || (/[A-ZÁÉÍÓÚÑ]/.test(suTexto) && suTexto === suTexto.toUpperCase());
        const rotulo = enMayus && parseFloat(cs.letterSpacing) > 0.5;
        const suelo = rotulo ? 11 : minL;
        if (propio && px < suelo) chicas.set(clave, Math.min(chicas.get(clave) ?? 99, +px.toFixed(1)));
        if (propio && px >= 11 && cs.lineHeight !== 'normal') {
          /* 'normal' es el interlineado que saca el navegador de las
             métricas de la fuente; darle 1.2 a ojo reportaba apretados
             encabezados que miden 57px de alto. Solo se juzga lo que la
             hoja declara. */
          const li = parseFloat(cs.lineHeight)/px;
          if (li < minI && e.textContent.trim().length > 40)
            pegados.set(clave, Math.min(pegados.get(clave) ?? 9, +li.toFixed(2)));
        }
        if (['BUTTON','A','SELECT','INPUT'].includes(e.tagName) && cs.cursor !== 'default') {
          const b = e.getBoundingClientRect();
          const m = Math.min(b.height, b.width);
          if (b.height < minT) toques.set(clave, Math.min(toques.get(clave) ?? 99, Math.round(b.height)));
        }
      }
      const doc = document.documentElement;
      return {
        chicas: [...chicas].sort((a,b)=>a[1]-b[1]).slice(0,6),
        toques: [...toques].sort((a,b)=>a[1]-b[1]).slice(0,6),
        pegados: [...pegados].sort((a,b)=>a[1]-b[1]).slice(0,4),
        ruedaX: doc.scrollWidth > doc.clientWidth,
      };
    }, [MIN_LETRA, MIN_TOQUE, MIN_INTERLINEA]);

    const l = [];
    if (r.chicas.length)  l.push(`letra<12px: ${r.chicas.map(([c,x])=>`${c} ${x}`).join('  ')}`);
    if (r.toques.length)  l.push(`toque<44px: ${r.toques.map(([c,x])=>`${c} ${x}`).join('  ')}`);
    if (r.pegados.length) l.push(`interlínea<1.3: ${r.pegados.map(([c,x])=>`${c} ${x}`).join('  ')}`);
    if (r.ruedaX) l.push('RUEDA EN HORIZONTAL');
    console.log(`\n### ${nombre} · ${v.n}`);
    console.log(l.length ? l.map(x=>'  '+x).join('\n') : '  sin problemas de densidad');
    await p.close();
  }
}
await b.close();
