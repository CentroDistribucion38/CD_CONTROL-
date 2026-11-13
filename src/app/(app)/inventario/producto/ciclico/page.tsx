import { misPermisos } from "@/lib/permisos";
import "../../fefo.css";
import "../../corte/corte.css";
import "../../fiscal/fiscal.css";
import "../../fiscal/torre.css";
import { Fiscal } from "../../fiscal/Fiscal";
import { cargarFiscales } from "../../fiscal/datos";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · PRODUCTO · CÍCLICO.
 *
 * «Dentro de Producto un módulo, no fiscal sino que se llame CÍCLICO: se elige lo mismo del módulo fiscal, la
 *  familia, las parejas; luego habilitar el Contar.»
 *
 * Es el armado del Plan fiscal —fecha, hojas, calle, familias y parejas OL / Bavaria— guardado como CÍCLICO:
 * no aparece en el Plan ni en el Control fiscal, ni le cambia el Contar diario a nadie. «Mostrar en Contar» lo
 * habilita en Contar de Producto, donde la pareja cuenta código y cantidad y cualquiera de los dos cruza.
 * NADIE APRUEBA NI «TERMINA» UNA HOJA: queda cuadrada sola cuando el cruce sale todo igual.
 * Solo se ofrecen las familias de PRODUCTO.
 */
export default async function CiclicoPage() {
  const [permisos, r] = await Promise.all([misPermisos(), cargarFiscales("CICLICO")]);
  if ("fallo" in r) return r.fallo;
  const { bodegaId, personas, roles, fiscales, conPublicar, conCruce, conCalle, conFamilias, familias } = r.datos;
  const puedeEditar = permisos.puedeEditar("/inventario/producto/ciclico");
  /* EL CRUCE DE CADA HOJA ABIERTA: la hoja queda cuadrada sola cuando todo coincide (nadie la aprueba).
     Sin 2026-11-producto-ciclico-sin-aprobar.sql no viene, y la pantalla sigue con el avance de siempre. */
  const sb = await createClient();
  const res = await sb.rpc("inv_ciclico_resumen");
  let cruces: Record<string, { total: number; conDif: number; enviada: boolean }> | undefined = res.error ? undefined
    : Object.fromEntries(((res.data ?? []) as { hoja_id: string; total: number; con_diferencia: number; enviada_en?: string | null }[])
      .map((x) => [x.hoja_id, { total: Number(x.total) || 0, conDif: Number(x.con_diferencia) || 0, enviada: !!x.enviada_en }]));
  /* SI EL RESUMEN NO RESPONDE, se arma hoja por hoja con el mismo cruce que usa Contar (y si ya se envió): así la pantalla
     nunca vuelve a decir «contando» de una hoja que ya se envió. Lo que dijo la base queda en los avisos de abajo. */
  if (res.error) {
    const abiertos = fiscales.filter((f) => f.estado === "abierto");
    const ids = abiertos.flatMap((f) => Object.values(f.hojaIds ?? {}));
    if (ids.length) {
      const [hs, ...cr] = await Promise.all([
        sb.from("inv_fiscal_hojas").select("id, cerrada_en").in("id", ids),
        ...ids.map((id) => sb.rpc("inv_ciclico_cruce", { p_hoja: id })),
      ]);
      const env = new Map(((hs.data ?? []) as { id: string; cerrada_en: string | null }[]).map((h) => [h.id, !!h.cerrada_en]));
      if (cr.every((r) => !r.error)) {
        cruces = Object.fromEntries(ids.map((id, i) => {
          const filas = (cr[i].data ?? []) as { estado: string }[];
          return [id, { total: filas.length, conDif: filas.filter((x) => x.estado !== "COINCIDE").length, enviada: env.get(id) ?? false }];
        }));
      }
    }
  }

  return (
    <div className="fe">
      {!puedeEditar && (
        <section className="fe-faltan">
          <p><b>Solo de lectura.</b> Para armar un inventario cíclico hace falta permiso de edición en «Cíclico» de
          Producto — pídelo en Admin → Roles.</p>
        </section>
      )}
      <Fiscal
        modo="ciclico"
        cruces={cruces}
        bodegaId={bodegaId}
        personas={personas}
        roles={roles}
        fiscales={fiscales}
        puedeEditar={puedeEditar}
        puedePublicar={conPublicar}
        conCruce={conCruce}
        conCalle={conCalle}
        conFamilias={conFamilias}
        familias={familias.filter((f) => f.tipo === "PT")}
        manda={permisos.manda}
        ahora={new Date().toISOString()}
      />
      {res.error && (
        <details className="fi-avisos">
          <summary>Avisos (1)</summary>
          <p className="cl-nota" role="note">El resumen del cruce no respondió ({res.error.message}); el estado de cada hoja se armó con el cruce hoja por hoja. Corre <code>supabase/migraciones/2026-11-producto-ciclico-control.sql</code> en Supabase.</p>
        </details>
      )}
    </div>
  );
}
