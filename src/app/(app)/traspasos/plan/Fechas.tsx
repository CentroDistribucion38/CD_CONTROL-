"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { EscogerDia } from "./Calendario";

/**
 * MOVERSE DE DÍA. La misma barra en Plan, en Registrar y en Control.
 *
 * El plan casi siempre se arma para MAÑANA, no para hoy: por eso las
 * flechas están antes del título y no escondidas en un filtro.
 *
 * Y EL CALENDARIO PARA TODO LO DEMÁS. Las flechas de ± un día resuelven
 * "mañana"; llegar a fin de mes con ellas eran veinte toques, y planear
 * el mes entrante empezaba por ahí.
 *
 * ES UNA SOLA BARRA Y NO TRES COPIAS. Las tres pantallas se mueven por
 * día y se mueven igual; tres barras parecidas es que dentro de un mes
 * una tenga el calendario y las otras no. Lo único que cambia entre
 * ellas es a qué dirección van y con qué nombre de parámetro, y eso
 * entra por arriba.
 */
export function Fechas({ dia, hoy, esHoy, hayBorrador = false,
                         ruta = "/traspasos/plan", param = "d", extra }: {
  dia: string; hoy: string; esHoy: boolean;
  hayBorrador?: boolean;
  /** A qué pantalla se navega al cambiar de día. */
  ruta?: string;
  /** Con qué nombre viaja la fecha en la dirección. */
  param?: string;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();

  /* SE CAMBIA EL DÍA Y SE DEJA LO DEMÁS. En Control hay además filtros
     de turno y de tipo en la dirección: armar la URL a mano los borraba,
     así que mover un día deshacía el filtro que la persona acababa de
     poner. Se copia lo que hay y solo se toca la fecha. */
  const con = (cambio: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params.toString());
    cambio(p);
    const q = p.toString();
    router.push(q ? `${ruta}?${q}` : ruta);
  };
  const ir = (f: string) => con((p) => p.set(param, f));
  const mover = (n: number) => {
    ir(new Date(Date.parse(dia + "T12:00:00") + n * 86400_000)
         .toISOString().slice(0, 10));
  };

  return (
    <div className="fecha-nav">
      <button type="button" onClick={() => mover(-1)} aria-label="día anterior">
        <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      {/* LA FECHA VA EN EL MEDIO, entre las dos flechas: es el sitio
          donde uno la busca, y de paso es el botón del calendario. HOY
          queda después, que es lo que es — un atajo para volver, no la
          pieza principal. */}
      <EscogerDia dia={dia} hoy={hoy} alEscoger={ir} />

      <button type="button" onClick={() => mover(1)} aria-label="día siguiente">
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>

      <button type="button" className={"hoy" + (esHoy ? " on" : "")} disabled={esHoy}
              onClick={() => con((p) => p.delete(param))}>HOY</button>

      {/* EL AVISO DE BORRADOR NO ES DECORACIÓN: es la diferencia entre
          lo que estás armando y lo que el turno está viendo. */}
      {hayBorrador && (
        <span className="estado-plan"><i aria-hidden /> Borrador · sin publicar</span>
      )}
      {extra}
    </div>
  );
}
