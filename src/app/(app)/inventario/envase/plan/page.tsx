import Link from "next/link";
import { maestro, masDias, papeles, type FilaPlanBD } from "@/modulos/inventario/envase/calc";
import { hoyBogota, lunesDe, planesDeSemana, productosDe } from "@/modulos/inventario/envase/datos";
import { Pasos } from "../Pasos";
import "../../fefo.css";
import "../../balance/analisis/analisis.css";
import "../envase.css";
import "./plan.css";
import { PlanVista, type Bloque, type FilaSku, type Modo } from "./PlanVista";

export const dynamic = "force-dynamic";

const esF = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));
const hora = (g: string) => new Date(g.replace(" ", "T") + (/[zZ+]/.test(g.slice(10)) ? "" : "Z")).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }).replace(/\./g, "");
const MAX = 31;

/**
 * INVENTARIO › PLAN VS NOTIFICADO › PLAN.
 *
 * El instructivo visto por DÍA, por RANGO de fechas o por SEMANA (?v=dia|rango|semana &d= &h= ; ?s= = una semana):
 *   · arriba, la LÍNEA DE TIEMPO por tren: qué SKU corre, desde qué hora y cuánto (la hora actual en rojo);
 *   · abajo, la MATRIZ por línea → SKU × día, con mapa de calor, qué cambió contra el inicial y el total.
 * Plan VIGENTE (cada día con el último corte que lo cubre, o el inicial si no hay corte) o el INICIAL de su semana.
 */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ v?: string; d?: string; h?: string; s?: string }> }) {
  const q = await searchParams;
  const hoy = hoyBogota();
  const modo: Modo = q.v === "dia" || q.v === "rango" ? q.v : "semana";
  let dias: string[];
  if (modo === "dia") dias = [esF(q.d) ? q.d! : hoy];
  else if (modo === "rango") {
    let a = esF(q.d) ? q.d! : lunesDe(hoy), b = esF(q.h) ? q.h! : masDias(a, 6);
    if (a > b) [a, b] = [b, a];
    dias = [];
    for (let f = a; f <= b && dias.length < MAX; f = masDias(f, 1)) dias.push(f);
  } else {
    const l = lunesDe(esF(q.s) ? q.s! : esF(q.d) ? q.d! : hoy);
    dias = Array.from({ length: 7 }, (_, i) => masDias(l, i));
  }

  const cabeza = (sub: React.ReactNode) => (<>
    <section className="cabeza"><div>
      <p className="ojo">INVENTARIO · PLAN VS NOTIFICADO</p>
      <h1>Plan</h1>
      <p className="sub">{sub}</p>
    </div></section>
    <Pasos ruta="/inventario/envase/plan" />
  </>);

  /* Cada día sale del plan de SU semana: se cargan las semanas que toca el periodo. */
  const lunesSet = [...new Set(dias.map(lunesDe))];
  const semanas = await Promise.all(lunesSet.map(async (l) => ({ l, ps: await planesDeSemana(l) })));
  if (semanas.some((x) => x.ps.falta)) {
    return (
      <div className="fe pe">
        {cabeza("Falta crear esta parte en Supabase.")}
        <p className="pe-vacio">Corre <b>supabase/migraciones/2026-11-plan-envase.sql</b> en Supabase y sube el instructivo en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      </div>
    );
  }
  const porLunes = new Map(semanas.map(({ l, ps }) => [l, { ps, P: papeles(ps.planes) }]));
  const un = (r: FilaPlanBD) => Number(r.unidades) || (r.formato_ml ? (r.hl * 1e5) / Number(r.formato_ml) : 0);

  const F = new Map<string, FilaSku>();
  const hlTren = new Map<string, Map<string, number>>();
  const fila = (r: FilaPlanBD) => {
    const sku = r.sku!;
    let f = F.get(sku);
    if (!f) { f = { sku, nombre: r.nombre ?? "", tren: r.tren, inicial: dias.map(() => 0), vigente: dias.map(() => 0) }; F.set(sku, f) }
    if (!f.nombre && r.nombre) f.nombre = r.nombre;
    const m = hlTren.get(sku) ?? hlTren.set(sku, new Map()).get(sku)!;
    m.set(r.tren, (m.get(r.tren) ?? 0) + Number(r.hl));
    return f;
  };
  /* Los bloques de la línea de tiempo: horas seguidas del mismo SKU en el mismo tren son un solo bloque. */
  const bloques: Bloque[] = [];
  const meter = (plan: "vig" | "ini", i: number, rs: FilaPlanBD[]) => {
    const orden = [...rs].sort((a, b) => a.tren.localeCompare(b.tren) || a.hora - b.hora);
    let cur: Bloque | null = null;
    for (const r of orden) {
      if (!r.sku) continue;
      if (cur && cur.tren === r.tren && cur.sku === r.sku && r.hora <= cur.fin && r.hora >= cur.ini) { cur.un += un(r); cur.fin = Math.max(cur.fin, r.hora + 1); continue }
      cur = { plan, d: i, tren: r.tren, sku: r.sku, ini: r.hora, fin: r.hora + 1, un: un(r) };
      bloques.push(cur);
    }
  };
  const deDia: (string | null)[] = [];
  dias.forEach((d, i) => {
    const w = porLunes.get(lunesDe(d));
    if (!w) { deDia.push(null); return }
    const { ps, P } = w;
    const ini = P.inicial ? ps.filas.filter((r) => r.plan_id === P.inicial!.id && r.fecha === d) : [];
    const pl = P.corteDe(d) ?? P.inicial;
    const vig = pl ? ps.filas.filter((r) => r.plan_id === pl.id && r.fecha === d) : [];
    for (const r of ini) if (r.sku) fila(r).inicial[i] += un(r);
    for (const r of vig) if (r.sku) fila(r).vigente[i] += un(r);
    meter("ini", i, ini); meter("vig", i, vig);
    deDia.push(!pl ? null : pl === P.inicial ? "inicial" : `corte ${hora(pl.generado)}`);
  });
  for (const f of F.values()) f.tren = [...(hlTren.get(f.sku) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? f.tren;
  const todas = semanas.flatMap((x) => x.ps.filas);
  const M = maestro(todas, await productosDe([...F.keys()]));
  const semana = modo === "semana" ? semanas[0]?.ps.planes[0]?.semana ?? null : null;
  const error = semanas.map((x) => x.ps.error).find(Boolean);
  const ahora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

  return (
    <div className="fe pe">
      {cabeza(<>
        El instructivo por <b>día</b>, por <b>rango</b> de fechas o por <b>semana</b>: arriba, la línea de tiempo de cada tren (qué SKU corre,
        desde qué hora y cuánto); abajo, cada línea con sus SKU día por día. <b>Vigente</b>: cada día con el último corte que lo cubre.
      </>)}
      {error && <p className="pe-error">No se pudo leer todo: {error}</p>}
      <PlanVista
        modo={modo} dias={dias} hoy={hoy} ahora={ahora} semana={semana}
        filas={[...F.values()]} bloques={bloques} maestro={Object.fromEntries(M)} deDia={deDia}
        hayPlan={semanas.some((x) => x.ps.planes.length > 0)}
      />
    </div>
  );
}
