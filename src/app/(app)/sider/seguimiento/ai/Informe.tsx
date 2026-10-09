"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PorDefecto, PorSocio, PorSemana, PorOrigen } from "@/modulos/sider/informe-ai";
import type { Revision } from "@/modulos/sider/ai";
import { NOMBRE_TIPO, type TipoRevision } from "@/modulos/sider/comun";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x: number) => nf2.format(x * 100) + " %";
const dia = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });

type Datos = {
  revisiones: Revision[];
  defectos: PorDefecto[];
  socios: PorSocio[];
  semanas: PorSemana[];
  origenes: PorOrigen[];
  total: {
    revisiones: number; recibidas: number; revisadas: number; defectos: number;
    otros: number; no_abono: number; hl: number; socios: number;
    importadas: number; indice: number;
    defectos_hoja: number; hl_hoja: number; pct_hoja: number;
  };
  porRevision: Map<string, Record<string, { pct: number; hl: number }>>;
};

/**
 * EL INFORME DE LA REVISIÓN AI.
 *
 * «Quitar del informe de AI todo lo de cobro y abono: solo dejar unidades revisadas, unidades en
 *  mal estado y %AI. Más bien dejar la tabla de %AI por origen.»
 *
 * TRES CIFRAS, LA SEMANA Y EL ORIGEN. %AI = unidades en mal estado / unidades revisadas, sumadas
 * (no el promedio de los porcentajes de cada revisión). La tabla de abajo es el detalle de cada
 * revisión, para cuando haya que mirar una fila concreta.
 *
 * TODO VA EN UN SOLO TONO: las barras miden magnitud, y para magnitud el color es uno solo.
 */
export function Informe({
  datos, opciones, filtro,
}: {
  datos: Datos;
  opciones: {
    socios: [string, string][]; envases: [string, string][]; canales: [string, string][];
    primera: string | null; ultima: string | null;
  };
  filtro: { desde?: string; hasta?: string; socio?: string; envase?: string; canal?: string; tipo?: string };
  esEditor: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [orden, setOrden] = useState<"fecha" | "indice">("fecha");

  function filtrar(k: string, v: string) {
    const p = new URLSearchParams();
    for (const [kk, vv] of Object.entries({ ...filtro, [k]: v })) if (vv) p.set(kk, vv as string);
    router.push(`/sider/seguimiento/ai?${p.toString()}`);
  }

  const { total, semanas, origenes, revisiones } = datos;

  /* El tope de las barras nunca puede ser cero: `width: NaN%` se descarta y la barra se llena. */
  const topeOri = Math.max(0.0001, ...origenes.map((o) => o.indice));

  const tabla = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const xs = q === "" ? revisiones : revisiones.filter((r) =>
      `${r.placa} ${r.planta ?? ""} ${r.socio_nombre ?? ""} ${r.envase} ${r.zcl3 ?? ""} ${r.comentarios ?? ""}`
        .toLowerCase().includes(q));
    return [...xs].sort((a, b) =>
      orden === "fecha" ? b.fecha.localeCompare(a.fecha) : b.indice - a.indice);
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
        <label><span>Revisión</span>
          <select value={filtro.tipo ?? ""} onChange={(e) => filtrar("tipo", e.target.value)}>
            <option value="">Todas</option>
            <option value="ai">Certificada</option>
            <option value="sorting">Normal</option>
          </select></label>
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
          {/* ---------- LAS TRES CIFRAS ----------
              %AI = suma de unidades en mal estado / suma de unidades revisadas. Promediar
              porcentajes le daría el mismo peso a una muestra de 200 que a una de 4.104. */}
          <section className="ia-cifras">
            <div className="ia-hero">
              <p className="rot">%AI DEL PERÍODO</p>
              <p className="num">{pct(total.indice)}</p>
              <p className="pie">
                {nf.format(total.defectos)} en mal estado de {nf.format(total.revisadas)} revisadas
                {" "}· {total.revisiones} revisiones
              </p>
            </div>
            <div className="ia-dato">
              <p className="rot">UNIDADES REVISADAS</p>
              <p className="num">{nf.format(total.revisadas)}</p>
              <p className="pie">en {total.revisiones} revisiones</p>
            </div>
            <div className="ia-dato">
              <p className="rot">UNIDADES EN MAL ESTADO</p>
              <p className="num">{nf.format(total.defectos)}</p>
              <p className="pie">de las revisadas</p>
            </div>
          </section>

          {/* ---------- %AI POR ORIGEN ---------- */}
          <section className="ia-caja">
            <div className="ia-caja-cab">
              <h2>%AI por origen</h2>
              <p>
                La planta de donde viene el camión, del %AI más alto al más bajo. Cada %AI es la suma
                de unidades en mal estado sobre la suma de revisadas de ese origen.
              </p>
            </div>
            <div className="ia-tabla">
              <table className="ia-origen">
                <thead>
                  <tr>
                    <th>Origen</th>
                    <th className="n">Revisiones</th>
                    <th className="n">Unid. revisadas</th>
                    <th className="n">Unid. en mal estado</th>
                    <th className="n">%AI</th>
                    <th className="ia-col-barra"><span className="sr">Barra del %AI</span></th>
                  </tr>
                </thead>
                <tbody>
                  {origenes.map((o) => (
                    <tr key={o.origen}>
                      <td><b>{o.origen}</b></td>
                      <td className="n">{nf.format(o.revisiones)}</td>
                      <td className="n">{nf.format(o.revisadas)}</td>
                      <td className="n">{nf.format(o.malas)}</td>
                      <td className="n destaca">{pct(o.indice)}</td>
                      <td className="ia-col-barra">
                        <span className="pista"><i style={{ width: `${(o.indice / topeOri) * 100}%` }} /></span>
                      </td>
                    </tr>
                  ))}
                  <tr className="ia-total">
                    <td>Total</td>
                    <td className="n">{nf.format(total.revisiones)}</td>
                    <td className="n">{nf.format(total.revisadas)}</td>
                    <td className="n">{nf.format(total.defectos)}</td>
                    <td className="n destaca">{pct(total.indice)}</td>
                    <td className="ia-col-barra" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- LA TENDENCIA ---------- */}
          <Tendencia semanas={semanas} />

          {/* ---------- REVISIÓN POR REVISIÓN ---------- */}
          <section className="ia-caja">
            <div className="ia-caja-cab con-busca">
              <div>
                <h2>Revisión por revisión</h2>
                <p>El detalle de cada revisión, para mirar una fila concreta.</p>
              </div>
              <div className="ia-herramientas">
                <label className="ia-busca">
                  <span className="sr">Buscar</span>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)}
                         placeholder="Placa, origen, socio…" />
                </label>
                <label className="ia-ordenar">
                  <span className="sr">Ordenar por</span>
                  <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
                    <option value="fecha">Más reciente</option>
                    <option value="indice">%AI más alto</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="ia-tabla">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Placa</th><th>Revisión</th><th>Origen</th><th>Socio</th><th>Envase</th>
                    <th className="n">Unid. revisadas</th>
                    <th className="n">Unid. en mal estado</th>
                    <th className="n">%AI</th>
                  </tr>
                </thead>
                <tbody>
                  {tabla.slice(0, 200).map((r) => (
                    <tr key={r.id}>
                      <td>{dia(r.fecha)}</td>
                      <td><b>{r.placa}</b></td>
                      {/* LA CLASE VA CON LA PALABRA ESCRITA, no solo con color. */}
                      <td>
                        <span className={"ia-sello " + (((r.tipo ?? "ai") as TipoRevision) === "ai" ? "propio" : "normal")}>
                          {NOMBRE_TIPO[(r.tipo ?? "ai") as TipoRevision]}
                        </span>
                      </td>
                      <td>{(r.planta ?? "").trim() || "—"}</td>
                      <td>{r.socio_nombre ?? "—"}</td>
                      <td>{r.envase}</td>
                      <td className="n">{nf.format(r.revisadas)}</td>
                      <td className="n">{nf.format(r.defectos)}</td>
                      <td className="n destaca">{pct(r.indice)}</td>
                    </tr>
                  ))}
                  {tabla.length === 0 && (
                    <tr><td colSpan={9} className="nada">Nada coincide con «{busca.trim()}».</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="ia-mas">
              {tabla.length > 200
                ? <>Se muestran las 200 primeras de {tabla.length} — afina la búsqueda o el rango.</>
                : <>{tabla.length} revisión{tabla.length === 1 ? "" : "es"}.</>}
              {!filtro.tipo && (() => {
                const n = revisiones.filter((r) => (r.tipo ?? "ai") === "sorting").length;
                return n > 0
                  ? <> {revisiones.length - n} certificada{revisiones.length - n === 1 ? "" : "s"} y {n} normal{n === 1 ? "" : "es"}.</>
                  : null;
              })()}
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
 * POR SEMANA Y NO POR DÍA: hay días con una sola revisión, y un %AI
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
          <h2>Cómo va el %AI, semana a semana</h2>
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
        <h2>Cómo va el %AI, semana a semana</h2>
        <p>
          Cada punto es una semana completa: unidades en mal estado sobre unidades revisadas
          de esa semana. La escala arranca en cero — empezarla en el valor más bajo convertiría
          dos décimas en un precipicio.
        </p>
      </div>
      <div className="ia-linea">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" role="img"
             aria-label={`%AI por semana, de ${semanas[0].semana} a ${semanas[semanas.length - 1].semana}`}>
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
