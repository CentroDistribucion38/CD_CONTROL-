import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { papeles } from "@/modulos/inventario/envase/calc";
import { loCargado } from "@/modulos/inventario/envase/datos";
import { cierreDeSemanas } from "@/modulos/inventario/envase/semana";
import "../../fefo.css";
import "../envase.css";
import { Cargar } from "./Cargar";
import { TablaCargado } from "./TablaCargado";
import { CierreSemanas } from "./CierreSemanas";

export const dynamic = "force-dynamic";

const fecha = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * INVENTARIO › PLAN VS NOTIFICADO › CARGAR.
 * El instructivo de envase (plan inicial y cortes) y la MB51, tal cual salen. Abajo, lo que ya hay cargado.
 */
export default async function CargarPage() {
  const [permisos, c, sem] = await Promise.all([misPermisos(), loCargado(), cierreDeSemanas()]);
  const puede = permisos.puedeEditar("/inventario/envase/cargar");
  const porSemana = new Map<string, typeof c.planes>();
  for (const p of c.planes) porSemana.set(p.lunes, [...(porSemana.get(p.lunes) ?? []), p]);
  return (
    <div className="fe pe">
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · PLAN VS NOTIFICADO</p>
        <h1>Cargar</h1>
        <p className="sub">El instructivo de envase de Suite 360 y la MB51, tal como salen. El primer instructivo que cubre la semana desde el
          lunes queda como <b>plan inicial</b>; los que subas después son <b>cortes</b>. Después, valida en <Link href="/inventario/envase">Validación del día</Link>.</p>
      </div></section>

      {c.falta ? (
        <p className="pe-vacio">Falta crear esta parte en Supabase: corre <b>supabase/migraciones/2026-11-plan-envase.sql</b> en el editor de SQL y vuelve a esta pantalla.</p>
      ) : (<>
        <Cargar puedeCargar={puede} existentes={c.planes.map((p) => ({ lunes: p.lunes, generado: p.generado.slice(0, 19), desde: p.desde, semana: p.semana }))} />

        {sem.error && <p className="pe-error">No se pudo leer todo para el cierre: {sem.error}</p>}
        <CierreSemanas semanas={sem.semanas} mb51={sem.mb51} />

        <section className="pe-card">
          <h3 className="pe-h3">Lo que hay cargado <small>{c.mb51?.desde ? `MB51: ${c.mb51.filas ? `${c.mb51.filas.toLocaleString("es-CO")} movimientos · ` : ""}contabilizados del ${fecha(c.mb51.desde)} al ${fecha(c.mb51.hasta!)}` : "MB51: nada todavía"}</small></h3>
          {c.planes.length ? (
            <TablaCargado puede={puede} filas={c.planes.map((p) => {
              const P = papeles(porSemana.get(p.lunes) ?? []);
              return { id: p.id, lunes: p.lunes, generado: p.generado, semana: p.semana, desde: p.desde, hasta: p.hasta, total_hl: p.total_hl,
                subido_en: p.subido_en, papel: p.papel ?? null, es: P.inicial?.id === p.id ? "inicial" : P.ultimo?.id === p.id ? "vigente" : "anterior" };
            })} />
          ) : <p className="pe-nota">Todavía no hay instructivos cargados.</p>}
        </section>
      </>)}
    </div>
  );
}
