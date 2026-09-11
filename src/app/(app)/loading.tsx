import "./cargando.css";

/**
 * LO QUE SE VE MIENTRAS LLEGA LA PANTALLA.
 *
 * Sin este archivo, tocar una sección del menú no hacía NADA visible: el
 * navegador se quedaba en la pantalla anterior hasta que el servidor
 * terminara de consultar, y la app parecía trabada. Quien no ve respuesta
 * vuelve a tocar, y el segundo toque cancela el primero: se sentía lento
 * porque en parte lo estábamos volviendo lento.
 *
 * Con esto, el cambio de pantalla es instantáneo —la dirección cambia, el
 * menú marca dónde estás, y aquí queda el armazón de la página— y los
 * datos entran encima cuando llegan.
 *
 * Y trae algo más, que no se ve: Next SOLO adelanta (prefetch) las
 * pantallas que tienen un armazón como este. Sin él no adelantaba ninguna,
 * porque todas consultan en vivo.
 *
 * Es el armazón de TODAS las pantallas del módulo, así que a propósito no
 * dibuja ninguna en particular: un título, un renglón de filtros y unas
 * filas. Dibujar la tabla exacta de cada una sería un segundo diseño que
 * mantener, y se vería mal el día que la de verdad cambie.
 */
export default function Cargando() {
  return (
    <div className="cg" aria-busy="true" aria-live="polite">
      <span className="sr">Cargando…</span>

      <div className="cg-cabeza">
        <div className="cg-b cg-ojo" />
        <div className="cg-b cg-titulo" />
        <div className="cg-b cg-sub" />
      </div>

      <div className="cg-filtros">
        <div className="cg-b cg-chip" />
        <div className="cg-b cg-chip" />
        <div className="cg-b cg-chip ancho" />
      </div>

      <div className="cg-tabla">
        {/* Ocho filas: llenan el alto de un portátil sin pasarse en un
            celular, donde las de abajo quedan cortadas por el propio
            recuadro y no estiran la página. */}
        {Array.from({ length: 8 }, (_, i) => (
          <div className="cg-fila" key={i}>
            <div className="cg-b" />
            <div className="cg-b" />
            <div className="cg-b" />
            <div className="cg-b" />
          </div>
        ))}
      </div>
    </div>
  );
}
