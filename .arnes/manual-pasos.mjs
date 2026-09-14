/* =====================================================================
   LAS CAPTURAS DEL INSTRUCTIVO, UNA POR PASO

   No son recortes de una pantalla grande: cada paso se fotografía
   APUNTANDO AL ELEMENTO, con el CSS de verdad del módulo. Recortar a
   mano una captura de 2880 px deja la mitad de los pasos borrosos y la
   otra mitad mal encuadrados, y hay que rehacerlos uno por uno cada vez
   que cambia una pantalla.

   SE FOTOGRAFÍA LA UNIÓN DEL ELEMENTO CON SUS HIJOS, no su caja. Un
   desplegable abierto se sale de la caja del campo: con element.screenshot()
   saldría cortado justo donde está lo que hay que mostrar.

   Se corre:  TEMA=gris node .arnes/manual-pasos.mjs
   ===================================================================== */
import { chromium } from "playwright";
import fs from "node:fs";

const css  = fs.readFileSync("src/app/(app)/traspasos/traspasos.css", "utf8");
const glob = fs.readFileSync("src/app/globals.css", "utf8");
const TEMA = process.env.TEMA || "gris";

const pagina = (cuerpo, ancho = 980) => `<!doctype html><meta charset="utf-8"><style>
${glob}
*{box-sizing:border-box} body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{padding:26px;width:${ancho}px}
${css}
</style><div class="sh" data-tema="${TEMA}"><div class="marco"><div class="tp">${cuerpo}</div></div></div>`;

/* ---------- Piezas ---------- */
const flecha = `<svg class="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
const tic = `<svg class="tic" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;
const campo = (rot, dentro, id) => `<div${id?` id="${id}"`:""}><span class="rot-campo">${rot}</span>${dentro}</div>`;
const desple = (texto, sin) => `<div class="desple"><button class="disparo">
<span class="${sin ? "sin" : "puesto"}">${texto}</span>${flecha}</button></div>`;

const CHIPS = [["Casco vidrio", 7, 4], ["Envase", 4, 4], ["Estibas", 2, 0],
               ["PET", 3, 1], ["Lavado", 1, 0]];
const chip = ([n, p, c], on) => {
  const f = Math.max(0, p - c), s = Math.max(0, c - p);
  return `<button class="chip-plan${on ? " on" : ""}${f === 0 ? " lleno" : ""}">
<b>${n}</b><span class="falta">${f > 0 ? `Faltan ${f}` : s > 0 ? `+${s} sobre el plan` : "Completo"}</span>
<span class="prog">${c} / ${p}</span></button>`;
};

const asa = `<button class="asa"><svg viewBox="0 0 24 24"><path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/></svg></button>`;
const sw = (on) => `<label class="sw"><input type="checkbox" ${on ? "checked" : ""}><i></i></label>`;
const menuMas = `<div class="mas"><button>⋯</button><div class="menu">
<button type="button">Cambiar nombre y subtítulo</button>
<button type="button">Apagar</button>
<button type="button" class="mal">Borrar</button>
<div class="nota">Los 44 viajes que la nombran no se pierden: queda escrita en cada uno.</div>
</div></div>`;
const renglon = (n, s, v, on, abierto) => `<div class="item${on ? "" : " apagado"}">${asa}
<div class="nom"><b>${n}</b><span>${s}</span></div>
<span class="uso">${v} viajes</span>${sw(on)}${abierto ? menuMas : `<div class="mas"><button>⋯</button></div>`}</div>`;

/* =====================================================================
   LAS PÁGINAS, y qué se fotografía de cada una.
   `mira` es lo que se recuadra; `alto` deja aire para lo que se abre.
   ===================================================================== */
const PAGINAS = [

/* ---------- REGISTRAR ---------- */
{
  nombre: "reg", ancho: 900, alto: 1100,
  cuerpo: `<section class="tarj-reg"><div class="cuerpo-f">
<div class="linea-campos">
${campo("¿Qué se registra?", `<div class="seg"><button class="on">Viaje con carga</button><button>Viaje vacío</button></div>`)}
${campo("Turno", `<div class="seg turno"><button class="on">A</button><button>B</button><button>C</button></div>`)}
</div>

${campo("Del plan del turno A", `<div class="chips-plan">
${CHIPS.map((c, i) => chip(c, i === 0)).join("")}
<button class="chip-mas"><b>+</b><span class="falta">Adicional</span><span class="prog">no planeado</span></button>
</div>
<p class="guia adicional">Del plan caben <b>3</b>; los otros <b>2</b> salen como <b>adicionales</b>.</p>`, "c-tipos")}

${campo("Ruta", `<div class="ruta">
${desple("Ag01<i>Bodega propia</i>")}
<button class="voltear"><svg viewBox="0 0 24 24"><path d="M7 10h13M7 10l3-3M7 10l3 3"/><path d="M17 14H4M17 14l-3-3M17 14l-3 3"/></svg></button>
${desple("Planta Barranquilla<i>Planta</i>")}</div>
<div class="rutas-frec"><button>Ag01 → Planta Barranquilla</button><button>Planta Barranquilla → Ag01</button></div>`, "c-ruta")}

<div class="linea-campos">
${campo("Cuántos viajes", `<div class="conteo"><span class="cel-step grande"><button>−</button><input value="1"><button>+</button></span>
<span class="nota-conteo">El plan se mide en viajes, no en canastas.</span></div>`, "c-cuantos")}
${campo("Carga (opcional)", `<input class="campo-suelto" placeholder="Canastas, estibas…">`)}
</div>
</div>
<div class="pie-reg"><button class="btn si">Registrar (2 adicionales)</button>
<span class="atajo">o pulsa <kbd>Ctrl</kbd> + <kbd>Enter</kbd></span></div>
</section>`,
  mira: [
    [".linea-campos > div:nth-child(1)", "p-carga-vacio"],
    [".linea-campos > div:nth-child(2)", "p-turno"],
    ["#c-tipos", "p-tipos"],
    ["#c-ruta", "p-ruta"],
    ["#c-cuantos", "p-cuantos"],
    [".pie-reg", "p-registrar"],
  ],
},

/* ---------- LA PLACA, con la lista abierta ---------- */
{
  nombre: "placa", ancho: 640, alto: 620,
  cuerpo: `<section class="tarj-reg"><div class="cuerpo-f">
${campo("Placa", `<div class="placa"><div class="desple grande">
<button class="disparo" aria-expanded="true"><span class="puesto">ABC123<i>Tractomula de Summar</i></span>${flecha}</button>
<div class="opciones"><div class="filtro"><input placeholder="Buscar…"></div><div class="rollo">
<button class="elegida">${tic}<span>ABC123<i>Tractomula de Summar</i></span></button>
<button class="marcada">${tic}<span>BHG156<i>Turbo propio</i></span></button>
<button>${tic}<span>UYT569</span></button>
<button>${tic}<span>WGX418<i>Sencillo</i></span></button>
<button class="mas"><span>＋ Otra placa…</span></button>
</div></div></div></div>`, "c-placa")}
</div></section>`,
  mira: [["#c-placa", "p-placa"]],
},

/* ---------- EL PLAN DEL TURNO, en el panel de la derecha ---------- */
{
  nombre: "panel", ancho: 420, alto: 380,
  cuerpo: `<div class="plan-turno"><div class="corte"></div><div class="rot">PLAN DEL TURNO A</div>
<div class="marca"><b>15</b><span>de 22 viajes</span></div>
<div class="huecos">${Array.from({ length: 22 }, (_, i) => `<i class="${i < 15 ? "lleno" : ""}"></i>`).join("")}</div>
<div class="pie-plan">Cada cuadro es un viaje del plan. Se prende al registrarlo.</div></div>`,
  mira: [[".plan-turno", "p-panel-turno"]],
},

/* ---------- ANULAR ---------- */
{
  nombre: "anular", ancho: 820, alto: 560,
  cuerpo: `<section class="caja">
<div class="fila"><div class="placa">WGX418</div>
<div><div class="ruta">Ag01 <span class="fl">→</span> CD Galapa</div>
<div class="meta"><span>Estibas</span><span>Turno A</span><span>10:58</span><span>Cristian P.</span><span>TR-0187</span></div></div>
<div class="der"><button class="btn chico">Cancelar</button></div></div>
<div class="pie-accion">
<div class="campo"><label>¿Por qué se anula?</label>
<input value="Se digitó dos veces"></div>
<p class="guia">El viaje no se borra: se queda marcado con este motivo y deja de contar para
el cumplido. Borrarlo dejaría el plan cuadrando sin que nadie sepa por qué.</p>
<button class="btn si">Anular este viaje</button></div>
</section>`,
  mira: [["section.caja", "p-anular"]],
},

/* ---------- UN VIAJE ANULADO Y UNO CORREGIDO ---------- */
{
  nombre: "marcas", ancho: 820, alto: 420,
  cuerpo: `<section class="caja">
<div class="fila anulada"><div class="placa">WGX418</div>
<div><div class="ruta">Ag01 <span class="fl">→</span> CD Galapa</div>
<div class="meta"><span>Estibas</span><span>Turno A</span><span>10:58</span><span>TR-0187</span></div>
<div class="meta"><span class="eti mal">ANULADO</span><span>Se digitó dos veces</span></div></div>
<div class="der"></div></div>
<div class="fila"><div class="placa">BHG156</div>
<div><div class="ruta">Ag01 <span class="fl">→</span> Planta Barranquilla</div>
<div class="meta"><span>Casco vidrio</span><span>Turno A</span><span>11:32</span><span>TR-0184</span>
<span class="eti corregido">CORREGIDO</span></div></div>
<div class="der"><button class="btn chico">Corregir</button><button class="btn chico">Anular</button></div></div>
</section>`,
  mira: [["section.caja", "p-marcas"]],
},

/* ---------- LOS ATAJOS DEL PLAN ---------- */
{
  nombre: "atajos", ancho: 420, alto: 320,
  cuerpo: `<div class="atajos-plan"><h3>Armar más rápido</h3>
<p>Casi todos los días se parecen. No empieces de cero.</p>
<div class="fila-a"><button>Copiar el plan de ayer <span>28</span></button>
<button>Promedio del mismo día <span>31</span></button>
<button>Vaciar la rejilla <span>0</span></button></div></div>`,
  mira: [[".atajos-plan", "p-atajos"]],
},

/* ---------- PUBLICAR O GUARDAR BORRADOR ---------- */
{
  nombre: "publicar", ancho: 880, alto: 260,
  cuerpo: `<section class="matriz"><div class="pie-publicar">
<button class="btn si">Publicar plan del día</button>
<button class="btn">Guardar borrador</button>
<span class="aviso-cambios"><b>4 cambios</b> sin publicar · ya hay 4 viajes hechos sobre este plan</span>
</div></section>`,
  mira: [[".pie-publicar", "p-publicar"]],
},

/* ---------- EL MAESTRO: agregar y el menú ---------- */
{
  nombre: "maestro", ancho: 640, alto: 760,
  cuerpo: `<div class="caja-m">
<div class="cab-m"><h2>Placas <em>4</em></h2>
<p>Los vehículos que se pueden escoger al registrar.</p></div>
<form class="agregar-m"><input placeholder="Placa — ABC123"><button>Agregar</button></form>
${renglon("ABC123", "Tractomula de Summar", 142, 1)}
${renglon("BHG156", "Turbo propio", 96, 1)}
${renglon("UYT569", "", 44, 1, true)}
</div>`,
  mira: [[".agregar-m", "p-agregar"], [".caja-m", "p-menu-mas"]],
},

/* ---------- POSIBLES DUPLICADOS ---------- */
{
  nombre: "dup", ancho: 820, alto: 340,
  cuerpo: `<section class="duplicados"><h3>Posibles duplicados</h3>
<p>Mismo sitio escrito de dos formas. Si se dejan así, el informe por punto parte el mismo
lugar en dos y ninguno cuadra.</p>
<div class="par-dup"><span class="tx">AG-01</span><span class="cuantos">4 viajes</span>
<span class="fl">→</span><span class="tx gana">Ag01</span><span class="cuantos">142 viajes</span>
<button class="unir">Unir en Ag01</button></div></section>`,
  mira: [[".duplicados", "p-duplicados"]],
},
];

/* ===================================================================== */
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
fs.mkdirSync(".arnes/manual", { recursive: true });
let n = 0;

for (const P of PAGINAS) {
  const pg = await nav.newPage({
    viewport: { width: P.ancho, height: P.alto }, deviceScaleFactor: 2,
  });
  await pg.setContent(pagina(P.cuerpo, P.ancho), { waitUntil: "load" });
  await pg.waitForTimeout(120);

  for (const [sel, nombre, op = {}] of P.mira) {
    const caja = await pg.evaluate(([sel, hasta]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      /* La unión con los hijos: lo que se abre —un desplegable, un
         menú— vive fuera de la caja del padre. */
      let { top: t, left: l, bottom: b, right: r } = el.getBoundingClientRect();
      for (const h of el.querySelectorAll("*")) {
        const c = h.getBoundingClientRect();
        if (c.width === 0 || c.height === 0) continue;
        t = Math.min(t, c.top); l = Math.min(l, c.left);
        b = Math.max(b, c.bottom); r = Math.max(r, c.right);
      }
      if (hasta) {
        const f = document.querySelector(hasta);
        if (f) { const c = f.getBoundingClientRect(); b = Math.max(b, c.bottom); r = Math.max(r, c.right) }
      }
      return { t, l, b, r };
    }, [sel, op.hasta ?? null]);

    if (!caja) { console.log("NO ENCONTRÉ", sel); continue }
    const p = 14;  /* aire alrededor, para que no quede pegado al filo */
    await pg.screenshot({
      path: `.arnes/manual/${nombre}.png`,
      clip: {
        x: Math.max(0, caja.l - p), y: Math.max(0, caja.t - p),
        width: Math.min(P.ancho, caja.r - caja.l + p * 2),
        height: caja.b - caja.t + p * 2,
      },
    });
    n++;
    console.log(`${nombre.padEnd(16)} ${Math.round(caja.r - caja.l)}×${Math.round(caja.b - caja.t)}`);
  }
  await pg.close();
}
await nav.close();
console.log(`\n${n} capturas en .arnes/manual/`);
