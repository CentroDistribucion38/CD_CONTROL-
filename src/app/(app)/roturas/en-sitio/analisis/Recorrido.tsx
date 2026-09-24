import type { Sankey } from "@/modulos/roturas/sankey";

/**
 * EL DIBUJO DEL RECORRIDO.
 *
 * VA APARTE DE LA PÁGINA por una razón práctica: la página es un
 * componente de SERVIDOR —hace cinco consultas antes de pintar nada— y
 * eso no se puede montar en un arnés. Esto sí: recibe la geometría ya
 * calculada y no sabe de dónde salió, así que se le pueden dar unos
 * datos a mano y mirar el SVG que produce.
 *
 * NO CALCULA NADA. Toda la aritmética está en `modulos/roturas/sankey`,
 * que es una función pura con su propio arnés. Si este componente
 * hiciera una sola cuenta, esa cuenta sería la única del diagrama sin
 * probar — y un Sankey mal armado no se ve mal: se ve perfecto y
 * miente.
 */
export function Recorrido({ s, total }: { s: Sankey; total: number }) {
  if (s.nodos.length === 0) {
    return (
      <div className="vacio">
        <b>Sin datos</b>
        Todavía no hay roturas con visto bueno en este filtro.
      </div>
    );
  }

  const ultima = s.nodos.reduce((m, x) => Math.max(m, x.col), 0);

  return (
    <svg viewBox={`0 0 ${s.ancho} ${s.alto}`} className="rq-svg" role="img"
         aria-label={`Recorrido de ${total} unidades: de la causa al proceso y a la baja`}>
      {/* LAS CINTAS PRIMERO Y LOS NODOS ENCIMA: al revés, una cinta
          gorda tapa la barra de la que sale. */}
      {/* LA OPACIDAD BAJA ES LO QUE DEJA VER LOS CRUCES. Con las
          cintas opacas, la que pasa por encima esconde a la otra y el
          dibujo enseña menos de lo que tiene. 0,45 en el primer tramo
          y 0,4 en el segundo, como la maqueta: el segundo tramo lleva
          más cintas encimadas y necesita algo más de transparencia. */}
      {s.cintas.map((c, i) => (
        <path key={i} d={c.d} fill={c.color}
              opacity={s.nodos.find((n) => n.id === c.de)?.col === 0 ? 0.45 : 0.4} />
      ))}
      {s.nodos.map((n) => {
        /* LA ÚLTIMA COLUMNA ROTULA A LA IZQUIERDA de su barra: a la
           derecha el texto se saldría del lienzo. */
        const fin = n.col === ultima;
        const tx = fin ? n.x - 14 : n.x + 34;
        return (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={20} height={n.alto} fill={n.color} />
            <text x={tx} y={n.y + 18} textAnchor={fin ? "end" : "start"}
                  className="rq-t-rot">{n.rotulo}</text>
            <text x={tx} y={n.y + 40} textAnchor={fin ? "end" : "start"}
                  className="rq-t-n">{n.valor}</text>
            {n.pie && (
              <text x={tx} y={n.y + 58} textAnchor={fin ? "end" : "start"}
                    className="rq-t-pie">{n.pie}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
