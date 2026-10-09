"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { SitioCasco } from "@/modulos/casco/datos";
import type { UbicacionesInventario } from "@/modulos/casco/ubicaciones-inventario";
import { limpiarPuesto } from "@/modulos/casco/ubicacion-sitio";
import { ubicacionDeFila } from "@/modulos/casco/ubicaciones-armar";
import { ejeNice, estadoAlmacen, filtrar, porFecha, porMaterial, viajesDelDia, viajesSerpro, type Punto } from "@/modulos/casco/serie";
import { enOrdenInforme, media, type DatosInformeCasco } from "@/modulos/casco/informe";
import { BotonesInforme } from "./BotonesInforme";

/**
 * TABLERO DE CASCO DE VIDRIO — la hoja PARTIR, viva.
 *
 *   · ENVASES PENDIENTES POR PARTIR (HL): una barra por día, apilada por ubicación.
 *   · HL PENDIENTE POR DISPOSICIÓN: la dinámica fecha × ubicación, con total general.
 *   · Por material: el último día (o el que se escoja) por material y ubicación.
 *   · Filtros como tus segmentaciones: SKU, periodo (tu «Meses») y UBICACIÓN.
 *
 * Los colores son la gama ámbar de tu gráfica. Cada barra además lleva su HL escrito y, al
 * pasar el cursor, el detalle: el color nunca es la única forma de saber cuál es cuál.
 */

const COLOR: Record<string, { fondo: string; tinta: string }> = {
  "BODEGA 38": { fondo: "var(--cvt-b38)", tinta: "#fff" },
  FABRICA: { fondo: "var(--cvt-fab)", tinta: "#1b1b1b" },
  CARNAVAL: { fondo: "var(--cvt-car)", tinta: "#1b1b1b" },
  "CARNAVAL PALMAR": { fondo: "var(--cvt-pal)", tinta: "#fff" },
};
const colorDe = (k: string) => COLOR[k] ?? { fondo: "#999", tinta: "#fff" };

const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (iso: string) => `${Number(iso.slice(8, 10))}-${MESES[Number(iso.slice(5, 7)) - 1]}`;
const larga = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
/* SIN FECHA NO HAY CUENTA: con la base vacía o sin poder leerla, `ultima` llega vacía y
   `toISOString` de una fecha inválida tumba la pantalla entera («RangeError: Invalid time value»)
   en vez de decir qué pasó. */
const sumaDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

type Rango = "mes" | "30" | "90" | "todo" | "fechas";

/* «TRATA DE MANTENER EL MES ACTUAL»: el tablero abre en el mes del último conteo, del día 1 al último
   día con datos. Y si se toca «Fechas», las casillas también arrancan en ese mes. */
const inicioDeMes = (iso: string) => (iso ? iso.slice(0, 8) + "01" : iso);
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function TableroCasco({ puntos, sitios, nombres, errorLectura, delInventario = null }: {
  puntos: Punto[]; sitios: SitioCasco[]; nombres: Record<string, string>; errorLectura: string | null;
  /** Las ubicaciones del último inventario (AG18 ← LAVADO, AG22 ← BAJA): el informe las usa aunque
   *  Control todavía no las haya guardado. */
  delInventario?: UbicacionesInventario | null;
}) {
  const fechas = useMemo(() => [...new Set(puntos.map((p) => p.fecha))].sort(), [puntos]);
  const ultima = fechas[fechas.length - 1] ?? "";
  const primera = fechas[0] ?? "";

  const mes = inicioDeMes(ultima) < primera ? primera : inicioDeMes(ultima);
  const [rango, setRango] = useState<Rango>("mes");
  const [desde, setDesde] = useState(mes);
  const [hasta, setHasta] = useState(ultima);
  const [sitiosVis, setSitiosVis] = useState<string[]>(sitios.map((s) => s.clave));
  const [sku, setSku] = useState<string>("");
  const [dia, setDia] = useState<string>("");
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);

  /* LA GRÁFICA OCUPA TODO EL ANCHO: se mide la caja y se reparte entre las barras. Con muchos días
     (el periodo «Todo») cada barra tiene un mínimo y la caja se desplaza de lado. */
  const lienzo = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = lienzo.current; if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir(); const ro = new ResizeObserver(medir); ro.observe(el); return () => ro.disconnect();
  });

  const ventana = useMemo(() => {
    if (rango === "todo") return { d: primera, h: ultima };
    if (rango === "mes") return { d: mes, h: ultima };
    if (rango === "fechas") return { d: desde || primera, h: hasta || ultima };
    return { d: sumaDias(ultima, -(Number(rango) - 1)), h: ultima };
  }, [rango, desde, hasta, primera, ultima, mes]);

  /* LOS DOS CORTES: con filtros (gráfica y dinámica) y sin ellos (viajes, que tu hoja calcula de todo). */
  const vistos = useMemo(() => filtrar(puntos, { desde: ventana.d, hasta: ventana.h, sitios: sitiosVis, sku: sku || null }), [puntos, ventana, sitiosVis, sku]);
  const serie = useMemo(() => porFecha(vistos), [vistos]);
  const claves = sitios.map((s) => s.clave).filter((k) => sitiosVis.includes(k));
  const nombreSitio = (k: string) => sitios.find((s) => s.clave === k)?.nombre ?? k;

  const diaMat = dia && serie.some((d) => d.fecha === dia) ? dia : (serie[serie.length - 1]?.fecha ?? "");
  const filasMat = useMemo(() => porMaterial(vistos, diaMat), [vistos, diaMat]);

  const skus = useMemo(() => [...new Set(puntos.map((p) => p.sku))].sort((a, b) => (nombres[a] ?? a).localeCompare(nombres[b] ?? b, "es")), [puntos, nombres]);

  /* ---------- LAS CIFRAS ---------- */
  const hoyD = serie[serie.length - 1], antes = serie[serie.length - 2];
  const delta = hoyD && antes ? hoyD.total - antes.total : null;
  const pico = serie.reduce<typeof hoyD | undefined>((m, d) => (!m || d.total > m.total ? d : m), undefined);
  /* Cada almacén con su divisor (Fábrica y Bodega ÷ 36, Carnaval y los demás ÷ 100), y se suman. */
  const centroDe = useCallback((u: string) => sitios.find((s) => s.clave === u)?.centro ?? null, [sitios]);
  const viajesHoy = useMemo(() => (ultima ? viajesDelDia(puntos, ultima, centroDe) : 0), [puntos, ultima, centroDe]);

  /* ---------- EL INFORME (PDF y Word) ----------
     Con los mismos cortes de la pantalla: lo que se ve es lo que sale. Cada almacén va con SU último
     conteo dentro del periodo, y solo los materiales con algo (estibas, baja o HL). */
  const datosInforme = useMemo<DatosInformeCasco | null>(() => {
    if (!serie.length) return null;
    /* EN EL INFORME, los almacenes van Carnaval, Bodega, Fábrica y Atlántico (en pantalla, como siempre). */
    const claves = sitios.map((s) => s.clave).filter((k) => sitiosVis.includes(k)).sort(enOrdenInforme);
    const corte = serie[serie.length - 1].fecha;
    const filtros = [
      sitiosVis.length < sitios.length ? `Ubicación: ${sitios.filter((s) => sitiosVis.includes(s.clave)).map((s) => s.centro ?? s.nombre).join(", ")}` : "",
      sku ? `SKU ${sku} · ${nombres[sku] ?? sku}` : "",
    ].filter(Boolean).join(" · ");
    const ant = serie[serie.length - 2];
    const pk = serie.reduce((m, d) => (d.total > m.total ? d : m), serie[0]);
    return {
      hoy: new Date().toLocaleDateString("sv-SE"),
      corte,
      periodo: `del ${media(serie[0].fecha)} al ${media(corte)} de ${corte.slice(0, 4)}`,
      filtros,
      total: serie[serie.length - 1].total,
      anterior: ant ? { fecha: ant.fecha, total: ant.total } : null,
      pico: { fecha: pk.fecha, total: pk.total },
      viajes: viajesHoy,
      claves,
      serie,
      /* «POR MATERIAL» del día que esté escogido en esa tabla, sin los renglones en cero. */
      porMaterial: {
        fecha: diaMat,
        filas: filasMat
          .filter((r) => Math.abs(r.total) >= 0.005 || r.estibas !== 0)
          .map((r) => ({ sku: r.sku, nombre: nombres[r.sku] ?? r.sku, porSitio: r.porSitio, estibas: r.estibas, total: r.total })),
      },
      sitios: claves.map((k) => {
        const s = sitios.find((x) => x.clave === k)!;
        const e = estadoAlmacen(vistos, k);
        return {
          clave: k, centro: s.centro ?? k, nombre: s.nombre, rotuloBaja: s.baja_rotulo,
          fecha: e.fecha, total: e.total, estibas: e.estibas, viajes: viajesSerpro(e.estibas, s.centro ?? k), anterior: e.anterior,
          /* LA UBICACIÓN DEL INFORME SALE DEL INVENTARIO (la misma que pone Control), si el conteo del
             almacén es de ese día o después; si el inventario no trae ese material, va la guardada. */
          filas: e.filas.map((f) => {
            const inv = delInventario?.porCentro[(s.centro ?? "").toUpperCase()];
            /* «SI NO HAY UBICACIÓN EN EL INVENTARIO, QUE NO APAREZCA»: cuando el inventario aplica a
               ese conteo, la ubicación es SOLO la del inventario; si el inventario no tiene ese
               material, va vacía (nada de un P19 viejo escrito a mano). Sin inventario que aplique,
               la guardada, sin lo de la otra tabla. */
            const aplica = !!inv && !!e.fecha && e.fecha >= inv.fecha;
            /* Y SOLO LA DEL ESTADO DE LA COLUMNA donde tiene estibas: si el Casco tiene 1 estiba en
               inventario y el conteo lo tiene como EXTRASUCIO, no cuadra → vacía (el aviso va al
               Análisis del Excel, no aquí, para no confundir). */
            const r = aplica ? ubicacionDeFila(delInventario!, s.centro ?? k, f.sku, f.inventario, f.baja, s.baja_rotulo ?? undefined) : null;
            const puesto = aplica ? (r?.puesto || null) : (limpiarPuesto(s.centro, f.puesto) || null);
            return { ...f, puesto, nombre: nombres[f.sku] ?? f.sku };
          }),
        };
      }),
    };
  }, [serie, vistos, sitiosVis, sku, viajesHoy, sitios, nombres, filasMat, diaMat, delInventario]);

  const alternar = (k: string) => setSitiosVis((v) => (v.includes(k) ? (v.length > 1 ? v.filter((x) => x !== k) : v) : [...v, k]));

  /* ---------- LA GRÁFICA ---------- */
  const n = serie.length;
  const ML = 52, MT = 24, MB = 36, H = 360, MR = 16;
  const W = Math.max(ancho || 760, ML + MR + n * 14);
  const PASO = (W - ML - MR) / Math.max(1, n);
  const BW = Math.max(8, Math.min(56, PASO * 0.64));
  const eje = ejeNice(Math.max(1, ...serie.map((d) => d.total)));
  const y = (v: number) => MT + (H - MT - MB) * (1 - v / eje.tope);
  const cadaK = Math.max(1, Math.ceil(54 / PASO));
  const verTotales = PASO >= 46;

  if (errorLectura) {
    return <p className="cvt-vacio">No se pudo leer el casco: {errorLectura}</p>;
  }

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · TABLERO</p>
          <h1>Envases pendientes por partir</h1>
          <p className="sub">
            Los hectolitros de casco de vidrio por día y ubicación: lo que en tu Excel era la hoja PARTIR.
            {ultima && <> Último registro: <b>{larga(ultima)}</b>.</>}
          </p>
          <p className="sub"><Link href="/inventario/casco">← Registrar casco de vidrio</Link></p>
        </div>
        <BotonesInforme datos={datosInforme} />
      </section>

      {/* ---------- FILTROS ---------- */}
      <section className="cvt-filtros" aria-label="Filtros">
        <div className="cvt-grupo">
          <span className="cvt-lb">Periodo</span>
          <div className="cvt-seg" role="radiogroup" aria-label="Periodo">
            {([["mes", ultima ? MESES_LARGOS[Number(ultima.slice(5, 7)) - 1] : "Este mes"], ["30", "30 días"], ["90", "90 días"], ["todo", "Todo"], ["fechas", "Fechas"]] as [Rango, string][]).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={rango === k} className={rango === k ? "on" : ""} onClick={() => setRango(k)}>{t}</button>
            ))}
          </div>
          {rango === "fechas" && (
            <span className="cvt-fechas">
              <input type="date" value={desde} min={primera} max={hasta || ultima} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
              <span>→</span>
              <input type="date" value={hasta} min={desde || primera} max={ultima} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
            </span>
          )}
        </div>
        <div className="cvt-grupo">
          <span className="cvt-lb">Ubicación</span>
          <div className="cvt-seg" role="group" aria-label="Ubicación">
            {sitios.map((s) => (
              <button key={s.clave} type="button" aria-pressed={sitiosVis.includes(s.clave)} className={sitiosVis.includes(s.clave) ? "on" : ""} onClick={() => alternar(s.clave)}>
                <i className="cvt-pt" style={{ background: colorDe(s.clave).fondo }} aria-hidden />{s.nombre}
              </button>
            ))}
          </div>
        </div>
        <label className="cvt-grupo">
          <span className="cvt-lb">SKU</span>
          <select value={sku} onChange={(e) => setSku(e.target.value)}>
            <option value="">(Todas)</option>
            {skus.map((s) => <option key={s} value={s}>{s} · {nombres[s] ?? s}</option>)}
          </select>
        </label>
      </section>

      {n === 0 ? (
        <p className="cvt-vacio">No hay registros con esos filtros. Cambia el periodo o la ubicación.</p>
      ) : (
        <>
          {/* ---------- CIFRAS ---------- */}
          <div className="cvt-cifras">
            <div className="cvt-cif"><span className="cvt-lb">Último día · {corta(hoyD!.fecha)}</span><b>{nf0.format(hoyD!.total)}</b><i>HL pendientes</i></div>
            <div className={"cvt-cif" + (delta != null && delta > 0 ? " sube" : delta != null && delta < 0 ? " bajo" : "")}>
              <span className="cvt-lb">Contra el día anterior</span>
              <b>{delta == null ? "—" : (delta > 0 ? "+" : delta < 0 ? "−" : "") + nf0.format(Math.abs(delta))}</b>
              <i>{antes ? `HL desde el ${corta(antes.fecha)}` : "no hay día anterior en el periodo"}</i>
            </div>
            <div className="cvt-cif"><span className="cvt-lb">Pico del periodo</span><b>{pico ? nf0.format(pico.total) : "—"}</b><i>{pico ? `HL el ${corta(pico.fecha)}` : ""}</i></div>
            <div className="cvt-cif cvt-serpro"><span className="cvt-lb">Viajes SERPRO</span><b>{nf1.format(viajesHoy)}</b><i>estibas del {ultima ? corta(ultima) : "—"}: Carnaval ÷ 100, Fábrica y Bodega ÷ 36</i></div>
          </div>

          {/* ---------- GRÁFICA ---------- */}
          <section className="cvt-caja" aria-label="Gráfica de envases pendientes por partir">
            <header className="cvt-cab">
              <h2>ENVASES PENDIENTES POR PARTIR (HL)</h2>
              <ul className="cvt-leyenda">
                {[...claves].reverse().map((k) => (
                  <li key={k}><i className="cvt-pt" style={{ background: colorDe(k).fondo }} aria-hidden />{nombreSitio(k)}</li>
                ))}
              </ul>
            </header>
            <div className="cvt-lienzo" ref={lienzo} onMouseLeave={() => setTip(null)}>
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Barras apiladas por día, de ${corta(serie[0].fecha)} a ${corta(serie[n - 1].fecha)}`}>
                {eje.ticks.map((t) => (
                  <g key={t}>
                    <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className="cvt-rej" />
                    <text x={ML - 8} y={y(t) + 4} textAnchor="end" className="cvt-eje">{nf0.format(t)}</text>
                  </g>
                ))}
                {serie.map((d, i) => {
                  const x = ML + i * PASO + (PASO - BW) / 2;
                  let base = 0;
                  return (
                    <g key={d.fecha} onMouseMove={(e) => { const r = e.currentTarget.ownerSVGElement!.parentElement!.getBoundingClientRect(); setTip({ i, x: e.clientX - r.left + (e.currentTarget.ownerSVGElement!.parentElement!.scrollLeft || 0), y: e.clientY - r.top }) }}>
                      <rect x={ML + i * PASO} y={MT} width={PASO} height={H - MT - MB} fill="transparent" />
                      {claves.map((k) => {
                        const v = d.porSitio[k] ?? 0; if (v <= 0) return null;
                        const y1 = y(base + v), y0 = y(base); base += v;
                        const alto = y0 - y1;
                        return (
                          <g key={k}>
                            <rect x={x} y={y1} width={BW} height={Math.max(0, alto - 1.5)} fill={colorDe(k).fondo} />
                            {alto >= 15 && BW >= 36 && <text x={x + BW / 2} y={y1 + alto / 2 + 4} textAnchor="middle" className="cvt-seg-txt" fill={colorDe(k).tinta}>{nf0.format(v)}</text>}
                          </g>
                        );
                      })}
                      {verTotales && <text x={x + BW / 2} y={y(d.total) - 5} textAnchor="middle" className="cvt-total-txt">{nf0.format(d.total)}</text>}
                      {i % cadaK === 0 && <text x={x + BW / 2} y={H - MB + 18} textAnchor="middle" className="cvt-eje">{corta(d.fecha)}</text>}
                    </g>
                  );
                })}
              </svg>
              {tip && serie[tip.i] && (
                <div className="cvt-tip" style={{ left: Math.min(tip.x + 14, W - 200), top: Math.max(tip.y - 10, 4) }} role="status">
                  <b>{larga(serie[tip.i].fecha)}</b>
                  {claves.map((k) => (
                    <span key={k}><i className="cvt-pt" style={{ background: colorDe(k).fondo }} aria-hidden />{nombreSitio(k)}<em>{nf0.format(serie[tip.i].porSitio[k] ?? 0)}</em></span>
                  ))}
                  <span className="cvt-tip-tot">Total<em>{nf0.format(serie[tip.i].total)}</em></span>
                </div>
              )}
            </div>
          </section>

          {/* ---------- DINÁMICA ---------- */}
          <section className="cvt-caja" aria-label="HL pendiente por disposición">
            <header className="cvt-cab"><h2>HL PENDIENTE POR DISPOSICIÓN</h2><span className="cvt-sub">{sku ? `SKU ${sku}` : "SKU (Todas)"} · el día más nuevo arriba</span></header>
            <div className="cvt-tabla-caja">
              <table className="cvt-tabla">
                <thead>
                  <tr><th>FECHA</th>{claves.map((k) => <th key={k} className="n">{nombreSitio(k).toUpperCase()}</th>)}<th className="n">TOTAL GENERAL</th></tr>
                </thead>
                <tbody>
                  {[...serie].reverse().map((d) => (
                    <tr key={d.fecha}>
                      <td>{corta(d.fecha)}</td>
                      {claves.map((k) => <td key={k} className="n">{d.porSitio[k] != null ? nf0.format(d.porSitio[k]) : "—"}</td>)}
                      <td className="n tot">{nf0.format(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- POR MATERIAL ---------- */}
          <section className="cvt-caja" aria-label="Por material">
            <header className="cvt-cab">
              <h2>POR MATERIAL</h2>
              <label className="cvt-sub">Día{" "}
                <select value={diaMat} onChange={(e) => setDia(e.target.value)}>
                  {[...serie].reverse().map((d) => <option key={d.fecha} value={d.fecha}>{corta(d.fecha)} · {larga(d.fecha)}</option>)}
                </select>
              </label>
            </header>
            <div className="cvt-tabla-caja">
              <table className="cvt-tabla">
                <thead>
                  <tr><th>COD</th><th>MATERIAL</th>{claves.map((k) => <th key={k} className="n">{nombreSitio(k).toUpperCase()}</th>)}<th className="n">ESTIBAS</th><th className="n">TOTAL HL</th></tr>
                </thead>
                <tbody>
                  {filasMat.map((r) => (
                    <tr key={r.sku}>
                      <td className="cod">{r.sku}</td><td>{nombres[r.sku] ?? r.sku}</td>
                      {claves.map((k) => <td key={k} className="n">{r.porSitio[k] != null ? nf0.format(r.porSitio[k]) : "—"}</td>)}
                      <td className="n">{nf0.format(r.estibas)}</td>
                      <td className="n tot">{nf0.format(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>TOTAL</td>
                    {claves.map((k) => <td key={k} className="n">{nf0.format(filasMat.reduce((t, r) => t + (r.porSitio[k] ?? 0), 0))}</td>)}
                    <td className="n">{nf0.format(filasMat.reduce((t, r) => t + r.estibas, 0))}</td>
                    <td className="n tot">{nf0.format(filasMat.reduce((t, r) => t + r.total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
