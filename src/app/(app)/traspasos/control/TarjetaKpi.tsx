/**
 * LA TARJETA DE ADHERENCIA, PARA EL CELULAR.
 *
 * EN EL ESCRITORIO esta pantalla reparte la misma información en tres
 * bloques —el panel del porcentaje grande, las seis cifras, y la cinta
 * con su leyenda— y ahí funciona: caben lado a lado y se leen de un
 * vistazo.
 *
 * EN EL CELULAR NO. Apilados uno debajo del otro, esos tres bloques
 * miden más de una pantalla entera: hay que rodar para ver el 63 %, rodar
 * otra vez para ver de cuántos, y rodar de nuevo para saber cuántos
 * faltan. Tres viajes por la misma respuesta.
 *
 * ASÍ QUE EN EL CELULAR SON UNO SOLO, en el orden en que alguien lo
 * pregunta:
 *
 *   1. cómo vamos ............. 63 %, y de cuántos: 22 de 35
 *   2. repartido en qué ....... la cinta, con su leyenda
 *   3. las cifras de atrás ..... seis, en rejilla, para verificar
 *   4. qué falta HOY .......... la banda de abajo, que es lo accionable
 *
 * LA BANDA NEGRA CIERRA, y no es adorno: es la única línea de la tarjeta
 * que dice qué HACER. Lo de arriba informa; esto es lo que queda por
 * mover antes de cerrar el turno.
 */

const TURNOS_ROTULO = (t: string[]) =>
  t.length === 0 ? "TODOS LOS TURNOS"
    : t.length === 1 ? `TURNO ${t[0]}`
      : `TURNOS ${t.join(" Y ")}`;

export function TarjetaKpi({
  adherencia, cumplimiento, planeado, adheridos, adicionales, faltan, vacios,
  pOk, pExtra, turnos,
}: {
  adherencia: number; cumplimiento: number;
  planeado: number; adheridos: number; adicionales: number;
  faltan: number; vacios: number;
  /** Los tramos de la cinta, ya calculados en la página: no se vuelven
      a calcular aquí para que no puedan dar distinto que el escritorio. */
  pOk: number; pExtra: number;
  turnos: string[];
}) {
  return (
    <section className="tk" aria-label="Adherencia al plan">
      <div className="tk-cab">
        <div className="tk-r">ADHERENCIA AL PLAN · {TURNOS_ROTULO(turnos)}</div>
        <div className="tk-fila">
          <div className="tk-pct">{planeado > 0 ? `${adherencia}%` : "—"}</div>
          <div className="tk-frac">
            <b>{adheridos} / {planeado}</b>
            <span>VIAJES DEL PLAN</span>
          </div>
        </div>
      </div>

      {/* La cinta reparte sobre el PLAN, igual que arriba en el
          escritorio: los mismos tres tramos y los mismos tres números. */}
      <div className="tk-barra" role="img"
           aria-label={`${adheridos} del plan, ${adicionales} adicionales, ${faltan} sin salir`}>
        <i className="c" style={{ width: `${pOk}%` }} />
        <i className="a" style={{ width: `${pExtra}%` }} />
      </div>
      <div className="tk-ley">
        <span><i className="c" /> {adheridos} cumplidos</span>
        <span><i className="a" /> {adicionales} adicionales</span>
        <span><i className="f" /> {faltan} faltan</span>
      </div>

      {/* LAS SEIS, EN EL ORDEN DEL PROCESO: se planea, se cumple, algo
          sale de más, algo falta, algunos van vacíos — y de ahí sale el
          cumplimiento. El mismo orden que en el escritorio, para que
          quien use las dos no tenga que reaprenderlo. */}
      <div className="tk-rejilla">
        <div><b>{planeado}</b><span>PLANEADOS</span></div>
        <div><b>{adheridos}</b><span>CUMPLIDOS</span></div>
        <div className="ac"><b>{adicionales}</b><span>ADICIONALES</span></div>
        <div className={faltan > 0 ? "mal" : undefined}><b>{faltan}</b><span>FALTAN</span></div>
        <div className="apag"><b>{vacios}</b><span>VACÍOS</span></div>
        <div><b>{planeado > 0 ? `${cumplimiento}%` : "—"}</b><span>CUMPLIMIENTO</span></div>
      </div>

      <div className="tk-pie">
        <span>FALTAN POR MOVER ANTES DE CERRAR</span>
        <b>{faltan}</b>
      </div>
    </section>
  );
}
