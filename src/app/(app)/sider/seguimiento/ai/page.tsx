import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { informeAi, opcionesAi } from "@/modulos/sider/informe-ai";
import "../../sider.css";
import "./informe.css";
import { Informe } from "./Informe";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * SIDER · AI — EL INFORME DE LA REVISIÓN DE ENVASE.
 *
 * Solo unidades revisadas, unidades en mal estado y %AI, por período, semana y origen.
 * Las cifras de cada revisión salen de `v_sider_ai`; esta pantalla agrupa y dibuja.
 */
export default async function InformeAiPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; socio?: string; envase?: string; canal?: string; tipo?: string }>;
}) {
  const q = await searchParams;
  const [permisos, ops] = await Promise.all([misPermisos(), opcionesAi()]);

  /* El rango arranca en TODO lo que hay. Un informe que abre en «este
     mes» y el mes va por el día 3 muestra tres revisiones y parece
     vacío; y quien entra por primera vez no sabe que hay cuatro meses
     detrás. Se acota después, con los filtros. */
  const desde = q.desde && FECHA.test(q.desde) ? q.desde : (ops.primera ?? undefined);
  const hasta = q.hasta && FECHA.test(q.hasta) ? q.hasta : (ops.ultima ?? undefined);
  const filtro = {
    desde: desde && hasta && desde > hasta ? hasta : desde,
    hasta: desde && hasta && desde > hasta ? desde : hasta,
    socio: q.socio || undefined,
    envase: q.envase || undefined,
    canal: q.canal || undefined,
    /* Solo dos valores valen; cualquier otra cosa es «las dos». */
    tipo: (q.tipo === "ai" || q.tipo === "sorting" ? q.tipo : undefined) as "ai" | "sorting" | undefined,
  };

  const inf = await informeAi(filtro);

  if (inf.falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta preparar la revisión AI en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta, en orden:{" "}
            <code>supabase/modulos/sider-ai.sql</code>,{" "}
            <code>supabase/migraciones/2026-09-sider-ai-que-cobra.sql</code>,{" "}
            <code>supabase/migraciones/2026-09-sider-ai-historico.sql</code> y{" "}
            <code>supabase/datos/sider-ai-historico-baq.sql</code>.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="sd">
      <section className="cabeza">
        <div>
          <p className="ojo">SIDER · INFORME AI</p>
          <h1>%AI de la revisión de envase</h1>
          <p className="sub">
            <b>%AI = unidades en mal estado / unidades revisadas</b>, sumadas en el período (no el
            promedio de cada revisión), y abajo por origen.{" "}
            Entran las dos clases de revisión —<b>certificada</b> y <b>normal</b>— cada una
            marcada con su nombre; con el filtro «Revisión» se ve una sola.{" "}
            <Link href="/sider/seguimiento">Volver al seguimiento de envase</Link>
          </p>
        </div>
      </section>

      <Informe
        datos={inf}
        opciones={ops}
        filtro={filtro}
        esEditor={permisos.puedeEditar("/sider/seguimiento")}
      />
    </div>
  );
}
