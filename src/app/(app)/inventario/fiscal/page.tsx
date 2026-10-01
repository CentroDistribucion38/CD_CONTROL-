import { misPermisos } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";
import { maestroInventario } from "@/modulos/inventario/fefo";
import type { HojaForm } from "@/modulos/inventario/fiscal";
import "../fefo.css";
import "../corte/corte.css";
import "./fiscal.css";
import { Fiscal, type FiscalBD } from "./Fiscal";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · INVENTARIO FISCAL.
 *
 * Un inventario fiscal se cuenta por parejas: una persona del operador
 * logístico y una de Bavaria cuentan LA MISMA hoja, cada una por su lado, y
 * después se comparan. Aquí se arma: cuántas hojas (las que hagan falta,
 * numeradas) y quién cuenta cada una.
 *
 * Esta pantalla es de quien organiza el inventario; quien cuenta entra por
 * «Contar». Se arma con calma en el escritorio, así que no tiene cola para
 * cuando se va la señal como sí la tienen Contar y el corte.
 */
export default async function FiscalPage() {
  const supabase = await createClient();
  const [permisos, m] = await Promise.all([misPermisos(), maestroInventario()]);
  const puedeEditar = permisos.puedeEditar("/inventario/fiscal");

  const sinSql = (
    <div className="fe">
      <section className="sin-tablas">
        <h2>Falta preparar el inventario fiscal en Supabase</h2>
        <p>
          Abre el SQL Editor y ejecuta{" "}
          <code>supabase/migraciones/2026-10-inventario-fiscal.sql</code>.
        </p>
      </section>
    </div>
  );
  if (m.falta) return sinSql;

  const conUbicaciones = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => b.activo && conUbicaciones.has(b.id)) ?? m.bodegas[0] ??
    (m.ubicaciones[0] ? { id: m.ubicaciones[0].bodega_id, activo: true } : null);
  if (!bodega) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>No hay bodega con ubicaciones</h2>
          <p>El inventario fiscal se hace sobre una bodega: primero hacen falta sus ubicaciones (Maestro).</p>
          <p>
            Bodegas leídas: {m.bodegas.length} · ubicaciones leídas: {m.ubicaciones.length}
            {m.errorBodegas ? <> · error de Supabase: <code>{m.errorBodegas}</code></> : null}
          </p>
        </section>
      </div>
    );
  }

  const [fis, hoj, mie, per] = await Promise.all([
    supabase.from("inv_fiscales").select("id,nombre,fecha,estado,creado_en")
      .eq("bodega_id", bodega.id).order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(100),
    supabase.from("inv_fiscal_hojas").select("id,fiscal_id,numero").limit(5000),
    supabase.from("inv_fiscal_miembros").select("hoja_id,equipo,user_id").limit(10000),
    supabase.from("perfiles").select("id,nombre,activo").order("nombre").limit(2000),
  ]);
  if (fis.error || hoj.error || mie.error) return sinSql;

  const miembros = new Map<string, { OL?: string; BAVARIA?: string }>();
  for (const x of mie.data ?? []) {
    const o = miembros.get(x.hoja_id) ?? {};
    o[x.equipo as "OL" | "BAVARIA"] = x.user_id;
    miembros.set(x.hoja_id, o);
  }
  const hojasDe = new Map<string, HojaForm[]>();
  for (const h of hoj.data ?? []) {
    const mm = miembros.get(h.id) ?? {};
    hojasDe.set(h.fiscal_id, [...(hojasDe.get(h.fiscal_id) ?? []), { numero: h.numero, ol: mm.OL ?? "", bavaria: mm.BAVARIA ?? "" }]);
  }
  const fiscales: FiscalBD[] = (fis.data ?? []).map((f) => ({
    id: f.id, nombre: f.nombre, fecha: String(f.fecha).slice(0, 10), estado: f.estado as "abierto" | "cerrado",
    hojas: (hojasDe.get(f.id) ?? []).sort((a, b) => a.numero - b.numero),
  }));
  /* Las personas que se pueden poner en una hoja: las activas. Las que ya están
     en un inventario siguen saliendo con su nombre aunque se hayan desactivado. */
  const enUso = new Set((mie.data ?? []).map((x) => x.user_id));
  const personas = (per.data ?? []).filter((p) => p.activo || enUso.has(p.id)).map((p) => ({ id: p.id, nombre: p.nombre as string, activo: Boolean(p.activo) }));

  return (
    <div className="fe">
      {!puedeEditar && (
        <section className="fe-faltan">
          <p><b>Solo de lectura.</b> Para armar un inventario fiscal hace falta permiso de edición en esta
          pantalla — pídelo en Admin → Roles.</p>
        </section>
      )}
      <Fiscal
        bodegaId={bodega.id}
        personas={personas}
        fiscales={fiscales}
        puedeEditar={puedeEditar}
        manda={permisos.manda}
        ahora={new Date().toISOString()}
      />
    </div>
  );
}
