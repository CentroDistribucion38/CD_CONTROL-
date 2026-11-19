import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { papeles } from "@/modulos/inventario/envase/calc";
import { loCargado } from "@/modulos/inventario/envase/datos";
import "../../fefo.css";
import "../envase.css";
import { Cargar } from "./Cargar";

export const dynamic = "force-dynamic";

const fh = (g: string) => new Date(g.slice(0, 19) + "Z").toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const fecha = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * INVENTARIO › PLAN VS NOTIFICADO › CARGAR.
 * El instructivo de envase (plan inicial y cortes) y la MB51, tal cual salen. Abajo, lo que ya hay cargado.
 */
export default async function CargarPage() {
  const [permisos, c] = await Promise.all([misPermisos(), loCargado()]);
  const puede = permisos.puedeEditar("/inventario/envase/cargar");
  const porSemana = new Map<string, typeof c.planes>();
  for (const p of c.planes) porSemana.set(p.lunes, [...(porSemana.get(p.lunes) ?? []), p]);
  const papel = (p: (typeof c.planes)[number]) => {
    const P = papeles(porSemana.get(p.lunes) ?? []);
    if (P.inicial?.id === p.id) return <span className="pe-tag t-g">Plan inicial</span>;
    if (P.ultimo?.id === p.id) return <span className="pe-tag t-a">Corte vigente</span>;
    return <span className="pe-tag t-g">Corte anterior</span>;
  };

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

        <section className="pe-card">
          <h3 className="pe-h3">Lo que hay cargado <small>{c.mb51?.filas ? `MB51: ${c.mb51.filas.toLocaleString("es-CO")} movimientos · contabilizados del ${fecha(c.mb51.desde!)} al ${fecha(c.mb51.hasta!)}` : "MB51: nada todavía"}</small></h3>
          {c.planes.length ? (
            <div className="pe-caja"><table className="pe-t">
              <thead><tr><th className="l">Instructivo</th><th className="l">Semana</th><th className="l">Cubre</th><th>Total HL</th><th className="l">Subido</th><th className="l">Papel</th></tr></thead>
              <tbody>{c.planes.map((p) => (
                <tr key={p.id}>
                  <td className="l">Generado {fh(p.generado)}</td><td className="l">{p.semana}</td>
                  <td className="l">{fecha(p.desde)} al {fecha(p.hasta)}</td><td>{Math.round(p.total_hl).toLocaleString("es-CO")}</td>
                  <td className="l">{new Date(p.subido_en).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" })}</td>
                  <td className="l">{papel(p)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <p className="pe-nota">Todavía no hay instructivos cargados.</p>}
        </section>
      </>)}
    </div>
  );
}
