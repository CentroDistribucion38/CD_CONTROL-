import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { salidas as leerSalidas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Bandeja } from "../Bandeja";

export const dynamic = "force-dynamic";

/**
 * VERIFICACIÓN — la segunda firma.
 *
 * Solo llega lo que la supervisora ya cerró. Lo que todavía se está
 * pesando no aparece aquí: no hay nada que verificar de una salida a la
 * que le pueden entrar dos tolvas más.
 */
export default async function VerificacionPage() {
  const [permisos, datos, nombres] = await Promise.all([
    misPermisos(), leerSalidas(300), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  /* Cerradas por la supervisora y todavía sin verificar. Lo más viejo
     primero: al revés, lo de hace tres días no se mira nunca porque
     cada turno entra algo encima. */
  const lista = datos.salidas
    .filter((s) => s.estado === "cerrada" && s.supervisora_en && !s.verificador_en)
    .sort((a, b) => (a.supervisora_en ?? "").localeCompare(b.supervisora_en ?? ""));

  const kg = lista.reduce((t, s) => t + Number(s.neto_kg), 0);

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · SALIDA · VERIFICACIÓN</p>
          <h1>Por verificar</h1>
          <p className="sub">
            Salidas que la supervisora ya cerró y que esperan que alguien más revise la cuenta.
            Quien pesó no verifica: es la regla que evita que el mismo par de manos pese,
            apruebe y despache.
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">ESPERANDO VERIFICACIÓN</div>
          <div className="num">{lista.length}<span className="u">salidas</span></div>
          <div className="pie"><b>{kilos(kg)}</b> kg netos en juego</div>
        </div>
      </section>

      <Bandeja salidas={lista} nombres={nombres} papel="verificador"
               rol={permisos.rol} manda={permisos.manda} />
    </div>
  );
}
