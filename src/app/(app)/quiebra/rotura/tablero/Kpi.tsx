/**
 * LA TARJETA DE ARRIBA DEL TABLERO.
 *
 * Banda con el rótulo, la cifra grande a la izquierda, la de al lado a
 * la derecha con su comparación, y la forma de la tendencia abajo.
 *
 * ES UN COMPONENTE DE SERVIDOR: no tiene estado ni escucha nada. La
 * chispa se dibuja en SVG con los números ya calculados, así que no
 * necesita JavaScript en el navegador — y esta pantalla se abre desde el
 * pasillo, no desde un escritorio.
 */

type Delta = { pct: number; que: string };

/* Qué tan plana se ve una tendencia. La chispa NO lleva ejes ni cifras a
   propósito: no es el gráfico del período —ese está más abajo, con su
   escala— sino la FORMA, para saber si el número de arriba viene de una
   subida sostenida o de un solo día malo. */
function chispa(v: number[], ancho = 800, alto = 34): string | null {
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v);
  /* Todo igual: una recta a media altura. Sin esto, dividir por cero
     manda la línea al infinito y el SVG sale vacío sin avisar. */
  const rango = max - min || 1;
  const paso = ancho / (v.length - 1);
  /* Se deja 3 px de aire arriba y abajo: una línea pegada al borde se
     corta al trazarla con grosor 2,4. */
  return v.map((n, i) =>
    `${(i * paso).toFixed(1)},${(alto - 3 - ((n - min) / rango) * (alto - 6)).toFixed(1)}`
  ).join(" ");
}

export function Kpi({ rotulo, cifra, sub, ladoRot, ladoVal, delta, serie }: {
  rotulo: string;
  cifra: string;
  sub: string;
  ladoRot: string;
  ladoVal: string;
  delta: Delta | null;
  serie: number[];
}) {
  const puntos = chispa(serie);
  /* EN ROTURA, SUBIR ES MALO. La flecha hacia arriba va en rojo y la de
     abajo en verde — al revés de lo que hace un tablero de ventas, y por
     eso está escrito: aquí el número que crece es vidrio en el piso. */
  const sube = delta != null && delta.pct > 0;

  return (
    <section className="rl-kpi">
      <div className="rl-kpi-banda">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.15"
             strokeLinejoin="round" strokeLinecap="round" aria-hidden>
          <path d="M13.1 3.4h5.8v1.3h-5.8z" />
          <path d="M13.5 4.7v3.6c0 .9-.3 1.7-.9 2.4l-1.5 1.8a4.4 4.4 0 0 0-1 2.8v11.1a2 2 0 0 0 2 2h7.8a2 2 0 0 0 2-2V15.3a4.4 4.4 0 0 0-1-2.8l-1.5-1.8a3.7 3.7 0 0 1-.9-2.4V4.7" />
          <path d="M11.6 18.6h8.8" />
          <path d="M17.4 12.9l-1.9 3.1h2.9l-1.8 3.4" />
        </svg>
        <span>{rotulo}</span>
      </div>

      <div className="rl-kpi-cuerpo">
        <div className="rl-kpi-izq">
          <p className="rl-kpi-num">{cifra}</p>
          <p className="rl-kpi-sub">{sub}</p>
        </div>
        <div className="rl-kpi-der">
          <p className="rl-kpi-k">{ladoRot}</p>
          <p className="rl-kpi-v">{ladoVal}</p>
          {delta ? (
            <p className={"rl-kpi-d" + (sube ? " sube" : " baja")}>
              {sube ? "▲" : "▼"} {Math.abs(delta.pct).toFixed(1).replace(".", ",")} % {delta.que}
            </p>
          ) : (
            /* No hay período anterior con registro. Se dice, en vez de
               dejar el hueco: quien lo ve vacío no sabe si es que no
               cambió o si la tarjeta está rota. */
            <p className="rl-kpi-d sin">sin período anterior para comparar</p>
          )}
        </div>
      </div>

      {puntos && (
        <div className="rl-kpi-chispa">
          <svg viewBox="0 0 800 34" preserveAspectRatio="none" aria-hidden>
            <polyline points={puntos} fill="none" strokeWidth="2.4" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </section>
  );
}
