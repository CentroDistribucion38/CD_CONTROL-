"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rango } from "../../sider/seguimiento/Rango";
import type { DatosFifo, LineaFifo, UbicFifo, Zona } from "@/modulos/inventario/fifo-envase";

/**
 * LA HOJA «FIFO DEL ENVASE» DEL TABLERO: qué envase lleva más tiempo en su sitio (y debería salir
 * primero), cuánto envase hubo cada día del rango y, ubicación por ubicación, si se mantiene, cambia,
 * llega o se vacía. Los colores son los de los informes de Quiebra: verde, ámbar, mostaza, azul, rojo y gris.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const corto = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const PALETA = ["#0F7A4A", "#FFC000", "#C08A16", "#0B4EA2", "#E4002B", "#12263A", "#8A96A3"];
const OTROS = "#C6D0DC";
const BALDES = [
  { t: "0–7 días", de: 0, a: 7, c: "#0F7A4A" },
  { t: "8–15 días", de: 8, a: 15, c: "#ECC644" },
  { t: "16–30 días", de: 16, a: 30, c: "#FFC000" },
  { t: "31–60 días", de: 31, a: 60, c: "#C08A16" },
  { t: "+60 días", de: 61, a: Infinity, c: "#E4002B" },
];
type Estado = "mantiene" | "cambio" | "nueva" | "vacio";
const ESTADOS: Record<Estado, { t: string; c: string }> = {
  mantiene: { t: "Se mantiene", c: "#0F7A4A" },
  cambio: { t: "Cambió de material", c: "#FFC000" },
  nueva: { t: "Llegó envase", c: "#0B4EA2" },
  vacio: { t: "Se vació", c: "#E4002B" },
};

function estadoDe(u: UbicFifo): Estado | null {
  const hay = u.celdas.filter(Boolean) as { codigo: string }[];
  if (!hay.length) return null;
  if (new Set(hay.map((c) => c.codigo)).size > 1) return "cambio";
  const primero = u.celdas[0], ultimo = u.celdas[u.celdas.length - 1];
  if (!primero && ultimo) return "nueva";
  if (primero && !ultimo) return "vacio";
  return "mantiene";
}
const cambios = (u: UbicFifo) => {
  let k = 0, prev: string | null | undefined;
  for (const c of u.celdas) { const v = c?.codigo ?? null; if (prev !== undefined && v !== prev) k++; prev = v }
  return k;
};

export function FifoEnvase({ datos }: { datos: DatosFifo }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [zona, setZona] = useState<"" | Zona>("");
  const [material, setMaterial] = useState("");
  const [verEstado, setVerEstado] = useState<"" | Estado>("");
  const [orden, setOrden] = useState<"quietas" | "movimiento">("quietas");
  const [cuantas, setCuantas] = useState(60);
  const [todos, setTodos] = useState(false);

  const nombre = useMemo(() => new Map(datos.materiales.map((m) => [m.codigo, m.material])), [datos.materiales]);
  const color = useMemo(() => new Map(datos.materiales.map((m, i) => [m.codigo, PALETA[i] ?? OTROS])), [datos.materiales]);
  const pasa = (z: Zona, c?: string) => (!zona || z === zona) && (!material || !c || c === material);

  const lineas = useMemo(() => datos.lineas.filter((l) => pasa(l.zona, l.codigo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos.lineas, zona, material]);
  const ubic = useMemo(() => datos.ubicaciones
    .filter((u) => (!zona || u.zona === zona) && (!material || u.celdas.some((c) => c?.codigo === material)))
    .map((u) => ({ u, estado: estadoDe(u), mov: cambios(u) }))
    .filter((x) => x.estado), [datos.ubicaciones, zona, material]);

  /* ---- indicadores (del último día del rango) ---- */
  const total = lineas.reduce((t, l) => t + l.cajas, 0);
  const conDias = lineas.filter((l) => l.dias != null);
  const cajasConDias = conDias.reduce((t, l) => t + l.cajas, 0);
  const promedio = cajasConDias ? conDias.reduce((t, l) => t + l.cajas * l.dias!, 0) / cajasConDias : null;
  const quietas = conDias.filter((l) => l.dias! > 30);
  const cajasQuietas = quietas.reduce((t, l) => t + l.cajas, 0);
  const cambiaron = ubic.filter((x) => x.estado !== "mantiene").length;

  /* ---- qué despachar primero ---- */
  const porMaterial = useMemo(() => {
    const m = new Map<string, LineaFifo[]>();
    for (const l of lineas) (m.get(l.codigo) ?? m.set(l.codigo, []).get(l.codigo)!).push(l);
    return [...m].map(([codigo, ls]) => {
      const cd = ls.filter((l) => l.dias != null), cc = cd.reduce((t, l) => t + l.cajas, 0);
      return {
        codigo, material: ls[0].material, cajas: ls.reduce((t, l) => t + l.cajas, 0),
        prom: cc ? cd.reduce((t, l) => t + l.cajas * l.dias!, 0) / cc : null,
        max: cd.length ? Math.max(...cd.map((l) => l.dias!)) : null,
        viejas: [...cd].sort((a, b) => b.dias! - a.dias!).slice(0, 3),
      };
    }).sort((a, b) => (b.max ?? -1) - (a.max ?? -1) || (b.prom ?? -1) - (a.prom ?? -1));
  }, [lineas]);

  /* ---- movimiento por día ---- */
  const serie = datos.rango.map((f) => ({ f, cajas: datos.serie.filter((p) => p.fecha === f && pasa(p.zona, p.codigo)).reduce((t, p) => t + p.cajas, 0) }));

  const ir = (d: string, h: string) => start(() => router.push(`/inventario/tablero?vista=fifo&desde=${d}&hasta=${h}`));
  const filasMapa = ubic
    .filter((x) => !verEstado || x.estado === verEstado)
    .sort((a, b) => orden === "quietas" ? (b.u.diasEnSitio ?? -1) - (a.u.diasEnSitio ?? -1) || a.u.ubicacion.localeCompare(b.u.ubicacion, "es", { numeric: true })
      : b.mov - a.mov || a.u.ubicacion.localeCompare(b.u.ubicacion, "es", { numeric: true }));
  const cuenta = (e: Estado) => ubic.filter((x) => x.estado === e).length;
  const etiquetaDias = (d: number | null) => d == null ? "—" : `${n(d)} d`;
  const tono = (d: number | null) => d == null ? "" : d > 60 ? " r" : d > 30 ? " m" : d > 15 ? " a" : " v";

  if (!datos.rango.length) {
    return <p className="ff-vacio">{datos.error ?? "Todavía no hay conteos enviados para ver el FIFO del envase."}</p>;
  }
  const visibles = todos ? porMaterial : porMaterial.slice(0, 12);
  const maxBalde = Math.max(1, ...BALDES.map((b) => conDias.filter((l) => l.dias! >= b.de && l.dias! <= b.a).reduce((t, l) => t + l.cajas, 0)));
  const sMax = Math.max(1, ...serie.map((s) => s.cajas)), sMin = Math.min(...serie.map((s) => s.cajas));
  const lo = Math.max(0, sMin - (sMax - sMin) * 0.25 || sMin * 0.9), hi = sMax + (sMax - sMin) * 0.15 || sMax * 1.05;
  const W = 560, H = 150, X0 = 54, X1 = W - 16, Y0 = 14, Y1 = H - 26;
  const px = (i: number) => serie.length === 1 ? (X0 + X1) / 2 : X0 + (i * (X1 - X0)) / (serie.length - 1);
  const py = (v: number) => Y1 - ((v - lo) / Math.max(1, hi - lo)) * (Y1 - Y0);

  return (
    <div className="ff">
      {/* ---- filtros ---- */}
      <div className="ff-barra">
        <div className="sd bal-cal ff-rango">
          <Rango rotulo="Rango" desde={datos.desde ?? ""} hasta={datos.hasta ?? ""} dias={datos.dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))} alElegir={ir} />
        </div>
        <div className="ff-grupo"><span>Zona</span>
          <div className="ff-chips">{(["", "Bodega 38", "Fábrica"] as const).map((z) => (
            <button key={z || "todo"} type="button" className={zona === z ? "on" : ""} aria-pressed={zona === z} onClick={() => setZona(z)}>{z || "Todo"}</button>
          ))}</div>
        </div>
        <label className="ff-grupo"><span>Material</span>
          <select value={material} onChange={(e) => setMaterial(e.target.value)}>
            <option value="">Todos</option>
            {datos.materiales.map((m) => <option key={m.codigo} value={m.codigo}>{m.codigo} · {m.material}</option>)}
          </select>
        </label>
        <small className="ff-dice">{datos.rango.length} días con conteo · foto del {corto(datos.rango[datos.rango.length - 1])}{pend && " · trayendo…"}</small>
      </div>

      {/* ---- indicadores ---- */}
      <div className="ff-k">
        <div><span>Envase en bodega</span><b>{n(total)}</b><small>cajas · conteo del {corto(datos.rango[datos.rango.length - 1])}</small></div>
        <div><span>Antigüedad promedio</span><b>{promedio == null ? "—" : `${n(Math.round(promedio))} días`}</b><small>en la misma ubicación, ponderada por cajas</small></div>
        <div className={cajasQuietas ? "mal" : ""}><span>Quieto más de 30 días</span><b>{total ? `${(cajasQuietas * 100 / total).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %` : "—"}</b>
          <small>{n(cajasQuietas)} cajas · {new Set(quietas.map((l) => l.ubicacion)).size} ubicaciones</small></div>
        <div><span>Ubicaciones que cambiaron</span><b>{n(cambiaron)} de {n(ubic.length)}</b><small>en el rango</small></div>
      </div>

      <div className="ff-dos">
        {/* ---- qué despachar primero ---- */}
        <section className="ff-card">
          <h3>Qué despachar primero <small>el envase que más tiempo lleva en su sitio</small> <Link href="/inventario/tablero?vista=despacho" className="ff-mas" style={{ marginLeft: 8 }}>Armar plan de despacho e imprimir →</Link></h3>
          <div className="ff-scroll">
            <table className="ff-t">
              <thead><tr><th>Código</th><th>Material</th><th className="n">Cajas</th><th className="n">Días prom.</th><th className="n">Más viejo</th><th>Ubicaciones más viejas</th></tr></thead>
              <tbody>{visibles.map((m) => (
                <tr key={m.codigo}>
                  <td className="mono"><i className="ff-pt" style={{ background: color.get(m.codigo) ?? OTROS }} />{m.codigo}</td>
                  <td>{m.material}</td>
                  <td className="n">{n(m.cajas)}</td>
                  <td className="n">{m.prom == null ? "—" : n(Math.round(m.prom))}</td>
                  <td className="n"><span className={"ff-d" + tono(m.max)}>{etiquetaDias(m.max)}</span></td>
                  <td className="ff-ubis">{m.viejas.map((l, i) => <span key={i}><b>{l.ubicacion}</b> {n(l.dias!)}</span>)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {porMaterial.length > 12 && <button type="button" className="ff-mas" onClick={() => setTodos((v) => !v)}>{todos ? "Ver menos" : `Ver los ${porMaterial.length} materiales`}</button>}
        </section>

        <div className="ff-col">
          {/* ---- antigüedad ---- */}
          <section className="ff-card">
            <h3>Antigüedad en la ubicación <small>cajas por días en el mismo sitio</small></h3>
            <div className="ff-baldes">{BALDES.map((b) => {
              const v = conDias.filter((l) => l.dias! >= b.de && l.dias! <= b.a).reduce((t, l) => t + l.cajas, 0);
              return (
                <div key={b.t} className="ff-balde">
                  <span>{b.t}</span>
                  <span className="ff-barra-c"><i style={{ width: `${(v * 100) / maxBalde}%`, background: b.c }} /></span>
                  <b>{n(v)}</b>
                </div>
              );
            })}</div>
          </section>
          {/* ---- movimiento ---- */}
          <section className="ff-card">
            <h3>Movimiento del inventario <small>cajas de envase por día de conteo</small></h3>
            <svg className="ff-linea" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cajas de envase por día">
              {[hi, (hi + lo) / 2, lo].map((v, i) => (
                <g key={i}><line x1={X0} x2={X1} y1={py(v)} y2={py(v)} className="ff-grid" />
                  <text x={X0 - 6} y={py(v) + 4} textAnchor="end">{v >= 1e6 ? `${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 2 })} M` : n(v)}</text></g>
              ))}
              {serie.length > 1 && <polyline className="ff-pl" points={serie.map((s, i) => `${px(i)},${py(s.cajas)}`).join(" ")} />}
              {serie.map((s, i) => (
                <g key={s.f}>
                  <circle cx={px(i)} cy={py(s.cajas)} r={i === serie.length - 1 ? 5 : 3.5} className={i === serie.length - 1 ? "ff-ult" : "ff-pto"}><title>{`${corto(s.f)} · ${n(s.cajas)} cajas`}</title></circle>
                  {(serie.length <= 10 || i % Math.ceil(serie.length / 8) === 0 || i === serie.length - 1) && <text x={px(i)} y={H - 6} textAnchor="middle">{corto(s.f)}</text>}
                </g>
              ))}
            </svg>
          </section>
        </div>
      </div>

      {/* ---- comportamiento por ubicación ---- */}
      <section className="ff-card ff-mapa">
        <div className="ff-mapa-cab">
          <h3>Comportamiento por ubicación <small>qué material había cada día en cada ubicación</small></h3>
          <div className="ff-chips">
            <button type="button" className={!verEstado ? "on" : ""} onClick={() => setVerEstado("")}>Todas · {ubic.length}</button>
            {(Object.keys(ESTADOS) as Estado[]).map((e) => (
              <button key={e} type="button" className={verEstado === e ? "on" : ""} aria-pressed={verEstado === e} onClick={() => setVerEstado(verEstado === e ? "" : e)}>
                <i className="ff-pt" style={{ background: ESTADOS[e].c }} />{ESTADOS[e].t} · {cuenta(e)}
              </button>
            ))}
            <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)} aria-label="Orden">
              <option value="quietas">Primero las de más tiempo en su sitio</option>
              <option value="movimiento">Primero las de más movimiento</option>
            </select>
          </div>
        </div>
        <div className="ff-scroll">
          <div className="ff-hm" style={{ gridTemplateColumns: `150px repeat(${datos.rango.length}, minmax(34px, 1fr)) 76px 140px` }}>
            <div className="ff-hm-h" />
            {datos.rango.map((f) => <div key={f} className="ff-hm-h">{corto(f)}</div>)}
            <div className="ff-hm-h n">En su sitio</div><div className="ff-hm-h">Estado</div>
            {filasMapa.slice(0, cuantas).map(({ u, estado }) => [
              <div key={`${u.ubicacion}-u`} className="ff-hm-u" title={u.zona}>{u.ubicacion}</div>,
              ...u.celdas.map((c, i) => (
                <div key={`${u.ubicacion}-${i}`} className={"ff-hm-c" + (c ? "" : " sin")} style={c ? { background: color.get(c.codigo) ?? OTROS } : undefined}
                     title={c ? `${corto(datos.rango[i])} · ${c.codigo} ${nombre.get(c.codigo) ?? ""} · ${n(c.cajas)} cajas` : `${corto(datos.rango[i])} · sin registro`} />
              )),
              <div key={`${u.ubicacion}-d`} className={"ff-hm-d" + tono(u.diasEnSitio)}>{etiquetaDias(u.diasEnSitio)}</div>,
              <div key={`${u.ubicacion}-e`} className="ff-hm-e"><i className="ff-pt" style={{ background: ESTADOS[estado!].c }} />{ESTADOS[estado!].t}</div>,
            ])}
          </div>
        </div>
        {filasMapa.length > cuantas && <button type="button" className="ff-mas" onClick={() => setCuantas((c) => c + 60)}>Ver 60 más ({filasMapa.length - cuantas} quedan)</button>}
        <div className="ff-ley">
          {datos.materiales.slice(0, PALETA.length).map((m) => <span key={m.codigo}><i style={{ background: color.get(m.codigo) }} />{m.codigo} · {m.material}</span>)}
          {datos.materiales.length > PALETA.length && <span><i style={{ background: OTROS }} />Otros materiales</span>}
          <span><i className="sin" />Sin registro ese día (no se contó o estaba vacía)</span>
        </div>
      </section>
    </div>
  );
}
