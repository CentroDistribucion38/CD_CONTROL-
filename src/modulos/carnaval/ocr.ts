import type { FilaHoja, SeccionHoja } from "./logica";

/**
 * DEL TEXTO QUE LEYÓ EL LECTOR DE LA FOTO A LA HOJA DE EXISTENCIAS.
 *
 * Leer letras de una foto pequeña falla (Costeñita sale «Costeflita», ceros salen «i)»), pero la hoja tiene siempre los
 * mismos renglones. Entonces: la hoja de molde (el último inventario guardado, o la inicial) pone los NOMBRES y el orden;
 * del texto leído solo se sacan los NÚMEROS de cada renglón, emparejando cada línea con el renglón del molde que más se le
 * parece, siempre hacia adelante. Todo lo que no quedó claro se marca `dudosa` para que una persona lo revise:
 *   · un número que no se pudo leer (en dos columnas se deja en 0 y se marca; en PALLET queda vacío y se marca),
 *   · un renglón del molde que no apareció en la foto,
 *   · una línea de la foto que no corresponde a ningún renglón (se cuenta en `sobrantes`).
 */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Parecido entre dos textos, de 0 a 1 (distancia de edición). */
export function parecido(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

const UMBRAL = 0.6;
const VENTANA = 14;
const soloDigitos = (t: string) => /^\d{1,6}$/.test(t);
/** Cómo suele salir un 0 en una celda sombreada: «i)», «it)», «a)», «4)», «i]», «Q»… Un número de verdad nunca trae paréntesis. */
const CERO_RUIDO = /^\(?[iIl1aAtTqQoO4eE¢c]{0,3}[)\]}]$|^[Qo]$/;
/** Secciones con una sola columna de números (la segunda es solo un título sin datos). */
const UNA_COLUMNA = (titulo: string) => /^(pallet|estibas de madera)/i.test(titulo.trim());

type Pos = { si: number; fi: number; cols: 1 | 2 };
export type Armada = { secciones: SeccionHoja[]; sobrantes: string[]; sinLeer: number; dudosas: number; fecha: string | null };

/** Una línea leída: sus trozos y qué tan seguro estuvo el lector de cada uno (0 a 100). */
export type LineaLeida = { toks: string[]; conf: number[] };
/** Por debajo de esto, el lector no estaba seguro del trozo y el renglón queda marcado. */
const CONF_MIN = 60;

export function armarDesdeTexto(texto: string, molde: SeccionHoja[]): Armada {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const toks = l.split(/\s+/); return { toks, conf: toks.map(() => 100) } });
  return armarDesdeLineas(lineas, molde, texto);
}

export function armarDesdeLineas(lineasLeidas: LineaLeida[], molde: SeccionHoja[], textoCompleto = lineasLeidas.map((l) => l.toks.join(" ")).join("\n")): Armada {
  const secciones: SeccionHoja[] = molde.map((s) => ({ ...s, filas: s.filas.map((f) => ({ concepto: f.concepto, a: null, b: null, dudosa: true } as FilaHoja)) }));
  const pos: Pos[] = [];
  molde.forEach((s, si) => s.filas.forEach((_, fi) => pos.push({ si, fi, cols: UNA_COLUMNA(s.titulo) ? 1 : 2 })));
  const claves = pos.map((p) => fold(secciones[p.si].filas[p.fi].concepto));

  const fm = textoCompleto.match(/(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})/);
  const fecha = fm ? `${fm[3]}-${fm[2].padStart(2, "0")}-${fm[1].padStart(2, "0")}` : null;

  const sobrantes: string[] = [];
  let j = 0;
  for (const ll of lineasLeidas) {
    const toks = ll.toks, linea = toks.join(" ");
    if (toks.length < 2) { continue }
    let mejor = -1, mejorP = 0;
    for (let i = j; i < Math.min(pos.length, j + VENTANA); i++) {
      const k = pos[i].cols;
      /* el concepto = la línea sin sus últimos k trozos (y, en una columna, sin el ruido final) */
      let fin = toks.length;
      if (k === 1) while (fin > 1 && !soloDigitos(toks[fin - 1])) fin--;
      const corte = Math.max(1, fin - k);
      const p = parecido(fold(toks.slice(0, corte).join(" ")), claves[i]);
      if (p > mejorP) { mejorP = p; mejor = i }
    }
    if (mejor < 0 || mejorP < UMBRAL) { if (/\d/.test(linea)) sobrantes.push(linea); continue }

    const { si, fi, cols } = pos[mejor];
    const fila = secciones[si].filas[fi];
    let dudosa = false;
    const leer = (t: string | undefined): number | null => {
      if (t != null && soloDigitos(t)) return Number(t);
      if (t != null && CERO_RUIDO.test(t)) return 0;
      dudosa = true;
      return null;
    };
    if (cols === 2) {
      const [ta, tb] = toks.slice(-2);
      const a = leer(ta), b = leer(tb);
      if (ll.conf.slice(-2).some((c) => c < CONF_MIN)) dudosa = true;
      fila.a = a ?? 0; fila.b = b ?? 0;               // lo ilegible casi siempre es un 0 sombreado; queda marcado
    } else {
      let fin = toks.length;
      while (fin > 1 && !soloDigitos(toks[fin - 1])) fin--;
      const ok = soloDigitos(toks[fin - 1] ?? "") && fin > 1;
      fila.a = ok ? Number(toks[fin - 1]) : null;
      if (!ok || (ll.conf[fin - 1] ?? 100) < CONF_MIN) dudosa = true;
      /* un trozo raro justo antes del número («oe 4» en vez de «122») delata un número mal leído */
      const antes = ok ? toks[fin - 2] : undefined;
      if (antes && !soloDigitos(antes) && parecido(fold(toks.slice(0, fin - 1).join(" ")), claves[mejor]) < 1 && fold(antes).length < 3 && !/\d/.test(antes)) dudosa = true;
      fila.b = null;
    }
    fila.dudosa = dudosa;
    j = mejor + 1;
  }
  const sinLeer = secciones.reduce((t, s) => t + s.filas.filter((f) => f.dudosa && f.a == null && f.b == null).length, 0);
  const dudosas = secciones.reduce((t, s) => t + s.filas.filter((f) => f.dudosa).length, 0);
  return { secciones, sobrantes, sinLeer, dudosas, fecha };
}
