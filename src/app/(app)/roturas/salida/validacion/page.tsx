import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { salidas as leerSalidas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { RUTA_FIRMA } from "@/modulos/roturas/firmas";
import { Bandeja } from "../Bandeja";

export const dynamic = "force-dynamic";

/**
 * VALIDACIÓN — la segunda y última firma, la que deja salir el Vh.
 *
 * ANTES ERA LA TERCERA. Se quitó Verificación —«que solo sean dos
 * firmas, dos procesos»—, así que aquí llega lo que acaba de pesar y
 * cerrar el supervisor (a), sin paso intermedio.
 *
 * LO QUE NO SE QUITÓ: quien valida no puede ser quien pesó. Son dos
 * personas y dos momentos, y esa es la razón de ser de la cadena. Lo
 * impone salida_firmar —no esta pantalla, y ya no una restricción de la
 * tabla: una restricción no sabe QUIÉN firma y por eso no podía dejar
 * pasar al administrador—. Cuando el administrador usa esa excepción,
 * la salida queda marcada como firmada por la misma persona.
 */
export default async function ValidacionPage() {
  const [permisos, datos, nombres] = await Promise.all([
    misPermisos(), leerSalidas(300), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  /* LO QUE ESPERA EL AVAL: cerrada por quien pesó y sin validar. Antes
     pedía además la firma del verificador; al quitarla, las salidas que
     llevaban semanas trancadas esperando a nadie aparecen aquí solas.
     La más vieja primero, que es la que lleva más tiempo parada. */
  const lista = datos.salidas
    .filter((s) => s.estado === "cerrada" && s.supervisora_en && !s.validador_en)
    .sort((a, b) => (a.supervisora_en ?? "").localeCompare(b.supervisora_en ?? ""));

  const kg = lista.reduce((t, s) => t + Number(s.neto_kg), 0);

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · SALIDA · VALIDACIÓN</p>
          <h1>Por dar salida</h1>
          <p className="sub">
            Salidas ya pesadas y cerradas, esperando el aval para que el Vh salga. Es la
            segunda y última firma: después la salida queda cerrada y sus kilos entran al
            informe del mes.
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
               puede={permisos.puedeEditar(RUTA_FIRMA.validador)} />
    </div>
  );
}
