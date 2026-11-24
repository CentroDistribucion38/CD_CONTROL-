import Link from "next/link";
import { maestro, notificacionesAlCorte, papeles, partidasCorte, productoSinNotificar, type FilaPlanBD } from "@/modulos/inventario/envase/calc";
import { envaseHistorico, hoyBogota, lunesDe, movimientosDigitadosDesde, movimientosParaElConteo, planesDeSemana, productosDe, upcEnvases } from "@/modulos/inventario/envase/datos";
import { Pasos } from "../Pasos";
import "../../fefo.css";
import "../../balance/analisis/analisis.css";
import "../envase.css";
import { Corte } from "./Corte";

export const dynamic = "force-dynamic";

const esF = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const esH = (s?: string) => !!s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/**
 * INVENTARIO › PLAN VS NOTIFICADO › CORTE DE INVENTARIO.
 * «Si mi inventario es a las 6 debo tomar mis existencias a las 6; sin embargo, para su análisis debo tener en
 *  cuenta partidas como las notificaciones.» La hora del conteo se escoge; por defecto, 06:00 de hoy.
 */
export default async function CortePage({ searchParams }: { searchParams: Promise<{ f?: string; h?: string }> }) {
  const q = await searchParams;
  const dia = esF(q.f) ? q.f! : hoyBogota();
  const hora = esH(q.h) ? q.h! : "06:00";
  const [mv, mc, upc] = await Promise.all([movimientosDigitadosDesde(dia), movimientosParaElConteo(dia), upcEnvases()]);
  const falta = !!mv.error && /pe_mb51|does not exist|PGRST20[25]|42P01/i.test(mv.error);
  const r = partidasCorte(`${dia}T${hora}`, mv.filas);
  /* Lo que va al análisis de diferencia de Bodega 38 (AG22) con los nombres de la plantilla. */
  const nt = notificacionesAlCorte(dia, hora, mc.filas, (c) => upc.get(c) ?? 0);
  /* LO PENDIENTE POR NOTIFICAR A LA HORA DEL CONTEO (la misma cuenta de Validación › Corte) y su envase: POR CONFIRMAR. */
  const sem = await planesDeSemana(lunesDe(dia));
  const P = papeles(sem.planes), id = P.corteDe(dia)?.id ?? P.inicial?.id;
  const planDia = new Map<string, FilaPlanBD[]>([[dia, id ? sem.filas.filter((f) => f.plan_id === id && f.fecha === dia) : []]]);
  const filasPlan = sem.filas;
  const skus = [...new Set(filasPlan.map((f) => f.sku).filter((x): x is string => !!x))];
  const skusPlan = [...new Set([...planDia.values()].flat().map((f) => f.sku).filter((x): x is string => !!x))];
  const [prods, historia] = await Promise.all([productosDe(skus), envaseHistorico(skusPlan, dia)]);
  const sinNotif = productoSinNotificar(dia, hora, planDia, mc.filas, maestro(filasPlan, prods), historia);

  return (
    <div className="fe pe">
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · PLAN VS NOTIFICADO · CORTE DE INVENTARIO</p>
        <h1>Partidas al corte · {dia.slice(8)}/{dia.slice(5, 7)} {hora}</h1>
        <p className="sub">La existencia que bajas a la hora del conteo solo tiene lo <b>digitado</b> hasta esa hora. Lo que pasó antes pero se
          digitó después son tus partidas: se suman o se restan a la existencia para compararla con el conteo físico.</p>
      </div></section>
      <Pasos ruta="/inventario/envase/corte" />
      {falta ? (
        <p className="pe-vacio">Falta crear esta parte en Supabase: corre <b>supabase/migraciones/2026-11-plan-envase.sql</b> y sube la MB51 en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      ) : mv.error ? (
        <p className="pe-error">No se pudo leer la MB51: {mv.error}</p>
      ) : (
        <Corte dia={dia} hora={hora} hoy={hoyBogota()} seguras={r.seguras} dudosas={r.dudosas} alcanza={r.alcanza} ultima={r.ultima} notif={nt.filas} sinNotif={sinNotif} />
      )}
    </div>
  );
}
