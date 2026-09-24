// src/modulos/roturas/sankey.ts
var COLOR_ASUMIDA = "#FFC400";
var COLOR_NO_ASUMIDA = "#E4002B";
var COLOR_PROCESO = "#B87F00";
var COLOR_PROCESO_2 = "#8A8E8A";
var COLOR_VIDRIO = "#FFC400";
var COLOR_LIQUIDO = "#B87F00";
var PISO = 1.5;
var ANCHO_NODO = 20;
var ALTO_ROTULO = 64;
var HUECO = ALTO_ROTULO;
function armarSankey(e, ancho = 1160, alto = 500) {
  const cols = e.columnas.length;
  const ARRIBA = 30;
  const ABAJO = ALTO_ROTULO;
  const util = alto - ARRIBA - ABAJO;
  let escala = Infinity;
  for (const col of e.columnas) {
    if (!col.length) continue;
    const suma = col.reduce((s, n) => s + n.valor, 0);
    if (suma <= 0) continue;
    const libre = util - HUECO * (col.length - 1);
    escala = Math.min(escala, libre / suma);
  }
  if (!isFinite(escala) || escala <= 0) escala = 0;
  const paso = cols > 1 ? (ancho - ANCHO_NODO) / (cols - 1) : 0;
  const grosor = (v) => Math.max(PISO, v * escala);
  const salen = /* @__PURE__ */ new Map();
  const entran = /* @__PURE__ */ new Map();
  for (const t of e.tramos) {
    if (t.valor <= 0) continue;
    salen.set(t.de, (salen.get(t.de) ?? 0) + grosor(t.valor));
    entran.set(t.a, (entran.get(t.a) ?? 0) + grosor(t.valor));
  }
  const nodos = [];
  const porId = /* @__PURE__ */ new Map();
  e.columnas.forEach((col, ci) => {
    let y = ARRIBA;
    for (const n of col) {
      const cintasDe = Math.max(salen.get(n.id) ?? 0, entran.get(n.id) ?? 0, PISO);
      const h = Math.max(cintasDe, n.valor * escala);
      const nodo = {
        id: n.id,
        col: ci,
        rotulo: n.rotulo,
        pie: n.pie,
        valor: n.valor,
        color: n.color,
        x: ci * paso,
        y,
        alto: h
      };
      nodos.push(nodo);
      porId.set(n.id, nodo);
      y += h + HUECO;
    }
  });
  const usadoSale = /* @__PURE__ */ new Map();
  const usadoEntra = /* @__PURE__ */ new Map();
  const cintas = [];
  for (const t of e.tramos) {
    const a = porId.get(t.de), b = porId.get(t.a);
    if (!a || !b || t.valor <= 0) continue;
    const h = grosor(t.valor);
    const y0 = a.y + (usadoSale.get(a.id) ?? 0);
    const y1 = b.y + (usadoEntra.get(b.id) ?? 0);
    usadoSale.set(a.id, (usadoSale.get(a.id) ?? 0) + h);
    usadoEntra.set(b.id, (usadoEntra.get(b.id) ?? 0) + h);
    const x0 = a.x + ANCHO_NODO;
    const x1 = b.x;
    const cx = (x0 + x1) / 2;
    cintas.push({
      de: t.de,
      a: t.a,
      valor: t.valor,
      /* LA CINTA SE PINTA DEL COLOR DE DONDE SALE, no de a dónde llega:
         la pregunta de esta pantalla es «de qué causa salió», y seguir
         un color desde la izquierda es como se lee. */
      color: a.color,
      d: `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1} L${x1},${y1 + h} C${cx},${y1 + h} ${cx},${y0 + h} ${x0},${y0 + h} Z`
    });
  }
  return { ancho, alto, nodos, cintas, agrupados: 0 };
}
function masGrandes(filas, n) {
  const orden = [...filas].sort((a, b) => b.valor - a.valor);
  if (orden.length <= n) return { filas: orden, juntados: 0 };
  const cabeza = orden.slice(0, n - 1);
  const cola = orden.slice(n - 1);
  const suma = cola.reduce((s, x) => s + x.valor, 0);
  return {
    filas: [...cabeza, { ...cola[0], id: "__otros", valor: suma }],
    juntados: cola.length
  };
}
export {
  COLOR_ASUMIDA,
  COLOR_LIQUIDO,
  COLOR_NO_ASUMIDA,
  COLOR_PROCESO,
  COLOR_PROCESO_2,
  COLOR_VIDRIO,
  armarSankey,
  masGrandes
};
