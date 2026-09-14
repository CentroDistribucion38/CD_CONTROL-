"use client";

import { useRouter } from "next/navigation";
import { EscogerDia } from "./Calendario";

/**
 * MOVERSE DE DÍA, Y EL AVISO DE BORRADOR.
 *
 * El plan casi siempre se arma para MAÑANA, no para hoy: por eso las
 * flechas están antes del título y no escondidas en un filtro.
 *
 * Y EL CALENDARIO PARA TODO LO DEMÁS. Las flechas de ± un día resuelven
 * "mañana"; llegar a fin de mes con ellas eran veinte toques, y planear
 * el mes entrante empezaba por ahí.
 */
export function Fechas({ dia, hoy, esHoy, hayBorrador }: {
  dia: string; hoy: string; esHoy: boolean; hayBorrador: boolean;
}) {
  const router = useRouter();
  const mover = (n: number) => {
    const d = new Date(Date.parse(dia + "T12:00:00") + n * 86400_000)
      .toISOString().slice(0, 10);
    router.push(`/traspasos/plan?d=${d}`);
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
      <EscogerDia dia={dia} hoy={hoy}
                  alEscoger={(f) => router.push(`/traspasos/plan?d=${f}`)} />

      <button type="button" onClick={() => mover(1)} aria-label="día siguiente">
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>

      <button type="button" className={"hoy" + (esHoy ? " on" : "")} disabled={esHoy}
              onClick={() => router.push("/traspasos/plan")}>HOY</button>

      {/* EL AVISO DE BORRADOR NO ES DECORACIÓN: es la diferencia entre
          lo que estás armando y lo que el turno está viendo. */}
      {hayBorrador && (
        <span className="estado-plan"><i aria-hidden /> Borrador · sin publicar</span>
      )}
    </div>
  );
}
