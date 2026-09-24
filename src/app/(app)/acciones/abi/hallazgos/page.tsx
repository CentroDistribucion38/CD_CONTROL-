import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { motivos } from "@/modulos/acciones/datos";
import { hallazgos as leerHallazgos } from "@/modulos/acciones/hallazgos";
import "../../acciones.css";
import "../abi.css";
import { SinAbi } from "../SinAbi";
import { Hallazgos } from "./Hallazgos";

export const dynamic = "force-dynamic";

/**
 * ABI · HALLAZGOS — donde se redacta y se decide qué hacer con cada uno.
 *
 * LOS MOTIVOS VIENEN DE ACCIONES y no de un maestro propio: de aquí
 * nace la acción correctiva, y una acción se abre con un motivo del
 * maestro de OL. Inventar un maestro de motivos para ABI sería tener
 * dos listas para la misma pregunta y descubrir a los tres meses que
 * dicen cosas distintas.
 */
export default async function AbiHallazgosPage() {
  const [permisos, hz, ms, nombres] = await Promise.all([
    misPermisos(),
    leerHallazgos(),
    motivos(),
    nombresTodos(),
  ]);

  if (hz.falta) return <div className="ac"><SinAbi /></div>;

  const sinRedaccion = hz.hallazgos.filter((h) => h.falta_redaccion).length;
  const deLaIa = hz.hallazgos.filter((h) => h.tal_cual_de_la_ia).length;

  return (
    <div className="ac">
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES · ABI · REDACCIÓN</p>
          <h1>Hallazgos</h1>
          <p className="sub">
            Lo que se dictó en la bodega a la izquierda y la redacción técnica a la derecha, del
            mismo ancho: es lo único que deja comprobar que la segunda dice lo mismo que la
            primera. <b>La máquina propone y tú apruebas</b> — lo que propone no se guarda hasta
            que alguien le da Aprobar, y se guarda aparte para poder contestar quién lo revisó.
          </p>
        </div>
        <div className="cifra">
          <div className="rot">ESPERAN REDACCIÓN</div>
          <div className="n">{sinRedaccion}</div>
          <div className="u">
            {deLaIa
              ? `${deLaIa} salieron tal cual de la IA`
              : "sin redacción no salen en el informe"}
          </div>
        </div>
      </section>

      <Hallazgos
        hallazgos={hz.hallazgos}
        nombres={nombres}
        motivos={ms}
        puedeEditar={permisos.puedeEditar("/acciones/abi/hallazgos")}
        manda={permisos.manda}
      />
    </div>
  );
}
