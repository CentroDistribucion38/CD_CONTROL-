import { chromium } from "playwright";
import fs from "node:fs";

const css = fs.readFileSync("src/app/(app)/cargando.css", "utf8");
const filas = Array.from({length:8}, () =>
  `<div class="cg-fila"><div class="cg-b"></div><div class="cg-b"></div><div class="cg-b"></div><div class="cg-b"></div></div>`).join("");

const html = `<!doctype html><meta charset="utf-8"><style>
:root{--bv-panel:#fff;--bv-linea:#dbe4f0;--bv-radio:12px}
*{box-sizing:border-box}
body{margin:0;font:14px system-ui;background:#f4f7fb}
/* el marco real: la pantalla NO hace scroll, el contenido vive adentro */
.marco{height:100vh;display:flex;flex-direction:column;padding:18px;overflow:hidden}
${css}
</style><div class="marco"><div class="cg">
<span class="sr">Cargando…</span>
<div class="cg-cabeza"><div class="cg-b cg-ojo"></div><div class="cg-b cg-titulo"></div><div class="cg-b cg-sub"></div></div>
<div class="cg-filtros"><div class="cg-b cg-chip"></div><div class="cg-b cg-chip"></div><div class="cg-b cg-chip ancho"></div></div>
<div class="cg-tabla">${filas}</div>
</div></div>`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [w,h,n] of [[1440,900,"cg-pc"],[820,1180,"cg-tab"],[390,844,"cg-cel"],[360,640,"cg-360"]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.setContent(html);
  await p.waitForTimeout(120);
  const m = await p.evaluate(() => {
    const de = document.documentElement;
    const tabla = document.querySelector(".cg-tabla");
    const bs = [...document.querySelectorAll(".cg-b")];
    const r = tabla.getBoundingClientRect();
    return {
      scrollPagina: de.scrollWidth > de.clientWidth || de.scrollHeight > de.clientHeight,
      anchoDesborde: de.scrollWidth - de.clientWidth,
      tablaDentro: r.right <= de.clientWidth + .5 && r.bottom <= de.clientHeight + .5,
      bloquesFuera: bs.filter(e => e.getBoundingClientRect().right > de.clientWidth + .5).length,
      bloqueMasChico: Math.min(...bs.map(e => e.getBoundingClientRect().width)).toFixed(1),
    };
  });
  console.log(n.padEnd(8), JSON.stringify(m));
  await p.screenshot({ path: `.arnes/${n}.png` });
  await p.close();
}
await b.close();
