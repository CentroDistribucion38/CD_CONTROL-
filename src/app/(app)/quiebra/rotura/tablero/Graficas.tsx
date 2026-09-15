/* =====================================================================
   LAS GRÁFICAS DEL TABLERO

   SE DIBUJAN EN SVG Y EN EL SERVIDOR. Sin librería: lo que hay que
   pintar son barras y una línea, y traerse trescientos kilobytes de
   JavaScript para eso hace que la pantalla tarde más en aparecer de lo
   que tarda en leerse.

   UN SOLO COLOR, y no hay paleta de categorías. No hace falta: todo lo
   que se dibuja aquí es LA MISMA MEDIDA —unidades rotas— repartida
   entre cosas distintas. Darle un color a cada máquina sería inventar
   una identidad que no existe, y encima habría que comprobar que los
   quince se distinguen entre sí y en los siete temas. Lo que distingue
   una barra de otra es su rótulo y su largo, que es lo que se está
   comparando.

   Y ESE COLOR ES --rl-dato, NO EL ACENTO A SECAS. El acento del tema es
   una marca, no una rampa de datos: en cuatro de los siete temas es
   ámbar, y ámbar sobre la pista gris de una barra da 1.4 de contraste
   —la barra se ve casi como el vacío—. --rl-dato es el mismo tono un
   paso más oscuro; el cuánto salió de medirlo tema por tema.

   EL TEXTO VA EN TINTA, nunca en el color de la barra. Un número
   escrito del color del dato se lee peor y encima repite lo que la
   barra ya dice.
   ===================================================================== */

export type Barra = { clave: string; rotulo: string; valor: number; nota?: string };

/* ---------------------------------------------------------------------
   BARRAS HORIZONTALES

   Horizontales y no verticales porque lo que va en el eje son NOMBRES
   —"PASTEURIZADORA - ETIQUETADORA"— y en vertical habría que girarlos o
   cortarlos. Un rótulo girado es un rótulo que nadie lee.
   --------------------------------------------------------------------- */
export function Barras({ datos, total, unidad = "und", max = 12 }: {
  datos: Barra[];
  /** Para el porcentaje. Se pasa aparte: el total del período puede ser
   *  mayor que la suma de lo que se está mostrando (top N). */
  total: number;
  unidad?: string;
  max?: number;
}) {
  const vivos = datos.filter((d) => d.valor > 0).slice(0, max);
  if (vivos.length === 0) {
    return <p className="rl-sin-datos">Sin datos en este período.</p>;
  }
  const tope = Math.max(...vivos.map((d) => d.valor));

  return (
    <div className="rl-barras">
      {vivos.map((d) => {
        const pct = total > 0 ? (d.valor * 100) / total : 0;
        return (
          <div className="rl-barra" key={d.clave}>
            <span className="rl-barra-rot" title={d.rotulo}>{d.rotulo}</span>
            <span className="rl-barra-pista">
              {/* El title nativo es la capa de detalle: sale al posar el
                  cursor y funciona sin una línea de JavaScript. */}
              <i style={{ width: `${Math.max((d.valor / tope) * 100, 1.5)}%` }}
                 title={`${d.rotulo}: ${d.valor.toLocaleString("es-CO")} ${unidad} · ${pct.toFixed(1)} %`} />
            </span>
            <span className="rl-barra-val">
              {d.valor.toLocaleString("es-CO")}
              <i>{pct.toFixed(1)} %</i>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------
   LA SERIE DIARIA

   Área con su línea encima. El área no es adorno: hace que se lea el
   VOLUMEN del período de un vistazo, que es lo que se mira antes que
   ningún día suelto.

   LA RAYA DEL PROMEDIO es una referencia, no una segunda serie: va
   punteada y en gris, que es como se dibuja algo contra lo que se
   compara. Dos series de colores distintos en la misma gráfica
   invitarían a leerla como si fueran dos medidas, y es una sola.
   --------------------------------------------------------------------- */
export function Serie({ puntos, unidad = "und" }: {
  puntos: { fecha: string; valor: number }[];
  unidad?: string;
}) {
  if (puntos.length < 2) {
    return <p className="rl-sin-datos">Hacen falta al menos dos días para dibujar la tendencia.</p>;
  }

  const W = 1000, H = 220, P = { arriba: 14, abajo: 26, izq: 4, der: 4 };
  const tope = Math.max(...puntos.map((p) => p.valor), 1);
  const prom = puntos.reduce((a, p) => a + p.valor, 0) / puntos.length;

  const x = (i: number) =>
    P.izq + (i * (W - P.izq - P.der)) / Math.max(puntos.length - 1, 1);
  const y = (v: number) =>
    P.arriba + (1 - v / tope) * (H - P.arriba - P.abajo);

  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join("");
  const area = `${linea}L${x(puntos.length - 1).toFixed(1)},${(H - P.abajo).toFixed(1)}L${x(0).toFixed(1)},${(H - P.abajo).toFixed(1)}Z`;

  /* Cuántas fechas caben abajo sin encimarse. Se calcula del número de
     puntos y no se escribe a mano: con quince días caben todas y con
     doscientos cincuenta no cabe ni una de cada diez. */
  const cada = Math.max(1, Math.ceil(puntos.length / 8));
  /* Los cuatro que sobreviven en el celular: el primero, el último y dos
     repartidos. Se marcan aquí y el CSS esconde los demás bajo 620 px. */
  const claves = new Set([0, Math.round(puntos.length / 3),
                          Math.round((puntos.length * 2) / 3), puntos.length - 1]);
  const dia = (f: string) =>
    new Date(Date.parse(f + "T12:00:00")).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  /* El día más alto, marcado. Es la pregunta que se hace mirando una
     serie: "¿y ese pico cuál fue?". */
  const iMax = puntos.reduce((m, p, i) => (p.valor > puntos[m].valor ? i : m), 0);

  return (
    <div className="rl-serie">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="none"
           aria-label={`Rotura por día. Máximo ${puntos[iMax].valor.toLocaleString("es-CO")} ${unidad} el ${dia(puntos[iMax].fecha)}.`}>
        {/* La rejilla, recesiva: está para poder estimar, no para verse. */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={P.izq} x2={W - P.der} y1={y(tope * f)} y2={y(tope * f)}
                className="rl-g-rejilla" />
        ))}
        <path d={area} className="rl-g-area" />
        <path d={linea} className="rl-g-linea" />

        {/* El promedio del período. */}
        <line x1={P.izq} x2={W - P.der} y1={y(prom)} y2={y(prom)} className="rl-g-prom" />

        <circle cx={x(iMax)} cy={y(puntos[iMax].valor)} r={5} className="rl-g-pico" />

        {/* Un punto invisible por día, solo para que el title tenga de
            dónde colgarse: la capa de detalle sin una línea de JS. */}
        {puntos.map((p, i) => (
          <rect key={p.fecha} x={x(i) - 4} y={P.arriba} width={8} height={H - P.arriba - P.abajo}
                className="rl-g-toque">
            <title>{`${dia(p.fecha)}: ${p.valor.toLocaleString("es-CO")} ${unidad}`}</title>
          </rect>
        ))}
      </svg>

      <div className="rl-serie-eje">
        {puntos.map((p, i) => (
          i % cada === 0 || i === puntos.length - 1
            ? <span key={p.fecha} className={claves.has(i) ? "clave" : undefined}
                    style={{ left: `${(x(i) / W) * 100}%` }}>{dia(p.fecha)}</span>
            : null
        ))}
      </div>

      <p className="rl-serie-pie">
        Promedio del período <b>{Math.round(prom).toLocaleString("es-CO")}</b> {unidad} al día ·
        el día más alto fue <b>{dia(puntos[iMax].fecha)}</b> con{" "}
        <b>{puntos[iMax].valor.toLocaleString("es-CO")}</b>
      </p>
    </div>
  );
}
