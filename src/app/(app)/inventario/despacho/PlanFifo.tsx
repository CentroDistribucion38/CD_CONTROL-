"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DatosPlan, MaterialPlan, RenglonPlan, Zona } from "@/modulos/inventario/plan-fifo";

const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const n0 = (v: number) => nf0.format(v);
const n1 = (v: number) => nf1.format(v);
const larga = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const corta = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}` : "—");
const tono = (d: number | null) => (d == null ? "" : d > 60 ? "r" : d > 30 ? "m" : d > 15 ? "a" : "v");
const PALETA = ["#0F7A4A", "#0B4EA2", "#C08A16", "#E4002B", "#12263A", "#8A96A3"];
const MAX_SKU = 6;
const TOPES = [5, 10, 15, 20, 0];   // posiciones por material; 0 = todas

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
/** FIFO: el que lleva más tiempo (fecha FIFO más vieja) sale primero; sin fecha, al final. */
const fifo = (a: RenglonPlan, b: RenglonPlan) => {
  if (a.fechaFifo && b.fechaFifo && a.fechaFifo !== b.fechaFifo) return a.fechaFifo < b.fechaFifo ? -1 : 1;
  if (!a.fechaFifo !== !b.fechaFifo) return a.fechaFifo ? -1 : 1;
  return natural(a.ubicacion, b.ubicacion);
};

export function PlanFifo({ datos, inicial }: { datos: DatosPlan; inicial: string[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const valido = useMemo(() => new Set(datos.materiales.map((m) => m.codigo)), [datos.materiales]);
  const [elegidos, setElegidos] = useState<string[]>(() => inicial.filter((c) => valido.has(c)));
  const [zona, setZona] = useState<"" | Zona>("");
  const [tope, setTope] = useState(10);
  const [marcas, setMarcas] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState(false);
  const [impreso, setImpreso] = useState("");

  const info = useMemo(() => new Map(datos.materiales.map((m) => [m.codigo, m])), [datos.materiales]);
  const color = useMemo(() => new Map(datos.materiales.map((m, i) => [m.codigo, PALETA[i % PALETA.length]])), [datos.materiales]);

  /* La lista de elegidos viaja en la dirección: se puede copiar el enlace con los mismos materiales. */
  const poner = useCallback((lista: string[]) => {
    setElegidos(lista);
    try {
      const u = new URL(window.location.href);
      if (lista.length) u.searchParams.set("sku", lista.join(",")); else u.searchParams.delete("sku");
      window.history.replaceState(null, "", u.toString());
    } catch { /* sin dirección que actualizar */ }
  }, []);
  const alterna = (c: string) => poner(elegidos.includes(c) ? elegidos.filter((x) => x !== c) : elegidos.length >= MAX_SKU ? elegidos : [...elegidos, c]);

  useEffect(() => {
    const antes = () => setImpreso(new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }));
    window.addEventListener("beforeprint", antes);
    return () => window.removeEventListener("beforeprint", antes);
  }, []);

  const bloques = useMemo(() => elegidos.map((cod) => {
    const todas = datos.renglones.filter((r) => r.codigo === cod && (!zona || r.zona === zona)).sort(fifo);
    /* Solo las N más antiguas (aunque tengan la misma fecha): lo que de verdad se va a despachar. */
    const rs = tope > 0 ? todas.slice(0, tope) : todas;
    let ac = 0, acE = 0;
    const filas = rs.map((r, i) => { ac += r.cajas; acE += r.estibas; return { r, n: i + 1, ac, acE }; });
    const maxDias = Math.max(1, ...rs.map((r) => r.dias ?? 0));
    const resto = todas.slice(rs.length);
    return {
      cod, material: info.get(cod)?.material ?? cod, filas, cajas: ac, estibas: acE, maxDias,
      totalModulos: todas.length, restoModulos: resto.length, restoCajas: resto.reduce((t, r) => t + r.cajas, 0),
    };
  }), [elegidos, datos.renglones, zona, info, tope]);

  const tCajas = bloques.reduce((t, b) => t + b.cajas, 0);
  const tEstibas = bloques.reduce((t, b) => t + b.estibas, 0);
  const tModulos = bloques.reduce((t, b) => t + b.filas.length, 0);
  const masViejo = bloques.flatMap((b) => b.filas.map((f) => f.r)).filter((r) => r.dias != null).sort((a, b) => b.dias! - a.dias!)[0];

  const irDia = (d: string) => start(() => router.push(`/inventario/despacho?dia=${d}${elegidos.length ? `&sku=${elegidos.join(",")}` : ""}`));
  const imprimir = () => { antesDeImprimir(); window.print(); };
  const antesDeImprimir = () => setImpreso(new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }));

  if (!datos.dia) {
    return <p className="pf-vacio">{datos.error ?? "Todavía no hay conteos enviados para armar el plan de despacho."}</p>;
  }

  return (
    <>
      {/* ---- SOLO EN EL PAPEL: encabezado de la hoja ---- */}
      <div className="pf-hoja">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-b.png" alt="" />
        <div>
          <b>CD38 · CONTROL</b>
          <span>Centro de Distribución 38 · Bavaria BAQ</span>
        </div>
        <div className="pf-hoja-sello">
          <strong>Plan de despacho FIFO</strong>
          Conteo del {larga(datos.dia)} · {zona || "Todas las zonas"} · {tope ? `las ${tope} posiciones más antiguas por material` : "todas las posiciones"}<br />
          {impreso && <>Impreso: {impreso}</>}
        </div>
      </div>
      <p className="pf-hoja-mat">
        {bloques.map((b) => `${b.cod} · ${b.material}`).join("   |   ")}
      </p>

      {/* ---- barra de filtros ---- */}
      <div className="pf-barra pf-no-papel">
        <label className="pf-grupo"><span>Conteo del día</span>
          <select value={datos.dia} onChange={(e) => irDia(e.target.value)} disabled={pend}>
            {datos.dias.map((d) => <option key={d} value={d}>{larga(d)}</option>)}
          </select>
        </label>
        <div className="pf-grupo"><span>Zona</span>
          <div className="pf-chips">{(["", "Bodega 38", "Fábrica"] as const).map((z) => (
            <button key={z || "todo"} type="button" className={zona === z ? "on" : ""} aria-pressed={zona === z} onClick={() => setZona(z)}>{z || "Todo"}</button>
          ))}</div>
        </div>
        <div className="pf-grupo"><span>Posiciones por material</span>
          <div className="pf-chips">{TOPES.map((t) => (
            <button key={t} type="button" className={tope === t ? "on" : ""} aria-pressed={tope === t} onClick={() => setTope(t)}>{t === 0 ? "Todas" : t}</button>
          ))}</div>
        </div>
        <div className="pf-grupo pf-mat">
          <span>Material <em>(hasta {MAX_SKU})</em></span>
          <div className="pf-mat-fila">
            <button type="button" className="pf-embudo" aria-haspopup="dialog" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 2h13L9.5 8.5V14l-3-1.6V8.5z" fill="currentColor" /></svg>
              {elegidos.length ? `${elegidos.length} de ${datos.materiales.length} materiales` : "Escoger materiales…"}
            </button>
            {elegidos.map((c) => (
              <span key={c} className="pf-chip" style={{ borderColor: color.get(c) }}>
                <i style={{ background: color.get(c) }} />{c}
                <button type="button" aria-label={`Quitar ${c}`} onClick={() => alterna(c)}>×</button>
              </span>
            ))}
            {elegidos.length > 0 && <button type="button" className="pf-limpia" onClick={() => poner([])}>Limpiar</button>}
          </div>
          {abierto && (
            <FiltroMaterial materiales={datos.materiales} elegidos={elegidos} color={color}
              aplicar={(l) => { poner(l.slice(0, MAX_SKU)); setAbierto(false); }} cerrar={() => setAbierto(false)} />
          )}
        </div>
        <button type="button" className="pf-imprimir" disabled={!elegidos.length} onClick={imprimir}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 2h10v4H5zM3 7h14a1 1 0 0 1 1 1v6h-3v4H5v-4H2V8a1 1 0 0 1 1-1zm4 6v4h6v-4z" fill="currentColor" /></svg>
          Imprimir hoja
        </button>
      </div>

      {/* ---- SIN MATERIAL: tarjetas para escoger de un clic ---- */}
      {!elegidos.length && (
        <section className="pf-card pf-no-papel">
          <h3>Empieza escogiendo el material <small>un clic en la tarjeta · los de más cajas primero</small></h3>
          <div className="pf-tiles">
            {datos.materiales.slice(0, 12).map((m) => <Tarjeta key={m.codigo} m={m} color={color.get(m.codigo)!} on={false} onClick={() => alterna(m.codigo)} />)}
          </div>
          {datos.materiales.length > 12 && <p className="pf-pista">Hay {datos.materiales.length - 12} materiales más: búscalos con el filtro de arriba.</p>}
        </section>
      )}

      {/* ---- CON MATERIAL: cifras y un bloque por SKU ---- */}
      {elegidos.length > 0 && (
        <>
          <div className="pf-k">
            <div><span>Posiciones a recorrer</span><b>{n0(tModulos)}</b><small>{elegidos.length} material{elegidos.length === 1 ? "" : "es"}</small></div>
            <div><span>Cajas en esas posiciones</span><b>{n0(tCajas)}</b><small>{n1(tEstibas)} estibas</small></div>
            <div className={masViejo && (masViejo.dias ?? 0) > 30 ? "mal" : ""}><span>Más viejo</span><b>{masViejo ? `${n0(masViejo.dias!)} d` : "—"}</b>
              <small>{masViejo ? `${masViejo.ubicacion} · desde ${corta(masViejo.fechaFifo)}` : "sin fecha FIFO"}</small></div>
            <div><span>Primero se sale por</span><b className="pf-mono">{bloques.find((b) => b.filas.length)?.filas[0].r.ubicacion ?? "—"}</b>
              <small>{bloques.find((b) => b.filas.length) ? "el módulo #1 del primer material" : "no hay existencia"}</small></div>
          </div>

          {bloques.map((b) => (
            <section key={b.cod} className="pf-bloque">
              <header className="pf-bloque-cab" style={{ borderLeftColor: color.get(b.cod) }}>
                <div>
                  <span className="pf-cod"><i style={{ background: color.get(b.cod) }} />{b.cod}</span>
                  <h2>{b.material}</h2>
                </div>
                <dl>
                  <div><dt>Posiciones</dt><dd>{n0(b.filas.length)}<small> de {n0(b.totalModulos)}</small></dd></div>
                  <div><dt>Cajas</dt><dd>{n0(b.cajas)}</dd></div>
                  <div><dt>Estibas</dt><dd>{n1(b.estibas)}</dd></div>
                </dl>
              </header>

              {b.filas.length === 0 ? (
                <p className="pf-pista">No hay {b.cod} en {zona || "ninguna zona"} en el conteo del {larga(datos.dia!)}.</p>
              ) : (
                <div className="pf-scroll">
                  <table className="pf-t">
                    <thead>
                      <tr>
                        <th className="c">Salida</th><th>Módulo</th><th>Zona</th><th>Estado</th>
                        <th className="n">Estibas</th><th className="n">Cajas</th><th>Fecha FIFO</th><th>Días en sitio</th>
                        <th>Acumulado</th><th className="c pf-no-papel">✓</th><th className="pf-solo-papel">Tomado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.filas.map(({ r, n, ac }) => {
                        const k = r.id; const hecho = marcas.has(k);
                        return (
                          <tr key={k} className={hecho ? "hecho" : ""}>
                            <td className="c"><span className={"pf-orden" + (n === 1 ? " uno" : "")}>{n}</span></td>
                            <td className="pf-mod">{r.ubicacion}</td>
                            <td>{r.zona}</td>
                            <td>{r.estado ? <span className="pf-est">{r.estado}</span> : <span className="pf-tenue">—</span>}</td>
                            <td className="n">{n1(r.estibas)}</td>
                            <td className="n"><b>{n0(r.cajas)}</b></td>
                            <td>{corta(r.fechaFifo)}</td>
                            <td>
                              <span className={"pf-dias " + tono(r.dias)}>
                                <b>{r.dias == null ? "—" : `${n0(r.dias)} d`}</b>
                                <i><u style={{ width: `${r.dias == null ? 0 : Math.max(4, (r.dias * 100) / b.maxDias)}%` }} /></i>
                              </span>
                            </td>
                            <td>
                              <span className="pf-acum">
                                <b>{n0(ac)}</b>
                                <i><u style={{ width: `${(ac * 100) / b.cajas}%`, background: color.get(b.cod) }} /></i>
                              </span>
                            </td>
                            <td className="c pf-no-papel">
                              <input type="checkbox" aria-label={`Ya tomé ${r.ubicacion}`} checked={hecho}
                                onChange={() => setMarcas((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; })} />
                            </td>
                            <td className="pf-solo-papel pf-caja"><span /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr><td colSpan={4}>TOTAL · {b.cod} · {n0(b.filas.length)} posiciones</td><td className="n">{n1(b.estibas)}</td><td className="n">{n0(b.cajas)}</td><td colSpan={4} /></tr>
                      {b.restoModulos > 0 && <tr className="pf-resto"><td colSpan={4}>Quedan {n0(b.restoModulos)} posiciones más recientes</td><td />
                        <td className="n">{n0(b.restoCajas)}</td><td colSpan={4}>cajas que no se tocan en este plan</td></tr>}
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          ))}

          <div className="pf-ley pf-no-papel">
            <span><i className="v" />0–15 días</span><span><i className="a" />16–30</span><span><i className="m" />31–60</span><span><i className="r" />+60 días</span>
            <span className="pf-tenue">Salida #1 = el que más tiempo lleva en su módulo (fecha FIFO más vieja). «Acumulado» = cajas si tomas del #1 hasta ese módulo.</span>
          </div>
          <p className="pf-pie-papel pf-solo-papel">Salida #1 = el que más tiempo lleva en su módulo (fecha FIFO más vieja) · Acumulado = cajas desde el #1 hasta ese módulo.</p>
        </>
      )}
    </>
  );
}

function Tarjeta({ m, color, on, onClick }: { m: MaterialPlan; color: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={"pf-tile" + (on ? " on" : "")} aria-pressed={on} onClick={onClick} style={{ borderTopColor: color }}>
      <span className="pf-cod"><i style={{ background: color }} />{m.codigo}</span>
      <strong>{m.material}</strong>
      <small>{n0(m.cajas)} cajas · {n0(m.modulos)} módulos</small>
      <em className={tono(m.maxDias)}>{m.maxDias == null ? "sin fecha FIFO" : `más viejo ${n0(m.maxDias)} d`}</em>
    </button>
  );
}

/** El filtro de material, igual que el de La base: busca, cuenta cajas, marca varios y se aplica. */
function FiltroMaterial({ materiales, elegidos, color, aplicar, cerrar }: {
  materiales: MaterialPlan[]; elegidos: string[]; color: Map<string, string>;
  aplicar: (l: string[]) => void; cerrar: () => void;
}) {
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState<string[]>(elegidos);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) cerrar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    const t = setTimeout(() => document.addEventListener("mousedown", fuera), 0);
    document.addEventListener("keydown", tecla);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [cerrar]);

  const vistos = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? materiales.filter((m) => `${m.codigo} ${m.material}`.toLowerCase().includes(t)) : materiales;
  }, [materiales, q]);
  const llena = marca.length >= MAX_SKU;
  const alterna = (c: string) => setMarca((l) => (l.includes(c) ? l.filter((x) => x !== c) : l.length >= MAX_SKU ? l : [...l, c]));

  return (
    <div className="pf-fc" ref={caja} role="dialog" aria-label="Filtrar material">
      <div className="pf-fc-t">Filtrar · <b>Material</b></div>
      <input className="pf-fc-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código o nombre…"
             onKeyDown={(e) => { if (e.key === "Enter") aplicar(marca); }} />
      <div className="pf-fc-l">
        {vistos.map((m) => {
          const on = marca.includes(m.codigo);
          return (
            <label key={m.codigo} className={!on && llena ? "off" : ""}>
              <input type="checkbox" checked={on} disabled={!on && llena} onChange={() => alterna(m.codigo)} />
              <i style={{ background: color.get(m.codigo) }} />
              <span><b>{m.codigo}</b> · {m.material}</span>
              <em>{n0(m.cajas)}</em>
            </label>
          );
        })}
        {vistos.length === 0 && <p className="pf-fc-mas">Nada con «{q}».</p>}
      </div>
      {llena && <p className="pf-fc-mas">Máximo {MAX_SKU} materiales por hoja.</p>}
      <div className="pf-fc-b">
        <button type="button" className="pf-fc-limpia" onClick={() => aplicar([])} disabled={!elegidos.length}>Quitar filtro</button>
        <span>
          <button type="button" className="pf-sec" onClick={cerrar}>Cancelar</button>
          <button type="button" className="pf-prim" onClick={() => aplicar(marca)}>Aplicar{marca.length ? ` (${marca.length})` : ""}</button>
        </span>
      </div>
    </div>
  );
}
