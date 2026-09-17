"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PorDefecto, PorSocio, PorSemana } from "@/modulos/sider/informe-ai";
import type { Revision } from "@/modulos/sider/ai";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const pct = (x: number) => nf2.format(x * 100) + " %";
const dia = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });

type Datos = {
  revisiones: Revision[];
  defectos: PorDefecto[];
  socios: PorSocio[];
  semanas: PorSemana[];
  total: {
    revisiones: number; recibidas: number; revisadas: number; defectos: number;
    otros: number; no_abono: number; hl: number; socios: number;
    importadas: number; indice: number;
    defectos_hoja: number; hl_hoja: number; pct_hoja: number;
  };
  porRevision: Map<string, Record<string, { pct: number; hl: number }>>;
};

/* EL ORDEN DE LAS COLUMNAS DEL EXCEL, tal cual. Doce de % y doce de Hl,
   y NO son la misma lista: la de % no tiene mezclado, cajas ni estibas;
   la de Hl tampoco, pero sí tiene cuerpo extraño en otro sitio. Se
   escriben aquí para poder poner la pantalla al lado de la hoja y
   cuadrar columna por columna sin ir traduciendo nombres. */
const COLS_EXCEL: [string, string][] = [
  ["rota", "% DESPICADO"],
  ["faltante", "% FALTANTE"],
  ["cemento", "% CEMENTO /PINTURA"],
  ["no_retorn", "% NO RETORNABLE"],
  ["otras_cias", "% OTRAS COMPAÑIAS"],
  ["antiguo", "% PRODUCCIÓN ANTIGUA"],
  ["cuerpo_extra", "% CUERPO EXTRAÑO"],
  ["extrasucio", "% EXTRASUCIO"],
  ["cristalizado", "% CRISTALIZADO METEORIZADA"],
  ["hongo", "% HONGO"],
  ["etiq_asoleada", "% ETIQUETA ASOLEADA"],
];

/**
 * EL INFORME DE LA REVISIÓN AI.
 *
 * TRES PREGUNTAS Y UNA TABLA. Cuánto se está cobrando, qué defecto lo
 * explica, y a qué socio llamar. La tabla va abajo para el detalle, que
 * es donde se va a mirar la fila concreta cuando el socio reclame.
 *
 * TODO VA EN UN SOLO TONO. Nada aquí distingue COSAS por color —no hay
 * cuatro series que haya que poder decir una de otra—: las barras miden
 * MAGNITUD, y para magnitud el color correcto es uno solo, más oscuro
 * cuanto más pesa. Meter una paleta de colores por categoría obligaría a
 * ir a la leyenda para leer una barra que ya tiene su nombre al lado.
 *
 * Lo único que sí es semáforo es «cobra / no cobra», y va con la palabra
 * escrita, no solo con el color: la mitad de una bodega mira esto en un
 * celular con el sol de frente.
 */
export function Informe({
  datos, opciones, filtro,
}: {
  datos: Datos;
  opciones: {
    socios: [string, string][]; envases: [string, string][]; canales: [string, string][];
    primera: string | null; ultima: string | null;
  };
  filtro: { desde?: string; hasta?: string; socio?: string; envase?: string; canal?: string };
  esEditor: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [orden, setOrden] = useState<"fecha" | "indice" | "no_abono">("fecha");
  /* «COMO EL EXCEL» pone las veinticuatro columnas del archivo. No es el
     modo por defecto porque veinticuatro columnas no se leen: se
     cuadran. Para leer está el resumen; para cuadrar, esto. */
  const [ancha, setAncha] = useState(false);

  function filtrar(k: string, v: string) {
    const p = new URLSearchParams();
    for (const [kk, vv] of Object.entries({ ...filtro, [k]: v })) if (vv) p.set(kk, vv as string);
    router.push(`/sider/seguimiento/ai?${p.toString()}`);
  }

  const { total, defectos, socios, semanas, revisiones } = datos;
  const cobran = defectos.filter((d) => d.cobra);
  const noCobran = defectos.filter((d) => !d.cobra);

  /* El tope de las barras nunca puede ser cero: `width: NaN%` no lanza
     ningún error —el navegador descarta la declaración— y un bloque sin
     ancho se estira hasta llenar la pista. El fallo no se vería como una
     barra que falta sino como TODAS LLENAS, que parece un dato. */
  const topeDef = Math.max(1, ...cobran.map((d) => d.unidades));
  const topeSoc = Math.max(1, ...socios.map((s) => s.no_abono));

  const tabla = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const xs = q === "" ? revisiones : revisiones.filter((r) =>
      `${r.placa} ${r.socio_nombre ?? ""} ${r.envase} ${r.zcl3 ?? ""} ${r.comentarios ?? ""}`
        .toLowerCase().includes(q));
    return [...xs].sort((a, b) =>
      orden === "fecha" ? b.fecha.localeCompare(a.fecha)
      : orden === "indice" ? b.indice - a.indice
      : b.no_abono - a.no_abono);
  }, [revisiones, busca, orden]);

  return (
    <>
      {/* ---------- LOS FILTROS, EN UNA FILA ARRIBA ---------- */}
      <section className="ia-filtros">
        <label><span>Desde</span>
          <input type="date" value={filtro.desde ?? ""} min={opciones.primera ?? undefined}
                 max={opciones.ultima ?? undefined}
                 onChange={(e) => filtrar("desde", e.target.value)} /></label>
        <label><span>Hasta</span>
          <input type="date" value={filtro.hasta ?? ""} min={opciones.primera ?? undefined}
                 max={opciones.ultima ?? undefined}
                 onChange={(e) => filtrar("hasta", e.target.value)} /></label>
        <label><span>Socio</span>
          <select value={filtro.socio ?? ""} onChange={(e) => filtrar("socio", e.target.value)}>
            <option value="">Todos</option>
            {opciones.socios.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select></label>
        <label><span>Envase</span>
          <select value={filtro.envase ?? ""} onChange={(e) => filtrar("envase", e.target.value)}>
            <option value="">Todos</option>
            {opciones.envases.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select></label>
        <label><span>Canal</span>
          <select value={filtro.canal ?? ""} onChange={(e) => filtrar("canal", e.target.value)}>
            <option value="">Todos</option>
            {opciones.canales.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select></label>
      </section>

      {total.revisiones === 0 ? (
        <section className="ia-vacio">
          <h2>No hay revisiones en ese rango</h2>
          <p>Suelta algún filtro o amplía las fechas.</p>
        </section>
      ) : (
        <>
          {/* ---------- LA CIFRA ----------
              UN NÚMERO GRANDE Y NO UNA GRÁFICA: es una sola cifra, y una
              cifra sola dibujada es una gráfica que dice menos que el
              número.

              Y NO ES EL PROMEDIO DE LOS ÍNDICES: es la suma de defectos
              sobre la suma de revisadas. Promediar porcentajes le da el
              mismo peso a una muestra de 200 botellas que a una de
              4.104, y una sola muestra chica mueve el número del mes. */}
          <section className="ia-cifras">
            <div className="ia-hero">
              <p className="rot">ÍNDICE DE COBRO DEL PERÍODO</p>
              <p className="num">{pct(total.indice)}</p>
              <p className="pie">
                {nf.format(total.defectos)} botellas que cobran de{" "}
                {nf.format(total.revisadas)} revisadas · {total.revisiones} revisiones ·{" "}
                {total.socios} socios
              </p>
            </div>
            <div className="ia-dato">
              <p className="rot">NO ABONADO</p>
              <p className="num">{nf.format(total.no_abono)}</p>
              <p className="pie">botellas · de {nf.format(total.recibidas)} recibidas</p>
            </div>
            <div className="ia-dato">
              <p className="rot">EN HECTOLITROS</p>
              <p className="num">{nf3.format(total.hl)}</p>
              <p className="pie">Hl con defecto que cobra</p>
            </div>
            <div className="ia-dato">
              <p className="rot">CONTADAS Y NO COBRADAS</p>
              <p className="num">{nf.format(total.otros)}</p>
              <p className="pie">hongo, etiqueta asoleada, cuerpo extraño, cajas y estibas</p>
            </div>
          </section>

          {/* ---------- LOS TRES TOTALES DE LA HOJA ----------
              ESTO ES LO QUE NO CUADRABA. El archivo trae tres sumas de
              botellas con defecto en la misma fila, se llaman casi
              igual, y no coinciden en 252 de las 296. Puestas una al
              lado de la otra, con la fórmula escrita, deja de ser un
              misterio y pasa a ser una decisión. */}
          <section className="ia-caja">
            <div className="ia-caja-cab">
              <h2>Por qué hay tres cifras distintas</h2>
              <p>
                Tu hoja calcula tres totales de «botellas con defectos» en la misma fila, con
                tres listas de categorías distintas. Aquí están los tres con su fórmula.
              </p>
            </div>
            <div className="ia-tres">
              <div className="ia-tres-uno manda">
                <p className="rot">% ÍNDICE DE COBRO · columnas M y BG</p>
                <p className="n">{pct(total.indice)}</p>
                <p className="f">(U+V+W+X+Y+Z+AA+AB+AE) / S — nueve categorías</p>
                <p className="u">
                  {nf.format(total.defectos)} botellas. <b>Es la que factura</b>: multiplicada
                  por las recibidas da las {nf.format(total.no_abono)} unidades no abonadas.
                </p>
              </div>
              <div className="ia-tres-uno">
                <p className="rot">% TOTAL BOTELLAS CON DEFECTOS · columna AI</p>
                <p className="n">{pct(total.pct_hoja)}</p>
                <p className="f">SUM(U:AD) / S — diez categorías</p>
                <p className="u">
                  {nf.format(total.defectos_hoja)} botellas. Suma hongo y etiqueta asoleada, y
                  NO suma mezclado. <b>No es la que cobra.</b>
                </p>
              </div>
              <div className="ia-tres-uno">
                <p className="rot">TOTAL BOTELLAS CON DEFECTOS (Hl) · columna AU</p>
                <p className="n">{nf3.format(total.hl_hoja)}</p>
                <p className="f">SUM(AV:BF) — once categorías</p>
                <p className="u">
                  Las diez de arriba más cuerpo extraño. En Hl de cobro son{" "}
                  <b>{nf3.format(total.hl)}</b>, que salen de las nueve.
                </p>
              </div>
            </div>
          </section>

          {/* ---------- LA TENDENCIA ---------- */}
          <Tendencia semanas={semanas} />

          <div className="ia-dos">
            {/* ---------- QUÉ DEFECTO LO EXPLICA ---------- */}
            <section className="ia-caja">
              <div className="ia-caja-cab">
                <h2>Qué defecto lo explica</h2>
                <p>
                  Las nueve que cobran, de la que más pesa a la que menos. El porcentaje es
                  sobre las {nf.format(total.revisadas)} botellas revisadas del período.
                </p>
              </div>
              <div className="ia-barras">
                {cobran.map((d) => (
                  <div key={d.clave} className="ia-bar">
                    <span className="nom">{d.nombre}</span>
                    <span className="pista">
                      <i style={{ width: `${(d.unidades / topeDef) * 100}%` }} />
                    </span>
                    <span className="val">
                      {nf.format(d.unidades)}
                      <em>{pct(d.pct)} · {nf3.format(d.hl)} Hl</em>
                    </span>
                  </div>
                ))}
                {cobran.length === 0 && <p className="ia-nada">Ninguna botella con defecto que cobre.</p>}
              </div>

              {noCobran.length > 0 && (
                <div className="ia-nocobra">
                  <p className="rot">SE CUENTAN Y NO COBRAN</p>
                  <ul>
                    {noCobran.map((d) => (
                      <li key={d.clave}>
                        <b>{nf.format(d.unidades)}</b> {d.nombre}
                        <em>{pct(d.pct)}</em>
                      </li>
                    ))}
                  </ul>
                  <p className="nota">
                    Están aquí porque alguien las contó y son botellas de verdad. No entran
                    en el índice: así está la fórmula de cobro del archivo, idéntica en las
                    296 filas.
                  </p>
                </div>
              )}
            </section>

            {/* ---------- A QUIÉN LLAMAR ---------- */}
            <section className="ia-caja">
              <div className="ia-caja-cab">
                <h2>A quién llamar</h2>
                <p>
                  Por socio, ordenado por lo que NO se le abona — que es la conversación que
                  hay que tener. El índice de al lado dice si es un problema suyo o si
                  simplemente manda mucho.
                </p>
              </div>
              <div className="ia-barras">
                {socios.slice(0, 12).map((s) => (
                  <div key={s.clave} className="ia-bar">
                    <span className="nom">
                      <button type="button" onClick={() => filtrar("socio", s.clave)}
                              title={`Ver solo ${s.nombre}`}>
                        {s.nombre}
                      </button>
                    </span>
                    <span className="pista">
                      <i style={{ width: `${(s.no_abono / topeSoc) * 100}%` }} />
                    </span>
                    <span className="val">
                      {nf.format(s.no_abono)}
                      <em>{pct(s.indice)} · {s.revisiones} rev.</em>
                    </span>
                  </div>
                ))}
              </div>
              {socios.length > 12 && (
                <p className="ia-mas">
                  Se muestran los 12 que más pesan, de {socios.length}. Filtra por socio para
                  ver el resto.
                </p>
              )}
            </section>
          </div>

          {/* ---------- REVISIÓN POR REVISIÓN ---------- */}
          <section className="ia-caja">
            <div className="ia-caja-cab con-busca">
              <div>
                <h2>Revisión por revisión</h2>
                <p>Es donde se mira la fila concreta cuando un socio reclama.</p>
              </div>
              <div className="ia-herramientas">
                <label className="ia-busca">
                  <span className="sr">Buscar</span>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)}
                         placeholder="Placa, socio, ZCL3…" />
                </label>
                <label className="ia-ordenar">
                  <span className="sr">Ordenar por</span>
                  <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
                    <option value="fecha">Más reciente</option>
                    <option value="indice">Índice más alto</option>
                    <option value="no_abono">No abono más alto</option>
                  </select>
                </label>
                <label className="ia-ordenar">
                  <span className="sr">Columnas</span>
                  <select value={ancha ? "excel" : "resumen"}
                          onChange={(e) => setAncha(e.target.value === "excel")}>
                    <option value="resumen">Columnas: resumen</option>
                    <option value="excel">Columnas: como el Excel</option>
                  </select>
                </label>
              </div>
            </div>
            <div className={"ia-tabla" + (ancha ? " ancha" : "")}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Placa</th><th>Socio</th><th>Envase</th>
                    <th className="n">Recibidas</th><th className="n">Revisadas</th>
                    {/* Los nombres son los DE LA HOJA, no los míos: quien
                        cuadra tiene el Excel abierto al lado y traducir
                        nombres de columna es donde se pierde el hilo. */}
                    <th className="n">% ÍNDICE DE COBRO</th>
                    <th className="n">Unid. no abonadas</th>
                    <th className="n">% TOTAL BOT. CON DEFECTOS</th>
                    <th className="n">TOTAL (Hl)</th>
                    {ancha && COLS_EXCEL.map(([k, n]) => <th key={"p" + k} className="n">{n}</th>)}
                    {ancha && COLS_EXCEL.map(([k, n]) =>
                      <th key={"h" + k} className="n">{n.replace("% ", "Hl ")}</th>)}
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {tabla.slice(0, 200).map((r) => (
                    <tr key={r.id}>
                      <td>{dia(r.fecha)}</td>
                      <td><b>{r.placa}</b></td>
                      <td>{r.socio_nombre ?? "—"}</td>
                      <td>{r.envase}</td>
                      <td className="n">{nf.format(r.recibidas)}</td>
                      <td className="n">{nf.format(r.revisadas)}</td>
                      <td className="n destaca">{pct(r.indice)}</td>
                      <td className="n destaca">{nf.format(r.no_abono)}</td>
                      <td className="n">{pct(Number((r as Revision & { pct_hoja?: number }).pct_hoja ?? 0))}</td>
                      <td className="n">{nf3.format(Number((r as Revision & { hl_hoja?: number }).hl_hoja ?? 0))}</td>
                      {ancha && COLS_EXCEL.map(([k]) => (
                        <td key={"p" + k} className="n">
                          {pct(datos.porRevision.get(r.id)?.[k]?.pct ?? 0)}
                        </td>
                      ))}
                      {ancha && COLS_EXCEL.map(([k]) => (
                        <td key={"h" + k} className="n">
                          {nf3.format(datos.porRevision.get(r.id)?.[k]?.hl ?? 0)}
                        </td>
                      ))}
                      <td>
                        {(r as Revision & { origen?: string }).origen === "importado"
                          ? <span className="ia-sello">Excel</span>
                          : <span className="ia-sello propio">Contada aquí</span>}
                      </td>
                    </tr>
                  ))}
                  {tabla.length === 0 && (
                    <tr><td colSpan={ancha ? 33 : 11} className="nada">Nada coincide con «{busca.trim()}».</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="ia-mas">
              {tabla.length > 200
                ? <>Se muestran las 200 primeras de {tabla.length} — afina la búsqueda o el rango.</>
                : <>{tabla.length} revisión{tabla.length === 1 ? "" : "es"}.</>}
              {total.importadas > 0 && <> {total.importadas} vienen del Excel histórico.</>}
            </p>
          </section>
        </>
      )}
    </>
  );
}

/**
 * LA TENDENCIA, POR SEMANA.
 *
 * POR SEMANA Y NO POR DÍA: hay días con una sola revisión, y un índice
 * sacado de una muestra sube y baja por azar — la línea diría «se
 * disparó el martes» cuando lo que pasó es que el martes se revisó un
 * solo camión. Y no por mes: cuatro meses darían cuatro puntos.
 *
 * UNA SOLA SERIE, así que NO LLEVA LEYENDA: el título ya dice qué es.
 * Una leyenda de un elemento es una fila de píxeles que no contesta
 * ninguna pregunta.
 */
function Tendencia({ semanas }: { semanas: PorSemana[] }) {
  const ANCHO = 1000, ALTO = 150, ABAJO = 22, ARRIBA = 14;

  if (semanas.length < 2) {
    return (
      <section className="ia-caja">
        <div className="ia-caja-cab">
          <h2>Cómo va el índice, semana a semana</h2>
          <p>
            Con una sola semana no hay tendencia que dibujar. Amplía el rango de fechas.
          </p>
        </div>
      </section>
    );
  }

  const vals = semanas.map((s) => s.indice);
  const max = Math.max(...vals);
  /* EL PISO ES CERO Y NO EL MÍNIMO. Arrancar la escala en el valor más
     bajo hace que una variación de dos décimas se vea como un
     precipicio: la misma serie contada honestamente es casi plana.
     Exagerar la pendiente es la forma más fácil de mentir con una
     gráfica y no requiere mala intención.

     Y el techo nunca es cero: con todas las semanas en cero la división
     daría NaN, el `d` del path saldría con «NaN» dentro y el SVG no
     dibujaría NADA — sin un solo error en la consola. */
  const techo = max > 0 ? max * 1.15 : 1;
  const x = (i: number) => (i / (semanas.length - 1)) * ANCHO;
  const y = (v: number) => ARRIBA + (1 - v / techo) * (ALTO - ARRIBA - ABAJO);

  const linea = semanas.map((s, i) => `${x(i).toFixed(1)},${y(s.indice).toFixed(1)}`).join(" ");
  const area = `M0,${ALTO - ABAJO} L${linea.replace(/ /g, " L")} L${ANCHO},${ALTO - ABAJO} Z`;

  /* Solo se rotulan los extremos y el pico: un número sobre cada punto
     tapa la línea, que es lo que se vino a ver. */
  const iPico = vals.indexOf(max);
  const rotular = new Set([0, semanas.length - 1, iPico]);

  return (
    <section className="ia-caja">
      <div className="ia-caja-cab">
        <h2>Cómo va el índice, semana a semana</h2>
        <p>
          Cada punto es una semana completa: defectos que cobran sobre botellas revisadas de
          esa semana. La escala arranca en cero — empezarla en el valor más bajo convertiría
          dos décimas en un precipicio.
        </p>
      </div>
      <div className="ia-linea">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" role="img"
             aria-label={`Índice de cobro por semana, de ${semanas[0].semana} a ${semanas[semanas.length - 1].semana}`}>
          <path className="area" d={area} />
          <polyline className="traza" points={linea} />
          {semanas.map((s, i) => (
            <circle key={s.semana} className={i === iPico ? "punto pico" : "punto"}
                    cx={x(i)} cy={y(s.indice)} r={i === iPico ? 6 : 4}>
              <title>{`Semana del ${dia(s.semana)} · ${pct(s.indice)} · ${s.revisiones} revisiones`}</title>
            </circle>
          ))}
        </svg>
        <div className="ia-rotulos">
          {semanas.map((s, i) => (
            <span key={s.semana} className={rotular.has(i) ? "on" : ""}
                  style={{ left: `${(i / (semanas.length - 1)) * 100}%` }}>
              {rotular.has(i) && <><b>{pct(s.indice)}</b><em>{dia(s.semana)}</em></>}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
