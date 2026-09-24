import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

const lum = (c) => { const [r,g,bl]=c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4}); return .2126*r+.7152*g+.0722*bl };
const rel = (a,bb)=>{const L1=lum(a),L2=lum(bb);return ((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05))};

const temas=[null,'tinta','pizarra','ambar'];
const pantallas=[{n:'pc',w:1440,h:900},{n:'tablet',w:834,h:1112},{n:'cel',w:360,h:640},{n:'bajo',w:1280,h:700}];

for (const t of temas) {
  for (const v of pantallas) {
    const p = await b.newPage({viewport:{width:v.w,height:v.h}});
    await p.goto('file://'+S+'/index.html');
    await p.waitForSelector('.cp-caja');
    /* GUARDIA: si los tokens no resuelven, las medidas mienten. */
    const tk = await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--c-5b6b7f"));
    if (!tk.trim()) throw new Error("los tokens --c-* no resolvieron: hoja de globals no cargada");
    if (t) await p.evaluate(x=>document.getElementById('w').setAttribute('data-tema',x), t);
    // llenar para ver el estado "cumple" y el error
    await p.fill('.cp-caja-clave input','Bavaria2026');
    await p.fill('.cp-campos label:nth-child(2) input','Bavaria2026');
    await p.waitForTimeout(120);
    const m = await p.evaluate(()=>{
      const cs=(el,pr)=>getComputedStyle(el).getPropertyValue(pr);
      const caja=document.querySelector('.cp-caja').getBoundingClientRect();
      const cp=document.querySelector('.cp');
      const btn=document.querySelector('.cp-btn');
      const ojo=document.querySelector('.cp-ojo');
      const h1=document.querySelector('.cp-caja h1');
      const dice=document.querySelector('.cp-dice');
      const regla=document.querySelector('.cp-reglas li');
      const reglaOk=document.querySelector('.cp-reglas li.ok');
      const raya=getComputedStyle(document.querySelector('.cp-caja'),'::before').backgroundColor;
      const inp=document.querySelector('.cp-campos input');
      const eye=document.querySelector('.cp-caja-clave button').getBoundingClientRect();
      const inpR=inp.getBoundingClientRect();
      return {
        rueda: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        cpRueda: cp.scrollHeight > cp.clientHeight + 1,
        cajaAlto: Math.round(caja.height), cajaAncho: Math.round(caja.width),
        cajaTop: Math.round(caja.top), cajaBot: Math.round(caja.bottom),
        vh: window.innerHeight,
        btnAlto: Math.round(btn.getBoundingClientRect().height),
        btnHab: !btn.disabled,
        panel: cs(document.querySelector('.cp-caja'),'background-color'),
        pares: {
          ojo:[cs(ojo,'color'), cs(document.querySelector('.cp-caja'),'background-color')],
          h1:[cs(h1,'color'), cs(document.querySelector('.cp-caja'),'background-color')],
          dice:[cs(dice,'color'), cs(document.querySelector('.cp-caja'),'background-color')],
          regla:[cs(regla,'color'), cs(regla,'background-color')],
          reglaOk: reglaOk?[cs(reglaOk,'color'), cs(reglaOk,'background-color')]:null,
          btn:[cs(btn,'color'), cs(btn,'background-color')],
          input:[cs(inp,'color'), cs(inp,'background-color')],
        },
        raya,
        ojoTapa: eye.left >= inpR.right - 48,
        reglasOk: document.querySelectorAll('.cp-reglas li.ok').length,
      };
    });
    const c = Object.fromEntries(Object.entries(m.pares).filter(([,v])=>v).map(([k,[f,g]])=>[k, +rel(f,g).toFixed(2)]));
    const malo = Object.entries(c).filter(([k,v])=> v < (k==='h1'?3:4.5));
    console.log(`${(t??'oficial').padEnd(8)} ${v.n.padEnd(7)} caja=${m.cajaAncho}x${m.cajaAlto} top=${m.cajaTop} bot=${m.cajaBot}/${m.vh} pagRueda=${m.rueda} cajaRueda=${m.cpRueda} btn=${m.btnAlto} reglasOk=${m.reglasOk} raya=${m.raya}`);
    console.log(`         contraste ${JSON.stringify(c)}${malo.length?'  <<< BAJO: '+malo.map(x=>x[0]+' '+x[1]).join(', '):''}`);
    if (v.n==='pc'||v.n==='cel') await p.screenshot({path:`${S}/cp-${t??'oficial'}-${v.n}.png`});
    await p.close();
  }
}
await b.close();
