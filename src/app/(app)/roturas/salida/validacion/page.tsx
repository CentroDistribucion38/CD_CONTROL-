import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { salidas as leerSalidas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Bandeja } from "../Bandeja";

export const dynamic = "force-dynamic";

/**
 * VALIDACIÓN — la tercera y última firma, la que deja salir el Vh.
 *
 * Solo llega lo que ya verificó otra persona. Y quien valida no puede
 * ser ninguna de las dos anteriores: son tres personas y tres momentos.
 * Lo impone salida_firmar —no esta pantalla, y ya no una restricción de
 * la tabla: una restricción no sabe QUIÉN firma y por eso no podía dejar
 * pasar al administrador—. Cuando el administrador usa esa excepción, la
 * salida queda marcada como firmada por la misma persona.
 */
export default async function ValidacionPage() {
  const [permisos, datos, nombres] = await Promise.all([
    misPermisos(), leerSalidas(300), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  const lista = datos.salidas
    .filter((s) => s.estado === "cerrada" && s.verificador_en && !s.validador_en)
    .sort((a, b) => (a.verificador_en ?? "").localeCompare(b.verificador_en ?? ""));

  const kg = lista.reduce((t, s) => t + Number(s.neto_kg), 0);

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · SALIDA · VALIDACIÓN</p>
          <h1>Por dar salida</h1>
          <p className="sub">
            Salidas ya verificadas, esperando el aval para que el Vh salga. Es la última
            firma: después la salida queda cerrada y sus kilos entran al informe del mes.
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">ESPERANDO EL AVAL</div>
          <div className="num">{lista.length}<span className="u">salidas</span></div>
          <div className="pie"><b>{kilos(kg)}</b> kg netos listos para salir</div>
        </div>
      </section>

      <Bandeja salidas={lista} nombres={nombres} papel="validador"
               rol={permisos.rol} manda={permisos.manda} />
    </div>
  );
}
