"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { textoVenc, compensarCruce, type FilaCruce } from "@/modulos/inventario/fiscal-cruce";
import {
  armarModulos, horaCorta, renglonDesdeBD, TEXTO_MOD,
  type EstadoMod, type Modulo, type RenglonBd, type RenglonBdBD, type RevMin,
} from "@/modulos/inventario/bd-fiscal";

/* ===================================================================
   LA BD DEL FISCAL

   Lo que contó cada persona de una hoja, lado a lado: el operador a la izquierda, Bavaria a la derecha, por módulo y por código.
   Desde aquí el fiscal compara, manda a validar, aprueba (con el conteo de quien quede como definitivo), mira la foto, la hora real
   y quién contó, y descarga todo en Excel. Lo que ya está en La base no cambia: esto es para analizar y decidir.
   =================================================================== */
export type HojaBd = {
  numero: number; id: string | null; calle?: string; ol: string; bavaria: string;
  /** El cruce de la hoja; null = todavía no se cruza (las dos personas no han terminado). */
  filas: FilaCruce[] | null;
};

const NF = new Intl.NumberFormat("es-CO");
const ROJO = "#b71c1c", VERDE = "#0b7a3e", AMBAR = "#b7791f", GRIS = "rgba(127,127,127,.14)";
const COLOR: Record<EstadoMod, string> = {
  contando: "#6b7280", coincide: VERDE, compensado: VERDE, difiere: ROJO, validando: ROJO, respondida: AMBAR, aprobado: VERDE,
};
type FiltroBd = "todo" | "difiere" | "solo-ol" | "solo-bav" | "compensado" | "coincide" | "aprobado";
const FILTROS: [FiltroBd, string][] = [
  ["todo", "Todo"], ["difiere", "Difiere"], ["solo-ol", "Solo operador"], ["solo-bav", "Solo Bavaria"],
  ["compensado", "Compensado"], ["coincide", "Coincide"], ["aprobado", "Aprobado"],
];
const signo = (v: number) => (v === 0 ? "0" : (v > 0 ? "+" : "") + NF.format(v));

export function BdFiscal({ nombre, fecha, hojas, revs, puedeEditar, compensar, onCompensar, onCambio, actualizado, quien }: {
  nombre: string; fecha: string; hojas: HojaBd[]; revs: (RevMin & { ubicacion_id: string })[]; puedeEditar: boolean;
  compensar: Record<number, boolean>; onCompensar: (numero: number, v: boolean) => void; onCambio: () => Promise<void>;
  /** Cambia cada vez que el panel refresca (para volver a leer lo contado). */
  actualizado: number; quien: string;
}) {
  const conId = hojas.filter((h) => !!h.id);
  const [num, setNum] = useState<number | null>(null);
  const hoja = conId.find((h) => h.numero === num) ?? conId[0] ?? null;
  const [raw, setRaw] = useState<RenglonBd[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState<FiltroBd>("todo");
  const [q, setQ] = useState("");
  const [armando, setArmando] = useState<"hoja" | "todas" | null>(null);

  const leer = useCallback(async (h: HojaBd): Promise<RenglonBd[] | null> => {
    const { data, error } = await createClient().rpc("inv_fiscal_bd_hoja", { p_hoja: h.id });
    if (error) {
      setMal(/inv_fiscal_bd_hoja|schema cache|does not exist|no existe la funci/i.test(error.message) ? "Falta correr 2026-10-fiscal-TODO.sql en Supabase." : traducirError(error.message));
      return null;
    }
    return ((data ?? []) as RenglonBdBD[]).map(renglonDesdeBD);
  }, []);

  useEffect(() => {
    if (!hoja) return;
    let vivo = true;
    setCargando(true);
    void leer(hoja).then((r) => { if (vivo) { if (r) { setRaw(r); setMal(null) } setCargando(false) } });
    return () => { vivo = false };
  }, [hoja?.id, actualizado, leer]); // eslint-disable-line react-hooks/exhaustive-deps

  const compensando = !!hoja && !!compensar[hoja.numero];
  const pares = useMemo(() => (hoja?.filas ? compensarCruce(hoja.filas).pares : 0), [hoja]);
  const modulos = useMemo(() => (hoja ? armarModulos(raw, hoja.filas, revs, hoja.numero, compensando) : []), [raw, hoja, revs, compensando]);

  const cuenta = (e: EstadoMod) => modulos.filter((m) => m.estado === e).length;
  const tOl = modulos.reduce((t, m) => t + m.sumOl, 0), tBav = modulos.reduce((t, m) => t + m.sumBav, 0);
  const abiertos = modulos.filter((m) => ["difiere", "validando", "respondida"].includes(m.estado)).length;
  const verdes = modulos.filter((m) => m.estado === "coincide" || m.estado === "compensado");

  const cumple = (m: Modulo): boolean => {
    const t = q.trim().toLowerCase();
    if (t && !(m.clave.toLowerCase().includes(t) || m.skus.some((s) => s.sku.toLowerCase().includes(t) || s.material.toLowerCase().includes(t)))) return false;
    switch (filtro) {
      case "difiere": return ["difiere", "validando", "respondida"].includes(m.estado);
      case "solo-ol": return m.skus.some((s) => s.solo === "OL");
      case "solo-bav": return m.skus.some((s) => s.solo === "BAVARIA");
      case "compensado": return m.estado === "compensado";
      case "coincide": return m.estado === "coincide";
      case "aprobado": return m.estado === "aprobado";
      default: return true;
    }
  };
  const vistos = modulos.filter(cumple);

  async function verFoto(ruta: string) {
    const w = window.open("", "_blank");
    const { data, error } = await createClient().storage.from("inventario").createSignedUrl(ruta, 600);
    if (error || !data?.signedUrl) { w?.close(); setMal("No pude abrir la foto: " + (error?.message ?? "sin enlace")); return }
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  }

  async function accion(fn: "inv_fiscal_validar" | "inv_fiscal_aprobar", ubis: (string | null)[], extra: Record<string, unknown>, listo: string) {
    if (!hoja?.id) return;
    const ids = ubis.filter((x): x is string => !!x);
    setMal(null); setOk(null);
    if (ids.length === 0 || ids.length !== ubis.length) { setMal("No se pudo identificar alguna ubicación. Actualiza la pantalla e intenta de nuevo."); return }
    setOcupado(true);
    const { error } = await createClient().rpc(fn, { p_hoja: hoja.id, p_ubicaciones: ids, ...extra });
    setOcupado(false);
    if (error) { setMal(traducirError(error.message)); return }
    setOk(listo);
    await onCambio();
    const r = await leer(hoja); if (r) setRaw(r);
  }
  const validar = (m: Modulo) => accion("inv_fiscal_validar", [m.ubicacionId], { p_nota: null }, `${m.clave} enviado a validar. Las dos personas lo ven en Contar.`);
  const aprobar = (m: Modulo, con: "OL" | "BAVARIA" | null) => accion("inv_fiscal_aprobar", [m.ubicacionId],
    { p_forzar: false, ...(con ? { p_adoptar: con } : {}), ...(compensando ? { p_compensar: true } : {}) },
    `${m.clave} aprobado${con ? ` con lo de ${con === "OL" ? (hoja?.ol || "el operador") : (hoja?.bavaria || "Bavaria")}` : ""}.`);
  const aprobarVerdes = () => accion("inv_fiscal_aprobar", verdes.map((m) => m.ubicacionId),
    { p_forzar: true, ...(compensando ? { p_compensar: true } : {}) }, `${verdes.length} ${verdes.length === 1 ? "módulo aprobado" : "módulos aprobados"}.`);

  async function excel(que: "hoja" | "todas") {
    if (!hoja) return;
    setMal(null); setOk(null); setArmando(que);
    try {
      const lista = que === "hoja" ? [hoja] : conId;
      const hojasX = [];
      for (const h of lista) {
        const r = h.numero === hoja.numero ? raw : await leer(h);
        if (!r) throw new Error("No se pudo leer la hoja " + h.numero);
        hojasX.push({ numero: h.numero, calle: h.calle ?? "", ol: h.ol, bavaria: h.bavaria, modulos: armarModulos(r, h.filas, revs, h.numero, !!compensar[h.numero]), renglones: r });
      }
      const { armarBdExcel } = await import("@/modulos/inventario/bd-fiscal-xlsx");
      const buf = await armarBdExcel({ nombre, fecha, quien, hojas: hojasX });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = que === "hoja" ? `bd-fiscal-${fecha}-hoja-${hoja.numero}.xlsx` : `bd-fiscal-${fecha}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setOk(que === "hoja" ? `Excel de la hoja ${hoja.numero} listo.` : `Excel de las ${hojasX.length} hojas listo.`);
    } catch (e) {
      setMal(e instanceof Error && e.message ? traducirError(e.message) : "No se pudo armar el Excel.");
    } finally { setArmando(null) }
  }

  if (!hoja) {
    return <p className="fe-vacio">Todavía no hay hojas con conteo. Cuando las parejas empiecen a contar, aquí ves lo de cada una lado a lado.</p>;
  }

  const linea = (r: RenglonBd) => (
    <li key={r.id} className="bd-reng">
      <b>{NF.format(r.total)}</b> <span>cajas</span>
      <small>
        {r.estibas > 0 || r.saldo > 0 ? ` · ${r.estibas} est + ${r.saldo} saldo + ${r.cajas} sueltas` : ""}
        {" · "}{textoVenc(r.vencDia, r.vencMes, r.vencAnio)}
        {r.averia && <em className="bd-marca"> · AVERÍA</em>}{r.pnc && <em className="bd-marca"> · PNC</em>}{r.estadoEnvase && <em className="bd-marca"> · {r.estadoEnvase}</em>}
        {" · "}{horaCorta(r.contadoEn)}
      </small>
      {r.ruta && <button type="button" className="fe-mini" onClick={() => verFoto(r.ruta!)} title="Foto del renglón">Foto</button>}
      {r.nota && <small className="bd-nota"> · «{r.nota}»</small>}
    </li>
  );

  return (
    <div role="tabpanel" className="bd">
      <style>{`
        .bd{display:flex;flex-direction:column;gap:14px}
        .bd *{border-radius:0}
        .bd-barra{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .bd-barra .bd-der{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
        .bd-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
        .bd-tile{padding:10px 12px;background:${GRIS};border-left:4px solid currentColor}
        .bd-tile b{display:block;font-size:1.5rem;line-height:1.1}
        .bd-tile small{opacity:.75}
        .bd-filtros{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .bd-filtros input{padding:7px 10px;min-width:200px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit}
        .bd-mod{border:1px solid rgba(127,127,127,.35);border-left-width:6px}
        .bd-cab{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 12px;background:${GRIS}}
        .bd-cab h4{margin:0;font-size:1.15rem}
        .bd-est{color:#fff;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px}
        .bd-tot{opacity:.85;font-size:.9rem}
        .bd-acc{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
        .bd-tabla{width:100%;border-collapse:collapse}
        .bd-tabla th{text-align:left;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;padding:8px 12px;opacity:.75}
        .bd-tabla td{vertical-align:top;padding:8px 12px;border-top:1px solid rgba(127,127,127,.25)}
        .bd-tabla td.bd-dif{text-align:right;white-space:nowrap;font-weight:800}
        .bd-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
        .bd-reng small{opacity:.8}
        .bd-marca{font-style:normal;font-weight:700;color:${AMBAR}}
        .bd-vacio{opacity:.55;font-style:italic}
        .bd-sub{display:block;opacity:.7;font-size:.8rem;margin-top:2px}
        @media (max-width:760px){.bd-tabla,.bd-tabla tbody,.bd-tabla tr,.bd-tabla td{display:block;width:100%}.bd-tabla thead{display:none}.bd-tabla td.bd-dif{text-align:left}}
      `}</style>

      <div className="bd-barra" role="tablist" aria-label="Hojas">
        {conId.map((h) => (
          <button key={h.numero} type="button" role="tab" aria-selected={h.numero === hoja.numero} className={"btn " + (h.numero === hoja.numero ? "" : "plano")}
                  onClick={() => { setNum(h.numero); setFiltro("todo"); setQ("") }}
                  title={`${h.ol || "—"} · ${h.bavaria || "—"}`}>
            Hoja {h.numero}{h.calle ? ` · ${h.calle}` : ""}{!h.filas ? " · contando" : ""}
          </button>
        ))}
        <span className="bd-der">
          <button type="button" className="btn plano" disabled={armando !== null || cargando} onClick={() => excel("hoja")}>{armando === "hoja" ? "Armando…" : "Excel de esta hoja"}</button>
          <button type="button" className="btn plano" disabled={armando !== null || cargando} onClick={() => excel("todas")}>{armando === "todas" ? "Armando…" : "Excel de todas las hojas"}</button>
        </span>
      </div>

      <div className="bd-tiles" aria-label="Resumen de la hoja">
        <div className="bd-tile"><b>{modulos.length}</b><small>módulos contados</small></div>
        <div className="bd-tile" style={{ color: VERDE }}><b>{cuenta("coincide")}</b><small>coinciden</small></div>
        <div className="bd-tile" style={{ color: ROJO }}><b>{abiertos}</b><small>por resolver</small></div>
        <div className="bd-tile" style={{ color: VERDE }}><b>{cuenta("compensado")}</b><small>compensados</small></div>
        <div className="bd-tile" style={{ color: VERDE }}><b>{cuenta("aprobado")}</b><small>aprobados</small></div>
        <div className="bd-tile"><b>{NF.format(tOl)}</b><small>cajas · {hoja.ol || "operador"}</small></div>
        <div className="bd-tile"><b>{NF.format(tBav)}</b><small>cajas · {hoja.bavaria || "Bavaria"}</small></div>
        <div className="bd-tile" style={{ color: tOl - tBav === 0 ? VERDE : ROJO }}><b>{signo(tOl - tBav)}</b><small>diferencia neta</small></div>
      </div>

      <div className="bd-filtros" role="group" aria-label="Filtrar">
        {FILTROS.map(([k, et]) => (
          <button key={k} type="button" className={"btn " + (filtro === k ? "" : "plano")} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{et}</button>
        ))}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, material o módulo…" aria-label="Buscar" />
        {puedeEditar && pares > 0 && hoja.filas && (
          <button type="button" className="btn plano" aria-pressed={compensando} onClick={() => onCompensar(hoja.numero, !compensando)}
                  title="Da por compensadas las diferencias del mismo código que cuadran en total o son iguales y contrarias">
            {compensando ? `Quitar la compensación (${pares})` : `Compensar (${pares} ${pares === 1 ? "par" : "pares"})`}
          </button>
        )}
        {puedeEditar && verdes.length > 0 && (
          <button type="button" className="btn" disabled={ocupado} onClick={aprobarVerdes} style={{ background: VERDE, color: "#fff" }}
                  title="Aprueba de una vez todo lo que está en verde (coincide o compensado)">
            ✓ Aprobar lo verde ({verdes.length})
          </button>
        )}
      </div>

      {mal && <p className="cl-mal" role="alert">{mal}</p>}
      {ok && <p className="cl-nota" role="status">{ok}</p>}
      {cargando && raw.length === 0 && <p className="fe-vacio">Cargando lo contado…</p>}
      {!cargando && raw.length === 0 && !mal && <p className="fe-vacio">Esta hoja todavía no tiene renglones contados.</p>}

      {vistos.map((m) => (
        <section key={m.clave} className="bd-mod" style={{ borderLeftColor: COLOR[m.estado] }} aria-label={`Módulo ${m.clave}`}>
          <header className="bd-cab">
            <h4>{m.clave}</h4>
            <span className="bd-est" style={{ background: COLOR[m.estado] }}>{m.estado === "compensado" || m.estado === "coincide" || m.estado === "aprobado" ? "✓ " : ""}{TEXTO_MOD[m.estado]}</span>
            {m.estado === "validando" || m.estado === "respondida" ? <small>Ronda {m.ronda}</small> : null}
            {m.estado === "aprobado" && (m.aprobadoCon || m.compensadoAlAprobar) && (
              <small>{m.aprobadoCon ? `con lo de ${m.aprobadoCon === "OL" ? (hoja.ol || "el operador") : (hoja.bavaria || "Bavaria")}` : "compensado"}</small>
            )}
            <span className="bd-tot">Operador {NF.format(m.sumOl)} · Bavaria {NF.format(m.sumBav)} · <b style={{ color: m.dif === 0 ? VERDE : (m.estado === "compensado" ? VERDE : ROJO) }}>{signo(m.dif)}</b></span>
            {puedeEditar && (
              <span className="bd-acc">
                {(m.estado === "difiere" || m.estado === "respondida") && <button type="button" className="btn plano" disabled={ocupado} onClick={() => validar(m)}>Mandar a validar</button>}
                {(m.estado === "difiere" || m.estado === "respondida" || m.estado === "validando") && (
                  <>
                    <button type="button" className="btn plano" disabled={ocupado} onClick={() => aprobar(m, "OL")}>Aprobar con lo de {hoja.ol || "el operador"}</button>
                    <button type="button" className="btn plano" disabled={ocupado} onClick={() => aprobar(m, "BAVARIA")}>Aprobar con lo de {hoja.bavaria || "Bavaria"}</button>
                  </>
                )}
                {(m.estado === "coincide" || m.estado === "compensado") && (
                  <button type="button" className="btn" disabled={ocupado} onClick={() => aprobar(m, null)} style={{ background: VERDE, color: "#fff" }}>✓ Aprobar</button>
                )}
              </span>
            )}
          </header>
          <table className="bd-tabla">
            <thead>
              <tr><th>Código</th><th>Operador · {hoja.ol || "—"}</th><th>Bavaria · {hoja.bavaria || "—"}</th><th style={{ textAlign: "right" }}>Diferencia</th></tr>
            </thead>
            <tbody>
              {m.skus.map((s) => (
                <tr key={s.sku}>
                  <td><b>{s.sku}</b> {s.material}{s.solo && <span className="bd-sub">Solo lo anotó {s.solo === "OL" ? "el operador" : "Bavaria"}</span>}</td>
                  <td>
                    {s.ol.length === 0 ? <span className="bd-vacio">no anotó</span> : (
                      <>
                        <ul className="bd-lista">{s.ol.map(linea)}</ul>
                        {s.ol.length > 1 && <span className="bd-sub">Suma: {NF.format(s.sumOl)}</span>}
                      </>
                    )}
                  </td>
                  <td>
                    {s.bav.length === 0 ? <span className="bd-vacio">no anotó</span> : (
                      <>
                        <ul className="bd-lista">{s.bav.map(linea)}</ul>
                        {s.bav.length > 1 && <span className="bd-sub">Suma: {NF.format(s.sumBav)}</span>}
                      </>
                    )}
                  </td>
                  <td className="bd-dif" style={{ color: s.dif === 0 || s.compensado ? VERDE : ROJO }}>
                    {s.dif === 0 ? "✓ 0" : s.compensado ? `✓ ${signo(s.dif)} compensado` : signo(s.dif)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {raw.length > 0 && vistos.length === 0 && <p className="fe-vacio">Ningún módulo coincide con ese filtro.</p>}
    </div>
  );
}
