import { misPermisos } from "@/lib/permisos";
import { zonas, areas } from "@/modulos/acciones/datos";
import { temasHallazgo, hallazgos as leerHallazgos } from "@/modulos/acciones/hallazgos";
import "../acciones.css";
import "./abi.css";
import { Levantar } from "./Levantar";
import { SinAbi } from "./SinAbi";

export const dynamic = "force-dynamic";

/**
 * ABI · LEVANTAR. La primera pantalla de la rama y la que se usa
 * caminando: aquí solo se captura. La redacción se hace en Hallazgos.
 */
export default async function AbiLevantarPage() {
  const [permisos, temas, zs, as, hz] = await Promise.all([
    misPermisos(), temasHallazgo(), zonas(), areas(), leerHallazgos(200),
  ]);

  if (hz.falta) return <div className="ac"><SinAbi /></div>;

  const hoy = new Date().toISOString().slice(0, 10);
  const deHoy = hz.hallazgos.filter((h) => h.fecha === hoy && h.estado !== "anulado").length;
  const sinRedactar = hz.hallazgos.filter((h) => h.falta_redaccion).length;

  return (
    <div className="ac">
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES · ABI · AUDITORÍA</p>
          <h1>Levantar un hallazgo</h1>
          <p className="sub">
            Lo que se encuentra caminando, con su evidencia. Se captura aquí y se redacta
            después: un hallazgo nace en <b>borrador</b> y no sale en el informe hasta que
            alguien apruebe su texto.
          </p>
        </div>
        <div className="cifra">
          <div className="rot">LEVANTADOS HOY</div>
          <div className="n">{deHoy}</div>
          <div className="u">
            {sinRedactar
              ? `${sinRedactar} esperan su redacción`
              : "todos los abiertos están redactados"}
          </div>
        </div>
      </section>

      <Levantar temas={temas} zonas={zs} areas={as}
                puedeEditar={permisos.puedeEditar("/acciones/abi")} />
    </div>
  );
}
