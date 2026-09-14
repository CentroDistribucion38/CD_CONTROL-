import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const dia = (n,c="") => `<button class="${c}">${n}</button>`;
const mes = (ocup) => `<div class="cal">
<div class="cal-cab"><button><svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6"/></svg></button>
<div class="cal-titulo">septiembre 2026</div>
<button><svg viewBox="0 0 24 24"><path d="M10 6l6 6-6 6"/></svg></button></div>
<div class="cal-sem">${["L","M","M","J","V","S","D"].map(d=>`<span>${d}</span>`).join("")}</div>
<div class="cal-dias">${"<span></span>".repeat(1)}${Array.from({length:30},(_,i)=>{
  const n=i+1; let c=[];
  if(n===14) c.push("cal-hoy");
  if(n===21) c.push("punta inicio");
  if(n===30) c.push("punta fin");
  if(n>21&&n<30) c.push("dentro");
  if(ocup&&[23,27].includes(n)) c.push("ocupado");
  return dia(n,c.join(" "));}).join("")}</div></div>`;

const HTML = `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;padding:18px;background:var(--c-eef1f5,#EEF1F5)}${css}</style>
<div${process.env.TEMA?` data-tema="${process.env.TEMA}"`:""}><div class="tp"><div class="pie-publicar" style="flex-wrap:wrap">

<div class="cal-caja">
<button class="cal-disparo" aria-expanded="true"><svg viewBox="0 0 24 24">
<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>21 de septiembre</button>
<div class="cal-flota">${mes(false)}</div></div>

<div class="cal-caja">
<button class="btn" aria-expanded="true">Aplicar a varios días</button>
<div class="cal-flota ancho">
<div class="rep-cab"><b>Repetir esta rejilla</b><span>22 viajes con carga. Toca el primer día y después el último.</span></div>
${mes(true)}
<div class="rep-sem">${["L","M","M","J","V","S","D"].map((c,i)=>
`<label class="${i===6?"":"on"}"><input type="checkbox" ${i===6?"":"checked"}>${c}</label>`).join("")}</div>
<div class="rep-cuenta"><b>8</b> días se van a planear<span class="saltan">· 2 se saltan: ya tienen plan</span></div>
<div class="rep-pie"><button class="btn si">Publicar en 8 días</button>
<span class="rep-nota">Se publica de una: el turno lo ve enseguida. Los días que ya tienen plan no se tocan.</span></div>
</div></div>

</div></div>`;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let malas = 0;
for (const [w,nom] of [[1440,"pc"],[820,"tab"],[390,"cel"],[360,"360"]]) {
  const pg = await nav.newPage({ viewport:{width:w,height:900}, deviceScaleFactor:2 });
  await pg.setContent(HTML,{waitUntil:"load"});
  const r = await pg.evaluate(() => {
    const d = document.documentElement, fuera = [];
    for (const el of document.querySelectorAll(".cal-flota, .cal-flota *")) {
      const b = el.getBoundingClientRect();
      if (b.width>0 && (b.right > d.clientWidth+0.5 || b.left < -0.5))
        fuera.push((el.className||el.tagName)+"<"+(el.parentElement?.className||"?")+"> r="+Math.round(b.right)+" l="+Math.round(b.left));
    }
    const chicos = [];
    for (const el of document.querySelectorAll(".cal-dias button, .rep-sem label, .btn")) {
      const b = el.getBoundingClientRect();
      if (b.height>0 && b.height<30) chicos.push((el.className||el.tagName)+" h="+Math.round(b.height));
    }
    return { ancho:d.clientWidth, scroll:d.scrollWidth, fuera:fuera.slice(0,4), chicos:chicos.slice(0,4) };
  });
  const mal = r.scroll > r.ancho+0.5 || r.fuera.length || r.chicos.length;
  if (mal) malas++;
  console.log(`${nom.padEnd(4)} ${String(w).padStart(5)}px scroll=${r.scroll} ${mal?"MAL":"bien"}`);
  if (r.fuera.length)  console.log("      SE SALE:", r.fuera.join(" | "));
  if (r.chicos.length) console.log("      CHICOS:", r.chicos.join(" | "));
  await pg.screenshot({ path:`.arnes/tpcal-${nom}.png`, fullPage:true });
  await pg.close();
}
await nav.close();
console.log(malas ? `\n${malas} con problemas` : "\nlos cuatro anchos, limpios");
