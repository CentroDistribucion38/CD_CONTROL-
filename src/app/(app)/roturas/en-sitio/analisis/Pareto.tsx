import type { Pareto as Datos, Barra } from "@/modulos/roturas/pareto";
import { pesos } from "@/modulos/roturas/formato";

/**
 * EL PARETO — LA GRÁFICA Y LA TABLA.
 *
 * «Quiero las gráficas de pareto por causa, área y OPM.»
 *
 * VA APARTE DE LA PÁGINA porque la página es un componente de SERVIDOR y
 * no se puede montar en un arnés. Esto sí: recibe las barras ya
 * calculadas y no sabe de dónde salieron. NO CALCULA NADA — la
 * aritmética está en `modulos/roturas/pareto`, con su propio arnés.
 *
 * ---------------------------------------------------------------------
 * SÍ, SON DOS ESCALAS, Y AQUÍ SÍ SE PUEDE
 * ---------------------------------------------------------------------
 * La regla general es no poner dos escalas en un mismo dibujo, y la
 * razón es buena: cuando se cruzan dos medidas distintas —usuarios
 * contra sesiones, digamos— el sitio donde se cruzan las dos escalas lo
 * eligió alguien, y el dibujo termina insinuando una relación que no
 * está en los datos.
 *
 * UN PARETO NO ES ESE CASO. La línea no es una segunda medida: SALE DE
 * LAS MISMAS BARRAS, sumadas de izquierda a derecha. El 100 % de la
 * derecha es el total de las barras, no un número elegido. Por eso aquí
 * las dos escalas no pueden desmentirse: son la misma.
 *
 * ---------------------------------------------------------------------
 * UNA SOLA FAMILIA DE COLOR, Y LA LÍNEA ES LA MÁS OSCURA
 * ---------------------------------------------------------------------
 * En esta pantalla el rojo ya dice dos cosas —«esta es LA cifra» y «esto
 * no se cobra»— y el ámbar dice «excepción». Meter un cuarto color para
 * la curva sería pedirle al que mira que recuerde cuatro significados.
 *
 * Así que la curva se distingue por la FORMA —una línea con puntos
 * contra unos rectángulos llenos, que no se confunden— y por ser lo más
 * oscuro del dibujo. Que sea lo más oscuro no es capricho: la curva es
 * la respuesta que el Pareto viene a dar.
 *
 * ---------------------------------------------------------------------
 * Y DEBAJO, LOS NÚMEROS
 * ---------------------------------------------------------------------
 * La gráfica contesta «cuántas» de un golpe de vista; la tabla es la que
 * deja leer un nombre largo entero, comparar la plata y llevarse la
 * cifra exacta a una reunión. En el celular, además, nueve barras
 * verticales quedan estrechas, y entonces la tabla es la que se lee.
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
  const n = d.barras.length;

  /* LA GEOMETRÍA, EN COORDENADAS DEL DIBUJO. El SVG lleva `viewBox` y
     ancho 100 %: el navegador lo escala al sitio que haya, así que estas
     medidas no son píxeles de pantalla sino proporciones. Es lo que hace
     que el mismo dibujo sirva en un monitor y en un celular. */
  const AN = 340, AL = 212;
  const IZQ = 30, DER = 30, ARR = 16, ABA = 56;
  const ancho = AN - IZQ - DER;
  const alto = AL - ARR - ABA;
  const banda = ancho / n;
  const grueso = Math.min(banda * 0.62, 34);

  const xCentro = (i: number) => IZQ + banda * i + banda / 2;
  const yBarra = (v: number) => ARR + alto - (v / max) * alto;
  const yPct = (p: number) => ARR + alto - (p / 100) * alto;

  const curva = d.barras.map((b, i) => `${xCentro(i)},${yPct(b.acumulado)}`).join(" ");
  const corto = (t: string) => (t.length > 16 ? t.slice(0, 15) + "…" : t);
  /* EL TOPE DE LA ESCALA, ESCRITO. Sin él las barras son proporciones
     sin tamaño: se ve cuál es el doble de cuál, no de cuánto se habla. */
  const nf = (v: number) => v.toLocaleString("es-CO");

  return (
    <div className="rq-pareto">
      {/* LA RESPUESTA, ARRIBA Y EN PALABRAS. Un Pareto sin esta línea es
          un ranking con una curva encima, y contar las barras a ojo en la
          gráfica es justo lo que casi nadie hace. */}
      <p className="rq-pareto-lee">
        <b>{d.hasta80} de {n}</b> {n === 1 ? "explica" : "explican"}
        {" "}el 80 % de {nf(d.total)} {medida}.
      </p>

      <svg
        className="rq-pareto-svg"
        viewBox={`0 0 ${AN} ${AL}`}
        role="img"
        aria-label={`Pareto: ${d.hasta80} de ${n} ${n === 1 ? "explica" : "explican"} el 80 % de ${nf(d.total)} ${medida}.`}
      >
        {/* LA RAYA DEL 80 %, DETRÁS DE TODO. Es contra lo que se mira la
            curva: sin ella hay que calcular de cabeza dónde está. */}
        <line className="rq-pk-raya" x1={IZQ} y1={yPct(80)} x2={AN - DER} y2={yPct(80)} />
        <text className="rq-pk-raya-rot" x={AN - DER + 2} y={yPct(80) + 3}>80 %</text>

        {/* LA ESCALA DE LA IZQUIERDA: el tope y el cero, nada más. Más
            marcas serían rejilla, y la rejilla se come el dibujo. */}
        <text className="rq-pk-eje" x={IZQ - 4} y={ARR + 4} textAnchor="end">{nf(max)}</text>
        <text className="rq-pk-eje" x={IZQ - 4} y={ARR + alto} textAnchor="end">0</text>
        <line className="rq-pk-base" x1={IZQ} y1={ARR + alto} x2={AN - DER} y2={ARR + alto} />

        {d.barras.map((b, i) => {
          const y = yBarra(b.valor);
          return (
            <g key={b.nombre} className={"rq-pk-g" + (b.clase === "normal" ? "" : " " + b.clase)}>
              {/* LA BARRA. Se ancla en la base: una barra que flota deja
                  de poderse comparar con la de al lado. */}
              <rect
                className="rq-pk-barra"
                x={xCentro(i) - grueso / 2} y={y}
                width={grueso} height={Math.max(1, ARR + alto - y)}
                rx="1.5"
              />
              {/* EL NÚMERO ENCIMA. Con nueve barras, leer la altura
                  contra el eje es trabajo; el número no. */}
              <text className="rq-pk-val" x={xCentro(i)} y={y - 3} textAnchor="middle">
                {nf(b.valor)}
              </text>
              {/* EL NOMBRE, INCLINADO. Derecho no cabe y en vertical hay
                  que girar la cabeza; a 40° se lee de corrido. El nombre
                  entero va en el `title` y en la tabla de abajo. */}
              <text
                className="rq-pk-nom" x={xCentro(i)} y={ARR + alto + 6}
                transform={`rotate(-40 ${xCentro(i)} ${ARR + alto + 6})`}
                textAnchor="end"
              >
                {corto(b.nombre)}
                <title>{b.nombre}</title>
              </text>
            </g>
          );
        })}

        {/* LA CURVA, ENCIMA DE LAS BARRAS Y LA ÚLTIMA EN DIBUJARSE. */}
        <polyline className="rq-pk-linea" points={curva} />
        {d.barras.map((b, i) => (
          <circle
            key={b.nombre} className="rq-pk-punto"
            cx={xCentro(i)} cy={yPct(b.acumulado)} r="2.6"
          >
            <title>{b.nombre}: {b.acumulado} % acumulado</title>
          </circle>
        ))}
      </svg>

      {/* LOS NÚMEROS. La gráfica contesta «cuántas» de un golpe; esto es
          lo que deja leer un nombre largo entero, comparar la plata y
          llevarse la cifra exacta. */}
      <table className="rq-pareto-tabla">
        <thead>
          <tr>
            <th scope="col">Qué</th>
            <th scope="col">Unid.</th>
            {/* Lleva la MISMA clase que sus celdas para que se oculten
                juntos en el celular: un encabezado sin columna deja los
                porcentajes debajo de «Se cobra», y ahí un 41 % se lee
                como plata. */}
            <th scope="col" className="rq-pb-plata">Se cobra</th>
            <th scope="col">Acum.</th>
          </tr>
        </thead>
        <tbody>
          {d.barras.map((b: Barra) => (
            <tr key={b.nombre} className={b.clase === "normal" ? undefined : b.clase}>
              <th scope="row">{b.nombre}</th>
              <td>{nf(b.valor)}</td>
              {/* UNA RAYA CUANDO NO SE PUDO CALCULAR: un cero ahí se
                  leería como «no cuesta nada», que es lo contrario de que
                  al material le falte el precio en el maestro. */}
              <td className="rq-pb-plata">{pesos(b.plata) ?? "—"}</td>
              <td className="rq-pb-acum">{b.acumulado} %</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(d.juntados > 0 || d.barras.some((b) => b.clase === "sinDato")) && (
        <p className="rq-pareto-pie">
          {d.juntados > 0 && <>Las {d.juntados} más chicas están sumadas en «Otros».</>}
          {d.barras.some((b) => b.clase === "sinDato") && (
            <> <b>«Sin dato» no es una categoría</b> — son roturas a las que les falta ese campo
            en el registro, y van al final a propósito.</>
          )}
        </p>
      )}
    </div>
  );
}
