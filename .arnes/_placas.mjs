// src/modulos/sider/placas.ts
var normPlaca = (s) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
var esPlaca = (s) => /^[A-Z0-9]{5,7}$/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s);
function porPalabras(pedazo) {
  const ps = pedazo.split(/\s+/).map(normPlaca).filter(Boolean);
  const out = [];
  for (let i = 0; i < ps.length; i++) {
    if (esPlaca(ps[i])) out.push(ps[i]);
    else if (i + 1 < ps.length && esPlaca(ps[i] + ps[i + 1])) {
      out.push(ps[i] + ps[i + 1]);
      i++;
    }
  }
  return out;
}
function leerPlacas(texto) {
  const vistas = /* @__PURE__ */ new Set();
  const out = [];
  for (const pedazo of texto.split(/[\r\n\t,;|]+/)) {
    const junto = normPlaca(pedazo);
    const candidatas = esPlaca(junto) ? [junto] : porPalabras(pedazo);
    for (const c of candidatas) {
      if (esPlaca(c) && !vistas.has(c)) {
        vistas.add(c);
        out.push(c);
      }
    }
  }
  return out;
}
export {
  leerPlacas,
  normPlaca
};
