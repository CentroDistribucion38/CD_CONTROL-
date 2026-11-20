import Link from "next/link";
import { maestro, masDias, papeles, type FilaPlanBD } from "@/modulos/inventario/envase/calc";
import { hoyBogota, lunesDe, planesDeSemana, productosDe } from "@/modulos/inventario/envase/datos";
import "../../fefo.css";
import "../../balance/analisis/analisis.css";
import "../envase.css";
import { PlanSku, type FilaSku } from "./PlanSku";

export const dynamic = "force-dynamic";

const esF = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const hora = (g: string) => new Date(g.replace(" ", "T") + (/[zZ+]/.test(g.slice(10)) ? "" : "Z")).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });

/**
 * INVENTARIO › PLAN VS NOTIFICADO › PLAN POR SKU.
 *
 * «Necesito verlo por SKU para poder hacer la solicitud.» El instructivo de la semana, SKU por SKU y día por día:
 * el plan VIGENTE (cada día con el último corte que lo cubre, o el inicial si no hay corte) o el plan INICIAL.
 */
export default async function PlanSkuPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const q = await searchParams;
  const hoy = hoyBogota();
  const lunes = lunesDe(esF(q.s) ? q.s! : hoy);
  const ps = await planesDeSemana(lunes);
  const cabeza = (sub: React.ReactNode) => (
    <section className="cabeza"><div>
      <p className="ojo">INVENTARIO · PLAN VS NOTIFICADO</p>
      <h1>Plan por SKU</h1>
      <p className="sub">{sub}</p>
    </div></section>
  );
  if (ps.falta) {
    return (
      <div className="fe pe">
        {cabeza("Falta crear esta parte en Supabase.")}
        <p className="pe-vacio">Corre <b>supabase/migraciones/2026-11-plan-envase.sql</b> en Supabase y sube el instructivo en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      </div>
    );
  }

  const dias = Array.from({ length: 7 }, (_, i) => masDias(lunes, i));
  const P = papeles(ps.planes);
  const un = (r: FilaPlanBD) => Number(r.unidades) || (r.formato_ml ? (r.hl * 1e5) / Number(r.formato_ml) : 0);
  const filasDe = (id: string | undefined) => (id ? ps.filas.filter((f) => f.plan_id === id) : []);
  const ini = filasDe(P.inicial?.id);

  /* Para cada día, de qué plan sale lo vigente: su último corte o, si no hay, el inicial. */
  const fuente = dias.map((d) => P.corteDe(d) ?? P.inicial);
  const F = new Map<string, FilaSku>();
  const fila = (sku: string, nombre: string | null) => {
    let f = F.get(sku);
    if (!f) { f = { sku, nombre: nombre ?? "", inicial: dias.map(() => 0), vigente: dias.map(() => 0) }; F.set(sku, f) }
    if (!f.nombre && nombre) f.nombre = nombre;
    return f;
  };
  for (const r of ini) { const i = dias.indexOf(r.fecha); if (i >= 0 && r.sku) fila(r.sku, r.nombre).inicial[i] += un(r) }
  dias.forEach((d, i) => {
    const pl = fuente[i];
    if (!pl) return;
    for (const r of filasDe(pl.id)) if (r.fecha === d && r.sku) fila(r.sku, r.nombre).vigente[i] += un(r);
  });
  const M = maestro(ps.filas, await productosDe([...F.keys()]));
  const semana = ps.planes[0]?.semana;

  return (
    <div className="fe pe">
      {cabeza(<>
        El instructivo de la semana SKU por SKU y día por día, para hacer la solicitud. <b>Vigente</b>: cada día con el último corte
        que lo cubre (o el inicial si no hay corte). <b>Inicial</b>: el plan con que arrancó la semana.
      </>)}
      {ps.error && <p className="pe-error">No se pudo leer todo: {ps.error}</p>}
      <PlanSku
        lunes={lunes} semana={semana ?? null} antes={masDias(lunes, -7)} despues={masDias(lunes, 7)} dias={dias}
        filas={[...F.values()]} maestro={Object.fromEntries(M)}
        deDia={fuente.map((p) => (!p ? null : p === P.inicial ? "inicial" : `corte ${hora(p.generado)}`))}
        hayPlan={ps.planes.length > 0}
      />
    </div>
  );
}
