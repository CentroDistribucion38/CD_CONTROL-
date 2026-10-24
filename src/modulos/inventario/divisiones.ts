import { createClient } from "@/lib/supabase/server";
import { porTandas } from "@/modulos/inventario/paginas";

/**
 * PASAR SOLO UNA PARTE DE LAS CAJAS DE UNA UBICACIÓN — «de las 90 cajas solo necesito pasar 45 para ANDINA».
 *
 * El renglón del conteo no se toca. `balance_divisiones` guarda cuántas cajas se separan de él; aquí esa parte
 * nace como un renglón más (su id es el de la división, y se reclasifica como cualquier otro) y al renglón de
 * donde salió se le restan. Todo lo que lee el consolidado del día (Balance, Cuadre, Consolidado) ve los dos
 * renglones como si se hubieran contado así. Si la tabla no existe o no se puede leer, los renglones salen
 * tal como se contaron.
 */
type Linea = {
  id: string;
  total_cajas: number | string | null;
  total_estibas?: number | string | null;
  estibas: number | string | null;
  cajas: number | string | null;
  saldo: number | string | null;
  factor_estibado?: number | string | null;
};
type Division = { id: string; conteo_envase_id: string; cajas: number | string; creado_en: string };

/** Reparte N cajas en estibas completas + sueltas con el factor del renglón (sin factor: todo sueltas). */
function reparto<T extends Linea>(l: T, total: number): T {
  const cpe = Number(l.factor_estibado) || 0;
  const est = cpe > 0 ? Math.floor(total / cpe) : 0;
  return { ...l, total_cajas: total, estibas: est, cajas: total - est * (cpe > 0 ? cpe : 0), saldo: 0,
    ...(l.total_estibas !== undefined ? { total_estibas: cpe > 0 ? total / cpe : 0 } : {}) };
}

export async function conDivisiones<T extends Linea>(lineas: T[]): Promise<T[]> {
  if (!lineas.length) return lineas;
  try {
    const supabase = await createClient();
    const divs: Division[] = [];
    let buscar = lineas.map((l) => String(l.id));
    /* Una parte se puede volver a dividir: se busca también por el id de las partes que van saliendo. */
    for (let vuelta = 0; vuelta < 4 && buscar.length; vuelta++) {
      const r = await porTandas<Division>(buscar, (t, d, h) =>
        supabase.from("balance_divisiones").select("id, conteo_envase_id, cajas, creado_en").in("conteo_envase_id", t).order("creado_en").range(d, h), 100);
      if (r.error || !r.data.length) break;
      divs.push(...r.data);
      buscar = r.data.map((x) => String(x.id));
    }
    if (!divs.length) return lineas;

    const salida: T[] = [];
    const porId = new Map<string, T>();
    const pos = new Map<string, number>();
    for (const l of lineas) { pos.set(String(l.id), salida.length); porId.set(String(l.id), l); salida.push(l) }
    /* De la más vieja a la más nueva: una parte siempre existe antes de que se divida. */
    divs.sort((a, b) => a.creado_en.localeCompare(b.creado_en));
    const orden: T[] = [...salida];
    for (const d of divs) {
      const base = porId.get(String(d.conteo_envase_id));
      if (!base) continue;
      const x = Number(d.cajas) || 0;
      const total = Number(base.total_cajas) || 0;
      if (x <= 0 || x >= total) continue; // ya no cabe (el renglón cambió): no se parte
      const resto = reparto(base, total - x);
      const parte = reparto({ ...base, id: d.id }, x);
      porId.set(String(base.id), resto);
      porId.set(String(d.id), parte);
      orden.splice(orden.findIndex((l) => String(l.id) === String(base.id)) + 1, 0, parte);
    }
    return orden.map((l) => porId.get(String(l.id)) ?? l);
  } catch { return lineas }
}
