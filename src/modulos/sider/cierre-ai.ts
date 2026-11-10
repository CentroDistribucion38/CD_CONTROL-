/**
 * EL CIERRE DE TURNO DE LA REVISIÓN AI (SIDER) — funciones puras, sin React.
 *
 * «VH y cantidad revisada · CDs revisados de mayor a menor AI · defecto más encontrado en la revisión (pareto).»
 *
 * La pantalla, la imagen y el texto para copiar salen de ESTA cuenta: si cada uno sumara por su lado, el papel diría
 * una cifra y la pantalla otra.
 *
 *   VH            vehículos revisados: viajes distintos (si no trae viaje, placas distintas). Un camión con dos materiales
 *                 revisados es UN vehículo.
 *   REVISADA      unidades revisadas (la muestra), y recibidas aparte.
 *   %AI           unidades en mal estado / unidades revisadas, SUMADAS (no el promedio de los %).
 *   CD            el socio de la revisión.
 *   PARETO        solo los defectos que cobran —los que forman el %AI—, del más encontrado al menos, con su % y el acumulado.
 *                 Lo que se cuenta y no cobra (mezclado, cuerpo extraño…) se dice aparte para que la suma no engañe.
 */
import type { Revision } from "./ai";
import type { PorDefecto } from "./informe-ai";

export type CdCierre = { clave: string; nombre: string; vh: number; revisiones: number; recibidas: number; revisadas: number; malas: number; indice: number };
export type ParetoFila = { clave: string; nombre: string; unidades: number; pct: number; pctDefectos: number; acumulado: number };
export type CierreAi = {
  vh: number; revisiones: number; recibidas: number; revisadas: number; malas: number; indice: number;
  cds: CdCierre[];
  pareto: ParetoFila[];
  /** Unidades contadas que no cobran (no entran en el %AI). */
  otras: { nombre: string; unidades: number }[];
};

const vhDe = (r: Revision) => (r.viaje_id ? `v:${r.viaje_id}` : `p:${r.placa}`);

export function armarCierreAi(revs: Revision[], defectos: PorDefecto[]): CierreAi {
  const vhTodos = new Set(revs.map(vhDe));
  const porCd = new Map<string, CdCierre & { _vh: Set<string> }>();
  for (const r of revs) {
    const k = r.socio ?? "—";
    const x = porCd.get(k) ?? { clave: k, nombre: r.socio_nombre ?? "Sin socio", vh: 0, revisiones: 0, recibidas: 0, revisadas: 0, malas: 0, indice: 0, _vh: new Set<string>() };
    x._vh.add(vhDe(r)); x.revisiones++; x.recibidas += r.recibidas; x.revisadas += r.revisadas; x.malas += r.defectos;
    porCd.set(k, x);
  }
  const cds = [...porCd.values()].map(({ _vh, ...x }) => ({ ...x, vh: _vh.size, indice: x.revisadas > 0 ? x.malas / x.revisadas : 0 }))
    .sort((a, b) => b.indice - a.indice || b.revisadas - a.revisadas);
  const revisadas = revs.reduce((t, r) => t + r.revisadas, 0), malas = revs.reduce((t, r) => t + r.defectos, 0);
  const cobran = defectos.filter((d) => d.cobra && d.unidades > 0).sort((a, b) => b.unidades - a.unidades);
  const totalMalas = cobran.reduce((t, d) => t + d.unidades, 0);
  let ac = 0;
  const pareto = cobran.map((d) => { ac += d.unidades; return { clave: d.clave, nombre: d.nombre, unidades: d.unidades, pct: revisadas > 0 ? d.unidades / revisadas : 0, pctDefectos: totalMalas > 0 ? d.unidades / totalMalas : 0, acumulado: totalMalas > 0 ? ac / totalMalas : 0 } });
  return {
    vh: vhTodos.size, revisiones: revs.length, recibidas: revs.reduce((t, r) => t + r.recibidas, 0), revisadas, malas,
    indice: revisadas > 0 ? malas / revisadas : 0,
    cds, pareto,
    otras: defectos.filter((d) => !d.cobra && d.unidades > 0).sort((a, b) => b.unidades - a.unidades).map((d) => ({ nombre: d.nombre, unidades: d.unidades })),
  };
}

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pc = (x: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x * 100) + " %";

/** El mismo cierre como texto para pegar en un mensaje. */
export function textoCierreAi(c: CierreAi, rotulo: string, generado: Date): string {
  const L: string[] = [];
  L.push(`CIERRE DE TURNO · REVISIÓN AI`, rotulo, `Foto de las ${generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`, "");
  L.push(`VH revisados: ${c.vh} · Revisiones: ${c.revisiones}`, `Cantidad revisada: ${nf.format(c.revisadas)} un. (recibidas ${nf.format(c.recibidas)})`, `En mal estado: ${nf.format(c.malas)} un. · %AI ${pc(c.indice)}`, "");
  L.push("CDs revisados, de mayor a menor %AI:");
  if (!c.cds.length) L.push("  — sin revisiones —");
  c.cds.forEach((x, i) => L.push(`  ${i + 1}. ${x.nombre} · ${x.vh} VH · ${nf.format(x.revisadas)} rev. · ${nf.format(x.malas)} malas · ${pc(x.indice)}`));
  L.push("", "Defecto más encontrado (pareto):");
  if (!c.pareto.length) L.push("  — sin defectos —");
  c.pareto.forEach((d, i) => L.push(`  ${i + 1}. ${d.nombre} · ${nf.format(d.unidades)} un. · ${pc(d.pct)} de lo revisado · acumulado ${Math.round(d.acumulado * 100)} %`));
  if (c.otras.length) L.push("", `Contadas que no cobran: ${c.otras.map((o) => `${o.nombre} ${nf.format(o.unidades)}`).join(" · ")}`);
  return L.join("\n");
}
