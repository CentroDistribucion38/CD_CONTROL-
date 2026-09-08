/**
 * TABLERO DIARIO — datos de un mes.
 *
 * Dos capas que nunca se mezclan en la base:
 *   · SAP        — v_quiebra_dia / v_quiebra_dia_causal, salen de lo importado.
 *   · Escrito    — quiebra_diario / quiebra_diario_causal, lo teclea la gente.
 *
 * Al mostrar manda lo escrito, pero lo de SAP se sigue leyendo y viajando
 * hasta la pantalla para poder decir "usted escribió 12.400 y SAP dice
 * 11.980". La comparación es el punto: si se botara el dato de SAP, el
 * tablero diario sería un cuaderno, no un control.
 *
 * Se trae el MES completo de una sola vez (31 días × 7 causales ≈ 220
 * filas): moverse de día queda instantáneo y sin ir al servidor.
 */

/** Orden fijo, el mismo de la hoja QUIEBRA DIARIA del maestro. */
export const CAUSALES = [
  "Sorting distribución",
  "Presorting",
  "Rotura máquina",
  "Rotura depósito",
  "Sorting envase",
  "Lavado / extrasucio",
  "Otros",
] as const;

export type Causal = (typeof CAUSALES)[number];

/** Cómo se llama cada causal en la hoja de Excel, para que el que llega
 *  del archivo reconozca la fila que está llenando. */
export const NOMBRE_HOJA: Record<string, string> = {
  "Sorting distribución": "Rotura sorting",
  "Presorting": "Rotura pre sorting",
  "Rotura máquina": "Rotura máquina",
  "Rotura depósito": "Rotura depósito",
};

export type DiaSap = {
  fecha: string;
  produccion: number;
  baja: number;
  causales: Record<string, number>;
};

export type DiaManual = {
  fecha: string;
  le_produccion: number | null;
  le_baja: number | null;
  produccion: number | null;
  nota: string | null;
  actualizado_en: string | null;
  actualizado_por: string | null;
  causales: Record<string, number>;
};

export type MesDiario = {
  /** Primer día del mes, AAAA-MM-01 */
  mes: string;
  meta: number | null;
  sap: Record<string, DiaSap>;
  manual: Record<string, DiaManual>;
  /** id → usuario, para poder decir quién escribió */
  autores: Record<string, string>;
};

const finDeMes = (mes: string) => {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
};

/**
 * Lo único que se le pide al cliente de Supabase es saber consultar. Se
 * describe por su forma y no por el tipo de la librería porque el del
 * servidor y el del navegador tienen genéricos distintos y aquí sirven
 * los dos igual.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Cliente = { from: (tabla: string) => any };

/**
 * Lee un mes. Sirve igual en el servidor (primera carga) y en el
 * navegador (al cambiar de mes o después de guardar), porque los dos
 * clientes de Supabase tienen la misma forma.
 */
export async function leerMes(supabase: Cliente, mes: string): Promise<MesDiario> {
  const desde = `${mes.slice(0, 7)}-01`;
  const hasta = finDeMes(mes);
  const anio = Number(mes.slice(0, 4));
  const numMes = Number(mes.slice(5, 7));

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const q = supabase as any;

  const [dias, causales, cab, det, meta] = await Promise.all([
    q.from("v_quiebra_dia").select("fecha, produccion, perdida").gte("fecha", desde).lte("fecha", hasta),
    q.from("v_quiebra_dia_causal").select("fecha, causal, unidades").gte("fecha", desde).lte("fecha", hasta),
    q.from("quiebra_diario")
      .select("fecha, le_produccion, le_baja, produccion, nota, actualizado_en, actualizado_por")
      .gte("fecha", desde).lte("fecha", hasta),
    q.from("quiebra_diario_causal").select("fecha, causal, cantidad").gte("fecha", desde).lte("fecha", hasta),
    q.from("quiebra_metas").select("meta").eq("anio", anio).eq("mes", numMes).maybeSingle(),
  ]);

  const sap: Record<string, DiaSap> = {};
  for (const d of (dias.data ?? []) as { fecha: string; produccion: number; perdida: number }[]) {
    sap[d.fecha] = {
      fecha: d.fecha,
      produccion: Number(d.produccion) || 0,
      baja: Number(d.perdida) || 0,
      causales: {},
    };
  }
  for (const c of (causales.data ?? []) as { fecha: string; causal: string; unidades: number }[]) {
    (sap[c.fecha] ??= { fecha: c.fecha, produccion: 0, baja: 0, causales: {} })
      .causales[c.causal] = Number(c.unidades) || 0;
  }

  const manual: Record<string, DiaManual> = {};
  for (const m of (cab.data ?? []) as DiaManual[]) {
    manual[m.fecha] = {
      fecha: m.fecha,
      le_produccion: num(m.le_produccion),
      le_baja: num(m.le_baja),
      produccion: num(m.produccion),
      nota: m.nota ?? null,
      actualizado_en: m.actualizado_en ?? null,
      actualizado_por: m.actualizado_por ?? null,
      causales: {},
    };
  }
  for (const c of (det.data ?? []) as { fecha: string; causal: string; cantidad: number }[]) {
    const d = manual[c.fecha];
    if (d) d.causales[c.causal] = Number(c.cantidad) || 0;
  }

  // Quién escribió cada día. Sin esto, "editado el 3 sep" no dice nada.
  const ids = [...new Set(Object.values(manual).map((m) => m.actualizado_por).filter(Boolean))] as string[];
  const autores: Record<string, string> = {};
  if (ids.length) {
    const { data } = await q.from("perfiles").select("id, usuario, nombre").in("id", ids);
    for (const p of (data ?? []) as { id: string; usuario: string | null; nombre: string | null }[]) {
      autores[p.id] = p.usuario || p.nombre || "—";
    }
  }

  return {
    mes: desde,
    meta: meta.data ? Number((meta.data as { meta: number }).meta) : null,
    sap,
    manual,
    autores,
  };
}

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
