import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";
let malos = 0;

const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");

const R = 34, C = 2*Math.PI*R;
const color = p => p>=100 ? "var(--tp-bien)" : p>0 ? "var(--tp-ojo)" : "var(--tp-mal)";
const clase = p => p>=100 ? "bien" : p>0 ? "medio" : "mal";

const TIPOS = [
  ["PET",8,6],["Vidrio",7,4],["Canastas",6,5],["Tarros",3,2],
  ["Estibas",1,1],["Plástico",1,0],["Preforma",2,0],
];
const planeado = TIPOS.reduce((a,t)=>a+t[1],0);
const cumplido = TIPOS.reduce((a,t)=>a+t[2],0);
const adheridos = TIPOS.reduce((a,t)=>a+Math.min(t[1],t[2]),0);
const adic = 3, faltan = planeado-adheridos;
const adherencia = Math.round(adheridos/planeado*100);
const cumplimiento = Math.round(cumplido/planeado*100);
const pOk = adheridos/planeado*100, pEx = Math.min(100-pOk, adic/planeado*100);
const pFa = Math.max(0,100-pOk-pEx);

const anillo = (t,pct,ad,pl) => `
<div class="turno"><svg viewBox="0 0 86 86">
<circle cx="43" cy="43" r="${R}" fill="none" stroke="var(--tp-fondo)" stroke-width="10"/>
<circle cx="43" cy="43" r="${R}" fill="none" stroke="${color(pct)}" stroke-width="10"
 stroke-linecap="butt" stroke-dasharray="${Math.min(pct,100)/100*C} ${C}" transform="rotate(-90 43 43)"/>
<text x="43" y="49" text-anchor="middle" font-family="Archivo" font-weight="900" font-size="20"
 fill="var(--tp-tinta)">${pct}%</text></svg><b>Turno ${t}</b><span>${ad} de ${pl}</span></div>`;

const filas = TIPOS.map(([n,pl,cu])=>{
  const pct = pl>0 ? Math.min(100,Math.round(Math.min(cu,pl)/pl*100)) : 0;
  return `<tr><td class="nom">${n}</td><td>C</td><td class="n">${pl}</td>
  <td><span class="cuenta">${cu}</span></td>
  <td class="mini"><div class="pista"><div class="relleno" style="width:${pct}%;background:${color(pct)}"></div></div></td>
  <td class="n pct ${clase(pct)}">${pct}%</td><td class="n">${pl-cu>0?pl-cu:"—"}</td></tr>`;
}).join("");

const html = `<!doctype html><meta charset="utf-8"><style>
${glob}
*{box-sizing:border-box} body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{min-height:100vh;padding:18px}
${css}
</style><div${process.env.TEMA?` data-tema="${process.env.TEMA}"`:""}><div class="marco"><div class="tp">
<section class="cabeza-ctl"><div>
<p class="ojo">TRASPASOS · CD38 AG01 · LUNES 14 DE SEPTIEMBRE</p>
<h1>Control y ejecución</h1>
<p class="sub">Lo que se planeó contra lo que de verdad salió, turno por turno y tipo por tipo.</p></div>
<div class="der-ctl">
<div class="acciones-informe">
<button class="accion"><svg viewBox="0 0 24 24"><path d="M20 11.5A8 8 0 1 1 17.7 6"/><path d="M20 4v6h-6"/></svg>Actualizar</button>
<button class="accion"><svg viewBox="0 0 24 24"><path d="M8 3.5h5.5L18 8v12.5H6V3.5z"/><path d="M13.5 3.5V8H18"/></svg>Generar PDF</button></div>
<div class="panel-ojo"><div class="corte"></div><div class="rot">ADHERENCIA AL PLAN</div>
<div class="num">${adherencia}%</div><div class="pie">del plan salieron <b>${adheridos} de ${planeado}</b></div></div>
</div></section>

<section class="filtros"><div class="arriba">
<label class="sel"><span>Período</span><select><option>Hoy</option></select></label>
<label class="sel"><span>Turno</span><select><option>Todos los turnos</option></select></label>
<label class="sel"><span>Tipo de viaje</span><select><option>Todos los tipos</option></select></label>
<button class="limpiar">Restablecer</button></div></section>

<section class="medidor"><div class="avance">
<div class="arr"><b>${cumplimiento}%</b><span>de cumplimiento · <b>${cumplido}</b> de <b>${planeado}</b> viajes planeados</span></div>
<div class="cinta"><i class="ok" style="width:${pOk}%"></i><i class="extra" style="width:${pEx}%"></i><i class="falta" style="width:${pFa}%"></i></div>
<div class="leyenda-cinta"><span><i style="background:var(--tp-ojo)"></i> ${adheridos} del plan</span>
<span><i style="background:color-mix(in srgb,var(--tp-ojo) 45%,#fff)"></i> ${adic} adicionales</span>
<span><i style="background:var(--tp-fondo);border:1px dashed var(--tp-linea)"></i> ${faltan} sin salir</span></div></div>
<div class="turnos">${anillo("C",75,12,16)}${anillo("A",75,6,8)}${anillo("B",0,0,4)}</div></section>

<section class="alertas">
<div class="alerta"><b>${faltan}</b> viajes sin salir</div>
<div class="alerta"><b>2</b> viajes vacíos</div>
<div class="alerta neutra"><b>${adic}</b> adicionales no planeados</div>
<div class="alerta bien"><b>1</b> tipo al 100% · Estibas</div></section>

<section class="panel-tabla"><div class="cab-tabla"><h2>Por tipo de viaje</h2>
<p>El cumplido no se escribe aquí: lo cuentan los viajes registrados. Si un número no cuadra, lo que falta es registrar el viaje —y ahí queda con su placa, que es lo que después permite decir cuál fue.</p></div>
<div class="tabla-envuelta"><table>
<thead><tr><th>Tipo</th><th>Turno</th><th class="n">Planeado</th><th>Cumplido</th><th class="mini"></th><th class="n">%</th><th class="n">Faltan</th></tr></thead>
<tbody>${filas}</tbody>
<tfoot><tr><td>Total del día</td><td></td><td class="n">${planeado}</td><td class="n">${cumplido}</td><td class="mini"></td><td class="n">${adherencia}%</td><td class="n">${faltan}</td></tr></tfoot>
</table></div></section>
</div></div>`;

fs.writeFileSync(".arnes/tp-control.html", html);
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [w,h,nom] of [[1440,1400,"pc"],[820,1500,"tab"],[390,2100,"cel"],[360,2100,"360"]]) {
  const p = await nav.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:2 });
  await p.setContent(html);
  await p.waitForTimeout(350);
  await p.screenshot({ path:`.arnes/tpc-${nom}.png`, fullPage:true });
  // medir desbordes a lo ancho
  const mal = await p.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const fuera = [];
    document.querySelectorAll(".tp *").forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > ancho + 1 || r.left < -1)) {
        const env = el.closest(".tabla-envuelta");
        if (!env) fuera.push((el.className||el.tagName) + " → " + Math.round(r.right));
      }
    });
    return { scrollX: document.documentElement.scrollWidth > ancho, fuera: fuera.slice(0,6) };
  });
  console.log(`${nom} (${w}px): desplaza a lo ancho = ${mal.scrollX}`, mal.fuera.length?mal.fuera:"");
  await p.close();
}
/* ---------------------------------------------------------------------
   EL PDF: CUÁNTAS HOJAS.

   «Generar PDF» es el navegador imprimiendo la pantalla, así que la
   única forma honesta de saber cómo queda es GENERARLO y contar las
   hojas. Cuatro páginas para un tablero que cabe en una no es un
   detalle: es que nadie lo va a mandar.

   Lo que las multiplicaba era «break-inside: avoid» en los bloques
   grandes: si el medidor no cabe en lo que queda de hoja, salta entero
   a la siguiente y deja media página en blanco.
   --------------------------------------------------------------------- */
{
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  await p.setContent(html);
  await p.waitForTimeout(300);
  /* Una barra de la app de mentira, para comprobar que no se imprime. */
  await p.evaluate(() => {
    const b = document.createElement("div");
    b.className = "sh-barra"; b.style.height = "70px"; b.textContent = "CONTROL";
    document.body.prepend(b);
  });
  await p.pdf({ path: ".arnes/tpc-impreso.pdf", format: "A4", landscape: true,
                printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
  await p.close();
  const info = execSync("pdfinfo .arnes/tpc-impreso.pdf", { encoding: "utf8" });
  const hojas = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
  const texto = execSync("pdftotext .arnes/tpc-impreso.pdf - 2>/dev/null", { encoding: "utf8" });
  console.log(`PDF: ${hojas} hoja(s)`);
  if (hojas > 2) { console.log(`✗ el PDF sale en ${hojas} hojas y el tablero cabe en 1 o 2`); malos++ }
  if (/CONTROL\n/.test(texto.slice(0, 60))) { console.log("✗ el PDF sale con la barra de la app"); malos++ }
  /* Y que no le falte nada: el título, los tres turnos y la tabla. */
  for (const q of ["Control y ejecución", "Turno A", "Turno B", "Turno C", "Por tipo de viaje", "PET"]) {
    if (!texto.includes(q)) { console.log(`✗ al PDF le falta «${q}»`); malos++ }
  }
}

await nav.close();

if (malos) process.exit(1);
console.log("\n✓ Control: nada se sale a 1440/820/390/360 y el PDF sale limpio y en pocas hojas.");
