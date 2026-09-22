import type { Renglon, ConteoFefo } from "./fefo";

/**
 * RIESGO DE VENCIMIENTO — las cuentas del tablero de inventario.
 *
 * Puro: no lee la base, recibe los renglones de los conteos enviados y el
 * maestro. Así el tablero, el panel y el PDF dicen lo mismo, y se puede
 * medir con datos hechos a mano.
 *
 * LA FOTO, NO LA SUMA. Si la calle A se contó el lunes y otra vez el
 * jueves, sumar los dos recorridos daría el doble de cajas. Lo que hay en
 * la bodega es lo que dijo EL ÚLTIMO recorrido que pasó por cada
 * ubicación. Por eso cada ubicación toma solo los renglones del conteo
 * más reciente que la tocó.
 *
 * LOS ENVASES NO SE VENCEN: no entran en el riesgo.
 */

export type Franja = "vencido" | "pasado" | "semana" | "quince" | "mes" | "ok" | "sinfecha";

export const FRANJAS: { clave: Franja; rot: string; corto: string; que: string }[] = [
  { clave: "vencido", rot: "Ya vencido", corto: "Vencido", que: "pasó su fecha de vencimiento: no se puede despachar" },
  { clave: "pasado", rot: "Ya no alcanza a salir", corto: "Pasó de salida", que: "no llega al cliente con la vida útil mínima" },
  { clave: "semana", rot: "Sale esta semana", corto: "0–7 días", que: "tiene que salir en los próximos 7 días" },
  { clave: "quince", rot: "Sale en 8 a 15 días", corto: "8–15 días", que: "hay que programarlo" },
  { clave: "mes", rot: "Sale en 16 a 30 días", corto: "16–30 días", que: "vigilar" },
  { clave: "ok", rot: "Con margen", corto: "+30 días", que: "más de un mes para salir" },
  { clave: "sinfecha", rot: "Sin fecha", corto: "Sin fecha", que: "no se le puede calcular cuándo sale" },
];

export function franja(r: Pick<Renglon, "dias_para_vencer" | "dias_para_salir">): Franja {
  if (r.dias_para_vencer != null && r.dias_para_vencer < 0) return "vencido";
  const d = r.dias_para_salir;
  if (d == null) return "sinfecha";
  if (d < 0) return "pasado";
  if (d <= 7) return "semana";
  if (d <= 15) return "quince";
  if (d <= 30) return "mes";
  return "ok";
}
const ORDEN: Record<Franja, number> = { vencido: 0, pasado: 1, semana: 2, quince: 3, mes: 4, ok: 5, sinfecha: 6 };
export const peor = (a: Franja, b: Franja) => (ORDEN[a] <= ORDEN[b] ? a : b);
export const enRiesgo = (f: Franja) => ORDEN[f] <= ORDEN.mes;

/** Un sitio donde está el material, con todo lo que se sabe de él. */
export type Sitio = {
  id: string; ubicacion: string; calle: string | null; modulo: string | null; lado: string | null;
  vencimiento: string | null; fabricacion: string | null; dias_para_vencer: number | null; dias_para_salir: number | null;
  estibas: number; cajas: number; saldo: number; total_cajas: number; unidades: number | null;
  franja: Franja; averia: boolean; pnc: boolean; nota: string | null;
  conto: string | null; contado_en: string | null; conteo: string;
};

export type MaterialRiesgo = {
  codigo: string; nombre: string; familia: string | null; uxc: number | null;
  cajas: number; unidades: number | null; enRiesgoCajas: number; enRiesgoUnidades: number | null;
  franja: Franja; diasSalir: number | null; vence: string | null; sitios: Sitio[];
};

export type Riesgo = {
  foto: Renglon[];
  /** Cajas / unidades / renglones / materiales por franja. */
  franjas: Record<Franja, { cajas: number; unidades: number; renglones: number; materiales: number; sinUxc: number }>;
  materiales: MaterialRiesgo[];
  /** Cajas que TIENEN que salir por semana, las próximas 8 (la 0 ya se pasó). */
  semanas: { rot: string; cajas: number; unidades: number }[];
  totalCajas: number; totalUnidades: number; ubicaciones: number;
  /** Del conteo más viejo al más nuevo que aportan a la foto. */
  desde: string | null; hasta: string | null; recorridos: number;
};

const num = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0 };

export function medirRiesgo(lineas: Renglon[], conteos: ConteoFefo[], uxcPorSku: Record<string, number | null>): Riesgo {
  /* ---------- LA FOTO ---------- */
  const cuando = new Map(conteos.map((c) => [c.id, c.enviado_en ?? c.fecha_analisis ?? ""]));
  const ultimoPorSitio = new Map<string, string>();
  for (const l of lineas) {
    const k = l.ubicacion_id ?? l.ubicacion ?? "—";
    const actual = ultimoPorSitio.get(k);
    if (!actual || (cuando.get(l.conteo_id) ?? "") > (cuando.get(actual) ?? "")) ultimoPorSitio.set(k, l.conteo_id);
  }
  const foto = lineas.filter((l) => ultimoPorSitio.get(l.ubicacion_id ?? l.ubicacion ?? "—") === l.conteo_id);
  const usados = new Set(foto.map((l) => l.conteo_id));
  const fechas = conteos.filter((c) => usados.has(c.id)).map((c) => c.fecha_analisis).filter(Boolean).sort();

  /* ---------- POR FRANJA Y POR MATERIAL ---------- */
  const vacia = () => ({ cajas: 0, unidades: 0, renglones: 0, materiales: 0, sinUxc: 0 });
  const franjas = Object.fromEntries(FRANJAS.map((f) => [f.clave, vacia()])) as Riesgo["franjas"];
  const porMat = new Map<string, MaterialRiesgo>();
  const matsPorFranja = new Map<Franja, Set<string>>();
  let totalCajas = 0, totalUnidades = 0;

  for (const l of foto) {
    if (l.tipo_material === "ENVASE") continue;
    const uxc = uxcPorSku[l.codigo] ?? null;
    const tc = num(l.total_cajas);
    const un = uxc ? tc * uxc : null;
    const f = franja(l);
    const fr = franjas[f];
    fr.cajas += tc; fr.renglones += 1; if (un != null) fr.unidades += un; else fr.sinUxc += 1;
    (matsPorFranja.get(f) ?? matsPorFranja.set(f, new Set()).get(f)!).add(l.codigo);
    totalCajas += tc; if (un != null) totalUnidades += un;

    const m = porMat.get(l.codigo) ?? {
      codigo: l.codigo, nombre: l.material, familia: l.familia, uxc, cajas: 0, unidades: uxc ? 0 : null,
      enRiesgoCajas: 0, enRiesgoUnidades: uxc ? 0 : null, franja: "ok" as Franja, diasSalir: null, vence: null, sitios: [],
    };
    m.cajas += tc; if (m.unidades != null && un != null) m.unidades += un;
    if (enRiesgo(f)) { m.enRiesgoCajas += tc; if (m.enRiesgoUnidades != null && un != null) m.enRiesgoUnidades += un }
    m.franja = m.sitios.length ? peor(m.franja, f) : f;
    if (l.dias_para_salir != null && (m.diasSalir == null || l.dias_para_salir < m.diasSalir)) { m.diasSalir = l.dias_para_salir; m.vence = l.vencimiento }
    m.sitios.push({
      id: l.id, ubicacion: l.ubicacion_combinada ?? l.ubicacion ?? "Sin ubicación", calle: l.calle, modulo: l.modulo, lado: l.lado,
      vencimiento: l.vencimiento, fabricacion: l.fabricacion, dias_para_vencer: l.dias_para_vencer, dias_para_salir: l.dias_para_salir,
      estibas: num(l.estibas), cajas: num(l.cajas), saldo: num(l.saldo), total_cajas: tc, unidades: un, franja: f,
      averia: !!l.averia, pnc: !!l.pnc, nota: l.nota, conto: l.conto, contado_en: l.contado_en, conteo: l.conteo,
    });
    porMat.set(l.codigo, m);
  }
  for (const [f, s] of matsPorFranja) franjas[f].materiales = s.size;

  const materiales = [...porMat.values()].map((m) => ({
    ...m,
    sitios: m.sitios.sort((a, b) => ORDEN[a.franja] - ORDEN[b.franja] || (a.dias_para_salir ?? 1e9) - (b.dias_para_salir ?? 1e9)
      || a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true })),
  })).sort((a, b) => ORDEN[a.franja] - ORDEN[b.franja] || b.enRiesgoCajas - a.enRiesgoCajas || b.cajas - a.cajas);

  /* ---------- LAS PRÓXIMAS 8 SEMANAS ---------- */
  const semanas = Array.from({ length: 9 }, (_, i) => ({ rot: i === 0 ? "Pasó" : i === 1 ? "Esta" : `S+${i - 1}`, cajas: 0, unidades: 0 }));
  for (const l of foto) {
    if (l.tipo_material === "ENVASE" || l.dias_para_salir == null) continue;
    const i = l.dias_para_salir < 0 || franja(l) === "vencido" ? 0 : Math.floor(l.dias_para_salir / 7) + 1;
    if (i > 8) continue;
    const uxc = uxcPorSku[l.codigo] ?? null;
    semanas[i].cajas += num(l.total_cajas); if (uxc) semanas[i].unidades += num(l.total_cajas) * uxc;
  }

  return {
    foto, franjas, materiales, semanas, totalCajas, totalUnidades,
    ubicaciones: new Set(foto.map((l) => l.ubicacion_id ?? l.ubicacion)).size,
    desde: fechas[0] ?? null, hasta: fechas.at(-1) ?? null, recorridos: usados.size,
  };
}
