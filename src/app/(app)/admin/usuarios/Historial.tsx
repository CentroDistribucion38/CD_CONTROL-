"use client";

import { useMemo, useState } from "react";

/**
 * EL HISTORIAL DE PERSONAS — «¿quién le quitó el acceso a ARENOSA?».
 * Cada cambio: a quién, qué (creado, rol, desactivado, clave…), de qué a
 * qué, quién lo hizo y cuándo. Se filtra por persona y por qué pasó.
 */
export type Mov = {
  id: number; a_quien: string | null; a_quien_nombre: string | null; a_quien_usuario: string | null;
  accion: string; detalle: Record<string, unknown>; hecho_nombre: string | null; hecho_en: string;
};
const QUE: Record<string, string> = {
  creado: "Creado", editado: "Editado", rol: "Cambio de rol", activado: "Activado",
  desactivado: "Desactivado", clave: "Clave nueva", eliminado: "Eliminado",
};

export function Historial({ movs, roles, falta }: {
  movs: Mov[]; roles: Record<string, string>; falta: boolean;
}) {
  const [quien, setQuien] = useState("");
  const [que, setQue] = useState("");
  const personas = useMemo(() => [...new Set(movs.map((m) => m.a_quien_nombre || m.a_quien_usuario || ""))].filter(Boolean).sort(), [movs]);
  const lista = movs.filter((m) => (!quien || (m.a_quien_nombre || m.a_quien_usuario) === quien) && (!que || m.accion === que));
  const nr = (c: unknown) => roles[String(c ?? "")] ?? String(c ?? "—");
  const detalle = (m: Mov) => {
    const d = m.detalle ?? {};
    if (m.accion === "rol") return <>{nr(d.de)} <span aria-hidden>→</span> <b>{nr(d.a)}</b></>;
    if (m.accion === "creado") return <>con rol <b>{nr(d.rol)}</b>{d.lote ? " · creado de a varios" : ""}</>;
    if (m.accion === "editado") return Object.entries(d).map(([k, v]) => {
      const x = v as { de?: unknown; a?: unknown };
      return <span key={k} className="cam">{k === "pantallas" ? `pantallas sueltas ${x.de} → ${x.a}` : `${k}: ${x.de ?? "—"} → ${x.a ?? "—"}`}</span>;
    });
    return null;
  };
  return (
    <section className="tarjeta us-hist" id="historial">
      <div className="cab">
        <div>
          <h2>Historial de cambios</h2>
          <p>A quién se le cambió qué, quién lo hizo y cuándo.</p>
        </div>
        {!falta && (
          <div className="us-hist-fil">
            <label><span>Persona</span>
              <select value={quien} onChange={(e) => setQuien(e.target.value)}>
                <option value="">Todas</option>
                {personas.map((p) => <option key={p} value={p}>{p}</option>)}
              </select></label>
            <label><span>Qué pasó</span>
              <select value={que} onChange={(e) => setQue(e.target.value)}>
                <option value="">Todo</option>
                {Object.entries(QUE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
        )}
      </div>
      {falta ? (
        <p className="us-hist-vacio">Empieza a llenarse cuando se corra <code>supabase/migraciones/2026-09-admin-historial.sql</code>.</p>
      ) : lista.length === 0 ? (
        <p className="us-hist-vacio">{movs.length ? "Nada con esos filtros." : "Todavía no hay cambios anotados."}</p>
      ) : (
        <ol className="us-hist-lista">
          {lista.map((m) => (
            <li key={m.id} className={m.accion}>
              <span className="ac">{QUE[m.accion] ?? m.accion}</span>
              <span className="quien"><b>{m.a_quien_nombre || m.a_quien_usuario || "—"}</b>{m.a_quien_usuario && <small>{m.a_quien_usuario}</small>}</span>
              <span className="det">{detalle(m)}</span>
              <span className="por">{m.hecho_nombre ?? "—"}<time>{new Date(m.hecho_en).toLocaleString("es-CO", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" })}</time></span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
