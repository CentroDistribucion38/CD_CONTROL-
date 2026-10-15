import { misPermisos } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";
import { conMedidas, type Novedad } from "@/modulos/inventario/evidencias";
import { armarAcciones, type RegistroAccion } from "@/modulos/averias/acciones";
import "../../fefo.css";
import "./acciones.css";
import { Acciones } from "./Acciones";

export const dynamic = "force-dynamic";

const RANGOS = [7, 30, 90, 365];

/**
 * INVENTARIO · AVERÍAS · ACCIONES.
 *
 * «Cuando guardan el conteo, en el módulo de averías quedan como acciones cargadas todo lo que se
 *  identificó, para darle cierre… que uno pueda seleccionar la acción, ver ubicación, absolutamente
 *  todo, y cerrarla.»
 *
 * Las acciones NO se registran aquí: salen solas del conteo guardado. Esta pantalla solo les da cierre.
 * No toca Registrar, Tablero, Análisis ni Maestro.
 */
export default async function AccionesPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const dias = RANGOS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const desde = new Date(Date.parse(hoy + "T12:00:00Z") - (dias - 1) * 86400000).toISOString().slice(0, 10);

  const supabase = await createClient();
  const [permisos, nov, reg, prod] = await Promise.all([
    misPermisos(),
    supabase.rpc("averias_acciones_conteo", { p_desde: desde, p_hasta: hoy }),
    supabase.from("averias_acciones").select("*").limit(20000),
    supabase.from("productos").select("sku,unidades_por_caja,hl").limit(5000),
  ]);

  const err = nov.error ?? reg.error;
  if (err) {
    const falta = /does not exist|schema cache|Could not find/i.test(err.message);
    return (
      <div className="fe">
        <section className="cabeza">
          <div>
            <p className="ojo">INVENTARIO · AVERÍAS · ACCIONES</p>
            <h1>{falta ? "Falta crear esta parte en Supabase" : "No se pudieron leer las acciones"}</h1>
            <p className="sub">
              {falta
                ? <>Abre el editor de SQL y corre <b>supabase/migraciones/2026-10-averias-acciones.sql</b>. Se puede correr varias veces sin romper nada.</>
                : err.message}
            </p>
          </div>
        </section>
      </div>
    );
  }

  const regs = (reg.data ?? []) as RegistroAccion[];
  const novs = conMedidas((nov.data ?? []) as Novedad[], (prod.data ?? []) as { sku: string; unidades_por_caja: number | null; hl: number | null }[]);
  const acciones = armarAcciones(novs, regs);

  /* Los nombres de quien gestionó o cerró. */
  const ids = [...new Set(regs.flatMap((r) => [r.gestion_por, r.cerrada_por]).filter(Boolean))] as string[];
  const nombres: Record<string, string> = {};
  if (ids.length) {
    const { data } = await supabase.from("perfiles").select("id,nombre,usuario").in("id", ids);
    for (const p of data ?? []) nombres[p.id as string] = (p.nombre as string) || (p.usuario as string) || "—";
  }

  return (
    <div className="fe avc">
      <Acciones
        acciones={acciones}
        nombres={nombres}
        dias={dias}
        rangos={RANGOS}
        desde={desde}
        hasta={hoy}
        puedeEditar={permisos.puedeEditar("/inventario/averias/acciones")}
      />
    </div>
  );
}
