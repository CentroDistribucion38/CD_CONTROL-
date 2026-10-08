/**
 * LA SUMA TIPO EXCEL: «24+15-36» → 3.
 *
 * El Excel de casco va sumando movimientos a mano (=24+15-36+21…) y
 * aquí se teclea igual. NO se usa `eval` ni `Function`: lo que se teclea
 * en un campo no puede ser código. Solo entran números, + − × ÷ y
 * paréntesis; cualquier otra cosa devuelve null y el campo se marca.
 *
 * Vacío vale 0. Una «=» al principio se ignora (viene del hábito del
 * Excel). Se acepta coma o punto decimal.
 */
export function suma(texto: string): number | null {
  const t = texto.replace(/^\s*=/, "").replace(/\s+/g, "").replace(/,/g, ".")
    .replace(/[−–]/g, "-").replace(/[x×]/gi, "*").replace(/÷/g, "/");
  if (t === "") return 0;
  if (!/^[0-9+\-*/().]+$/.test(t)) return null;
  let i = 0;
  const num = (): number | null => {
    if (t[i] === "(") {
      i++;
      const v = suma_();
      if (v == null || t[i] !== ")") return null;
      i++;
      return v;
    }
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(t.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const unario = (): number | null => {
    if (t[i] === "-") { i++; const v = unario(); return v == null ? null : -v }
    if (t[i] === "+") { i++; return unario() }
    return num();
  };
  const prod = (): number | null => {
    let v = unario();
    while (v != null && (t[i] === "*" || t[i] === "/")) {
      const op = t[i++];
      const w = unario();
      if (w == null) return null;
      if (op === "/" && w === 0) return null;
      v = op === "*" ? v * w : v / w;
    }
    return v;
  };
  const suma_ = (): number | null => {
    let v = prod();
    while (v != null && (t[i] === "+" || t[i] === "-")) {
      const op = t[i++];
      const w = prod();
      if (w == null) return null;
      v = op === "+" ? v + w : v - w;
    }
    return v;
  };
  const r = suma_();
  if (r == null || i !== t.length || !Number.isFinite(r)) return null;
  return Math.round(r * 100) / 100;
}

/** ¿Lo tecleado es una cuenta (tiene operadores) y no un número solo? */
export const esCuenta = (texto: string) => /[+*/()]|.-/.test(texto.replace(/^\s*=/, "").trim());
