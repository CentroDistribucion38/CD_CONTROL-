/**
 * ANÁLISIS DE DIFERENCIA · LAS CUENTAS DE LAS HOJAS APARTE PARA EL INFORME (puras, sin base):
 * la recurrencia de los días guardados y la comparación contra el día guardado anterior.
 */
export type FilaDia = { fecha: string; codigo: string; descripcion: string; sap: number; conteo: number; diferencia: number; ajuste: number };

export type Recurrente = { codigo: string; descripcion: string; racha: number; ult: number; total: number; falta: number; sobra: number };
/** Los códigos que terminan el rango (los últimos `dias` días hasta `hasta`) con `min` o más días guardados seguidos
 *  faltando o sobrando. */
export function recurrencias(detalle: FilaDia[], hasta: string, dias = 30, min = 3): { desde: string; fechas: number; filas: Recurrente[] } {
  const desde = new Date(Date.parse(hasta + "T12:00:00Z") - (dias - 1) * 86400000).toISOString().slice(0, 10);
  const fechas = [...new Set(detalle.map((f) => f.fecha))].filter((f) => f >= desde && f <= hasta).sort();
  const en = new Set(fechas);
  const por = new Map<string, { descripcion: string; v: Map<string, number> }>();
  for (const f of detalle) {
    if (!en.has(f.fecha)) continue;
    const c = por.get(f.codigo) ?? { descripcion: f.descripcion, v: new Map() };
    c.v.set(f.fecha, f.ajuste); por.set(f.codigo, c);
  }
  const filas: Recurrente[] = [];
  for (const [codigo, c] of por) {
    const serie = fechas.map((d) => c.v.get(d) ?? 0);
    const ult = serie.at(-1) ?? 0; let racha = 0;
    if (ult !== 0) for (let i = serie.length - 1; i >= 0 && Math.sign(serie[i]) === Math.sign(ult); i--) racha++;
    if (racha >= min) filas.push({ codigo, descripcion: c.descripcion, racha, ult, total: serie.reduce((t, x) => t + x, 0), falta: serie.filter((x) => x < 0).length, sobra: serie.filter((x) => x > 0).length });
  }
  return { desde, fechas: fechas.length, filas: filas.sort((a, b) => b.racha - a.racha || Math.abs(b.total) - Math.abs(a.total)) };
}

export type Cambio = { codigo: string; descripcion: string; da: number; dh: number; cambio: number; estado: "empeoro" | "mejoro" | "nuevo" | "cerro" | "igual" };
/** El día contra el día guardado anterior. */
export function contraAnterior(detalle: FilaDia[], fecha: string): { anterior: string | null; filas: Cambio[] } {
  const anterior = [...new Set(detalle.map((f) => f.fecha))].filter((f) => f < fecha).sort().at(-1) ?? null;
  if (!anterior) return { anterior: null, filas: [] };
  const H = new Map(detalle.filter((f) => f.fecha === fecha).map((f) => [f.codigo, f]));
  const A = new Map(detalle.filter((f) => f.fecha === anterior).map((f) => [f.codigo, f]));
  const filas = [...new Set([...H.keys(), ...A.keys()])].map((c) => {
    const h = H.get(c), a = A.get(c);
    const dh = h?.diferencia ?? 0, da = a?.diferencia ?? 0;
    const estado: Cambio["estado"] = dh === da ? "igual" : da === 0 ? "nuevo" : dh === 0 ? "cerro" : Math.abs(dh) > Math.abs(da) ? "empeoro" : "mejoro";
    return { codigo: c, descripcion: (h ?? a)!.descripcion, da, dh, cambio: dh - da, estado };
  }).filter((f) => f.dh !== 0 || f.da !== 0).sort((x, y) => Math.abs(y.cambio) - Math.abs(x.cambio));
  return { anterior, filas };
}
