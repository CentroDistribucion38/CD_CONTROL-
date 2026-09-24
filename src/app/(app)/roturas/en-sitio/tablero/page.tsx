import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { roturas as leerRoturas } from "@/modulos/roturas/datos";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Tablero } from "./Tablero";

export const dynamic = "force-dynamic";

/**
 * EN SITIO · TABLERO — todos los registros y su estado.
 *
 * VA APARTE DE LAS BANDEJAS y no como una pestaña suya, por la misma
 * razón que en Averías: en una bandeja cada rotura es UNA DECISIÓN y
 * se lee de una en una; aquí se viene a BUSCAR una entre trescientas,
 * o a ver de un vistazo cuántas quedaron sin origen. Son dos trabajos
 * distintos y necesitan dos formas distintas.
 */
export default async function TableroEnSitioPage() {
  const [permisos, datos, nombres] = await Promise.all([
    misPermisos(), leerRoturas(1000), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  const vivas = datos.roturas.filter((r) => r.estado !== "anulada");
  const und = vivas.reduce((s, r) => s + r.unidades, 0);

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · TABLERO</p>
          <h1>Todo lo registrado</h1>
          <p className="sub">
            Cada rotura con el estado en que quedó: si espera al operador logístico, si está
            en desacuerdo, si se va a cobrar o si ya se descartó. Aquí se <b>busca</b>; las
            bandejas son para decidir, de una en una.
            {permisos.manda && <> Y aquí el administrador anula y borra — que no son lo mismo.</>}
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">REGISTRADAS</div>
          <div className="num">{vivas.length}</div>
          <div className="pie">
            <b>{und}</b> unidades
            {datos.roturas.length !== vivas.length
              && ` · ${datos.roturas.length - vivas.length} anuladas`}
          </div>
        </div>
      </section>

      <Tablero roturas={datos.roturas} nombres={nombres} manda={permisos.manda} />

      {!permisos.manda && (
        <div className="aviso">
          Estás viendo el tablero. <b>Anular y borrar</b> son del administrador: una rotura que
          desaparece después de haber entrado en la conciliación de alguien es un mes que
          cambió sin dejar nada que mirar.
        </div>
      )}

      <p className="rq-mas">
        <Link href="/roturas/en-sitio">← Registrar</Link>
        {"  ·  "}
        <Link href="/roturas/en-sitio/visto-bueno">Visto bueno</Link>
        {"  ·  "}
        <Link href="/roturas/en-sitio/analisis">Análisis</Link>
      </p>
    </div>
  );
}
