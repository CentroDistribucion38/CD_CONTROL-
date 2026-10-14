import type { FilaAnalisis } from "./analisis-dif";

/** Retornable ↔ su NR nuevo (330 cc, la misma botella): se cruzan en los ajustes del análisis de diferencia.
 *  Va aparte (sin nada del servidor) porque lo usan el servidor (los ajustes) y el navegador (el Excel). */
export const COMPENSA: [string, string][] = [
  ["3500162", "412644"],   // Envase Marrón 330R       ↔ ENVASE MARRON 330NR NUEVO
  ["3500446", "412671"],   // Envase Marrón Club Col   ↔ ENVASE MARRON 330NR CLUB COLOMBIA NUEVA
  ["3500213", "412707"],   // Envase Flint 330R        ↔ ENVASE FLINT AGUILA 330NR NUEVO
];

export type FilaAjuste = {
  familia: string; codigo: string; descripcion: string;
  sap: number; conteo: number; diferencia: number;
  /** Con qué código se cruza y cuánto se le aplicó a ESTA fila (con signo). */
  par: string | null; parDescripcion: string | null; compensa: number;
  /** Lo que queda por ajustar (CONTEO − SAP después de compensar). */
  ajuste: number;
  observacion: string;
  /** Lo que ya se hizo en SAP: la compensación (sí/no) y cuánto del ajuste (vacío = nada). */
  compHecha: boolean;
  ajusteHecho: number | null;
};

export type Hecho = { comp: boolean; ajuste: number | null };

export function calcularAjustes(filas: FilaAnalisis[], obs: Record<string, string>, hechos: Record<string, Hecho> = {}): FilaAjuste[] {
  const por = new Map(filas.map((f) => [f.codigo, f]));
  const comp = new Map<string, { par: string; aplica: number }>();
  for (const [r, nr] of COMPENSA) {
    const a = por.get(r), b = por.get(nr);
    if (!a || !b) continue;
    const da = a.diferencia, db = b.diferencia;
    /* Solo si uno sobra y el otro falta. */
    if (!(da > 0 && db < 0) && !(da < 0 && db > 0)) {
      comp.set(r, { par: nr, aplica: 0 }); comp.set(nr, { par: r, aplica: 0 });
      continue;
    }
    const m = Math.min(Math.abs(da), Math.abs(db));
    comp.set(r, { par: nr, aplica: -Math.sign(da) * m });
    comp.set(nr, { par: r, aplica: -Math.sign(db) * m });
  }
  return filas.map((f) => {
    const c = comp.get(f.codigo);
    const compensa = c?.aplica ?? 0;
    return {
      familia: f.familia, codigo: f.codigo, descripcion: f.descripcion,
      sap: f.sap, conteo: f.conteo, diferencia: f.diferencia,
      par: c?.par ?? null, parDescripcion: c ? por.get(c.par)?.descripcion ?? null : null,
      compensa, ajuste: f.diferencia + compensa,
      observacion: obs[f.codigo] ?? "",
      compHecha: hechos[f.codigo]?.comp ?? false,
      ajusteHecho: hechos[f.codigo]?.ajuste ?? null,
    };
  });
}


/* =====================================================================
   EL ANÁLISIS FINAL: cómo queda SAP con lo que ya se hizo.
     · la compensación hecha mueve SAP al revés de la compensación: el R que sobraba recibe lo del NR
       (SAP sube), el NR que faltaba lo entrega (SAP baja);
     · el ajuste hecho mueve SAP en su signo (sobrante sube, faltante baja).
   SAP final = SAP + compensación hecha + ajuste hecho.  Diferencia final = CONTEO − SAP final.
   Si todo se hizo, la diferencia final es cero.
   ===================================================================== */
export type FilaFinal = FilaAjuste & { movComp: number; movAjuste: number; sapFinal: number; difFinal: number };

export function analisisFinal(xs: FilaAjuste[]): FilaFinal[] {
  return xs.map((f) => {
    const movComp = f.compHecha ? -f.compensa : 0;
    const movAjuste = f.ajusteHecho ?? 0;
    const sapFinal = f.sap + movComp + movAjuste;
    return { ...f, movComp, movAjuste, sapFinal, difFinal: f.conteo - sapFinal };
  });
}
