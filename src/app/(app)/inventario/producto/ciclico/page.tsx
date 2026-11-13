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
  const res = await (await createClient()).rpc("inv_ciclico_resumen");
  const cruces = res.error ? undefined : Object.fromEntries(((res.data ?? []) as { hoja_id: string; total: number; con_diferencia: number }[])
    .map((x) => [x.hoja_id, { total: Number(x.total) || 0, conDif: Number(x.con_diferencia) || 0 }]));

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
    </div>
  );
}
