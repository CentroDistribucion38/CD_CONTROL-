import Link from "next/link";
import { notFound } from "next/navigation";
import { misPermisos } from "@/lib/permisos";
import { pendientesAi, maestrosAi, revisionDe } from "@/modulos/sider/ai";
import type { Pendiente } from "@/modulos/sider/ai";
import { createClient } from "@/lib/supabase/server";
import "../../sider.css";
import "@/modulos/sider/ai.css";
import { Editor } from "./Editor";

export const dynamic = "force-dynamic";

/**
 * LLENAR (O CORREGIR) LA REVISIÓN DE UN CAMIÓN.
 *
 * EL VIAJE PUEDE ESTAR EN DOS SITIOS: en la lista de pendientes, si
 * nadie lo ha revisado, o ya con revisión hecha, si se viene a
 * corregir. Se busca en los dos y se arma la misma pantalla: un
 * formulario para llenar y otro para corregir serían dos formularios
 * que se van separando con cada cambio.
 */
export default async function RevisarPage({ params }: {
  params: Promise<{ viaje: string }>;
}) {
  const { viaje: viajeId } = await params;
  const [permisos, pen, m, hecha] = await Promise.all([
    misPermisos(), pendientesAi(), maestrosAi(), revisionDe(viajeId),
  ]);

  if (!permisos.puedeEditar("/sider/transito")) {
    return (
      <div className="sd ai">
        <section className="ai-caja">
          <div className="ai-cab"><h2>No tienes permiso</h2>
            <p>Llenar una revisión AI necesita rol de supervisor o administrador.</p></div>
          <p><Link href="/sider/ai">Volver</Link></p>
        </section>
      </div>
    );
  }

  let viaje: Pendiente | undefined = pen.pendientes.find((p) => p.viaje_id === viajeId);

  /* Si ya está revisado no sale en pendientes, así que la cabecera del
     camión se arma de la propia revisión — que además es la versión
     CONGELADA de esos datos, que es la que vale para un cobro. */
  if (!viaje && hecha.revision) {
    const supabase = await createClient();
    const { data: v } = await supabase.from("sider_viajes")
      .select("sku, estibas, ai_motivo").eq("id", viajeId).maybeSingle();
    viaje = {
      viaje_id: viajeId,
      placa: hecha.revision.placa,
      planta: hecha.revision.planta,
      sku: (v as { sku?: string } | null)?.sku ?? "—",
      estibas: Number((v as { estibas?: number } | null)?.estibas ?? 0),
      fecha: hecha.revision.fecha,
      ai_pedido_en: null, ai_pedido_por: null,
      ai_motivo: (v as { ai_motivo?: string | null } | null)?.ai_motivo ?? null,
      pedido_nombre: null, llego_en: null,
    };
  }

  if (!viaje) notFound();

  return (
    <div className="sd ai">
      <section className="ai-cabeza chica">
        <div>
          <p className="ai-ojo">
            SIDER · REVISIÓN AI · {viaje.placa}
            {hecha.revision && " · CORRIGIENDO"}
          </p>
          <h1>{hecha.revision ? "Corregir la revisión" : "Revisión del envase"}</h1>
          <p className="ai-sub">
            Se cuentan las botellas malas de la muestra. El índice de cobro y las unidades
            que no se abonan <b>salen solos</b>: nadie los digita.
          </p>
        </div>
      </section>

      <Editor viaje={viaje} revision={hecha.revision} detalle={hecha.detalle}
              defectos={m.defectos} envases={m.envases}
              socios={m.socios} canales={m.canales} />
    </div>
  );
}
