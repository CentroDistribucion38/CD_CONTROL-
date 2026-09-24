// .arnes/_link.mjs
import { createElement } from "react";
function Link({ href, children, ...r }) {
  return createElement("a", { href, ...r }, children);
}

// src/app/(app)/quiebra/rotura/tablero/Pestanas.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Pestanas({ actual, desde, hasta, informes }) {
  const q = new URLSearchParams({ desde, hasta }).toString();
  return /* @__PURE__ */ jsxs("nav", { className: "rl-pestanas", "aria-label": "Hojas del tablero de rotura", children: [
    /* @__PURE__ */ jsx(Link, { href: `/quiebra/rotura/tablero?${q}`, "aria-current": actual === "tablero" ? "page" : void 0, children: "Tablero" }),
    /* @__PURE__ */ jsxs(
      Link,
      {
        href: `/quiebra/rotura/tablero/informes?${q}`,
        "aria-current": actual === "informes" ? "page" : void 0,
        children: [
          "Informes generados",
          informes != null && /* @__PURE__ */ jsx("b", { children: informes })
        ]
      }
    )
  ] });
}
export {
  Pestanas
};
