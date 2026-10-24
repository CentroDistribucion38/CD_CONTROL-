"use client";

import { useMemo, useState, useTransition } from "react";
import type { MaestroPasivo } from "@/modulos/pasivos/datos";
import { borrarMaestro, guardarMaestro } from "../actions";
import { Confirmar } from "../Confirmar";

/**
 * EL MAESTRO DE PASIVOS, como la hoja MAESTRO del Excel: cada celda se edita en el sitio y la fila se
 * guarda con su botón. Lo que se cambia aquí cambia de una vez la base (descripción, HL, cajas, costo).
 */
type Campo = keyof MaestroPasivo;
const COLS: { k: Campo; t: string; num?: boolean; ancho?: number }[] = [
  { k: "codigo", t: "Código" }, { k: "material", t: "Material" }, { k: "descripcion", t: "Descripción", ancho: 260 },
  { k: "familia", t: "Familia" }, { k: "unidades_por_caja", t: "Und por caja", num: true }, { k: "plancha", t: "Plancha", num: true },
  { k: "alto", t: "Alto", num: true }, { k: "cajas_por_estiba", t: "Estd", num: true }, { k: "tipo", t: "Tipo" },
  { k: "hl_unidad", t: "HL", num: true }, { k: "caja", t: "Caja" }, { k: "costo", t: "Costo", num: true },
];
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const VACIA: MaestroPasivo = { codigo: "", material: "", descripcion: "", familia: "Envase", unidades_por_caja: null, plancha: null, alto: null, cajas_por_estiba: null, tipo: "EER", hl_unidad: null, caja: null, costo: null, activo: true };

export function MaestroPasivos({ filas, error, puedeEditar }: { filas: MaestroPasivo[]; error: string | null; puedeEditar: boolean }) {
  const [cambios, setCambios] = useState<Record<string, MaestroPasivo>>({});
  const [nueva, setNueva] = useState<MaestroPasivo | null>(null);
  const [q, setQ] = useState("");
  const [quitando, setQuitando] = useState<MaestroPasivo | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "mal"; texto: string } | null>(null);
  const [pending, start] = useTransition();

  const vistas = useMemo(() => {
    const t = sinTilde(q.trim());
    return filas.filter((f) => !t || f.codigo.includes(t) || sinTilde(f.descripcion).includes(t));
  }, [filas, q]);

  const valor = (f: MaestroPasivo, k: Campo) => { const v = (cambios[f.codigo] ?? f)[k]; return v == null ? "" : String(v) };
  const poner = (f: MaestroPasivo, k: Campo, v: string) => setCambios((c) => ({ ...c, [f.codigo]: { ...(c[f.codigo] ?? f), [k]: v } as MaestroPasivo }));

  function guardar(f: MaestroPasivo) {
    start(async () => {
      const r = await guardarMaestro(JSON.stringify(f));
      if ("error" in r && r.error) { setAviso({ tipo: "mal", texto: r.error }); return }
      setCambios((c) => { const x = { ...c }; delete x[f.codigo]; return x });
      setNueva(null);
      setAviso({ tipo: "ok", texto: `${f.codigo} guardado.` });
    });
  }
  function borrar(f: MaestroPasivo) {
    start(async () => {
      const r = await borrarMaestro(f.codigo);
      setQuitando(null);
      setAviso("error" in r && r.error ? { tipo: "mal", texto: r.error } : { tipo: "ok", texto: `${f.codigo} quitado.` });
    });
  }

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · PASIVOS</p>
          <h1>Maestro de pasivos</h1>
          <p className="sub">La hoja MAESTRO de BLOQUEADOS.xlsx. De aquí salen la descripción, la caja, las unidades por caja, el HL y el costo de la base.</p>
        </div>
      </section>

      <div className="bal-conso-filtros">
        <label className="bal-conso-q"><span>Buscar</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código o descripción" /></label>
        {puedeEditar && !nueva && <button type="button" className="btn" onClick={() => setNueva({ ...VACIA })}>Agregar material</button>}
        <span className="pas-trae">{filas.length} materiales</span>
      </div>
      {aviso && <p className={`bal-conso-aviso ${aviso.tipo}`} role="status">{aviso.texto}</p>}
      {error && <p className="bal-conso-aviso mal">No se pudo leer el maestro: {error}. ¿Ya corriste 2026-10-pasivos.sql?</p>}

      <div className="bal-tabla-wrap">
        <table className="bal-tabla bal-hoja pas-maestro">
          <thead><tr>{COLS.map((c) => <th key={c.k} className={c.num ? "r" : ""}>{c.t}</th>)}{puedeEditar && <th></th>}</tr></thead>
          <tbody>
            {nueva && (
              <tr className="sucia">
                {COLS.map((c) => (
                  <td key={c.k}><input className={c.num ? "r" : ""} style={c.ancho ? { minWidth: c.ancho } : undefined} value={nueva[c.k] == null ? "" : String(nueva[c.k])}
                    onChange={(e) => setNueva({ ...nueva, [c.k]: e.target.value } as MaestroPasivo)} placeholder={c.k === "codigo" ? "Código" : ""} /></td>
                ))}
                <td className="pas-acc">
                  <button type="button" className="bal-btn confirmar" disabled={pending} onClick={() => guardar(nueva)}>Guardar</button>
                  <button type="button" className="bal-btn cancelar" onClick={() => setNueva(null)}>Cancelar</button>
                </td>
              </tr>
            )}
            {vistas.map((f) => {
              const sucia = !!cambios[f.codigo];
              return (
                <tr key={f.codigo} className={sucia ? "sucia" : ""}>
                  {COLS.map((c) => (
                    <td key={c.k} className={c.k === "codigo" ? "mono" : ""}>
                      {c.k === "codigo" || !puedeEditar ? (valor(f, c.k) || "—") : (
                        <input className={c.num ? "r" : ""} style={c.ancho ? { minWidth: c.ancho } : undefined}
                          value={valor(f, c.k)} onChange={(e) => poner(f, c.k, e.target.value)} aria-label={`${c.t} de ${f.codigo}`} />
                      )}
                    </td>
                  ))}
                  {puedeEditar && (
                    <td className="pas-acc">
                      {sucia ? (
                        <>
                          <button type="button" className="bal-btn confirmar" disabled={pending} onClick={() => guardar(cambios[f.codigo])}>Guardar</button>
                          <button type="button" className="bal-btn cancelar" onClick={() => setCambios((c) => { const x = { ...c }; delete x[f.codigo]; return x })}>Deshacer</button>
                        </>
                      ) : (
                        <button type="button" className="bal-btn cancelar" disabled={pending} onClick={() => setQuitando(f)} title="Quitar del maestro">×</button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {quitando && (
        <Confirmar cabecera="QUITAR DEL MAESTRO" titulo={`¿Quitar ${quitando.codigo} del maestro?`} textoConfirmar="Quitar del maestro"
                   ocupado={pending} alConfirmar={() => borrar(quitando)} alCancelar={() => setQuitando(null)}>
          <ul className="pas-conf-lista"><li><span className="c">{quitando.codigo}</span><span>{quitando.descripcion}</span><span /></li></ul>
          <p className="pas-conf-nota">Las filas de la base con ese código quedan <b>sin costo ni HL</b> hasta que lo vuelvas a agregar.</p>
        </Confirmar>
      )}
    </>
  );
}
