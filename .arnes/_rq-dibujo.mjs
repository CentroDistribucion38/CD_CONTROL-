// src/app/(app)/roturas/en-sitio/analisis/Recorrido.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Recorrido({ s, total }) {
  if (s.nodos.length === 0) {
    return /* @__PURE__ */ jsxs("div", { className: "vacio", children: [
      /* @__PURE__ */ jsx("b", { children: "Sin datos" }),
      "Todav\xEDa no hay roturas con visto bueno en este filtro."
    ] });
  }
  const ultima = s.nodos.reduce((m, x) => Math.max(m, x.col), 0);
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      viewBox: `0 0 ${s.ancho} ${s.alto}`,
      className: "rq-svg",
      role: "img",
      "aria-label": `Recorrido de ${total} unidades: de la causa al proceso y a la baja`,
      children: [
        s.cintas.map((c, i) => /* @__PURE__ */ jsx(
          "path",
          {
            d: c.d,
            fill: c.color,
            opacity: s.nodos.find((n) => n.id === c.de)?.col === 0 ? 0.45 : 0.4
          },
          i
        )),
        s.nodos.map((n) => {
          const fin = n.col === ultima;
          const tx = fin ? n.x - 14 : n.x + 34;
          return /* @__PURE__ */ jsxs("g", { children: [
            /* @__PURE__ */ jsx("rect", { x: n.x, y: n.y, width: 20, height: n.alto, fill: n.color }),
            /* @__PURE__ */ jsx(
              "text",
              {
                x: tx,
                y: n.y + 18,
                textAnchor: fin ? "end" : "start",
                className: "rq-t-rot",
                children: n.rotulo
              }
            ),
            /* @__PURE__ */ jsx(
              "text",
              {
                x: tx,
                y: n.y + 40,
                textAnchor: fin ? "end" : "start",
                className: "rq-t-n",
                children: n.valor
              }
            ),
            n.pie && /* @__PURE__ */ jsx(
              "text",
              {
                x: tx,
                y: n.y + 58,
                textAnchor: fin ? "end" : "start",
                className: "rq-t-pie",
                children: n.pie
              }
            )
          ] }, n.id);
        })
      ]
    }
  );
}
export {
  Recorrido
};
