/* =====================================================================
   EL FORMULARIO DE LA REVISIÓN AI, AHORA DENTRO DE LA CERTIFICACIÓN

   POR QUÉ HAY QUE VOLVER A MEDIRLO. Este formulario se diseñó para una
   pantalla suelta, donde era lo único que había y tenía todo el ancho.
   Ahora vive como tercer paso de la certificación de llegada: dentro de
   una `.tarjeta`, que tiene su propio relleno y su propio borde. Un
   bloque que cabía solo puede no caber adentro de otro, y el sitio donde
   se usa es un celular en el muelle, no el monitor del que programa.

   QUÉ SE COMPRUEBA
     · Que nada se salga por los lados —el bug clásico de un input sin
       `box-sizing: border-box`, que ya pasó una vez en este mismo
       formulario—.
     · Que los campos donde se escribe se puedan tocar: 38 px de alto es
       el mínimo con guante, y a 360 px de ancho es donde se aprietan.
     · Que la tira de cuentas —índice, no abono, abono— no se parta en
       columnas de un dígito.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const sider = readFileSync(new URL("../src/app/(app)/sider/sider.css", import.meta.url), "utf8");
const ai    = readFileSync(new URL("../src/modulos/sider/ai.css", import.meta.url), "utf8");
const glob  = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const PANTALLAS = [
  { w: 1440, h: 900, nombre: "portátil" },
  { w: 820,  h: 1180, nombre: "tableta" },
  { w: 390,  h: 844, nombre: "celular" },
  { w: 360,  h: 640, nombre: "celular chico" },
];

const defecto = (n) => `<label><span>${n}</span><input inputmode="numeric" placeholder="0"></label>`;

/* El armazón real: la tarjeta de la certificación con el formulario
   adentro, que es exactamente como queda en la pantalla. */
const ARMAZON = `
<div class="sd">
  <section class="tarjeta">
    <div class="ct-paso tr-llegada">
      <div class="tr-quien">
        <div>
          <h2>Revisión AI de JGY577</h2>
          <p class="ct-dice"><b>La llegada ya quedó registrada.</b> Falta la muestra: se
            saca en el muelle, antes de descargar, y de lo que se cuente aquí sale lo que
            se le abona al socio.</p>
        </div>
        <button class="btn plano">← Volver al tránsito</button>
      </div>

      <div class="ai-form">
        <section class="ai-caja">
          <div class="ai-cab"><h2>El vehículo</h2>
            <p>Sale del viaje. No se digita: ya está.</p></div>
          <dl class="ai-datos">
            <div><dt>Placa</dt><dd>JGY577</dd></div>
            <div><dt>Planta</dt><dd>CD Unión Apartado</dd></div>
            <div><dt>Fecha</dt><dd>2026-09-16</dd></div>
            <div><dt>Material</dt><dd>3500887</dd></div>
          </dl>
        </section>

        <section class="ai-caja">
          <div class="ai-cab"><h2>De quién y de qué</h2></div>
          <div class="ai-campos">
            <label><span>Turno</span><div class="ai-seg">
              <button class="on">T1</button><button>T2</button><button>T3</button></div></label>
            <label><span>Canal de envase</span><select><option>Socios</option></select></label>
            <label class="ancho"><span>Socio</span><select><option>— escoge el socio —</option></select></label>
            <label><span>Tipo de envase</span><select><option>— escoge —</option></select></label>
            <label class="ai-check"><input type="checkbox">
              <span>El envase venía certificado por el socio</span></label>
          </div>
        </section>

        <section class="ai-caja">
          <div class="ai-cab"><h2>La muestra</h2>
            <p>De estas dos cifras y de los conteos sale todo lo demás.</p></div>
          <div class="ai-campos">
            <label><span>Botellas recibidas de la referencia</span>
              <input inputmode="numeric" placeholder="0"></label>
            <label><span>Botellas revisadas</span><input inputmode="numeric" placeholder="0"></label>
            <label><span>N.° ZCL3</span><input></label>
          </div>
        </section>

        <section class="ai-caja">
          <div class="ai-cab"><h2>Botellas con defecto</h2>
            <p>Las de arriba <b>cobran</b>: entran en el índice.</p></div>
          <div class="ai-defectos">
            ${["Rotura", "Desportillado", "Rayado", "Sucio interno", "Sucio externo",
               "Etiqueta", "Deformado", "Boca golpeada", "Marca ilegible", "Otro envase"]
              .map(defecto).join("")}
          </div>
          <div class="ai-cab chico"><h3>No cobran</h3></div>
          <div class="ai-defectos no-cobra">
            ${["Mezclado", "Cuerpo extraño", "Cajas", "Estibas"].map(defecto).join("")}
          </div>
        </section>

        <section class="ai-cuenta">
          <div class="ai-cab"><h2>Lo que sale</h2><p>Se recalcula solo.</p></div>
          <div class="ai-cifras">
            <div><span>Con defecto</span><b>32</b><i>de 4.104 revisadas</i></div>
            <div class="ojo"><span>Índice de cobro</span><b>0,780 %</b><i>defectos ÷ revisadas</i></div>
            <div class="ojo"><span>No se abona</span><b>640</b><i>unidades</i></div>
            <div><span>Abono final SAP</span><b>81.440</b><i>unidades</i></div>
            <div><span>Hectolitros</span><b>0,0560</b><i>del envase roto</i></div>
          </div>
        </section>

        <label class="ai-caja ai-coment"><span>Comentarios para el facturador</span>
          <textarea rows="2"></textarea></label>

        <div class="ai-pie">
          <button class="ai-btn si">Guardar la revisión</button>
          <button class="ai-btn">Después</button>
        </div>
      </div>
    </div>
  </section>
</div>`;

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage();
const fallas = [];

console.log("pantalla        campo más bajo   se sale   cifras por fila");
for (const p of PANTALLAS) {
  await pag.setViewportSize({ width: p.w, height: p.h });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    ${glob}${sider}${ai}
    body{margin:0;background:#EEF1F5;font:14px system-ui}
    main{padding:20px 16px 40px}
  </style></head><body><main>${ARMAZON}</main></body></html>`);

  const r = await pag.evaluate(() => {
    const marco = document.querySelector(".ai-form");
    const c = marco.getBoundingClientRect();
    const salen = [];
    for (const e of marco.querySelectorAll("*")) {
      const b = e.getBoundingClientRect();
      if (b.width === 0) continue;
      if (b.right - c.right > 0.5 || c.left - b.left > 0.5)
        salen.push(e.className || e.tagName.toLowerCase());
    }
    /* El campo más bajo de todos los que se tocan. */
    let bajo = 999, quien = "";
    for (const e of marco.querySelectorAll("input:not([type=checkbox]), select, textarea, .ai-seg button")) {
      const h = e.getBoundingClientRect().height;
      if (h < bajo) { bajo = h; quien = e.closest("label")?.querySelector("span")?.textContent ?? e.tagName }
    }
    /* Cuántas cifras caben por fila en la tira de cuentas: si cada una
       queda sola, la tira deja de leerse como un resumen. */
    const cifras = [...document.querySelectorAll(".ai-cifras > div")].map((e) => Math.round(e.getBoundingClientRect().top));
    const porFila = cifras.length / new Set(cifras).size;
    return { salen: [...new Set(salen)], bajo: Math.round(bajo), quien, porFila: +porFila.toFixed(1) };
  });

  console.log(`${p.nombre.padEnd(15)} ${String(r.bajo).padStart(5)} px        ` +
              `${(r.salen.length ? r.salen.join(", ") : "nada").padEnd(9)} ${r.porFila}`);

  if (r.salen.length)
    fallas.push(`${p.nombre}: se sale del formulario: ${r.salen.join(", ")}`);
  /* 38 px: lo mínimo que se toca con guante. Es el mismo número que usa
     el botón del pie de la tarjeta de un vehículo. */
  if (r.bajo < 38)
    fallas.push(`${p.nombre}: «${r.quien}» mide ${r.bajo} px de alto (mínimo 38 para tocar con guante)`);
  if (r.porFila < 1.5)
    fallas.push(`${p.nombre}: las cifras quedan a una por fila; deja de leerse como resumen`);
}

await navegador.close();
if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\nListo: el formulario cabe y se toca dentro de la certificación en las cuatro.");
