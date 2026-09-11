import { chromium } from "playwright";
import fs from "node:fs";

const css = fs.readFileSync("src/app/(app)/roturas/roturas.css", "utf8");
const glob = fs.readFileSync("src/app/globals.css", "utf8")
  .split("\n").filter(l => /^\s*--c-|^:root|^}/.test(l)).join("\n");

const fila = (cod, roja) => `
<div class="fila ${roja ? "roja" : ""}"><div class="cod">${cod}</div>
<div><div class="tit">Envase retornable ámbar · 12 empaques · 360 botellas</div>
<div class="meta"><span class="eti ${roja ? "no_asumida" : "asumida"}">${roja ? "NO ASUMIDA" : "ASUMIDA"}</span>
<span class="vidrio ambar"><i></i>Ámbar</span><span>·</span><b>Sorting</b><span>·</span><span>Apilado por encima de lo permitido</span>
${roja ? '<span>·</span><span class="eti falta">LE FALTA LA FOTO</span>' : ""}</div>
<div class="meta"><span>hace 40 min</span><span>·</span><span>Génesis Visbal</span></div></div>
<div class="der"><span class="eti esperando">ESPERA VISTO BUENO</span>
<div class="par"><button class="btn">Ver · 1 foto</button><button class="btn bien">Cuenta</button><button class="btn mal">No cuenta</button></div></div></div>`;

const html = `<!doctype html><meta charset="utf-8"><style>
${glob}
*{box-sizing:border-box} body{margin:0;background:#F4F6F9;font:14px system-ui}
.marco{min-height:100vh;display:flex;flex-direction:column;padding:16px}
${css}
</style><div class="marco"><div class="rt">
<section class="cabeza"><div><p class="ojo">ROTURAS · VISTO BUENO DE ABI</p>
<h1>Cuenta o no cuenta</h1><p class="sub">Lo que el turno registró, esperando la decisión.</p></div>
<div class="kpi"><div class="corte"></div><div class="rot">LA MÁS VIEJA ESPERANDO</div>
<div class="num">14<span class="u">horas</span></div><div class="pie">9 en la bandeja</div></div></section>
<section class="cifras">
<div class="cifra ojo"><div class="rot">ESPERAN VISTO BUENO</div><div class="n">9</div><div class="u">ABI no ha dicho si cuentan</div></div>
<div class="cifra mal"><div class="rot">SIN LA FOTO QUE EXIGEN</div><div class="n">2</div><div class="u">ABI las va a devolver así</div></div>
<div class="cifra mal"><div class="rot">NO ASUMIDAS</div><div class="n">4</div><div class="u">se dice que no fueron del OL</div></div>
<div class="cifra bien"><div class="rot">UNIDADES DE VIDRIO</div><div class="n">1248</div><div class="u">de lo que ya cuenta. No son kilos</div></div></section>
<section class="caja"><div class="cab"><div><h2>9 esperando</h2><p>Lo más viejo arriba.</p></div></div>
<div class="rueda">${[1,2,3,4,5,6].map(i => fila("RB-00" + (40 + i), i % 2 === 0)).join("")}</div></section>

<section class="caja"><div class="cab"><div><h2>SAL-0007 · 3 tolvas</h2><p>El neto sale de sumar las tolvas.</p></div></div>
<div style="padding:14px"><div class="cuenta">
<span class="caja-n"><small>BRUTO</small>3.609</span><span class="signo">−</span>
<span class="caja-n tara"><small>TARA</small>333</span><span class="signo">=</span>
<span class="caja-n neto"><small>NETO KG</small>3.276</span></div></div>
<div class="rueda">
<div class="tolva"><div><div class="nom">TOLVA-1 · <span class="vidrio ambar"><i></i>Ámbar</span></div>
<div class="det">1.203 − 111 = <b>1.092 kg</b> · Génesis Visbal · 11 sep, 08:14</div></div>
<button class="btn mal">Quitar</button></div></div></section>

<section class="caja"><div class="cab"><div><h2>Las tres firmas</h2><p>En cadena y en orden.</p></div></div>
<div style="padding:12px"><div class="firmas">
<div class="firma lista"><div class="rot">SUPERVISORA</div><div class="quien">Génesis Visbal</div><div class="cuando">11 sep, 08:40</div></div>
<div class="firma turno"><div class="rot">VERIFICADOR</div><div class="quien">Sin firmar</div><div class="cuando">verifica el peso</div><button class="btn si">Firmar</button></div>
<div class="firma"><div class="rot">FACTURADOR</div><div class="quien">Sin firmar</div><div class="cuando">factura la salida</div><div class="espera">Espera la firma anterior.</div></div>
</div></div></section>

<section class="caja"><div class="cab"><div><h2>Por causa</h2><p>Unidades de vidrio.</p></div></div>
<div class="barras">
<div class="b mal"><div class="et">Apilado por encima de lo permitido</div><div class="riel"><i style="width:100%"></i></div><div class="n">412</div></div>
<div class="b"><div class="et">Mal estibado</div><div class="riel"><i style="width:58%"></i></div><div class="n">239</div></div>
</div></section>
</div></div>`;

const rep = `<!doctype html><meta charset="utf-8"><style>
${glob}
*{box-sizing:border-box} body{margin:0;background:#F4F6F9;font:14px system-ui}
${css}
</style><div class="rt-rep">
<div class="barra"><span class="t">ROTURA EN SITIO</span><button>✕</button></div>
<div class="pasos"><i class="on"></i><i class="on"></i></div>
<div class="cuerpo"><h2>¿Por qué se rompió?</h2>
<p class="guia">El proceso dice dónde pasó; la causa, de quién fue.</p>
<div class="campo"><label>Proceso</label><select><option>Sorting</option></select></div>
<div class="opciones">
<button class="on roja"><span class="p">Apilado por encima de lo permitido</span><span class="h">No asumida — no fue del OL · exige foto</span></button>
<button><span class="p">Mal estibado</span><span class="h">Asumida por el OL</span></button></div>
<div class="negro"><span class="punto"></span><span><b>Esta causa exige foto.</b> Estás diciendo que la rotura no fue del OL, y eso se prueba aquí y ahora.</span></div>
<div class="foto"><div class="lienzo"><span>SIN FOTO</span></div><div class="sello">La hora y el lugar se graban en la imagen al tomarla.</div></div>
<button class="otra">Tomar la foto</button>
<div class="campo" style="margin-top:14px"><label>Qué pasó (opcional)</label><textarea rows="3"></textarea></div>
</div>
<div class="pie"><button>Atrás</button><button class="si">Falta la foto</button></div></div>`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

for (const [nom, w, h] of [["pc", 1440, 900], ["tab", 820, 1180], ["cel", 390, 844], ["360", 360, 780]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.waitForTimeout(120);
  const m = await p.evaluate(() => {
    const r = (s, i = 0) => {
      const e = document.querySelectorAll(s)[i];
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x) };
    };
    const desborde = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    // ¿Algún hijo se sale de su fila?
    let fuera = 0;
    for (const f of document.querySelectorAll(".fila")) {
      const fb = f.getBoundingClientRect();
      for (const c of f.querySelectorAll("*")) {
        const cb = c.getBoundingClientRect();
        if (cb.right > fb.right + 1 || cb.left < fb.left - 1) fuera++;
      }
    }
    return {
      desborde, fuera,
      fila: r(".fila"), cod: r(".cod"), der: r(".der"),
      btn1: r(".der .par .btn", 0), btn2: r(".der .par .btn", 1), btn3: r(".der .par .btn", 2),
      cuenta: r(".cuenta"), neto: r(".caja-n.neto"),
      firmas: r(".firmas"), firma1: r(".firma"),
      barra: r(".barras .b"), et: r(".barras .et"),
      kpi: r(".kpi"),
    };
  });
  console.log(nom.padEnd(4), JSON.stringify(m));
  await p.screenshot({ path: `.arnes/rot-${nom}.png`, fullPage: true });
  await p.close();
}

// El asistente de registrar, solo en celular: es donde vive.
for (const [nom, w, h] of [["cel", 390, 844], ["360", 360, 780]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(rep);
  await p.waitForTimeout(120);
  console.log("rep-" + nom, JSON.stringify(await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null;
      const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) } };
    return {
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cuerpoTapado: Math.round(document.querySelector(".pie").getBoundingClientRect().bottom - window.innerHeight),
      opcion: r(".opciones button"), pie: r(".pie"), pieBtn: r(".pie .si"), foto: r(".foto .lienzo"),
    };
  })));
  await p.screenshot({ path: `.arnes/rot-rep-${nom}.png` });
  await p.close();
}

await b.close();
