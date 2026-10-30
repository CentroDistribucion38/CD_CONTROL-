"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FilaPasivo } from "@/modulos/pasivos/datos";
import { Rango } from "../../../../sider/seguimiento/Rango";
import { estadoDelConteo, type DatosInformePasivo } from "@/modulos/pasivos/informe";
import { juntarLineas } from "@/modulos/casco/ubicaciones-armar";
import { gruposDeUbicacion } from "@/modulos/casco/informe";
import type { UbicPasivos } from "@/modulos/pasivos/ubicaciones";
import { BotonesPasivo } from "./BotonesPasivo";

/**
 * EL INFORME PASIVO EN PANTALLA (opción A): tarjetas arriba, el mes por día, el reparto por almacén,
 * los HL diarios, los SKU en HL y en pesos, las cajas plásticas y el consolidado (la TD del Excel).
 * Los filtros de almacén y estado mandan en todo; el día se escoge con el calendario de Traspasos.
 */
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (v: number) => nf0.format(Math.round(v));
const n1 = (v: number) => nf1.format(v);
const plata = (v: number) => "$ " + nf0.format(Math.round(v));
const millones = (v: number) => nf1.format(v / 1e6);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const largo = (f: string) => {
  const d = new Date(f + "T12:00:00");
  return `${SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};
/** Solo el número del día, para el eje de las gráficas. */
const diaNum = (f: string) => String(Number(f.slice(8, 10)));
/** Tamaño de letra para que `txt` quepa en `ancho` px (unidades del viewBox), entre `min` y `max`. */
const letra = (txt: string, ancho: number, max: number, min = 5.5) => Math.max(min, Math.min(max, ancho / (Math.max(1, txt.length) * 0.62)));
const corto = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1].slice(0, 3)}`;

/* EL COLOR VA CON EL ESTADO, SIEMPRE EL MISMO (la gama ámbar del informe de casco). */
const COLOR: Record<string, string> = { BAJA: "#B58200", LAVADO: "#FFC300", EXTRASUCIO: "#3B3B3B" };
const colorDe = (e: string) => COLOR[e] ?? "#8C8C8C";
/** La letra que se lee encima de cada color (blanco sobre el ámbar oscuro y el gris, negro sobre el amarillo). */
const tintaSobre = (e: string) => (e === "LAVADO" ? "#1B1B1B" : "#FFFFFF");
const ORDEN = ["BAJA", "LAVADO", "EXTRASUCIO"];
const enOrden = (a: string, b: string) => {
  const i = (x: string) => { const k = ORDEN.indexOf(x); return k < 0 ? 9 : k };
  return i(a) - i(b) || a.localeCompare(b);
};
const ALMACEN: Record<string, string> = { AG22: "Bodega 38", AG18: "Fábrica", AG07: "Carnaval" };

export function InformePasivo({ dia, dias, filas, error, nombresCaja, ubic = { fecha: null, mapa: {} } }: {
  dia: string | null; dias: string[]; filas: FilaPasivo[]; error: string | null; nombresCaja: Record<string, string>;
  /** Dónde está cada pasivo en el conteo de ese día (Bodega 38 y Fábrica). */
  ubic?: UbicPasivos;
}) {
  const router = useRouter();
  const [cargando, start] = useTransition();
  const [almacen, setAlmacen] = useState("");
  const [estados, setEstados] = useState<Set<string>>(new Set());

  const almacenes = useMemo(() => [...new Set(filas.map((f) => f.almacen))].sort(), [filas]);
  const listaEstados = useMemo(() => [...new Set(filas.map((f) => f.estado))].sort(enOrden), [filas]);
  const mes = useMemo(() => filas.filter((f) => (!almacen || f.almacen === almacen) && (!estados.size || estados.has(f.estado))), [filas, almacen, estados]);
  const hoy = useMemo(() => mes.filter((f) => f.fecha === dia), [mes, dia]);
  const estadosVistos = useMemo(() => [...new Set(mes.map((f) => f.estado))].sort(enOrden), [mes]);

  /* ---------- LAS CUENTAS ---------- */
  const suma = (rs: FilaPasivo[], k: "hl" | "costo" | "unidades" | "cajas") => rs.reduce((t, f) => t + (Number(f[k]) || 0), 0);
  const totHl = suma(hoy, "hl"), totCosto = suma(hoy, "costo");
  const porDia = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const f of mes) { const x = m.get(f.fecha) ?? {}; x[f.estado] = (x[f.estado] ?? 0) + (Number(f.hl) || 0); m.set(f.fecha, x) }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, e]) => ({ fecha, e, total: Object.values(e).reduce((a, b) => a + b, 0) }));
  }, [mes]);
  const anterior = porDia.filter((d) => dia && d.fecha < dia).at(-1) ?? null;
  const porAlmacen = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const f of hoy) { const x = m.get(f.almacen) ?? {}; x[f.estado] = (x[f.estado] ?? 0) + (Number(f.hl) || 0); m.set(f.almacen, x) }
    return [...m.entries()].map(([a, e]) => ({ a, e, total: Object.values(e).reduce((s, v) => s + v, 0) })).sort((x, y) => y.total - x.total);
  }, [hoy]);
  const porSku = useMemo(() => {
    const m = new Map<string, { desc: string; hl: Record<string, number>; costo: Record<string, number>; th: number; tc: number }>();
    for (const f of hoy) {
      const x = m.get(f.codigo) ?? { desc: f.descripcion, hl: {}, costo: {}, th: 0, tc: 0 };
      x.hl[f.estado] = (x.hl[f.estado] ?? 0) + (Number(f.hl) || 0); x.costo[f.estado] = (x.costo[f.estado] ?? 0) + (Number(f.costo) || 0);
      x.th += Number(f.hl) || 0; x.tc += Number(f.costo) || 0; m.set(f.codigo, x);
    }
    return [...m.values()];
  }, [hoy]);
  const cajas = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of hoy) if (f.caja) m.set(f.caja, (m.get(f.caja) ?? 0) + (Number(f.cajas) || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [hoy]);
  const consolidado = useMemo(() => {
    const m = new Map<string, { almacen: string; codigo: string; desc: string; und: number; hl: number; cajas: number; costo: number; estados: Set<string> }>();
    for (const f of hoy) {
      const k = `${f.almacen}|${f.codigo}`;
      const x = m.get(k) ?? { almacen: f.almacen, codigo: f.codigo, desc: f.descripcion, und: 0, hl: 0, cajas: 0, costo: 0, estados: new Set<string>() };
      x.und += Number(f.unidades) || 0; x.hl += Number(f.hl) || 0; x.cajas += Number(f.cajas) || 0; x.costo += Number(f.costo) || 0;
      const e = estadoDelConteo(f.estado, f.causal); if (e) x.estados.add(e);
      m.set(k, x);
    }
    /* LA UBICACIÓN: la del conteo, del estado que le toca a cada renglón de ese material en ese almacén. */
    return [...m.values()].map(({ estados, ...x }) => ({
      ...x, ubic: juntarLineas([...estados].map((e) => ubic.mapa[`${x.almacen}|${e}|${x.codigo}`]).filter((l): l is string => !!l)),
    })).sort((a, b) => a.almacen.localeCompare(b.almacen) || b.hl - a.hl);
  }, [hoy, ubic]);
  /* AG22 primero (izquierda), AG18 después (derecha), y los demás detrás. */
  const almacenesHoy = useMemo(() => {
    const ord = (x: string) => { const i = ["AG22", "AG18"].indexOf(x); return i < 0 ? 9 : i };
    return [...new Set(consolidado.map((x) => x.almacen))].sort((a, b) => ord(a) - ord(b) || a.localeCompare(b));
  }, [consolidado]);

  /* LO QUE VA AL PDF / WORD: lo mismo que se ve, con los filtros puestos. */
  const datos: DatosInformePasivo | null = useMemo(() => {
    if (!dia) return null;
    const costoDe = (a: string) => hoy.filter((f) => f.almacen === a).reduce((t, f) => t + (Number(f.costo) || 0), 0);
    const filtros = [almacen && `Almacén ${almacen}`, estados.size ? `Estado ${[...estados].join(", ")}` : ""].filter(Boolean).join(" · ");
    return {
      dia, filtros, total: totHl, costo: totCosto, anterior: anterior ? { fecha: anterior.fecha, total: anterior.total } : null,
      estados: estadosVistos,
      almacenes: almacenesHoy.map((a) => { const x = porAlmacen.find((p) => p.a === a); return { a, nombre: ALMACEN[a] ?? a, e: x?.e ?? {}, total: x?.total ?? 0, costo: costoDe(a) } }),
      porDia, sku: porSku.map((s) => ({ codigo: "", desc: s.desc, hl: s.hl, costo: s.costo, th: s.th, tc: s.tc })),
      cajas: cajas.map(([c, v]) => ({ caja: c, nombre: nombresCaja[c] ?? "", cajas: v })),
      consolidado,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, hoy, mes, almacen, estados, ubic]);

  const alternar = (e: string) => setEstados((s) => { const x = new Set(s); if (x.has(e)) x.delete(e); else x.add(e); return x });
  const ley = (
    <div className="ip-ley" aria-hidden="true">
      {estadosVistos.map((e) => <span key={e}><i style={{ background: colorDe(e) }} />{e}</span>)}
    </div>
  );

  if (!dia) {
    return (
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · BALANCE · PASIVOS</p>
        <h1>Informe pasivo</h1>
        <p className="sub">Todavía no hay pasivos cargados. Trae el balance o sube el archivo en Pasivos · Base.</p>
      </div></section>
    );
  }

  return (
    <>
      <section className="cabeza ip-cab">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · PASIVOS</p>
          <h1>Informe pasivo</h1>
          <p className="sub">EER bloqueados al <b>{largo(dia)}</b>{cargando && " · trayendo…"}</p>
        </div>
        <BotonesPasivo datos={datos} />
      </section>

      {/* ---- FILTROS ---- */}
      <div className="ip-filtros">
        <div className="sd bal-cal">
          <Rango rotulo="Día" desde={dia} hasta={dia} dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                 alElegir={(d) => start(() => router.push(`/inventario/balance/pasivos/informe?dia=${d}`))} />
        </div>
        <div className="bal-conso-grupo">
          <span>Almacén</span>
          <div className="bal-chips">
            {["", ...almacenes].map((a) => <button key={a || "t"} type="button" className={almacen === a ? "on" : ""} aria-pressed={almacen === a} onClick={() => setAlmacen(a)}>{a ? `${a} · ${ALMACEN[a] ?? ""}` : "Todos"}</button>)}
          </div>
        </div>
        <div className="bal-conso-grupo">
          <span>Estado</span>
          <div className="bal-chips">
            <button type="button" className={!estados.size ? "on" : ""} onClick={() => setEstados(new Set())}>Todos</button>
            {listaEstados.map((e) => <button key={e} type="button" className={estados.has(e) ? "on" : ""} aria-pressed={estados.has(e)} onClick={() => alternar(e)}>{e}</button>)}
          </div>
        </div>
      </div>
      {error && <p className="bal-conso-aviso mal">No se pudo leer la base: {error}</p>}

      {/* ---- TARJETAS ---- */}
      <div className="ip-kpis">
        <div className="ip-k oscura">
          <span>Total pasivos (HL)</span><b>{n0(totHl)}</b>
          <i>{anterior ? `${totHl - anterior.total >= 0 ? "+" : "−"}${n0(Math.abs(totHl - anterior.total))} HL vs ${corto(anterior.fecha)}` : "primer día del mes"}</i>
        </div>
        <div className="ip-k"><span>Costo pasivos</span><b>$ {millones(totCosto)} M</b><i>{plata(totCosto)}</i></div>
        {porAlmacen.slice(0, 2).map((x) => (
          <div className="ip-k" key={x.a}><span>{x.a} · {ALMACEN[x.a] ?? ""}</span><b>{n0(x.total)} HL</b><i>{totHl ? n0(x.total / totHl * 100) : 0}% del total</i></div>
        ))}
      </div>

      {/* ---- EL MES POR DÍA + POR ALMACÉN ---- */}
      <div className="ip-fila ip-2-1">
        <section className="ip-p">
          <h3>EER bloqueados por día (HL) · {MESES[Number(dia.slice(5, 7)) - 1]}</h3>
          {ley}
          <Columnas dias={porDia} estados={estadosVistos} marcado={dia} />
        </section>
        <section className="ip-p">
          <h3>% de bloqueados por almacén</h3>
          <div className="ip-dona">
            <Dona partes={porAlmacen.map((x, i) => ({ k: x.a, v: x.total, c: i === 0 ? "#B58200" : i === 1 ? "#FFC300" : "#3B3B3B" }))} total={totHl} />
            <table className="ip-t">
              <thead><tr><th>Almacén</th>{estadosVistos.map((e) => <th key={e} className="r">{e}</th>)}<th className="r">Total HL</th></tr></thead>
              <tbody>{porAlmacen.map((x) => (
                <tr key={x.a}><td>{x.a}</td>{estadosVistos.map((e) => <td key={e} className="r">{n0(x.e[e] ?? 0)}</td>)}<td className="r"><b>{n0(x.total)}</b></td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ---- HL DIARIOS ---- */}
      <section className="ip-p ip-sola">
        <h3>HL diarios · {MESES[Number(dia.slice(5, 7)) - 1]}</h3>
        <Linea puntos={porDia.map((d) => ({ fecha: d.fecha, v: d.total }))} marcado={dia} />
      </section>

      {/* ---- SKU EN HL Y EN PESOS ---- */}
      <div className="ip-fila ip-1-1">
        <section className="ip-p">
          <h3>SKU bloqueados (HL)</h3>{ley}
          <Barras filas={[...porSku].sort((a, b) => b.th - a.th).map((s) => ({ k: s.desc, partes: s.hl, total: s.th }))} estados={estadosVistos} fmt={n1} />
        </section>
        <section className="ip-p">
          <h3>SKU bloqueados ($ millones)</h3>{ley}
          <Barras filas={[...porSku].sort((a, b) => b.tc - a.tc).map((s) => ({ k: s.desc, partes: s.costo, total: s.tc }))} estados={estadosVistos} fmt={millones} />
        </section>
      </div>

      {/* ---- CONSOLIDADO: AG22 A LA IZQUIERDA, AG18 A LA DERECHA; DEBAJO LAS CAJAS PLÁSTICAS ---- */}
      <div className={`ip-fila ${almacenesHoy.length > 1 ? "ip-1-1" : ""}`}>
        {almacenesHoy.map((a) => {
          const rs = consolidado.filter((x) => x.almacen === a);
          const conUbi = rs.some((x) => x.ubic);
          return (
            <section className="ip-p" key={a}>
              <h3>{a} · {ALMACEN[a] ?? ""} <span className="ip-h-sub">{n1(rs.reduce((t, y) => t + y.hl, 0))} HL · {plata(rs.reduce((t, y) => t + y.costo, 0))}</span></h3>
              <div className="ip-scroll">
                <table className="ip-t">
                  <thead><tr><th>Código</th><th>Material</th><th className="r">Unidades</th><th className="r">Cajas</th><th className="r">HL</th><th className="r">Costo</th>{conUbi && <th>Ubicación</th>}</tr></thead>
                  <tbody>{rs.map((x) => (
                    <tr key={x.codigo}><td className="mono">{x.codigo}</td><td>{x.desc}</td>
                      <td className={`r ${x.und < 0 ? "neg" : ""}`}>{n0(x.und)}</td><td className="r">{n0(x.cajas)}</td><td className="r">{n1(x.hl)}</td><td className="r">{plata(x.costo)}</td>
                      {conUbi && <td className="ip-ubi">{gruposDeUbicacion(x.ubic).map((l) => <span key={l}>{l}</span>)}</td>}</tr>
                  ))}</tbody>
                  <tfoot><tr><td colSpan={2}><b>Total {a}</b></td>
                    <td className="r"><b>{n0(rs.reduce((t, y) => t + y.und, 0))}</b></td><td className="r"><b>{n0(rs.reduce((t, y) => t + y.cajas, 0))}</b></td>
                    <td className="r"><b>{n1(rs.reduce((t, y) => t + y.hl, 0))}</b></td><td className="r"><b>{plata(rs.reduce((t, y) => t + y.costo, 0))}</b></td>{conUbi && <td />}</tr></tfoot>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <section className="ip-p ip-sola">
        <h3>Cajas plásticas comprometidas</h3>
        <div className="ip-cajas">
          {cajas.map(([c, v]) => (
            <div className="ip-caja" key={c}>
              <span className="mono">{c}</span>
              <b>{n0(v)}</b>
              <i>{nombresCaja[c] ?? "—"}</i>
            </div>
          ))}
          {cajas.length > 1 && (
            <div className="ip-caja total"><span>Total</span><b>{n0(cajas.reduce((t, [, v]) => t + v, 0))}</b><i>cajas plásticas</i></div>
          )}
        </div>
      </section>
    </>
  );
}

/* ============================ GRÁFICAS ============================ */
type DiaE = { fecha: string; e: Record<string, number>; total: number };

/** Columnas apiladas por estado, un día por columna; el total encima y el día escogido resaltado. */
function Columnas({ dias, estados, marcado }: { dias: DiaE[]; estados: string[]; marcado: string }) {
  const W = 760, H = 270, arriba = 30, abajo = 26, izq = 8, der = 8;
  const max = Math.max(1, ...dias.map((d) => d.total));
  const paso = (W - izq - der) / Math.max(1, dias.length);
  const ancho = Math.min(64, paso * 0.8);
  const alto = (v: number) => (v / max) * (H - arriba - abajo);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ip-svg" role="img" aria-label="HL bloqueados por día y estado">
      <line x1={izq} x2={W - der} y1={H - abajo} y2={H - abajo} className="ip-eje" />
      {dias.map((d, i) => {
        const x = izq + i * paso + (paso - ancho) / 2;
        let y = H - abajo;
        const capas = [...estados].reverse().map((e) => {
          const h = alto(d.e[e] ?? 0); if (h <= 0) return null;
          y -= h;
          return (
            <g key={e}>
              <rect x={x} y={y} width={ancho} height={Math.max(0, h - 1)} fill={colorDe(e)}><title>{`${corto(d.fecha)} · ${e}: ${n0(d.e[e] ?? 0)} HL`}</title></rect>
              {(() => {
                const t = n0(d.e[e] ?? 0), fs = letra(t, ancho - 2, 11);
                return h >= fs + 3 ? <text x={x + ancho / 2} y={y + h / 2 + fs * 0.36} textAnchor="middle" className="ip-seg" style={{ fontSize: fs }} fill={tintaSobre(e)}>{t}</text> : null;
              })()}
            </g>
          );
        });
        return (
          <g key={d.fecha} className={d.fecha === marcado ? "ip-marcado" : undefined}>
            {capas}
            <text x={x + ancho / 2} y={y - 6} textAnchor="middle" className="ip-val" style={{ fontSize: letra(n0(d.total), paso - 1, 12) }}>{n0(d.total)}</text>
            <text x={x + ancho / 2} y={H - 8} textAnchor="middle" className="ip-dia" style={{ fontSize: letra(diaNum(d.fecha), paso - 1, 11, 7) }}>{diaNum(d.fecha)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** La línea de HL diarios: puntos con su cifra, el área suave debajo y el día escogido más grande. */
function Linea({ puntos, marcado }: { puntos: { fecha: string; v: number }[]; marcado: string }) {
  const W = 760, H = 230, arriba = 40, abajo = 26, izq = 28, der = 28;
  if (!puntos.length) return <p className="ip-nada">Sin días en este mes.</p>;
  const vals = puntos.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const lo = Math.max(0, min - (max - min) * 0.25 - 1), hi = max + (max - min) * 0.1 + 1;
  const x = (i: number) => puntos.length === 1 ? W / 2 : izq + (i * (W - izq - der)) / (puntos.length - 1);
  const y = (v: number) => arriba + (1 - (v - lo) / (hi - lo)) * (H - arriba - abajo);
  const paso = puntos.length > 1 ? (W - izq - der) / (puntos.length - 1) : W;
  const largo = Math.max(...puntos.map((p) => n0(p.v).length));
  // si las cifras no caben una al lado de otra, se alternan en dos alturas y se achica la letra
  const alterna = paso < largo * 8;
  const fsVal = alterna ? Math.max(7.5, Math.min(11, (paso * 2 - 2) / (largo * 0.62))) : 12;
  const camino = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${camino} L${x(puntos.length - 1).toFixed(1)},${H - abajo} L${x(0).toFixed(1)},${H - abajo} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ip-svg" role="img" aria-label="HL diarios">
      {[0.25, 0.5, 0.75].map((t) => <line key={t} x1={izq} x2={W - der} y1={arriba + t * (H - arriba - abajo)} y2={arriba + t * (H - arriba - abajo)} className="ip-grilla" />)}
      <line x1={izq} x2={W - der} y1={H - abajo} y2={H - abajo} className="ip-eje" />
      <path d={area} className="ip-area" />
      <path d={camino} className="ip-linea" />
      {puntos.map((p, i) => (
        <g key={p.fecha}>
          <circle cx={x(i)} cy={y(p.v)} r={p.fecha === marcado ? 6 : 4} className={p.fecha === marcado ? "ip-punto on" : "ip-punto"}><title>{`${corto(p.fecha)}: ${n0(p.v)} HL`}</title></circle>
          <text x={x(i)} y={y(p.v) - (alterna && i % 2 ? 11 + fsVal + 2 : 10)} textAnchor="middle" className="ip-val" style={{ fontSize: fsVal }}>{n0(p.v)}</text>
          <text x={x(i)} y={H - 8} textAnchor="middle" className="ip-dia" style={{ fontSize: letra(diaNum(p.fecha), Math.max(8, paso - 1), 11, 7) }}>{diaNum(p.fecha)}</text>
        </g>
      ))}
    </svg>
  );
}

function Dona({ partes, total }: { partes: { k: string; v: number; c: string }[]; total: number }) {
  const R = 44, L = 2 * Math.PI * R;
  let acum = 0;
  return (
    <svg viewBox="0 0 120 120" className="ip-dona-svg" role="img" aria-label="Reparto por almacén">
      <circle cx="60" cy="60" r={R} fill="none" className="ip-dona-fondo" strokeWidth="20" />
      {partes.map((p) => {
        const largo = total ? (p.v / total) * L : 0;
        const medio = ((acum + largo / 2) / L) * 2 * Math.PI - Math.PI / 2;
        const pct = total ? Math.round((p.v / total) * 100) : 0;
        const el = (
          <g key={p.k}>
            <circle cx="60" cy="60" r={R} fill="none" stroke={p.c} strokeWidth="20"
              strokeDasharray={`${largo} ${L}`} strokeDashoffset={-acum} transform="rotate(-90 60 60)"><title>{`${p.k}: ${n0(p.v)} HL`}</title></circle>
            {pct >= 6 && (
              <text x={60 + R * Math.cos(medio)} y={60 + R * Math.sin(medio) + 3} textAnchor="middle" className="ip-dona-pct"
                    fill={p.c === "#FFC300" ? "#1B1B1B" : "#FFFFFF"}>{pct}%</text>
            )}
          </g>
        );
        acum += largo;
        return el;
      })}
      <text x="60" y="60" textAnchor="middle" className="ip-dona-n">{n0(total)}</text>
      <text x="60" y="75" textAnchor="middle" className="ip-dia">HL</text>
    </svg>
  );
}

function Barras({ filas, estados, fmt }: { filas: { k: string; partes: Record<string, number>; total: number }[]; estados: string[]; fmt: (v: number) => string }) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  return (
    <div className="ip-barras">
      {filas.map((f) => (
        <div className="ip-b" key={f.k}>
          <span className="ip-bn" title={f.k}>{f.k}</span>
          <span className="ip-bb">
            {estados.map((e) => (f.partes[e] ?? 0) > 0 && (
              <i key={e} style={{ width: `${((f.partes[e] ?? 0) / max) * 100}%`, background: colorDe(e) }} title={`${e}: ${fmt(f.partes[e] ?? 0)}`} />
            ))}
          </span>
          <b>{fmt(f.total)}</b>
        </div>
      ))}
    </div>
  );
}
