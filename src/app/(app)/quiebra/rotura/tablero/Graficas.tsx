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

/* ---------------------------------------------------------------------
   EL PARETO DE VERDAD

   Las barras ya estaban —ordenadas de mayor a menor, que es media
   receta—. Lo que faltaba es lo que convierte un ranking en un pareto:
   LA LÍNEA ACUMULADA. Sin ella se ve cuál máquina rompe más; con ella
   se ve CUÁNTAS HACEN FALTA para cubrir la mayoría, que es la pregunta
   con la que se decide dónde meter una hora de mantenimiento.

   VERTICAL, y no horizontal como las otras barras de este tablero. Un
   pareto se lee siguiendo la curva que sube de izquierda a derecha;
   girado, esa curva baja y deja de significar lo que significa. El
   precio es que los nombres van rotados abajo, y por eso el cuadro
   entra en un contenedor que se desliza en el celular en vez de
   encogerse hasta ser ilegible.

   LA RAYA DEL 80 % NO ES DECORACIÓN: es el umbral del que habla la
   regla. Y las barras cambian de tono justo donde la curva la cruza,
   así que «cuántas máquinas hacen el 80 %» se responde contando las
   barras oscuras, sin leer un solo número.

   LA CURVA VA EN TINTA, no en el color del dato. Mide otra cosa
   —porcentaje, no unidades— y pintarla del mismo color diría que es
   más de lo mismo. En tinta se lee como lo que es: una anotación
   encima de las barras.
   --------------------------------------------------------------------- */
export function Pareto({ datos, total, unidad = "und" }: {
  datos: Barra[]; total: number; unidad?: string;
}) {
  const vivos = datos.filter((d) => d.valor > 0);
  if (vivos.length < 2 || total <= 0) {
    return <p className="rl-sin-datos">Hacen falta al menos dos máquinas con dato.</p>;
  }

  /* EL NOMBRE SE PARTE EN DOS POR EL GUION. «PASTEURIZADORA -
     ETIQUETADORA» girado medía 240 unidades y el espacio de los
     rótulos acababa siendo más alto que la gráfica: el cuadro se
     volvía una torre donde lo que hay que mirar quedaba aplastado
     arriba. Partido, ocupa la mitad y se lee igual, porque el guion ya
     era la pausa natural del nombre. */
  const enLineas = (r: string) => {
    const p = r.split(" - ");
    return p.length === 2 ? [p[0] + " -", p[1]] : [r];
  };
  const masLargo = Math.max(...vivos.flatMap((d) => enLineas(d.rotulo).map((l) => l.length)));

  /* ------------------------------------------------------------------
     LOS DOS EJES, que es lo que le faltaba y lo que hace que un pareto
     sea un pareto y no dos dibujos encima del otro.

     A LA IZQUIERDA, UNIDADES: cuánto se rompió en cada máquina. Sin esa
     escala, las barras solo dicen «esta es más alta que aquella» y no
     cuánto más.

     A LA DERECHA, PORCENTAJE ACUMULADO: dónde va la curva. Es OTRA
     medida —por eso va en su propio lado y con su propio título—; si
     compartieran eje, la curva y las barras dirían que se pueden
     comparar entre sí, y no se puede.

     Es la única gráfica de este tablero con dos escalas, y la excepción
     está justificada: en un pareto las dos series son la MISMA medida,
     una en bruto y la otra acumulada en porcentaje. En cualquier otro
     caso dos ejes son una trampa para el que mira.
     ------------------------------------------------------------------ */
  const W = 1000, ALTO = 250;
  /* 78 y 56 de margen, no 62 y 48: con los anteriores el título girado
     del eje se montaba encima de sus propios números —«UNIDADES ROTAS»
     cruzaba el «125 mil»—. Se vio mirando la gráfica, no razonándola. */
  const IZQ = 78, DER = 56, TECHO = 28;
  const PIE = Math.min(Math.max(70, Math.round(masLargo * 7.6) + 22), 200);
  const H = ALTO + PIE;
  const ancho = (W - IZQ - DER) / vivos.length;
  const barra = Math.min(ancho * 0.6, 54);

  /* LAS MARCAS DEL EJE SON NÚMEROS REDONDOS, y eso hay que buscarlo.
     Partir el máximo en cuartos daba «250 mil · 188 mil · 125 mil ·
     63 mil»: cifras que nadie compara de un vistazo porque no son de
     las que uno tiene en la cabeza. Se escoge primero el PASO —1, 2 o
     5 por una potencia de diez— y el tope sale de ahí. Con los datos
     de hoy: 0 · 50 mil · 100 mil · 150 mil · 200 mil · 250 mil. */
  const paso = (max: number) => {
    const crudo = max / 5;
    const p = 10 ** Math.floor(Math.log10(crudo));
    for (const m of [1, 2, 2.5, 5, 10]) if (p * m >= crudo) return p * m;
    return p * 10;
  };
  const salto = paso(vivos[0].valor);
  const tope = Math.ceil(vivos[0].valor / salto) * salto;
  const MARCAS: number[] = [];
  for (let v = 0; v <= tope + 0.5; v += salto) MARCAS.push(v);

  let suma = 0;
  const pasos = vivos.map((d) => {
    suma += d.valor;
    return { ...d, acum: (suma * 100) / total, pct: (d.valor * 100) / total };
  });
  const cruce = pasos.findIndex((p) => p.acum >= 80);
  const cuantasOchenta = cruce === -1 ? vivos.length : cruce + 1;

  const x = (i: number) => IZQ + i * ancho + ancho / 2;
  const yBarra = (v: number) => TECHO + (1 - v / tope) * (ALTO - TECHO);
  const yPct = (p: number) => TECHO + (1 - p / 100) * (ALTO - TECHO);

  const curva = pasos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yPct(p.acum).toFixed(1)}`).join("");

  /* 206.075 → «206 mil». Siete cifras en el eje obligarían a un margen
     el doble de ancho para un dato que solo sirve de referencia; el
     número exacto de cada máquina está en la tabla de abajo. */
  const corto = (v: number) =>
    v === 0 ? "0"
    : v >= 1000 ? `${Math.round(v / 1000).toLocaleString("es-CO")} mil`
    : v.toLocaleString("es-CO");

  return (
    <div className="rl-pareto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`Pareto de rotura por máquina. ${cuantasOchenta} de ${vivos.length} máquinas suman el 80 % del total.`}>
        {MARCAS.map((v) => (
          <g key={v}>
            <line x1={IZQ} x2={W - DER} y1={yBarra(v)} y2={yBarra(v)} className="rl-g-rejilla" />
            {/* Izquierda: unidades */}
            <text x={IZQ - 9} y={yBarra(v) + 3.5} className="rl-p-eje" textAnchor="end">
              {corto(v)}
            </text>
          </g>
        ))}
        {/* Derecha: porcentaje acumulado. Va en su propia tanda porque
            sus marcas son otras —de veinticinco en veinticinco— y
            colgarlas de las de la izquierda las ataría a un tope que no
            es el suyo. */}
        {[0, 25, 50, 75, 100].map((p) => (
          <text key={p} x={W - DER + 9} y={yPct(p) + 3.5} className="rl-p-eje der" textAnchor="start">
            {p} %
          </text>
        ))}

        {/* Los títulos de cada eje, girados y pequeños: están para que
            nadie tenga que adivinar qué mide cada lado. */}
        <text transform={`rotate(-90 11 ${(TECHO + ALTO) / 2})`} x={11} y={(TECHO + ALTO) / 2}
              className="rl-p-eje-tit" textAnchor="middle">unidades rotas</text>
        <text transform={`rotate(90 ${W - 9} ${(TECHO + ALTO) / 2})`} x={W - 9} y={(TECHO + ALTO) / 2}
              className="rl-p-eje-tit" textAnchor="middle">% acumulado</text>

        {/* La línea del cero, que cierra las barras por abajo. */}
        <line x1={IZQ} x2={W - DER} y1={ALTO} y2={ALTO} className="rl-p-base" />

        {pasos.map((p, i) => (
          <g key={p.clave}>
            <rect x={x(i) - barra / 2} y={yBarra(p.valor)}
                  width={barra} height={ALTO - yBarra(p.valor)}
                  className={"rl-p-barra" + (i < cuantasOchenta ? "" : " cola")}>
              <title>{`${p.rotulo}: ${p.valor.toLocaleString("es-CO")} ${unidad} · ${p.pct.toFixed(1)} % · acumulado ${p.acum.toFixed(1)} %`}</title>
            </rect>

            {/* EL NÚMERO DE CADA BARRA, ENCIMA. Sin él hay que pasar el
                cursor por cada una, y en el celular no hay cursor. */}
            <text x={x(i)} y={yBarra(p.valor) - 7} className="rl-p-val" textAnchor="middle">
              {p.pct.toFixed(1)}
            </text>

            {enLineas(p.rotulo).map((l, k, a) => {
              const xx = x(i) + (k - (a.length - 1) / 2) * 12;
              return (
                <text key={k} x={xx} y={ALTO + 8} className="rl-p-rotulo"
                      transform={`rotate(-90 ${xx} ${ALTO + 8})`}>{l}</text>
              );
            })}
          </g>
        ))}

        <line x1={IZQ} x2={W - DER} y1={yPct(80)} y2={yPct(80)} className="rl-p-umbral" />
        <text x={W - DER - 4} y={yPct(80) - 6} className="rl-p-umbral-txt" textAnchor="end">80 %</text>

        {/* LA CURVA VA DOS VECES: la tinta encima y la misma línea más
            gruesa del color del papel debajo. Sin ese forro, en el tema
            oficial la tinta sobre el rojo oscuro daba 1.77 de contraste
            y la curva desaparecía justo en las barras altas. */}
        <path d={curva} className="rl-p-forro" />
        <path d={curva} className="rl-p-curva" />
        {pasos.map((p, i) => (
          <circle key={p.clave} cx={x(i)} cy={yPct(p.acum)} r={3.5} className="rl-p-punto">
            <title>{`Hasta ${p.rotulo}: ${p.acum.toFixed(1)} % del total`}</title>
          </circle>
        ))}
        {[0, cuantasOchenta - 1, pasos.length - 1]
          .filter((i, k, a) => i >= 0 && a.indexOf(i) === k)
          .map((i) => (
            <text key={i} x={x(i)} y={yPct(pasos[i].acum) - 9}
                  className="rl-p-acum" textAnchor="middle">
              {pasos[i].acum.toFixed(0)} %
            </text>
          ))}
      </svg>
      <p className="rl-p-leyenda">
        Eje izquierdo: <b>unidades rotas</b> por máquina —el número encima de cada barra es su
        porcentaje del total—. Eje derecho: <b>% acumulado</b>, que es la línea. Las{" "}
        {cuantasOchenta} barras oscuras son las que juntan el 80 %.
      </p>
    </div>
  );
}
