/* =====================================================================
   LA FILA DE UN USUARIO CON MUCHAS PANTALLAS EXTRA

   LO QUE PASÓ. La columna «Pantallas extra» imprimía una chapa por cada
   pantalla. Con diecisiete —el caso real de Santiago Leal— la fila medía
   cinco veces las otras: la tabla dejaba de leerse de un vistazo, que es
   para lo único que sirve una tabla. Y ninguna de las diecisiete se
   podía tocar.

   QUÉ SE COMPRUEBA
     · Que la MISMA tabla con y sin las diecisiete pantallas mida
       prácticamente lo mismo. Y se compara la tabla entera, no una fila
       contra otra: la primera versión de este arnés comparaba la fila
       llena contra una vacía y no cazó nada, porque al ensancharse la
       columna de las chapas se estrechaba la de acciones y los botones
       se partían en dos líneas — TODAS las filas crecían a la vez, así
       que la razón entre ellas seguía siendo 1. El daño era uniforme, y
       una medida relativa a algo que también se daña no mide nada.
     · Que el editor, cuando se abre, ofrezca blancos que se tocan con
       guante —30 px en escritorio, 38 en pantalla chica— y que las
       diecisiete casillas quepan sin salirse por los lados.
     · Y que el panel no se cuele cuando NADIE está en edición: una fila
       de más en una tabla es una fila que alguien va a intentar leer.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const us   = readFileSync(new URL("../src/app/(app)/admin/usuarios/usuarios.css", import.meta.url), "utf8");
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/* Los módulos y secciones reales, para que el panel mida lo que mide de
   verdad y no una versión corta inventada aquí. */
const MODULOS = [
  { n: "T1 / T2", s: ["Fuente principal", "Maestro", "Importar", "En tránsito", "Certificar", "Seguimiento"] },
  { n: "Quiebra", s: ["Tablero", "Quiebra diaria", "Importar"] },
  { n: "Inventario", s: ["Resumen", "Bodegas", "Conteos físicos", "Productos", "Movimientos"] },
  { n: "Administración", s: ["Roles", "Usuarios"] },
];

const seccion = (nombre) => `
  <div class="us-sec"><span>${nombre}</span>
    <div class="us-niveles"><button>Ver</button><button class="on">Editar</button></div>
  </div>`;

const panel = `
<tr class="us-panel"><td colspan="6">
  <p class="us-rot">Pantallas de Santiago Leal<em> — se suman a las de su rol</em></p>
  <p class="us-dice">Toca el nivel otra vez para quitarlo.</p>
  <div class="us-modulos">
    ${MODULOS.map((m) => `<div class="us-mod"><b style="border-color:#E4002B">${m.n}</b>
      ${m.s.map(seccion).join("")}</div>`).join("")}
  </div>
</td></tr>`;

const fila = (nombre, usuario, cuantas, edicion) => `
<tr class="${edicion ? "us-editando" : ""}">
  <td>${nombre}</td>
  <td class="cod">${usuario}</td>
  <td>Administrador</td>
  <td class="us-cuantas">${
    edicion ? '<span class="us-editando-aqui">17 elegidas · abajo ↓</span>'
      : cuantas === 0 ? '<span class="apagado">—</span>'
        : `<button class="us-chapa cuenta">${cuantas} pantallas<em>ver y cambiar</em></button>`
  }</td>
  <td><span class="us-estado bien">al día</span></td>
  <td class="us-acc"><button class="us-mini">Editar</button>
    <button class="us-mini">Nueva clave</button></td>
</tr>`;

const tabla = (conPanel, cuantas = 17) => `
<div class="us"><div class="us-marco"><table class="us-tabla">
  <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th>
    <th>Pantallas extra</th><th>Estado</th><th class="us-acc">Acciones</th></tr></thead>
  <tbody>
    ${fila("ARENOSA", "arenosa", 0, false)}
    ${fila("Santiago Leal", "sleal", cuantas, conPanel)}
    ${conPanel ? panel : ""}
    ${fila("operador", "operador", 0, false)}
  </tbody>
</table></div></div>`;

const PANTALLAS = [
  { w: 1440, h: 900, nombre: "escritorio", toque: 30 },
  { w: 820,  h: 1180, nombre: "tableta", toque: 30 },
  { w: 390,  h: 844, nombre: "celular", toque: 38 },
];

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fallas = [];

console.log("pantalla      tabla sin    tabla con 17   botón más bajo   se sale");
for (const p of PANTALLAS) {
  const pag = await navegador.newPage({ viewport: { width: p.w, height: p.h } });

  /* 1 ─ CERRADO, DOS VECES: la misma tabla con las diecisiete pantallas
     y sin ninguna. La diferencia entre las dos es exactamente lo que
     cuesta esa columna. */
  const mideTabla = async (html) => {
    await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}${us}
      html,body{margin:0;background:#EEF1F5}main{padding:16px}</style></head>
      <body><main>${html}</main></body></html>`);
    return pag.evaluate(() => ({
      alto: Math.round(document.querySelector(".us-tabla").getBoundingClientRect().height),
      paneles: document.querySelectorAll(".us-panel").length,
    }));
  };
  const conNada = await mideTabla(tabla(false, 0));
  const con17 = await mideTabla(tabla(false, 17));
  const cerrado = { vacia: conNada.alto, llena: con17.alto, panelesSueltos: con17.paneles };

  /* 2 ─ ABIERTO: la fila en edición, con su panel. */
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}${us}
    html,body{margin:0;background:#EEF1F5}main{padding:16px}</style></head>
    <body><main>${tabla(true, 17)}</main></body></html>`);

  const abierto = await pag.evaluate(() => {
    const caja = document.querySelector(".us-panel > td").getBoundingClientRect();
    let bajo = 999;
    for (const b of document.querySelectorAll(".us-niveles button"))
      bajo = Math.min(bajo, b.getBoundingClientRect().height);
    const salen = [...document.querySelectorAll(".us-panel *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
    }).map((e) => e.className || e.tagName.toLowerCase());
    return { bajo: Math.round(bajo), salen: [...new Set(salen)] };
  });
  await pag.close();

  console.log(`${p.nombre.padEnd(13)} ${String(cerrado.vacia).padStart(6)} px ` +
              `${String(cerrado.llena).padStart(9)} px ${String(abierto.bajo).padStart(11)} px   ` +
              (abierto.salen.length ? abierto.salen.join(", ") : "nada"));

  /* EL BUG, MEDIDO. Tener diecisiete pantallas extra no puede costarle
     alto a la tabla: con las chapas apiladas costaba más del doble. El
     20 % de margen es para que el botón pueda ser un poco más alto que
     un guion, y nada más. */
  if (cerrado.llena > cerrado.vacia * 1.2)
    fallas.push(`${p.nombre}: con 17 pantallas la tabla mide ${cerrado.llena} px contra ` +
                `${cerrado.vacia} sin ninguna — esa columna vuelve a costar alto`);
  if (cerrado.panelesSueltos > 0)
    fallas.push(`${p.nombre}: hay un panel de pantallas dibujado sin que nadie esté editando`);
  if (abierto.bajo < p.toque)
    fallas.push(`${p.nombre}: los botones de nivel miden ${abierto.bajo} px ` +
                `(mínimo ${p.toque} para tocarlos con guante)`);
  if (abierto.salen.length)
    fallas.push(`${p.nombre}: el panel se sale por los lados: ${abierto.salen.join(", ")}`);
}

await navegador.close();
if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\nListo: la tabla queda pareja y el editor se toca en las tres.");
