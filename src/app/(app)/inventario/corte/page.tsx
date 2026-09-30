import { misPermisos } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";
import { maestroInventario } from "@/modulos/inventario/fefo";
import type { Corte as CorteT, RenglonCorte, Sitio, Unidad } from "@/modulos/inventario/corte";
import "../fefo.css";
import "./corte.css";
import { Corte } from "./Corte";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · CORTE DE LÍNEAS.
 *
 * VA ANTES DE «CONTAR» EN EL MENÚ, y es el orden del proceso: antes de
 * caminar la bodega contando, se corta lo que las líneas han movido (el
 * contador de la depaletizadora y de dónde tomaban / dónde estaban
 * ubicados). Se hace uno INICIAL y, después, uno FINAL; la resta entre
 * los dos es la diferencia que se analiza.
 *
 * Baja con la página el maestro de ubicaciones y de materiales, igual que
 * Contar y Recibir: se llena de pie en el celular y las listas
 * (calle → módulo → lado) tienen que responder sin ir al servidor.
 */
export default async function CortePage() {
  const supabase = await createClient();
  const [permisos, m] = await Promise.all([misPermisos(), maestroInventario()]);
  const puedeEditar = permisos.puedeEditar("/inventario/corte");

  const sinSql = (
    <div className="fe">
      <section className="sin-tablas">
        <h2>Falta preparar el corte de líneas en Supabase</h2>
        <p>
          Abre el SQL Editor y ejecuta{" "}
          <code>supabase/migraciones/2026-09-inventario-corte-lineas.sql</code>.
        </p>
      </section>
    </div>
  );
  if (m.falta) return sinSql;

  const conUbicaciones = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => b.activo && conUbicaciones.has(b.id)) ?? m.bodegas[0] ?? null;
  if (!bodega) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>No hay bodega con ubicaciones</h2>
          <p>El corte se anota por calle, módulo y lado: primero hacen falta las ubicaciones de la bodega (Maestro).</p>
        </section>
      </div>
    );
  }

  const [lin, cor, ren, per] = await Promise.all([
    supabase.from("inv_lineas").select("clave,nombre").eq("activa", true).order("orden"),
    supabase.from("inv_cortes").select("id,tipo,inicial_id,cortado_en,nota,creado_por")
      .eq("bodega_id", bodega.id).order("cortado_en", { ascending: false }).limit(400),
    supabase.from("inv_corte_renglones").select(
      "corte_id,linea,cajas_depa,material_id,envase_id,origen_ubicacion_id,origen_cant,origen_unidad,destino_ubicacion_id,destino_cant,destino_unidad,nota"
    ).limit(5000),
    supabase.from("perfiles").select("id,nombre").limit(2000),
  ]);
  if (lin.error || cor.error || ren.error) return sinSql;

  const sitio = (u: string | null, c: number | null, un: string | null): Sitio | null =>
    u && c !== null && un ? { ubicacion_id: u, cant: Number(c), unidad: un as Unidad } : null;
  const renglonesDe = new Map<string, RenglonCorte[]>();
  for (const r of ren.data ?? []) {
    const l = renglonesDe.get(r.corte_id) ?? [];
    l.push({
      linea: r.linea, cajas_depa: Number(r.cajas_depa), material_id: r.material_id, envase_id: r.envase_id,
      origen: sitio(r.origen_ubicacion_id, r.origen_cant, r.origen_unidad),
      destino: sitio(r.destino_ubicacion_id, r.destino_cant, r.destino_unidad),
      nota: r.nota,
    });
    renglonesDe.set(r.corte_id, l);
  }
  const cortes: CorteT[] = (cor.data ?? []).map((c) => ({
    id: c.id, tipo: c.tipo as "inicial" | "final", inicial_id: c.inicial_id,
    cortado_en: c.cortado_en, nota: c.nota, creado_por: c.creado_por,
    renglones: renglonesDe.get(c.id) ?? [],
  }));
  const nombres = Object.fromEntries((per.data ?? []).map((p) => [p.id, p.nombre as string]));

    const ubis = m.ubicaciones.filter((u) => u.bodega_id === bodega.id && u.activa);
  const mats = m.materiales.filter((x) => x.activo);

  return (
    <div className="fe">
      {!puedeEditar && (
        <section className="fe-faltan">
          <p><b>Solo de lectura.</b> Para hacer un corte hace falta permiso de edición en esta
          pantalla — pídelo en Admin → Roles.</p>
        </section>
      )}

      <Corte
        bodegaId={bodega.id}
        lineas={(lin.data ?? []) as { clave: string; nombre: string }[]}
        ubicaciones={ubis.map((u) => ({ id: u.id, calle: u.calle, modulo: u.modulo, lado: u.lado }))}
        materiales={mats.map((x) => ({ id: x.id, sku: x.sku, nombre: x.nombre, cajas_por_estiba: x.cajas_por_estiba, unidades_por_caja: x.unidades_por_caja, tipo: x.tipo_material === "ENVASE" ? "ENVASE" : "PRODUCTO" }))}
        cortes={cortes}
        nombres={nombres}
        puedeEditar={puedeEditar}
        manda={permisos.manda}
        ahora={new Date().toISOString()}
      />
    </div>
  );
}
