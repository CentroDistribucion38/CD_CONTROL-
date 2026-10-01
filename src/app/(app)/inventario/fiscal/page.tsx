import { misPermisos } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";
import { maestroInventario } from "@/modulos/inventario/fefo";
import type { HojaForm } from "@/modulos/inventario/fiscal";
import { avanceDesdeBD, type AvanceBD, type AvanceHoja } from "@/modulos/inventario/fiscal-cruce";
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

  const leerFiscales = (cols: string) => supabase.from("inv_fiscales").select(cols)
    .eq("bodega_id", bodega.id).order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(100);
  /* `publicado_en` llega con 2026-10-fiscal-publicar.sql: sin él la pantalla sigue sirviendo (sin el botón de Contar). */
  let fisP = await leerFiscales("id,nombre,fecha,estado,creado_en,publicado_en");
  const conPublicar = !fisP.error;
  if (fisP.error) fisP = await leerFiscales("id,nombre,fecha,estado,creado_en");
  const [fis, hoj, mie, per, rol, ava] = await Promise.all([
    Promise.resolve(fisP as unknown as { data: Record<string, unknown>[] | null; error: unknown }),
    supabase.from("inv_fiscal_hojas").select("id,fiscal_id,numero").limit(5000),
    supabase.from("inv_fiscal_miembros").select("hoja_id,equipo,user_id").limit(10000),
    supabase.from("perfiles").select("id,nombre,activo,rol").order("nombre").limit(2000),
    supabase.from("roles").select("clave,nombre").order("orden", { nullsFirst: false }).limit(200),
    /* El avance de cada hoja llega con 2026-10-fiscal-cruce.sql: sin él la pantalla sigue sirviendo, sin avance ni cruce. */
    supabase.rpc("inv_fiscal_avance"),
  ]);
  const conCruce = !ava.error;
  const hojaIdsDe = new Map<string, Record<number, string>>();
  const avanceDe = new Map<string, Record<number, AvanceHoja>>();
  for (const a of ((ava.data ?? []) as AvanceBD[])) {
    hojaIdsDe.set(a.fiscal_id, { ...(hojaIdsDe.get(a.fiscal_id) ?? {}), [a.numero]: a.hoja_id });
    avanceDe.set(a.fiscal_id, { ...(avanceDe.get(a.fiscal_id) ?? {}), [a.numero]: avanceDesdeBD(a) });
  }
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
    id: f.id as string, nombre: f.nombre as string, fecha: String(f.fecha).slice(0, 10), estado: f.estado as "abierto" | "cerrado",
    publicado: (f.publicado_en as string | null | undefined) ?? null,
    hojas: (hojasDe.get(f.id as string) ?? []).sort((a, b) => a.numero - b.numero),
    ...(conCruce ? { hojaIds: hojaIdsDe.get(f.id as string) ?? {}, avance: avanceDe.get(f.id as string) ?? {} } : {}),
  }));
  /* Las personas que se pueden poner en una hoja: las activas. Las que ya están
     en un inventario siguen saliendo con su nombre aunque se hayan desactivado. */
  const enUso = new Set((mie.data ?? []).map((x) => x.user_id));
  const personas = (per.data ?? []).filter((p) => p.activo || enUso.has(p.id))
    .map((p) => ({ id: p.id, nombre: p.nombre as string, activo: Boolean(p.activo), rol: (p.rol ?? "") as string }));
  const roles = (rol.data ?? []).map((r) => ({ clave: r.clave as string, nombre: r.nombre as string }));

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
        roles={roles}
        fiscales={fiscales}
        puedeEditar={puedeEditar}
        puedePublicar={conPublicar}
        conCruce={conCruce}
        manda={permisos.manda}
        ahora={new Date().toISOString()}
      />
    </div>
  );
}
