import { nombresTodos } from "@/modulos/sider/datos";
import { hallazgos as leerHallazgos, temasHallazgo } from "@/modulos/acciones/hallazgos";
import "../../acciones.css";
import "../abi.css";
import { SinAbi } from "../SinAbi";
import { Informe } from "./Informe";

export const dynamic = "force-dynamic";

export default async function AbiInformePage() {
  const [hz, temas, nombres] = await Promise.all([
    leerHallazgos(),
    temasHallazgo(false),
    nombresTodos(),
  ]);

  if (hz.falta) return <div className="ac"><SinAbi /></div>;

  /* LA FECHA LA PONE EL SERVIDOR. `new Date()` en el navegador toma el
     reloj del computador, y en la bodega hay máquinas con la fecha
     corrida: un informe fechado tres días antes es un informe que
     alguien va a discutir. */
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <div className="ac">
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES · ABI · INFORME</p>
          <h1>Informe de hallazgos</h1>
          <p className="sub">
            El PDF que se manda, con el logo, el encabezado y cada hallazgo con su redacción y
            sus fotos del <b>antes</b> y el <b>después</b>. <b>Solo entra lo redactado y
            aprobado</b> — un borrador es un dictado de bodega sin revisar—, y el informe dice en
            la primera página cuántos quedaron por fuera: quien lo recibe tiene que saber que eso
            no fue todo lo que se encontró.
          </p>
        </div>
      </section>

      <Informe hallazgos={hz.hallazgos} temas={temas} nombres={nombres} hoy={hoy} />
    </div>
  );
}
