import Link from "next/link";
import { estadoDia, maestro, masDias, papeles, validarDia } from "@/modulos/inventario/envase/calc";
import { hoyBogota, lunesDe, movimientosContab, planesDeSemana, productosDe, ultimaEntrada } from "@/modulos/inventario/envase/datos";
import "../fefo.css";
import "../balance/analisis/analisis.css";
import "./envase.css";
import { ValidacionDia } from "./ValidacionDia";

export const dynamic = "force-dynamic";

const esF = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const largo = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const hora = (g: string) => new Date(g.replace(" ", "T") + "Z").toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

/**
 * INVENTARIO › PLAN VS NOTIFICADO › VALIDACIÓN DEL DÍA.
 *
 * «Yo valido las notificaciones por día.» Se escoge el día y se compara contra el plan de ESE día: lo notificado
 * con fecha de contabilización del día y el envase de sus órdenes.
 *
 * «Quiero que me muestre el del día de hoy y me diga, según la hora y el plan, cuál es el pendiente por notificar; quiero el dato
 *  real y que siempre muestre el actual.» Por defecto abre HOY. Para hoy se suma el plan HORA POR HORA del instructivo (cada
 * columna es una hora, de las 00:00 a las 23:00) hasta la hora actual —la hora en curso, en proporción a los minutos—, con el
 * plan vigente (el último corte; si no hay, el inicial): eso es lo que debería ir notificado, y el pendiente es eso menos lo notificado.
 */
export default async function ValidacionPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const q = await searchParams;
  const hoy = hoyBogota();
  const u = await ultimaEntrada();
  const cabeza = (sub: React.ReactNode) => (
    <section className="cabeza"><div>
      <p className="ojo">INVENTARIO · PLAN VS NOTIFICADO</p>
      <h1>Validación del día</h1>
      <p className="sub">{sub}</p>
    </div></section>
  );
  if (u.falta) {
    return (
      <div className="fe pe">
        {cabeza("Falta crear esta parte en Supabase.")}
        <p className="pe-vacio">Corre <b>supabase/migraciones/2026-11-plan-envase.sql</b> en el editor de SQL de Supabase y después sube el instructivo y la MB51 en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      </div>
    );
  }

  /* Por defecto, HOY: siempre el día actual. */
  const d = esF(q.d) ? q.d! : hoy;
  const lunes = lunesDe(d);
  const [ps, mv] = await Promise.all([planesDeSemana(lunes), movimientosContab(masDias(d, -28), d)]);
  const P = papeles(ps.planes);
  const ini = P.inicial ? ps.filas.filter((f) => f.plan_id === P.inicial!.id) : [];
  const c = P.corteDe(d);
  const cor = c ? ps.filas.filter((f) => f.plan_id === c.id) : null;
  const skus = new Set<string>(ps.filas.map((f) => f.sku).filter((s): s is string => !!s));
  for (const m of mv.filas) if (/^Z0[12]$/.test(m.clase)) skus.add(m.material.replace(/P$/i, ""));
  const M = maestro(ps.filas, await productosDe([...skus]));
  const v = validarDia(d, ini, cor, mv.filas, M);
  /* Los días con MB51 (un punto en el calendario): de los 60 días antes de la última entrada hasta hoy. */
  const conDatos: string[] = [];
  for (let f = masDias(hoy, -60); f <= hoy; f = masDias(f, 1)) { const e = estadoDia(f, u.valor, hoy); if (e === "cerrado" || e === "abierto") conDatos.push(f) }
  const semana = ps.planes[0]?.semana;

  /* HOY, A ESTA HORA: el plan vigente sumado hora por hora hasta ahora (la hora en curso en proporción a los minutos). */
  let ahora: { hora: string; planHasta: Record<string, number>; mb51: string | null } | undefined;
  if (d === hoy) {
    const [hh, mm] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
    const vig = (cor ?? ini).filter((f) => f.fecha === d && f.sku);
    const planHasta: Record<string, number> = {};
    for (const f of vig) {
      const peso = f.hora < hh ? 1 : f.hora === hh ? mm / 60 : 0;
      const un = f.unidades ?? (f.formato_ml ? (f.hl * 1e5) / f.formato_ml : 0);
      if (peso > 0 && un) planHasta[f.sku!] = (planHasta[f.sku!] ?? 0) + un * peso;
    }
    ahora = { hora: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, planHasta, mb51: u.valor };
  }

  /* POR LÍNEA (cada TREN del instructivo): el plan del día de cada SKU en cada línea —inicial y vigente— y, hoy, el plan hasta
     esta hora. Lo notificado se reparte en la pantalla (la MB51 no dice la línea). */
  const hm = ahora ? ahora.hora.split(":").map(Number) : null;
  const unDe = (f: (typeof ini)[number]) => f.unidades ?? (f.formato_ml ? (f.hl * 1e5) / f.formato_ml : 0);
  const porLinea = new Map<string, { tren: string; sku: string; ini: number; vig: number; hasta: number }>();
  const lin = (tren: string, sku: string) => {
    const k = `${tren}|${sku}`;
    let x = porLinea.get(k); if (!x) { x = { tren, sku, ini: 0, vig: 0, hasta: 0 }; porLinea.set(k, x) }
    return x;
  };
  for (const f of ini) if (f.fecha === d && f.sku) lin(f.tren, f.sku).ini += unDe(f);
  for (const f of (cor ?? ini)) if (f.fecha === d && f.sku) {
    const x = lin(f.tren, f.sku); x.vig += unDe(f);
    if (hm) { const peso = f.hora < hm[0] ? 1 : f.hora === hm[0] ? hm[1] / 60 : 0; x.hasta += unDe(f) * peso }
  }
  const lineas = [...porLinea.values()];

  return (
    <div className="fe pe">
      {cabeza(<>
        {largo(d)}{semana ? ` · semana ${semana}` : ""}. Plan inicial: {P.inicial ? <b>instructivo del {hora(P.inicial.generado)}</b> : <b className="mal">no hay</b>}
        {c ? <> · corte: <b>{hora(c.generado)}</b></> : null}. MB51 cargada hasta <b>{u.valor ? hora(u.valor) : "—"}</b>.
      </>)}
      {(ps.error || mv.error) && <p className="pe-error">No se pudo leer todo: {ps.error ?? mv.error}</p>}
      {!P.inicial && ps.planes.length > 0 && (
        <p className="pe-aviso">Esta semana no tiene plan inicial: los instructivos cargados empiezan después del lunes. Sube el que se sacó al arrancar la semana.</p>
      )}
      <ValidacionDia
        dia={d} hoy={hoy} conDatos={conDatos} antes={masDias(d, -1)} despues={masDias(d, 1)}
        filas={v.filas} alertas={v.alertas} maestro={Object.fromEntries(M)} hayCorte={!!c}
        estado={estadoDia(d, u.valor, hoy)} ahora={ahora} lineas={lineas}
      />
    </div>
  );
}
