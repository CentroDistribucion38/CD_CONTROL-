import { chromium } from "playwright";
import fs from "node:fs";
const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css","utf8");
const glob = fs.readFileSync("src/app/globals.css","utf8");
const marco = (cuerpo) => `<!doctype html><meta charset="utf-8"><style>
${glob}
*{box-sizing:border-box} body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{min-height:100vh;padding:18px}
${css}
</style><div${process.env.TEMA?` data-tema="${process.env.TEMA}"`:""}><div class="marco"><div class="tp">${cuerpo}</div></div></div>`;

const TIPOS=[["Casco vidrio",6,5,3,4],["Envase",4,3,2,0],["Estibas",2,1,1,0],
  ["Plástico",1,1,0,0],["PET",3,2,2,0],["Lavado",1,0,0,0],["PT Expo",2,1,0,0],
  ["Material",1,1,0,0],["Averías",0,0,0,0]];
const cel=(n,hecho)=>`<td class="cen"><span class="cel-step${n===0?" vacia":""}">
<button>−</button><input value="${n}"><button>+</button></span>${hecho?`<span class="hecho">${hecho} hechos</span>`:""}</td>`;
const tA=TIPOS.reduce((a,t)=>a+t[1],0),tB=TIPOS.reduce((a,t)=>a+t[2],0),tC=TIPOS.reduce((a,t)=>a+t[3],0);

const PLAN = marco(`
<section class="cabeza-ctl"><div>
<div class="fecha-nav"><button><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
<button class="hoy">HOY</button><button><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
<span class="estado-plan"><i></i> Borrador · sin publicar</span></div>
<h1>Plan del día</h1>
<p class="sub">Lunes 14 de septiembre. Los tres turnos y los nueve tipos en una sola rejilla. Lo cumplido no se escribe aquí: lo cuenta la base sobre los viajes que se registran.</p></div>
<div class="der-ctl"><div class="panel-ojo"><div class="corte"></div>
<div class="rot">VIAJES PLANEADOS</div><div class="num">${tA+tB+tC}</div>
<div class="pie">hay un borrador sin publicar</div></div></div></section>

<div class="plan-marco"><div><section class="matriz"><div class="tabla-envuelta"><table>
<thead><tr><th>Tipo de viaje</th>
<th class="cen">Turno A<span class="hor">06:00 · 14:00</span></th>
<th class="cen">Turno B<span class="hor">14:00 · 22:00</span></th>
<th class="cen">Turno C<span class="hor">22:00 · 06:00</span></th>
<th class="cen dia">Día</th></tr></thead>
<tbody>${TIPOS.map(([n,a,b,c,h])=>`<tr><td class="tipo">${n}</td>${cel(a,h)}${cel(b)}${cel(c)}<td class="cen tot">${a+b+c||"—"}</td></tr>`).join("")}</tbody>
<tfoot><tr class="total"><td>TOTAL CON CARGA</td><td class="cen">${tA}</td><td class="cen">${tB}</td><td class="cen">${tC}</td><td class="cen dia">${tA+tB+tC}</td></tr>
<tr class="vacios"><td>Viajes vacíos<span>cuestan igual y no mueven producto</span></td>
<td class="cen"><span class="cel-step"><button>−</button><input value="2"><button>+</button></span></td>
<td class="cen"><span class="cel-step"><button>−</button><input value="1"><button>+</button></span></td>
<td class="cen"><span class="cel-step vacia"><button>−</button><input value="0"><button>+</button></span></td>
<td class="cen tot">3</td></tr></tfoot>
</table></div>
<div class="pie-publicar"><button class="btn si">Publicar plan del día</button>
<button class="btn">Guardar borrador</button>
<span class="aviso-cambios"><b>4 cambios</b> sin publicar · ya hay 4 viajes hechos sobre este plan</span>
<div class="borrar-plan"><button class="btn mal">Sí, dejar el día sin plan</button>
<button class="btn">Dejar así</button>
<span class="nota-borrar">Se va el plan de este día, publicado y borrador. Los 4 viajes ya registrados NO se borran: pasan a contar como adicionales.</span></div></div>
</section></div>
<aside class="lado-plan">
<div class="resumen-dia"><div class="corte"></div><div class="rot">CARGA DEL DÍA</div>
<div class="gran">${tA+tB+tC+3}</div><div class="sub">${tA+tB+tC} con carga · 3 vacíos</div>
<div class="barras-turno">
<div class="bt"><span>Turno A</span><span class="pista"><i style="width:100%"></i></span><span class="v">${tA+2}</span></div>
<div class="bt"><span>Turno B</span><span class="pista"><i style="width:68%"></i></span><span class="v">${tB+1}</span></div>
<div class="bt"><span>Turno C</span><span class="pista"><i style="width:36%"></i></span><span class="v">${tC}</span></div>
</div></div>
<div class="atajos-plan"><h3>Armar más rápido</h3><p>Casi todos los días se parecen. No empieces de cero.</p>
<div class="fila-a"><button>Copiar el plan de ayer <span>28</span></button>
<button>Promedio del mismo día <span>31</span></button>
<button>Vaciar la rejilla <span>0</span></button></div></div>
<div class="referencia"><h3>Contra los últimos días iguales</h3>
<p>Promedio de lo que de verdad salió, no de lo que se planeó: copiar cuatro veces un plan que estuvo mal es como un error se vuelve costumbre.</p>
<div class="ref-fila"><span>Casco vidrio</span><span class="prom">prom. 12</span><span class="dif mas">+2</span></div>
<div class="ref-fila"><span>Envase</span><span class="prom">prom. 10</span><span class="dif menos">−1</span></div>
<div class="ref-fila"><span>PET</span><span class="prom">prom. 6</span><span class="dif mas">+1</span></div>
<div class="ref-fila"><span>Lavado</span><span class="prom">prom. 3</span><span class="dif menos">−2</span></div>
</div></aside></div>`);

const REG = marco(`
<section class="cabeza-ctl"><div>
<p class="ojo">TRASPASOS · CD38 AG01 · TURNO A</p>
<h1>Registrar viaje</h1>
<p class="sub">Cada viaje que sale, con su placa y su ruta. El cumplido del plan no se escribe: sube solo con lo que se registra aquí.</p></div>
<div class="der-ctl"><div class="panel-ojo"><div class="corte"></div>
<div class="rot">REGISTRADOS HOY</div><div class="num">4</div>
<div class="pie">de <b>16 planeados</b></div></div></div></section>

<div class="consola"><section class="tarj-reg">
<div class="cab"><h2>Viaje nuevo</h2><p>Todo cabe en una pantalla. Lo que más se repite ya está de un toque.</p></div>
<div class="cuerpo-f">
<div class="linea-campos">
<div><span class="rot-campo">¿Qué se registra?</span><div class="seg">
<button class="on">Viaje con carga</button><button>Viaje vacío</button></div></div>
<div><span class="rot-campo">Turno</span><div class="seg turno">
<button class="on">A</button><button>B</button><button>C</button></div></div></div>

<div><span class="rot-campo">Placa</span><div class="placa"><input value="WGX418"></div>
<div class="recientes"><button>WGX418</button><button>SVD902</button><button>TKR337</button><button>JHP551</button><button>RQM204</button></div></div>

<div><span class="rot-campo">Documento</span>
<input class="campo-suelto doc" value="4500123456">
<p class="guia" style="margin-top:8px">No se puede repetir: si este número ya está en otro viaje, la pantalla te dice en cuál. Si ese otro registro está malo, anúlalo y este entra.</p></div>

<div><span class="rot-campo">Tipo de viaje</span><div class="chips">
<button class="on">Casco vidrio</button><button>Envase</button><button>Estibas</button>
<button>Plástico</button><button>PET</button><button>Lavado</button>
<button>PT Expo</button><button>Material</button><button>Averías</button></div></div>

<div><span class="rot-campo">Ruta</span><div class="ruta">
<input value="Ag01"><button class="voltear"><svg viewBox="0 0 24 24"><path d="M7 10h13M7 10l3-3M7 10l3 3"/><path d="M17 14H4M17 14l-3-3M17 14l-3 3"/></svg></button>
<input value="Planta Barranquilla"></div>
<div class="rutas-frec"><button>Ag01 → Planta Barranquilla</button><button>Ag01 → CD Galapa</button>
<button>Planta Barranquilla → Ag01</button><button>Ag01 → CD Turbaco</button></div></div>

<div class="linea-campos">
<div><span class="rot-campo">Cuántos viajes</span><div class="conteo">
<span class="cel-step grande"><button>−</button><input value="1"><button>+</button></span>
<span class="nota-conteo">El plan se mide en viajes, no en canastas.</span></div></div>
<div><span class="rot-campo">Carga (opcional)</span><input class="campo-suelto" placeholder="Canastas, estibas…"></div></div>

<details class="extra"><summary>Agregar novedad</summary></details>
</div>
<div class="pie-reg"><button class="btn si">Registrar viaje</button>
<span class="atajo">o pulsa <kbd>Ctrl</kbd> + <kbd>Enter</kbd></span></div>
</section>
<aside>
<div class="plan-turno"><div class="corte"></div><div class="rot">PLAN DEL TURNO A</div>
<div class="marca"><b>4</b><span>de 16 viajes</span></div>
<div class="huecos">${Array.from({length:16},(_,i)=>`<i class="${i<4?"lleno":""}"></i>`).join("")}</div>
<div class="pie-plan">Cada cuadro es un viaje del plan. Se prende al registrarlo.</div></div>
<div class="hoy"><div class="cab"><h3>Viajes de hoy</h3><span class="cuantos">4 registrados</span></div>
${[["11:32","WGX418","4500123456 · Casco vidrio · Ag01 → Planta Barranquilla"],
   ["10:58","SVD902","4500123457 · Estibas · Ag01 → CD Galapa"],
   ["10:14","WGX418","4500123458 · Envase · Planta Barranquilla → Ag01"],
   ["09:40","TKR337","sin documento · PET · Ag01 → CD Turbaco"]].map(([h,p,d])=>
`<div class="viaje"><span class="hora">${h}</span><span><span class="pl">${p}</span><span class="det">${d}</span></span></div>`).join("")}
</div></aside></div>`);

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [nom, html] of [["plan", PLAN], ["reg", REG]]) {
  for (const [w,h,m] of [[1440,1600,"pc"],[820,1900,"tab"],[390,2600,"cel"],[360,2600,"360"]]) {
    const p = await nav.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:2 });
    await p.setContent(html); await p.waitForTimeout(300);
    await p.screenshot({ path:`.arnes/tp-${nom}-${m}.png`, fullPage:true });
    const r = await p.evaluate(() => {
      const a = document.documentElement.clientWidth;
      const fuera = [];
      document.querySelectorAll(".tp *").forEach(el => {
        const b = el.getBoundingClientRect();
        if (b.width>0 && (b.right>a+1 || b.left<-1) && !el.closest(".tabla-envuelta")
            && !el.classList.contains("corte")) fuera.push(el.className||el.tagName);
      });
      const det = [];
      document.querySelectorAll(".tp .matriz, .tp .fila-vacios, .tp .fila-vacios > *, .tp .tabla-envuelta, .tp .pie-publicar").forEach(el => {
        const b = el.getBoundingClientRect();
        if (b.right > a + 1) det.push((el.className||el.tagName) + " w=" + Math.round(b.width) + " r=" + Math.round(b.right));
      });
      return { x: document.documentElement.scrollWidth > a, fuera: [...new Set(fuera)].slice(0,5), det };
    });
    console.log(`${nom} ${m} (${w}px): desplaza=${r.x}`, r.det?.length?r.det:"");

    /* EL DOCUMENTO SE TECLEA DE PIE Y A VECES CON GUANTES. 48px de alto
       es el mínimo de esta bodega, el mismo que ya rige las casillas de
       fecha del conteo — allí intenté bajarlo a 46 para ganar seis
       píxeles y el arnés tuvo razón y yo no. Y tiene que caber el
       número entero: un campo que corta «4500123456» a la mitad obliga
       a rodar dentro del campo para cotejarlo contra el papel. */
    if (nom === "reg") {
      const d = await p.evaluate(() => {
        const el = document.querySelector(".campo-suelto.doc");
        if (!el) return { falta: true };
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        /* Cuánto mide el texto de verdad con la tipografía que le tocó,
           medido con el navegador y no calculado a ojo. */
        const lona = document.createElement("canvas").getContext("2d");
        lona.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const ancho = lona.measureText("4500123456").width;
        const util = b.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return { alto: Math.round(b.height), ancho: Math.round(ancho), util: Math.round(util) };
      });
      const malDoc = [];
      if (d.falta) malDoc.push("no está el campo de documento");
      else {
        if (d.alto < 48) malDoc.push(`alto ${d.alto}px, el mínimo son 48`);
        if (d.ancho > d.util) malDoc.push(`el número no cabe: ${d.ancho}px en ${d.util}px`);
      }
      console.log(`      documento: alto ${d.alto ?? "?"}px · cabe el número: ${d.falta || d.ancho > d.util ? "NO" : "sí"}`
                  + (malDoc.length ? `  ← MAL: ${malDoc.join(" | ")}` : ""));
      if (malDoc.length) process.exitCode = 1;
    }

    /* LA COLUMNA CLAVADA. Se rueda la rejilla hasta el final y se
       comprueba que la primera celda de cada fila siguió en el borde
       izquierdo del recuadro —y con fondo propio, o los números de
       atrás se leerían a través de ella. */
    if (nom === "plan") {
      const f = await p.evaluate(() => {
        const env = document.querySelector(".matriz .tabla-envuelta");
        env.scrollLeft = env.scrollWidth;
        const e = env.getBoundingClientRect();
        const malas = [];
        for (const c of document.querySelectorAll(".matriz tr > :first-child")) {
          const b = c.getBoundingClientRect();
          const tx = (c.textContent || "").trim().slice(0, 16);
          if (Math.abs(b.left - e.left) > 1) malas.push(tx + " se corrió " + Math.round(b.left - e.left) + "px");
          const fondo = getComputedStyle(c).backgroundColor;
          if (fondo === "rgba(0, 0, 0, 0)" || fondo === "transparent") malas.push(tx + " SIN FONDO");
        }
        return { sobra: Math.round(env.scrollWidth - env.clientWidth), rodado: Math.round(env.scrollLeft), malas };
      });
      console.log(`      rejilla: sobran ${f.sobra}px de lado, rodada ${f.rodado}px · columna clavada: ${f.malas.length ? "MAL" : "bien"}`);
      if (f.malas.length) console.log("      ", f.malas.slice(0, 6).join(" | "));
      if (f.sobra > 0) await p.screenshot({ path: `.arnes/tp-fijo-${m}.png` });
    }
    await p.close();
  }
}
await nav.close();
