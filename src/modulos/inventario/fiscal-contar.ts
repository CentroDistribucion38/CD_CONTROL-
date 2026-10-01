import type { Material } from "./fefo";

/* ===================================================================
   CONTAR LA HOJA DEL INVENTARIO FISCAL — lo que se teclea y cómo se revisa

   Es el mismo renglón del conteo diario (dónde, qué, vence, cuánto), pero
   más corto: en el fiscal no se pregunta por rotación, avería ni estado del
   envase. Y UN CERO CUENTA: «0 cajas» es contar que ahí no hay nada, y en un
   inventario fiscal eso es un dato, no un renglón vacío (en el diario
   no se puede anotar cero porque no se cuenta lo que no está).
   =================================================================== */
export type ModoFiscal = "estibas" | "cajas";

export type BorradorFiscal = {
  calle: string;
  /** «A|01»: calle y módulo, sin el lado. */
  base: string;
  lado: string;
  codigo: string;
  dia: string; mes: string; anio: string;
  modo: ModoFiscal; estibas: string; saldo: string; cajas: string;
  nota: string;
};
export const VACIO_FISCAL: BorradorFiscal = {
  calle: "", base: "", lado: "", codigo: "", dia: "", mes: "", anio: "",
  modo: "estibas", estibas: "", saldo: "", cajas: "", nota: "",
};

/** Una cantidad: vacío es «no se contó»; 0 es «se contó y no hay». */
export const cantidad = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const d = t.replace(/\D/g, "");
  return d === "" ? null : Number(d);
};

/** Lo que dice la casilla sin pasar por «cantidad»: para saber si hay fecha a medias. */
const hayFecha = (b: BorradorFiscal) => b.dia.trim() !== "" || b.mes.trim() !== "" || b.anio.trim() !== "";

/** Cajas que da el renglón, o null si no se puede saber (estibas de un material sin factor). */
export function totalCajas(b: BorradorFiscal, mat: Material | null): { formula: string | null; total: number | null } | null {
  if (b.modo === "cajas") {
    const c = cantidad(b.cajas);
    return c == null ? null : { formula: String(c), total: c };
  }
  const e = cantidad(b.estibas), s = cantidad(b.saldo);
  if (e == null && s == null) return null;
  const f = mat?.cajas_por_estiba ?? null;
  if (e != null && e > 0 && f == null) return { formula: null, total: null };
  const total = (e ?? 0) * (f ?? 0) + (s ?? 0);
  const partes = [e != null ? `${e} × ${f ?? 0}` : null, s != null ? String(s) : null].filter(Boolean).join(" + ");
  return { formula: partes, total };
}

/** Lo que falta o está mal en el renglón, dicho como lo diría una persona; null si se puede anotar. */
export function revisarFiscal(b: BorradorFiscal, mat: Material | null, claveEscogida: string | null): string | null {
  const env = mat?.tipo_material === "ENVASE";
  if (!b.base) return "Escoge el módulo.";
  if (!claveEscogida) return "Falta decir de qué lado del módulo.";
  if (!mat) return b.codigo.trim() === "" ? "Falta el código del material." : `El código «${b.codigo.trim()}» no está en el maestro.`;
  if (b.modo === "cajas") {
    if (cantidad(b.cajas) == null) return "¿Cuántas cajas? Si no hay nada, anota 0.";
  } else {
    const e = cantidad(b.estibas), s = cantidad(b.saldo);
    if (e == null && s == null) return "¿Cuántas estibas? Si solo hay sueltas, anótalas en el saldo; si no hay nada, anota 0.";
    if (e != null && e > 0 && mat.cajas_por_estiba == null) return "Este material no dice cuántas cajas lleva una estiba: cuéntalo por cajas.";
  }
  if (!env && !(b.dia.trim() !== "" && b.mes.trim() !== "" && b.anio.trim() !== "")) return "Falta la fecha de vencimiento.";
  if (hayFecha(b)) {
    const d = cantidad(b.dia), m = cantidad(b.mes), a = cantidad(b.anio);
    if (d == null || m == null || a == null) return "La fecha de vencimiento va completa: día, mes y año.";
    if (d < 1 || d > 31) return `El día del vencimiento dice ${d}. Va de 1 a 31.`;
    if (m < 1 || m > 12) return `El mes del vencimiento dice ${m}. Va de 1 a 12.`;
    const f = new Date(2000 + a, m - 1, d);
    if (f.getMonth() !== m - 1 || f.getDate() !== d) return `El ${d}/${m}/${a} no existe. Revisa el día.`;
  }
  return null;
}

/** Los argumentos de `inv_fiscal_contar_agregar`. Solo se llama con un renglón que pasó `revisarFiscal`. */
export function argumentosFiscal(hojaId: string, ubicacionId: string, mat: Material, b: BorradorFiscal) {
  const fecha = hayFecha(b);
  return {
    p_hoja: hojaId,
    p_ubicacion: ubicacionId,
    p_producto: mat.id,
    p_estibas: b.modo === "estibas" ? cantidad(b.estibas) : null,
    p_saldo: b.modo === "estibas" ? cantidad(b.saldo) : null,
    p_cajas: b.modo === "cajas" ? cantidad(b.cajas) : null,
    p_dia: fecha ? cantidad(b.dia) : null,
    p_mes: fecha ? cantidad(b.mes) : null,
    p_anio: fecha ? cantidad(b.anio) : null,
    p_nota: b.nota.trim() === "" ? null : b.nota.trim(),
  };
}

/** Lo que devuelve `inv_fiscal_contar_mios`. */
export type RenglonFiscal = {
  id: string; ubicacion_id: string; ubicacion: string; producto_id: string; sku: string; material: string;
  estibas: number | null; saldo: number | null; cajas: number | null; total_cajas: number | string;
  venc_dia: number | null; venc_mes: number | null; venc_anio: number | null; nota: string | null; contado_en: string;
};
