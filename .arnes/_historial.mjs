// src/modulos/rotlinea/historial.ts
var DESDE_HOJAS = "2026-09-21";
var anulada = (h) => h.anulada_en != null;
function resumirHojas(hojas, dias, { conLinea }) {
  const undDia = /* @__PURE__ */ new Map();
  for (const d of dias) undDia.set(d.fecha, (undDia.get(d.fecha) ?? 0) + Number(d.und));
  const ultima = /* @__PURE__ */ new Map();
  for (const h of hojas) {
    if (anulada(h)) continue;
    const u = ultima.get(h.fecha);
    if (!u || h.generado_en > u.generado_en) ultima.set(h.fecha, h);
  }
  const sinHoja = [...undDia.entries()].filter(([f, u]) => u > 0 && f >= DESDE_HOJAS && !ultima.has(f)).map(([fecha, und]) => ({ fecha, und })).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const cambio = /* @__PURE__ */ new Set();
  if (!conLinea) {
    for (const [f, h] of ultima) {
      const hoy = undDia.get(f) ?? 0;
      if (Number(h.unidades) !== hoy) cambio.add(h.id);
    }
  }
  const ordenadas = [...hojas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.generado_en.localeCompare(a.generado_en));
  const anuladas = hojas.filter(anulada).length;
  return {
    total: hojas.length - anuladas,
    anuladas,
    dias: ultima.size,
    sinHoja,
    cambio,
    ordenadas,
    esUltima: (h) => ultima.get(h.fecha)?.id === h.id
  };
}
export {
  DESDE_HOJAS,
  anulada,
  resumirHojas
};
