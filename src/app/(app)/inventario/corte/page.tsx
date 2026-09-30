import { misPermisos } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";
import { maestroInventario } from "@/modulos/inventario/fefo";
import { renglonesPorCorte, type ConteoRef, type Corte as CorteT, type FilaRenglonBD, type FilaSitioBD, type LineaConteo } from "@/modulos/inventario/corte";
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
  /* Si la lista de bodegas no se pudo leer (permisos, o un fallo de la consulta) pero las
     ubicaciones sí llegaron, la bodega se toma de ellas: la pantalla no se cae por eso. */
  const bodega = m.bodegas.find((b) => b.activo && conUbicaciones.has(b.id)) ?? m.bodegas[0] ??
    (m.ubicaciones[0] ? { id: m.ubicaciones[0].bodega_id, activo: true } : null);
  if (!bodega) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>No hay bodega con ubicaciones</h2>
          <p>El corte se anota por calle, módulo y lado: primero hacen falta las ubicaciones de la bodega (Maestro).</p>
          <p>
            Bodegas leídas: {m.bodegas.length} · ubicaciones leídas: {m.ubicaciones.length}
            {m.errorBodegas ? <> · error de Supabase: <code>{m.errorBodegas}</code></> : null}
          </p>
        </section>
      </div>
    );
  }

  const [lin, cor, ren, sit, per] = await Promise.all([
    supabase.from("inv_lineas").select("clave,nombre").eq("activa", true).order("orden"),
    supabase.from("inv_cortes").select("id,tipo,inicial_id,cortado_en,nota,creado_por")
      .eq("bodega_id", bodega.id).order("cortado_en", { ascending: false }).limit(400),
    supabase.from("inv_corte_renglones").select(
      "id,corte_id,linea,cajas_depa,material_id,envase_id,origen_ubicacion_id,origen_cant,origen_unidad,destino_ubicacion_id,destino_cant,destino_unidad,nota"
    ).limit(5000),
    supabase.from("inv_corte_sitios").select("renglon_id,rol,orden,ubicacion_id,cant,unidad")
      .order("orden").limit(20000),
    supabase.from("perfiles").select("id,nombre").limit(2000),
  ]);
  if (lin.error || cor.error || ren.error || sit.error) return sinSql;

  const renglonesDe = renglonesPorCorte((ren.data ?? []) as FilaRenglonBD[], (sit.data ?? []) as FilaSitioBD[]);
  const cortes: CorteT[] = (cor.data ?? []).map((c) => ({
    id: c.id, tipo: c.tipo as "inicial" | "final", inicial_id: c.inicial_id,
    cortado_en: c.cortado_en, nota: c.nota, creado_por: c.creado_por,
    renglones: renglonesDe.get(c.id) ?? [],
  }));
  /* LOS CONTEOS CON LOS QUE SE COMPARA EL CORTE: solo los ENVIADOS (un borrador
     a medio caminar diría que un módulo está vacío porque todavía no se llegó).
     Si quien mira no puede ver el conteo, esto viene vacío y el corte se ve
     igual, sin la comparación: nunca puede tumbar la pantalla. */
  const [cv, lv] = await (async () => {
    const r = await supabase.from("v_conteos_fefo").select("*")
      .eq("bodega_id", bodega.id).eq("estado", "cerrado")
      .order("fecha_analisis", { ascending: false }).limit(30);
    if (r.error || !r.data?.length) return [[], []] as [ConteoRef[], LineaConteo[]];
    const refs: ConteoRef[] = r.data.map((c: { id: string; codigo: string; fecha_analisis: string; enviado_en: string | null }) => ({
      id: c.id, codigo: c.codigo, fecha: String(c.fecha_analisis).slice(0, 10), enviado_en: c.enviado_en ?? null }));
    const l = await supabase.from("v_conteo_fefo")
      .select("conteo_id,producto_id,ubicacion_id,total_cajas,averia,pnc")
      .in("conteo_id", refs.map((x) => x.id)).limit(20000);
    return [refs, (l.error ? [] : (l.data ?? [])) as LineaConteo[]] as [ConteoRef[], LineaConteo[]];
  })();
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
        conteos={cv}
        lineasConteo={lv}
        nombres={nombres}
        puedeEditar={puedeEditar}
        manda={permisos.manda}
        ahora={new Date().toISOString()}
      />
    </div>
  );
}
