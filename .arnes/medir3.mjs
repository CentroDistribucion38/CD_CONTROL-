import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const lum=(c)=>{const[r,g,bl]=c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*bl};
const rel=(a,bb)=>{const L1=lum(a),L2=lum(bb);return +((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2)};
// fondo efectivo: sube el árbol hasta encontrar un color opaco
const fondoEfectivo = `(el)=>{let n=el;while(n){const bg=getComputedStyle(n).backgroundColor;if(bg&&!/rgba\\(0, 0, 0, 0\\)|transparent/.test(bg))return bg;n=n.parentElement}return 'rgb(255,255,255)'}`;

for (const t of [null,'tinta','pizarra','ambar']) {
 for (const v of [{n:'pc',w:1440,h:900},{n:'tablet',w:834,h:1112},{n:'cel',w:360,h:640}]) {
  const p = await b.newPage({viewport:{width:v.w,height:v.h}});
  await p.goto('file://'+S+'/index2.html'); await p.waitForSelector('.us-tabla');
    /* GUARDIA: si los tokens no resuelven, las medidas mienten. */
    const tk = await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--c-5b6b7f"));
    if (!tk.trim()) throw new Error("los tokens --c-* no resolvieron: hoja de globals no cargada");
  if (t) await p.evaluate(x=>document.getElementById('w').setAttribute('data-tema',x), t);
  // abrir el formulario
  await p.click('.cab .btn'); await p.waitForTimeout(120);
  await p.fill('.us-campos .ancho input','Génesis Visbal'); await p.waitForTimeout(450);
  const m = await p.evaluate(new Function('return '+`(()=>{
    const fe = ${fondoEfectivo};
    const cs=(el,pr)=>getComputedStyle(el).getPropertyValue(pr);
    const par=(sel)=>{const el=document.querySelector(sel); if(!el) return null; return [cs(el,'color'), fe(el)]};
    const doc=document.documentElement;
    const marco=document.querySelector('.us-marco');
    const tabla=document.querySelector('.us-tabla');
    const chapa=document.querySelector('.us-chapa');
    const mods=document.querySelector('.us-modulos');
    const form=document.querySelector('.us-form').getBoundingClientRect();
    const btns=[...document.querySelectorAll('.us-niveles button')];
    const bmin=Math.min(...btns.map(x=>x.getBoundingClientRect().height));
    const wmin=Math.min(...btns.map(x=>x.getBoundingClientRect().width));
    const main=document.getElementById('m');
    return {
      pagRueda: doc.scrollHeight > doc.clientHeight,
      mainRueda: main.scrollHeight > main.clientHeight+1,
      tablaAncho: Math.round(tabla.scrollWidth), marcoAncho: Math.round(marco.clientWidth),
      marcoRueda: tabla.scrollWidth > marco.clientWidth+1,
      marcoRuedaY: marco.scrollHeight > marco.clientHeight+1,
      modsRuedaX: mods ? mods.scrollWidth > mods.clientWidth+1 : null,
      formAncho: Math.round(form.width),
      btnMin: Math.round(bmin), btnAncho: Math.round(wmin),
      usuario: document.querySelector('.us-campos label:nth-child(2) input').value,
      libre: document.querySelector('.us-campos em')?.textContent,
      pares: {
        emLibre: par('.us-campos em'),
        rot: par('.us-rot'), dice: par('.us-dice'),
        th: par('.us-tabla th'), td: par('.us-tabla td'),
        chapa: chapa ? [cs(chapa,'color'), fe(chapa)] : null,
        chapaEm: chapa?.querySelector('em') ? [cs(chapa.querySelector('em'),'color'), fe(chapa)] : null,
        estadoBien: par('.us-estado.bien'), estadoOjo: par('.us-estado.ojo'), estadoMal: par('.us-estado.mal'),
        nivelOn: par('.us-niveles button.on'), nivelOff: par('.us-niveles button:not(.on)'),
        apagado: par('.apagado'),
        modNombre: par('.us-mod b'),
      },
    }
  })()`));
  const c = Object.fromEntries(Object.entries(m.pares).filter(([,x])=>x).map(([k,[f,g]])=>[k, rel(f,g)]));
  const bajo = Object.entries(c).filter(([,x])=>x<4.5);
  console.log(`${(t??'oficial').padEnd(8)} ${v.n.padEnd(7)} pagRueda=${m.pagRueda} tabla=${m.tablaAncho}/${m.marcoAncho} ruedaX=${m.marcoRueda} modsX=${m.modsRuedaX} nivelBtn=${m.btnAncho}x${m.btnMin} usuario="${m.usuario}" libre="${m.libre}"`);
  if (bajo.length) console.log(`         BAJO: ${bajo.map(([k,x])=>k+' '+x).join(', ')}`);
  else console.log(`         contraste ok (min ${Math.min(...Object.values(c))})`);
  if (v.n==='pc'&&t==='ambar') await p.screenshot({path:S+'/us-ambar-pc.png', fullPage:false});
  if (v.n==='cel'&&t===null) await p.screenshot({path:S+'/us-oficial-cel.png'});
  await p.close();
 }
}
await b.close();
