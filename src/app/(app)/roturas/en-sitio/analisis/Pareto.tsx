import type { Pareto as Datos } from "@/modulos/roturas/pareto";
import { pesos } from "@/modulos/roturas/formato";

/**
 * EL DIBUJO DEL PARETO.
 *
 * VA APARTE DE LA PÁGINA por lo mismo que el recorrido: la página es un
 * componente de SERVIDOR y no se puede montar en un arnés. Esto sí —
 * recibe las barras ya calculadas y no sabe de dónde salieron.
 *
 * NO CALCULA NADA. Toda la aritmética está en `modulos/roturas/pareto`,
 * que es una función pura con su propio arnés.
 *
 * ---------------------------------------------------------------------
 * LO QUE UN PARETO TIENE QUE DEJAR VER, Y CÓMO SE CONSIGUE
 * ---------------------------------------------------------------------
 *  · LA RESPUESTA ESCRITA: «3 de 7 son el 80 %». Contarlo a ojo en la
 *    gráfica es justo lo que casi nadie hace, y entonces el Pareto se
 *    queda en un ranking bonito.
 *  · LA RAYA DEL 80 %, para poder mirar dónde la cruza la línea.
 *  · LAS UNIDADES Y LA PLATA JUNTAS en cada renglón: se ordena por
 *    unidades —la plata puede estar incompleta si a un material le falta
 *    el precio— pero se decide mirando las dos.
 *
 * BARRAS HORIZONTALES Y NO VERTICALES: los nombres son «Estibas en mal
 * estado» o «Bahías de cargue T1», y en vertical hay que girar la cabeza
 * o abreviarlos hasta que dejan de distinguirse.
 */
export function Pareto({ d, medida }: { d: Datos; medida: string }) {
  if (d.barras.length === 0) {
    return (
      <div className="vacio">
        <b>Sin datos</b>
        No hay roturas con visto bueno en este filtro.
      </div>
    );
  }
  const max = Math.max(...d.barras.map((b) => b.valor));

  return (
    <div className="rq-pareto">
      {/* LA RESPUESTA, ARRIBA Y EN PALABRAS. Un Pareto sin esta línea es
          un ranking con una curva encima. */}
      <p className="rq-pareto-lee">
        <b>{d.hasta80} de {d.barras.length}</b> {d.barras.length === 1 ? "explica" : "explican"}
        {" "}el 80 % de {d.total.toLocaleString("es-CO")} {medida}.
      </p>

      <ol className="rq-pareto-barras">
        {d.barras.map((b) => (
          <li key={b.nombre} className={b.clase === "normal" ? undefined : b.clase}>
            <span className="rq-pb-nom">{b.nombre}</span>
            <span className="rq-pb-riel">
              <i style={{ width: Math.max(1, (b.valor / max) * 100) + "%" }} />
            </span>
            <span className="rq-pb-val">{b.valor.toLocaleString("es-CO")}</span>
            {/* LA PLATA AL LADO, y una raya cuando no se pudo calcular:
                un cero ahí se leería como «no cuesta nada». */}
            <span className="rq-pb-plata">{pesos(b.plata) ?? "—"}</span>
            <span className="rq-pb-acum">{b.acumulado} %</span>
          </li>
        ))}
      </ol>

      {/* EL PIE SOLO CUANDO HAY ALGO QUE ADVERTIR DE ESTE PARETO. Qué es
          la columna del acumulado se dice UNA vez, arriba de los tres:
          repetido tres veces deja de leerse, y entonces lo que sí es
          particular de uno —que tiene «otros», que tiene «sin dato»— se
          pierde dentro de una frase que el ojo ya aprendió a saltarse. */}
      {(d.juntados > 0 || d.barras.some((b) => b.clase === "sinDato")) && (
        <p className="rq-pareto-pie">
          {d.juntados > 0 && <>Las {d.juntados} más chicas están sumadas en «otros».</>}
          {d.barras.some((b) => b.clase === "sinDato") && (
            <> <b>«Sin dato» no es una categoría</b> — son roturas a las que les falta ese campo
            en el registro, y van al final a propósito.</>
          )}
        </p>
      )}
    </div>
  );
}
