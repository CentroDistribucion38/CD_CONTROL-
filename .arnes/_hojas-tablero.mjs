// .arnes/_link.mjs
import { createElement } from "react";
function Link({ href, children, ...r }) {
  return createElement("a", { href, ...r }, children);
}

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

// src/app/(app)/quiebra/rotura/tablero/Hojas.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function ResumenHojas({ hojas, dias, conLinea, falta, desde, hasta }) {
  const q = new URLSearchParams({ desde, hasta }).toString();
  if (falta) {
    return /* @__PURE__ */ jsx("section", { className: "rl-tarj rl-hojas", children: /* @__PURE__ */ jsxs("p", { className: "rl-hojas-falta", children: [
      "Los informes generados se listan cuando se corra",
      " ",
      /* @__PURE__ */ jsx("code", { children: "supabase/migraciones/2026-09-rotura-linea-hojas.sql" }),
      "."
    ] }) });
  }
  const r = resumirHojas(hojas, dias, { conLinea });
  const pend = r.sinHoja.length;
  const ojo = pend > 0 || r.cambio.size > 0;
  return /* @__PURE__ */ jsxs(Link, { href: `/quiebra/rotura/tablero/informes?${q}`, className: `rl-tarj rl-hojas rl-hojas-ir${ojo ? " ojo" : ""}`, children: [
    /* @__PURE__ */ jsx("span", { className: "rl-hojas-tit", children: "Informes generados" }),
    /* @__PURE__ */ jsxs("span", { className: "rl-hojas-dice", children: [
      /* @__PURE__ */ jsx("b", { children: r.total }),
      " ",
      r.total === 1 ? "hoja" : "hojas",
      " de ",
      r.dias,
      " ",
      r.dias === 1 ? "d\xEDa" : "d\xEDas",
      pend > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        " \xB7 ",
        /* @__PURE__ */ jsxs("em", { children: [
          pend,
          " ",
          pend === 1 ? "d\xEDa" : "d\xEDas",
          " sin hoja"
        ] })
      ] }),
      r.cambio.size > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        " \xB7 ",
        /* @__PURE__ */ jsxs("em", { children: [
          r.cambio.size,
          " ",
          r.cambio.size === 1 ? "cambi\xF3" : "cambiaron",
          " despu\xE9s"
        ] })
      ] }),
      !ojo && r.total > 0 && /* @__PURE__ */ jsx(Fragment, { children: " \xB7 ninguna pendiente" })
    ] }),
    /* @__PURE__ */ jsx("span", { className: "rl-hojas-flecha", children: "Ver, descargar y anular \u2192" })
  ] });
}
export {
  ResumenHojas
};
