import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const lum=(c)=>{const[r,g,bl]=c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*bl};
const rel=(a,bb)=>{const L1=lum(a),L2=lum(bb);return +((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2)};

for (const t of [null,'tinta','pizarra','ambar']) {
 for (const cfg of [{n:'cel-error',w:360,h:640,err:1},{n:'muy-bajo',w:360,h:420,err:1},{n:'grande',w:1440,h:900,g:1},{n:'grande-cel',w:360,h:640,g:1}]) {
  const p = await b.newPage({viewport:{width:cfg.w,height:cfg.h}});
  await p.goto('file://'+S+'/index.html'); await p.waitForSelector('.cp-caja');
    /* GUARDIA: si los tokens no resuelven, las medidas mienten. */
    const tk = await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--c-5b6b7f"));
    if (!tk.trim()) throw new Error("los tokens --c-* no resolvieron: hoja de globals no cargada");
  if (t) await p.evaluate(x=>document.getElementById('w').setAttribute('data-tema',x), t);
  if (cfg.g) await p.evaluate(()=>document.getElementById('w').setAttribute('data-grande','si'));
  if (cfg.err) { // clave que cumple pero no coincide -> banner de error
    await p.fill('.cp-caja-clave input','Bavaria2026');
    await p.fill('.cp-campos label:nth-child(2) input','Otra9999');
    await p.click('.cp-btn'); await p.waitForTimeout(150);
  } else {
    await p.fill('.cp-caja-clave input','Bavaria2026');
    await p.fill('.cp-campos label:nth-child(2) input','Bavaria2026');
  }
  const m = await p.evaluate(()=>{
    const cs=(el,pr)=>getComputedStyle(el).getPropertyValue(pr);
    const cp=document.querySelector('.cp'), caja=document.querySelector('.cp-caja');
    const r=caja.getBoundingClientRect();
    const mal=document.querySelector('.cp-mal');
    const inp=document.querySelector('.cp-caja-clave input').getBoundingClientRect();
    const eye=document.querySelector('.cp-caja-clave button').getBoundingClientRect();
    const li=[...document.querySelectorAll('.cp-reglas li')];
    // ¿alguna regla se sale de la caja?
    const fuera = li.some(x=>{const b=x.getBoundingClientRect(); return b.right > r.right-1 || b.left < r.left-1});
    return {
      pagRueda: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      cajaRueda: cp.scrollHeight > cp.clientHeight+1,
      alto: Math.round(r.height), bot: Math.round(r.bottom), vh: innerHeight,
      malTexto: mal? cs(mal,'color'):null, malFondo: mal? cs(mal,'background-color'):null,
      malBorde: mal? cs(mal,'border-left-color'):null,
      ojoDentro: eye.right <= inp.right+1 && eye.left >= inp.left,
      ojoAncho: Math.round(eye.width), ojoAlto: Math.round(eye.height), inpAlto: Math.round(inp.height),
      reglasFuera: fuera,
    };
  });
  const cMal = m.malTexto ? rel(m.malTexto, m.malFondo) : '-';
  console.log(`${(t??'oficial').padEnd(8)} ${cfg.n.padEnd(11)} alto=${m.alto} bot=${m.bot}/${m.vh} pagRueda=${m.pagRueda} cajaRueda=${m.cajaRueda} ojo=${m.ojoAncho}x${m.ojoAlto}/inp${m.inpAlto} ojoDentro=${m.ojoDentro} reglasFuera=${m.reglasFuera} contrasteError=${cMal}`);
  if (cfg.n==='cel-error'&&t==='ambar') await p.screenshot({path:S+'/cp-error-ambar.png'});
  await p.close();
 }
}
await b.close();
