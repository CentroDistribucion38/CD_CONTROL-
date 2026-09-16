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
     · Que la letra chica de cada renglón —«sale del rol · editar», 10,5
       px— se lea sobre el panel en los siete temas, y que el renglón de
       tres botones no descuadre la rejilla ni los empuje fuera.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

/* LAS DOS HOJAS, y el envoltorio `rl us` como en la página de verdad:
   los tokens --rl-* viven en `.rl`, así que un armazón con solo `us`
   los deja sin definir y todo cae a lo heredado. Con eso, el rótulo del
   rol medía 15,78 de contraste —que es el negro del texto normal, no el
   acento— y el arnés habría jurado que estaba bien sin haber mirado el
   color de verdad. Es la tercera vez en este proyecto que un armazón
   incompleto hace mentir a una medición. */
const rl   = readFileSync(new URL("../src/app/(app)/admin/roles/roles.css", import.meta.url), "utf8");
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

/* La mitad de las secciones se pintan como «el rol ya da», que es el
   caso realista de un administrador: su rol le da casi todo y las
   extra son la excepción. */
const seccion = (nombre, res, aMano) => `
  <div class="us-sec n-${res}">
    <span class="us-res ${res}">${res === "ninguno" ? "sin acceso" : res}</span>
    <span class="us-nom">${nombre}<em>${aMano ? "a mano · el rol da nada" : "sale del rol · editar"}</em></span>
    <div class="us-niveles tres">
      <button${aMano === "ninguno" ? ' class="on"' : ""}>Sin acceso</button>
      <button${aMano === "ver" ? ' class="on"' : ""}>Ver</button>
      <button${aMano === "editar" ? ' class="on"' : ""}>Editar</button>
    </div>
  </div>`;

const panel = `
<tr class="us-panel"><td colspan="6">
  <p class="us-rot">A qué entra Santiago Leal<em> — y a qué no</em></p>
  <p class="us-dice">A la izquierda, en qué queda cada pantalla.</p>
  <p class="us-resumen">Entra a <b>12 de 17</b> pantallas. 5 están puestas a mano.</p>
  <div class="us-modulos">
    ${MODULOS.map((m) => `<div class="us-mod"><b style="border-color:#E4002B">${m.n}</b>
      ${m.s.map((x, i) => seccion(x, ["editar", "ver", "ninguno"][i % 3],
          i % 3 === 2 ? "ninguno" : null)).join("")}</div>`).join("")}
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
<div class="rl us"><div class="us-marco"><table class="us-tabla">
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

/* Chromium contesta el color en 0–255 (`rgb(...)`) o en 0–1
   (`color(srgb ...)`, para lo que salga de un color-mix). Leer el
   segundo como el primero da contrastes inventados. */
const canales = (c) => {
  const n = (c.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
  return c.startsWith("color(") ? n.map((v) => v * 255) : n;
};
const contraste = (a, b) => {
  const lum = (c) => {
    const [r, g, bl] = canales(c).map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const L1 = lum(a), L2 = lum(b);
  return +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2);
};

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fallas = [];

console.log("pantalla      tabla sin    tabla con 17   botón más bajo   se sale");
for (const p of PANTALLAS) {
  const pag = await navegador.newPage({ viewport: { width: p.w, height: p.h } });

  /* 1 ─ CERRADO, DOS VECES: la misma tabla con las diecisiete pantallas
     y sin ninguna. La diferencia entre las dos es exactamente lo que
     cuesta esa columna. */
  const mideTabla = async (html) => {
    await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}${rl}${us}
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
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}${rl}${us}
    html,body{margin:0;background:#EEF1F5}main{padding:16px}</style></head>
    <body><main>${tabla(true, 17)}</main></body></html>`);

  const abierto = await pag.evaluate(() => {
    const caja = document.querySelector(".us-panel > td").getBoundingClientRect();
    let bajo = 999;
    for (const b of document.querySelectorAll(".us-niveles button"))
      bajo = Math.min(bajo, b.getBoundingClientRect().height);
    const g = (sel, prop) => {
      const e = document.querySelector(sel);
      return e ? getComputedStyle(e).getPropertyValue(prop) : "";
    };
    const yaTiene = { txt: g(".us-yatiene", "color"), fondo: g(".us-panel > td", "background-color") };
    const salen = [...document.querySelectorAll(".us-panel *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
    }).map((e) => e.className || e.tagName.toLowerCase());
    return { bajo: Math.round(bajo), salen: [...new Set(salen)], yaTiene };
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

/* ===== EL RÓTULO DEL ROL, EN LOS SIETE TEMAS =====
   «el rol ya da · editar» es letra de 10,5 px pintada con el acento del
   tema sobre el fondo del panel: dos tokens que nadie emparejó a
   propósito, y el acento cambia con las preferencias de cada quien. Se
   mide tema por tema, que es la única forma de saberlo. */
const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const pag = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
console.log("\ntema      la letra chica del renglón, sobre el panel");
for (const t of TEMAS) {
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}${rl}${us}
    html,body{margin:0;background:#EEF1F5}main{padding:16px}</style></head>
    <body><div class="sh"${t ? ` data-tema="${t}"` : ""}><main>${tabla(true, 17)}</main></div></body></html>`);
  const m = await pag.evaluate(() => {
    const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
    return { txt: g(".us-sec .us-nom em", "color"), fondo: g(".us-panel > td", "background-color") };
  });
  const c = contraste(m.txt, m.fondo);
  const nombre = t ?? "oficial";
  console.log(`${nombre.padEnd(9)} ${c}`);
  if (c < 4.5)
    fallas.push(`tema ${nombre}: la letra chica del renglón contrasta ${c} sobre el panel (mínimo 4.5)`);
}
await pag.close();
await navegador.close();
if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}

console.log("\nListo: la tabla queda pareja, el editor se toca y el rótulo del rol se lee.");
