"use client";

import { DUENOS_ENVASE } from "@/modulos/inventario/duenos";
import { useMemo, useState, useTransition } from "react";
import type { LineaConsolidado } from "@/modulos/inventario/balance";
import { reasignarPorDestino } from "./actions";

/**
 * LA HOJA «CONSOLIDADO» DEL BALANCE.
 *
 * «Una hoja que sea el consolidado del inventario, filtrar por SKU y por estado (varios), que
 *  aparezca la cantidad y yo allí hacer las reasignaciones de estado.»
 *
 * Todo lo contado el día escogido, por material · estado · zona · ubicación. Se marcan las líneas
 * (una o varias) y se pasan a otro estado; la reasignación vale para el balance de ese día.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number | null | undefined) => (v == null ? "—" : nf.format(v));
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const BASE = ["BAJA", "LAVADO", "EXTRASUCIO"];
/* A quién pertenece: ANDINA y HEINEKEN también son destino (van a su casco y a la base de Pasivos con esa causal). */
const DESTINOS = [...BASE, "RETORNO", ...DUENOS_ENVASE];

export function Consolidado({ lineas, fecha }: { lineas: LineaConsolidado[]; fecha: string | null }) {
  const [q, setQ] = useState("");
  const [estados, setEstados] = useState<Set<string>>(new Set());
  const [zona, setZona] = useState<"" | "Fábrica" | "Bodega 38">("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "mal"; texto: string } | null>(null);
  const [pending, start] = useTransition();
  /* CUÁNTO PASAR de cada línea marcada: vacío = toda; en cajas o en estibas (si el material tiene cajas por estiba). */
  const [cant, setCant] = useState<Record<string, string>>({});
  const [unidad, setUnidad] = useState<"cajas" | "estibas">("cajas");

  /* Los estados que hay ese día (los tres de siempre primero) y a cuáles se puede pasar. */
  const todos = useMemo(() => {
    const hay = new Set(lineas.map((l) => l.estado));
    return [...BASE.filter((e) => hay.has(e)), ...[...hay].filter((e) => !BASE.includes(e)).sort()];
  }, [lineas]);
  /* La base acepta reasignar a estos (balance_reclasificaciones). */
  const destinos = DESTINOS;

  /* Filtro de SKU: uno o varios códigos (espacio o coma), o palabras del nombre (todas). */
  const terminos = sinTilde(q).split(/[\s,;]+/).filter(Boolean);
  const soloCodigos = terminos.length > 0 && terminos.every((t) => /^\d+$/.test(t));
  const vistas = useMemo(() => lineas.filter((l) => {
    if (estados.size && !estados.has(l.estado)) return false;
    if (zona && l.zona !== zona) return false;
    if (terminos.length) {
      const nombre = sinTilde(l.material ?? "");
      return soloCodigos ? terminos.some((t) => l.codigo.includes(t))
        : terminos.every((t) => l.codigo.includes(t) || nombre.includes(t));
    }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lineas, estados, zona, q]);

  const totCajas = vistas.reduce((t, l) => t + l.cajas, 0);
  const totUnid = vistas.reduce((t, l) => t + (l.unidades ?? 0), 0);
  /* Por estado, lo que muestra el filtro: la cantidad de un vistazo. */
  const porEstado = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of vistas) m.set(l.estado, (m.get(l.estado) ?? 0) + l.cajas);
    return [...m.entries()];
  }, [vistas]);

  const marcadasVistas = vistas.filter((l) => marcadas.has(l.clave));
  const todasMarcadas = vistas.length > 0 && marcadasVistas.length === vistas.length;
  const alternar = (clave: string) => setMarcadas((m) => { const x = new Set(m); if (x.has(clave)) x.delete(clave); else x.add(clave); return x });
  const alternarTodas = () => setMarcadas(todasMarcadas ? new Set() : new Set(vistas.map((l) => l.clave)));
  const alternarEstado = (e: string) => setEstados((s) => { const x = new Set(s); if (x.has(e)) x.delete(e); else x.add(e); return x });

  /* Las cajas que se pasan de una línea (tope: las que tiene). Vacío o inválido = todas. */
  const cajasDe = (l: LineaConsolidado) => {
    const t = (cant[l.clave] ?? "").trim().replace(",", ".");
    if (!t) return l.cajas;
    const x = Number(t);
    if (!Number.isFinite(x) || x <= 0) return l.cajas;
    const c = unidad === "estibas" && l.cpe ? Math.round(x * l.cpe) : Math.floor(x);
    return Math.max(1, Math.min(c, l.cajas));
  };
  const hayParcial = marcadasVistas.some((l) => cajasDe(l) < l.cajas);

  function reasignar(ls: LineaConsolidado[], a: string) {
    if (!ls.length || !a || !fecha) return;
    setAviso(null);
    start(async () => {
      const partes: Record<string, number> = {};
      for (const l of ls) if (l.ids.length === 1 && cajasDe(l) < l.cajas) partes[l.ids[0]] = cajasDe(l);
      const fd = new FormData();
      fd.set("fecha", fecha);
      fd.set("motivo", motivo);
      fd.set("grupos", JSON.stringify([{ estado_nuevo: a, ids: ls.flatMap((l) => l.ids), partes }]));
      const r = await reasignarPorDestino(fd);
      if ("error" in r && r.error) { setAviso({ tipo: "mal", texto: r.error }); return }
      const cajas = ls.reduce((t, l) => t + cajasDe(l), 0);
      setAviso({ tipo: "ok", texto: `${ls.length} línea${ls.length === 1 ? "" : "s"} (${n(cajas)} cajas) pasaron a ${a}.${"pasivos" in r && r.pasivos != null ? ` La Base de pasivos de ese día se actualizó (${r.pasivos} filas del balance).` : ""}` });
      setMarcadas(new Set()); setMotivo(""); setCant({});
    });
  }

  return (
    <div className="bal-conso">
      {/* ---- FILTROS ---- */}
      <div className="bal-conso-filtros">
        <label className="bal-conso-q">
          <span>SKU o material</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="3500005 3500162 · marron 330…" />
        </label>
        <div className="bal-conso-grupo">
          <span>Estado (puedes marcar varios)</span>
          <div className="bal-chips">
            {todos.map((e) => (
              <button key={e} type="button" className={estados.has(e) ? "on" : ""} aria-pressed={estados.has(e)} onClick={() => alternarEstado(e)}>{e}</button>
            ))}
            {estados.size > 0 && <button type="button" className="limpiar" onClick={() => setEstados(new Set())}>Todos</button>}
          </div>
        </div>
        <div className="bal-conso-grupo">
          <span>Zona</span>
          <div className="bal-chips">
            {(["", "Fábrica", "Bodega 38"] as const).map((z) => (
              <button key={z || "todas"} type="button" className={zona === z ? "on" : ""} aria-pressed={zona === z} onClick={() => setZona(z)}>{z || "Todas"}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ---- LA CANTIDAD DE LO FILTRADO ---- */}
      <div className="bal-resumen-bloque">
        <span><b>{n(vistas.length)}</b> líneas</span>
        <span><b>{n(totCajas)}</b> cajas</span>
        <span><b>{n(totUnid)}</b> unidades</span>
        {porEstado.map(([e, c]) => <span key={e} className="bal-conso-est">{e} <b>{n(c)}</b></span>)}
      </div>

      {/* ---- REASIGNAR LO MARCADO ---- */}
      {marcadasVistas.length > 0 && (
        <div className="bal-conso-barra" role="region" aria-label="Reasignar estado">
          <b>{marcadasVistas.length} marcada{marcadasVistas.length === 1 ? "" : "s"} · {n(marcadasVistas.reduce((t, l) => t + cajasDe(l), 0))} cajas{hayParcial ? " (una parte)" : ""}</b>
          <label>Pasar a
            <select value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Escoge el estado…</option>
              {destinos.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" />
          <button type="button" className="bal-btn confirmar" disabled={!destino || pending} onClick={() => reasignar(marcadasVistas, destino)}>
            {pending ? "Guardando…" : "Reasignar"}
          </button>
          <button type="button" className="bal-btn cancelar" onClick={() => { setMarcadas(new Set()); setCant({}) }}>Quitar marcas</button>
          {/* «Que aquí pueda pasar también cantidades, no solo el estado»: cuánto pasar de cada línea marcada. */}
          <div className="bal-conso-partes">
            <p className="bal-conso-partes-t"><b>¿Cuánto pasar?</b> Déjalo vacío para pasar toda la línea, o escribe la cantidad.
              <span className="bal-chips">
                <button type="button" className={unidad === "cajas" ? "on" : ""} aria-pressed={unidad === "cajas"} onClick={() => setUnidad("cajas")}>En cajas</button>
                <button type="button" className={unidad === "estibas" ? "on" : ""} aria-pressed={unidad === "estibas"} onClick={() => setUnidad("estibas")}>En estibas</button>
              </span></p>
            {marcadasVistas.slice(0, 30).map((l) => {
              const sinCpe = unidad === "estibas" && !l.cpe;
              return (
                <label key={l.clave} className="bal-conso-parte">
                  <span className="mono">{l.codigo}</span>
                  <span>{l.ubicacion} · {l.estado}</span>
                  <span className="tiene">tiene {n(l.cajas)} cajas{l.cpe ? ` (${n(Math.round((l.cajas / l.cpe) * 10) / 10)} estibas)` : ""}</span>
                  <input inputMode="decimal" value={cant[l.clave] ?? ""} disabled={l.ids.length !== 1 || sinCpe}
                    onChange={(e) => setCant((c) => ({ ...c, [l.clave]: e.target.value }))}
                    placeholder={unidad === "estibas" && l.cpe ? `todas (${n(Math.round((l.cajas / l.cpe) * 10) / 10)})` : `todas (${n(l.cajas)})`}
                    aria-label={`Cuánto pasar de ${l.codigo} ${l.ubicacion}`} />
                  <span className="unid">{unidad === "estibas" ? "estibas" : "cajas"}{cant[l.clave]?.trim() ? ` = ${n(cajasDe(l))} cajas` : ""}{sinCpe ? " · sin cajas por estiba" : ""}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      {aviso && <p className={`bal-conso-aviso ${aviso.tipo}`} role="status">{aviso.texto}</p>}

      {/* ---- LA HOJA ---- */}
      <div className="bal-tabla-wrap">
        <table className="bal-tabla bal-hoja">
          <thead>
            <tr>
              <th className="bal-col-chk"><input type="checkbox" aria-label="Marcar todas" checked={todasMarcadas} onChange={alternarTodas} /></th>
              <th>Código</th>
              <th>Material</th>
              <th>Estado</th>
              <th>Zona</th>
              <th>Ubicación</th>
              <th className="r">Estibas</th>
              <th className="r">Sueltas</th>
              <th className="r">Saldo</th>
              <th className="r">Total cajas</th>
              <th className="r">Unidades</th>
              <th>Recorrido</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {vistas.map((l) => (
              <tr key={l.clave} className={marcadas.has(l.clave) ? "marcada" : ""} onClick={() => alternar(l.clave)}>
                <td className="bal-col-chk"><input type="checkbox" aria-label={`Marcar ${l.codigo} ${l.ubicacion}`} checked={marcadas.has(l.clave)} onChange={() => alternar(l.clave)} onClick={(e) => e.stopPropagation()} /></td>
                <td className="mono">{l.codigo}</td>
                <td>{l.material ?? "—"}</td>
                <td>
                  <b>{l.estado}</b>
                  {l.reasignado && <span className="bal-conso-antes" title="Reasignado en el balance">antes {l.contado}</span>}
                </td>
                <td>{l.zona}</td>
                <td className="mono">{l.ubicacion}</td>
                <td className="r">{l.estibas ? n(l.estibas) : "—"}</td>
                <td className="r">{l.sueltas ? n(l.sueltas) : "—"}</td>
                <td className="r">{l.saldo ? n(l.saldo) : "—"}</td>
                <td className="r"><b>{n(l.cajas)}</b></td>
                <td className="r">{n(l.unidades)}</td>
                <td className="mono">{l.recorrido ?? "—"}</td>
                <td className="bal-conso-nota">{l.nota || "—"}</td>
              </tr>
            ))}
            {vistas.length === 0 && (
              <tr><td colSpan={13} className="bal-sin-filas">Nada con ese filtro en el conteo de este día.</td></tr>
            )}
          </tbody>
          {vistas.length > 1 && (
            <tfoot>
              <tr>
                <td colSpan={6}><b>Total del filtro</b> · {vistas.length} renglones</td>
                <td className="r"><b>{n(vistas.reduce((t, l) => t + (l.estibas ?? 0), 0))}</b></td>
                <td></td><td></td>
                <td className="r"><b>{n(totCajas)}</b></td>
                <td className="r"><b>{n(totUnid)}</b></td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
