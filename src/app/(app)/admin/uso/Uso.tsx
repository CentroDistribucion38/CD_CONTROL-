"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerPaleta } from "../../inventario/informe";
import {
  colorModulo, diasDelRango, duracion, haceCuanto, moduloTop, nombreModulo, nombrePantalla, num, rango,
  type UsoDia, type UsoPantalla, type UsoUsuario,
} from "@/modulos/uso/uso";

type Datos = { desde: string; hasta: string; usuarios: UsoUsuario[]; dias: UsoDia[]; pantallas: UsoPantalla[] };
type Rol = { clave: string; nombre: string; manda: boolean };
type Orden = "minutos" | "visitas" | "dias" | "ultimo" | "nombre";
const PERIODOS = [7, 30, 90] as const;

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const fechaCorta = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
const hora = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });

function coloresTema() {
  const P = leerPaleta(document.querySelector(".uso"));
  const hx = (c: number[]) => c.map((v) => v.toString(16).padStart(2, "0")).join("");
  return { tinta: hx(P.tinta), banda: hx(P.cinta[1]?.[1] ?? P.acento) };
}

export function Uso({ hoy, inicial, roles }: { hoy: string; inicial: Datos; roles: Rol[] }) {
  const [datos, setDatos] = useState<Datos>(inicial);
  const [periodo, setPeriodo] = useState<number | "otro">(30);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [rol, setRol] = useState("");
  const [buscar, setBuscar] = useState("");
  const [soloSinUso, setSoloSinUso] = useState(false);
  const [orden, setOrden] = useState<Orden>("minutos");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);

  const nRol = (c: string) => roles.find((r) => r.clave === c)?.nombre ?? c;

  const traer = useCallback(async (d: string, h: string) => {
    if (!d || !h || d > h) { setError("La fecha de inicio no puede ser después de la final."); return }
    setCargando(true); setError("");
    try {
      const sb = createClient();
      const [u, di, p] = await Promise.all([
        sb.rpc("uso_usuarios", { p_desde: d, p_hasta: h }),
        sb.rpc("uso_dias", { p_desde: d, p_hasta: h }),
        sb.rpc("uso_pantallas", { p_desde: d, p_hasta: h }),
      ]);
      const mal = u.error || di.error || p.error;
      if (mal) { setError("No se pudo leer el uso: " + mal.message); return }
      setDatos({ desde: d, hasta: h, usuarios: (u.data ?? []) as UsoUsuario[], dias: (di.data ?? []) as UsoDia[], pantallas: (p.data ?? []) as UsoPantalla[] });
    } catch (e) { setError("No se pudo leer el uso: " + (e instanceof Error ? e.message : String(e))) }
    finally { setCargando(false) }
  }, []);

  const elegir = (n: number) => { const r = rango(n, hoy); setPeriodo(n); setDesde(r.desde); setHasta(r.hasta); void traer(r.desde, r.hasta) };

  const diasRango = useMemo(() => diasDelRango(datos.desde, datos.hasta), [datos.desde, datos.hasta]);

  /* La lista, filtrada y ordenada. */
  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const f = datos.usuarios.filter((p) =>
      (!rol || p.rol === rol) &&
      (!soloSinUso || p.visitas === 0) &&
      (!q || `${p.nombre ?? ""} ${p.usuario ?? ""}`.toLowerCase().includes(q)));
    const k: Record<Orden, (a: UsoUsuario, b: UsoUsuario) => number> = {
      minutos: (a, b) => num(b.minutos) - num(a.minutos) || b.visitas - a.visitas,
      visitas: (a, b) => b.visitas - a.visitas,
      dias: (a, b) => b.dias_activos - a.dias_activos || b.visitas - a.visitas,
      ultimo: (a, b) => (b.ultimo_uso ?? "").localeCompare(a.ultimo_uso ?? ""),
      nombre: (a, b) => (a.nombre ?? a.usuario ?? "").localeCompare(b.nombre ?? b.usuario ?? "", "es"),
    };
    return [...f].sort(k[orden]);
  }, [datos.usuarios, rol, buscar, soloSinUso, orden]);

  const ids = useMemo(() => new Set(filas.map((p) => p.id)), [filas]);
  const total = {
    personas: filas.length,
    usaron: filas.filter((p) => p.visitas > 0).length,
    visitas: filas.reduce((s, p) => s + p.visitas, 0),
    minutos: filas.reduce((s, p) => s + num(p.minutos), 0),
    sin: filas.filter((p) => p.visitas === 0),
  };
  const maxMin = Math.max(1, ...filas.map((p) => num(p.minutos)));

  /* Por módulo, de todos los que se ven. */
  const porModulo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of filas) for (const [k, n] of Object.entries(p.modulos ?? {})) m[k] = (m[k] ?? 0) + n;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filas]);

  const diasDe = useCallback((id: string) => {
    const m = new Map(datos.dias.filter((d) => d.usuario === id).map((d) => [d.dia, d]));
    return diasRango.map((d) => ({ dia: d, visitas: m.get(d)?.visitas ?? 0, minutos: num(m.get(d)?.minutos) }));
  }, [datos.dias, diasRango]);

  const descargar = async () => {
    setBajando(true);
    try {
      const [{ armarUso }, { bajarBlob }, logo] = await Promise.all([
        import("@/modulos/admin/libro-uso"), import("../usuarios/tarjeta"),
        fetch("/marca/logo-b.png").then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
      ]);
      const buf = await armarUso({
        desde: datos.desde, hasta: datos.hasta,
        filtro: [rol ? `rol ${nRol(rol)}` : "", soloSinUso ? "solo quien no la usa" : "", buscar.trim() ? `«${buscar.trim()}»` : ""].filter(Boolean).join(" · ") || undefined,
        personas: filas.map((p) => ({ ...p, rolNombre: nRol(p.rol) })),
        dias: datos.dias.filter((d) => ids.has(d.usuario)),
        pantallas: datos.pantallas.filter((p) => ids.has(p.usuario)),
        sello: logo, colores: coloresTema(),
      });
      bajarBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `uso-control-${datos.desde}-a-${datos.hasta}.xlsx`);
    } catch (e) { setError("No se pudo armar el Excel: " + (e instanceof Error ? e.message : String(e))) }
    finally { setBajando(false) }
  };

  const th = (k: Orden, t: string, cls = "") => (
    <th className={cls} aria-sort={orden === k ? "descending" : "none"}>
      <button type="button" className={orden === k ? "on" : ""} onClick={() => setOrden(k)}>{t}{orden === k ? " ↓" : ""}</button>
    </th>
  );

  return (
    <>
      {/* FILTROS */}
      <section className="tarjeta us-filtros">
        <div className="us-seg" role="group" aria-label="Periodo">
          {PERIODOS.map((n) => (
            <button key={n} type="button" className={periodo === n ? "on" : ""} onClick={() => elegir(n)}>Últimos {n} días</button>
          ))}
          <button type="button" className={periodo === "otro" ? "on" : ""} onClick={() => setPeriodo("otro")}>Otro rango</button>
        </div>
        {periodo === "otro" && (
          <div className="us-fechas">
            <label><span>Desde</span><input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
            <label><span>Hasta</span><input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} /></label>
            <button type="button" className="btn" onClick={() => void traer(desde, hasta)} disabled={cargando}>Ver</button>
          </div>
        )}
        <div className="us-fila2">
          <label><span>Rol</span>
            <select value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="">Todos</option>
              {roles.map((r) => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}
            </select>
          </label>
          <label className="us-buscar"><span>Buscar</span>
            <input type="search" value={buscar} placeholder="Nombre o usuario" onChange={(e) => setBuscar(e.target.value)} />
          </label>
          <label><span>Ordenar por</span>
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              <option value="minutos">Tiempo activo</option><option value="visitas">Visitas</option>
              <option value="dias">Días con uso</option><option value="ultimo">Último uso</option><option value="nombre">Nombre</option>
            </select>
          </label>
          <label className="us-check"><input type="checkbox" checked={soloSinUso} onChange={(e) => setSoloSinUso(e.target.checked)} /><span>Solo quien no la usa</span></label>
          <button type="button" className="btn us-excel" onClick={() => void descargar()} disabled={bajando || cargando || filas.length === 0}>
            {bajando ? "Armando…" : "Descargar Excel"}
          </button>
        </div>
        <p className="us-rango">
          {fechaCorta(datos.desde)} → {fechaCorta(datos.hasta)} · {diasRango.length} días{cargando ? " · actualizando…" : ""}
        </p>
        {error && <div className="aviso mal" role="alert">{error}</div>}
      </section>

      {/* CIFRAS */}
      <div className="us-cifras">
        <div className="us-cifra"><i>Entraron</i><b>{total.usaron}<small> de {total.personas}</small></b><span>personas activas</span></div>
        <div className="us-cifra"><i>Visitas</i><b>{nf.format(total.visitas)}</b><span>pantallas abiertas</span></div>
        <div className="us-cifra"><i>Tiempo activo</i><b>{duracion(total.minutos)}</b><span>con la pantalla a la vista y en uso</span></div>
        <div className={"us-cifra" + (total.sin.length ? " alerta" : "")}><i>No la usan</i><b>{total.sin.length}</b>
          <span>{total.sin.length ? total.sin.slice(0, 3).map((p) => p.nombre || p.usuario).join(", ") + (total.sin.length > 3 ? "…" : "") : "todas entraron en el periodo"}</span></div>
      </div>

      {/* POR MÓDULO */}
      {porModulo.length > 0 && (
        <section className="tarjeta">
          <div className="cab"><div><h2>Qué módulos se abren</h2><p>Visitas de las personas que se ven abajo, por módulo.</p></div></div>
          <ul className="us-mods">
            {porModulo.map(([id, n]) => (
              <li key={id}>
                <span className="n">{nombreModulo(id)}</span>
                <span className="barra"><i style={{ width: `${(n / porModulo[0][1]) * 100}%`, background: colorModulo(id) }} /></span>
                <b>{nf.format(n)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* LA TABLA */}
      <section className="tarjeta">
        <div className="cab"><div><h2>Por persona</h2><p>Toca una fila para ver sus módulos, sus pantallas y los días que entró.</p></div></div>
        {filas.length === 0 ? <p className="us-vacio">No hay personas con ese filtro.</p> : (
          <div className="us-tabla">
            <table>
              <thead>
                <tr>
                  {th("nombre", "Persona")}<th>Rol</th>{th("ultimo", "Último uso")}{th("dias", "Días con uso", "d")}
                  {th("visitas", "Visitas", "d")}{th("minutos", "Tiempo activo", "d")}<th>Más usa</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => {
                  const top = moduloTop(p.modulos);
                  const abre = abierto === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr className={(abre ? "abierta " : "") + (p.visitas === 0 ? "nada" : "")} onClick={() => setAbierto(abre ? null : p.id)}>
                        <td><button type="button" className="us-nom" aria-expanded={abre} onClick={(e) => { e.stopPropagation(); setAbierto(abre ? null : p.id) }}>
                          <b>{p.nombre || p.usuario}</b><i>{p.usuario}</i></button></td>
                        <td data-l="Rol"><span className="us-rol">{nRol(p.rol)}</span></td>
                        <td data-l="Último uso" className={p.ultimo_uso ? "" : "mal"}>{haceCuanto(p.ultimo_uso)}</td>
                        <td data-l="Días con uso" className="d">{p.dias_activos}<small> / {diasRango.length}</small></td>
                        <td data-l="Visitas" className="d">{nf.format(p.visitas)}</td>
                        <td data-l="Tiempo activo" className="d">
                          <span className="us-min"><i style={{ width: `${(num(p.minutos) / maxMin) * 100}%` }} /></span>
                          {duracion(num(p.minutos))}
                        </td>
                        <td data-l="Más usa">{top ? <span className="us-chip" style={{ borderColor: colorModulo(top), color: "inherit" }}><i style={{ background: colorModulo(top) }} />{nombreModulo(top)}</span> : "—"}</td>
                      </tr>
                      {abre && (
                        <tr className="us-detalle"><td colSpan={7}><Detalle p={p} dias={diasDe(p.id)} pantallas={datos.pantallas.filter((x) => x.usuario === p.id)} /></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="us-nota">
        El día cuenta en hora de Colombia. «Tiempo activo» suma solo los momentos en que la pantalla estaba a la vista y la persona
        la estaba usando; una pestaña olvidada abierta no cuenta. Lo anterior al día en que se corrió el archivo de uso no se puede reconstruir.
      </p>
    </>
  );
}

function Detalle({ p, dias, pantallas }: { p: UsoUsuario; dias: { dia: string; visitas: number; minutos: number }[]; pantallas: UsoPantalla[] }) {
  const mods = Object.entries(p.modulos ?? {}).sort((a, b) => b[1] - a[1]);
  const top = [...pantallas].sort((a, b) => b.visitas - a.visitas || num(b.minutos) - num(a.minutos)).slice(0, 8);
  const maxD = Math.max(1, ...dias.map((d) => d.minutos));
  if (p.visitas === 0) return <p className="us-vacio">No entró a CONTROL en este periodo.{p.ultimo_uso ? ` Su último uso fue ${haceCuanto(p.ultimo_uso)} (${hora(p.ultimo_uso)}).` : " Nunca ha entrado desde que se anota el uso."}</p>;
  return (
    <div className="us-det">
      <div>
        <h3>Módulos</h3>
        <ul className="us-mods chico">
          {mods.map(([id, n]) => (
            <li key={id}><span className="n">{nombreModulo(id)}</span>
              <span className="barra"><i style={{ width: `${(n / mods[0][1]) * 100}%`, background: colorModulo(id) }} /></span><b>{n}</b></li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Pantallas que más abre</h3>
        <table className="us-pant">
          <tbody>
            {top.map((x) => (
              <tr key={x.ruta}><td>{nombrePantalla(x.ruta)}</td><td className="d">{x.visitas} {x.visitas === 1 ? "vez" : "veces"}</td><td className="d">{duracion(num(x.minutos))}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ancho">
        <h3>Día por día <small>más oscuro = más tiempo activo · último uso {hora(p.ultimo_uso!)}</small></h3>
        <div className="us-dias" role="img" aria-label="Tiempo activo por día">
          {dias.map((d) => (
            <i key={d.dia} title={`${fechaCorta(d.dia)} · ${d.visitas} visitas · ${duracion(d.minutos)}`}
               className={d.visitas ? "on" : ""} style={d.visitas ? { opacity: 0.25 + 0.75 * (d.minutos / maxD) } : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}
