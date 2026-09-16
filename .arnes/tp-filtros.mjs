/* =====================================================================
   LOS FILTROS DE VARIOS A LA VEZ

   DOS COSAS, Y LA PRIMERA IMPORTA MÁS: que filtren bien. Un filtro que
   se ve precioso y devuelve las filas equivocadas es peor que no tener
   filtro, porque lo que sale se cree.

   1. LA LÓGICA. Se copia tal cual la de la pantalla —leer la lista de
      la dirección, prender, apagar, y decidir si una fila pasa— y se
      prueba contra los casos que rompen: nada escogido, uno solo, dos
      sueltos (A y C, dejando el B fuera), apagar el último, y los
      enlaces VIEJOS de un solo valor sin comas, que tienen que seguir
      abriendo lo mismo.

   2. QUE QUEPAN. Nueve tipos de viaje con nombres largos —«Averías /
      isotanque»— en una fila de filtros, a 360 px. O envuelven o se
      salen, y la diferencia no se ve escribiéndolo.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/(app)/traspasos/traspasos.css", import.meta.url), "utf8");
/* GLOBALS TAMBIÉN, y no es relleno: los tokens del tema —--tp-ojo,
   --tp-sobre— se definen allí. Sin ellos, `var(--tp-ojo)` no resuelve,
   el fondo y la letra del botón salen iguales, y la comprobación de
   contraste reporta 1.00 en los siete temas sobre un botón que en la
   app se ve perfecto. Una prueba que falla sin razón enseña a
   ignorarla. */
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const TEMAS = ["", "gris", "gris-ambar", "negro", "azul", "verde", "arena"];
const ANCHOS = [1440, 820, 390, 360];

const TIPOS = [
  ["casco", "Casco vidrio"], ["envase", "Envase"], ["estibas", "Estibas"],
  ["plastico", "Plástico"], ["pet", "PET"], ["lavado", "Lavado"],
  ["ptexpo", "PT expo"], ["material", "Material"], ["averias", "Averías / isotanque"],
];

const fallas = [];

/* ---------------------------------------------------------------------
   1. LA LÓGICA, copiada de la pantalla
   --------------------------------------------------------------------- */
const lista = (v) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const alternar = (v, x) => {
  const p = lista(v);
  return (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]).join(",");
};
const pasa = (valorUrl, fila) => {
  const s = new Set(lista(valorUrl));
  return s.size === 0 || s.has(fila);
};

const casos = [
  ["nada escogido deja pasar todo", () => pasa("", "A") && pasa("", "B") && pasa("", "C")],
  ["uno solo filtra", () => pasa("A", "A") && !pasa("A", "B")],
  ["dos sueltos: A y C, sin el B", () => {
    const v = alternar(alternar("", "A"), "C");
    return v === "A,C" && pasa(v, "A") && pasa(v, "C") && !pasa(v, "B");
  }],
  ["apagar uno de dos deja el otro", () => alternar("A,C", "A") === "C"],
  ["apagar el último vuelve a «todos»", () => {
    const v = alternar("C", "C");
    return v === "" && pasa(v, "A") && pasa(v, "B");
  }],
  ["prender dos veces el mismo no lo duplica", () =>
    alternar(alternar("", "B"), "B") === ""],
  /* LOS ENLACES VIEJOS. Antes de esto la dirección llevaba ?turno=A sin
     comas, y esos enlaces están mandados por chat. Tienen que seguir
     abriendo lo mismo o el cambio rompe algo que nadie ve. */
  ["un enlace viejo de un solo valor sigue sirviendo", () =>
    pasa("A", "A") && !pasa("A", "C")],
  ["espacios y comas sueltas no rompen nada", () =>
    lista(" A , ,C ,").join(",") === "A,C"],
  ["el orden en que se prenden no cambia lo que pasa", () => {
    const a = alternar(alternar("", "C"), "A");
    return pasa(a, "A") && pasa(a, "C") && !pasa(a, "B");
  }],
];
for (const [nombre, f] of casos) if (!f()) fallas.push(`lógica: ${nombre}`);
console.log(`Lógica: ${casos.length - fallas.length} de ${casos.length}`);

/* ---------------------------------------------------------------------
   1b. EL AGRUPADO: tres toques, UNA consulta

   Es la razón de que la barra dejara de sentirse trabada, así que es
   lo que hay que comprobar. Se copia el mecanismo de la pantalla —un
   reloj que se reinicia con cada toque y solo dispara cuando pasan
   400 ms sin tocar nada— y se cuenta CUÁNTAS VECES se iría al servidor.

   Con reloj de verdad, no con uno inventado: un temporizador simulado
   probaría la simulación, no el código.
   --------------------------------------------------------------------- */
const ESPERA = 400;
function barraFalsa() {
  let pend = {}, reloj = null, viajes = 0, ultimo = null;
  const mandar = (v) => { viajes++; ultimo = { ...v } };
  return {
    poner(clave, valor) {
      pend = { ...pend, [clave]: valor };
      if (reloj) clearTimeout(reloj);
      const copia = pend;
      reloj = setTimeout(() => mandar(copia), ESPERA);
    },
    alternar(clave, valor) {
      const p = lista(pend[clave] ?? "");
      this.poner(clave, (p.includes(valor) ? p.filter((x) => x !== valor) : [...p, valor]).join(","));
    },
    cuenta: () => viajes,
    ultimo: () => ultimo,
  };
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

{
  const b = barraFalsa();
  b.alternar("turno", "A");
  b.alternar("turno", "C");
  b.alternar("tipo", "pet");
  await dormir(ESPERA + 150);
  if (b.cuenta() !== 1)
    fallas.push(`agrupado: tres toques seguidos dispararon ${b.cuenta()} consultas, debía ser 1`);
  const u = b.ultimo() ?? {};
  if (u.turno !== "A,C" || u.tipo !== "pet")
    fallas.push(`agrupado: la consulta no llevó todo lo escogido (${JSON.stringify(u)})`);
  console.log(`Agrupado: 3 toques → ${b.cuenta()} consulta con ${JSON.stringify(u)}`);
}
{
  /* Y si de verdad se espera entre toque y toque, sí son dos: el
     agrupado junta lo seguido, no se queda esperando para siempre. */
  const b = barraFalsa();
  b.alternar("turno", "A");
  await dormir(ESPERA + 150);
  b.alternar("turno", "C");
  await dormir(ESPERA + 150);
  if (b.cuenta() !== 2)
    fallas.push(`agrupado: dos toques separados dieron ${b.cuenta()} consultas, debían ser 2`);
}

/* ---------------------------------------------------------------------
   2. QUE QUEPAN
   --------------------------------------------------------------------- */
const grupo = (rotulo, opciones, puestos) => `
<div class="grupo-f"><span class="grupo-r">${rotulo}${puestos.length ? `<i>${puestos.length}</i>` : ""}</span>
<div class="grupo-b"><button class="${puestos.length ? "" : "on"}">Todos</button>
${opciones.map(([id, n]) => `<button class="${puestos.includes(id) ? "on" : ""}">${n}</button>`).join("")}
</div></div>`;

const PAGINA = (tema) => `<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}>
<head><meta charset="utf-8"><style>${glob}${css}body{margin:0;font:14px system-ui}
.tp .filtros{background:#fff;border:1px solid #E3E8EF;border-radius:3px;padding:16px}
.tp .arriba{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}</style></head>
<body><div class="tp"><section class="filtros"><div class="arriba">
${grupo("Turno", [["A","A"],["B","B"],["C","C"]], ["A","C"])}
${grupo("Tipo de viaje", TIPOS, ["casco","pet","averias"])}
</div></section></div></body></html>`;

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const tema of TEMAS) {
  const pag = await navegador.newPage();
  await pag.setContent(PAGINA(tema));
  for (const ancho of ANCHOS) {
    await pag.setViewportSize({ width: ancho, height: 700 });
    const r = await pag.evaluate(() => {
      const caja = document.querySelector(".filtros").getBoundingClientRect();
      const botones = [...document.querySelectorAll(".grupo-b button")].map((b) => {
        const c = b.getBoundingClientRect();
        /* ¿El texto cabe dentro del botón o lo desborda? */
        const r = document.createRange();
        r.selectNodeContents(b);
        return { txt: b.textContent, ...c.toJSON(), texto: r.getBoundingClientRect().width };
      });
      const on = document.querySelector(".grupo-b button.on");
      const e = getComputedStyle(on);
      return { caja, botones, fondo: e.backgroundColor, tinta: e.color };
    });

    const donde = `${tema || "claro"} @${ancho}`;
    for (const b of r.botones) {
      if (b.right > r.caja.right + 1 || b.left < r.caja.left - 1)
        fallas.push(`${donde}: «${b.txt}» se sale de la tarjeta`);
      if (b.texto > b.width - 8)
        fallas.push(`${donde}: «${b.txt}» no cabe en su botón (${Math.round(b.texto)}>${Math.round(b.width - 8)})`);
      /* Tamaño mínimo para el dedo. En bodega se usa con guantes. */
      if (b.height < 34)
        fallas.push(`${donde}: «${b.txt}» mide ${Math.round(b.height)} px de alto, muy chico para el dedo`);
    }

    const lum = (c) => {
      const n = c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const e = c.startsWith("color(") ? 1 : 255;
      return n.map((v) => v / e).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    };
    /* TRANSPARENTE NO ES UN COLOR, y esta comprobación existe porque
       el arnés ya se dejó engañar una vez: la regla decía
       `var(--tp-grupo)`, ese token no existe, CSS descartó la
       declaración EN SILENCIO —no es un error, es cómo funciona— y el
       fondo quedó en rgba(0,0,0,0). El arnés leyó los ceros como negro
       puro, calculó 21.00 de contraste y aprobó un botón con letra
       blanca sobre papel blanco. Un fondo sin pintar se reporta, no se
       mide. */
    if (/rgba?\([^)]*,\s*0(\.0+)?\s*\)/.test(r.fondo) || r.fondo === "transparent") {
      fallas.push(`${donde}: el botón prendido se quedó SIN FONDO (${r.fondo}) — seguro hay un var() a un token que no existe`);
    } else {
      const [p, q] = [lum(r.tinta), lum(r.fondo)].sort((a, b) => b - a);
      const c = (p + 0.05) / (q + 0.05);
      if (c < 4.5) fallas.push(`${donde}: el botón prendido tiene contraste ${c.toFixed(2)}`);
    }
    if (ancho === 1440) console.log(`${(tema || "claro").padEnd(11)} prendido  fondo ${r.fondo}  letra ${r.tinta}`);
  }
  await pag.close();
}
await navegador.close();

if (fallas.length) {
  console.error("\nFALLAS:\n" + [...new Set(fallas)].map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log(`\nListo: la lógica pasa los ${casos.length} casos y los botones caben en ${TEMAS.length * ANCHOS.length} combinaciones.`);
