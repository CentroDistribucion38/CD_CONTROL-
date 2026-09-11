"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Accion, Carga, Motivo, Zona } from "@/modulos/acciones/datos";
import { Fila, quien } from "./comunes";
import { Reportar } from "./Reportar";

/**
 * TODAS LAS ACCIONES — la bandeja del módulo, y donde se asigna.
 *
 * ASIGNAR ES LA DECISIÓN MÁS IMPORTANTE DE ESTE MÓDULO y la que más
 * fácil se toma mal: se le da al primero que aparece en la lista. Por eso
 * la lista de personas no es un desplegable con nombres — es la carga de
 * cada quien, con cuántas tiene abiertas y cuántas vencidas, ordenada por
 * quién tiene menos encima. Doce acciones en la misma persona no se
 * cierran: se acumulan, y el plazo de 48 horas pasa a ser una promesa que
 * el sistema ya sabe que no se va a cumplir.
 */
export function Todas({ acciones, carga, nombres, zonas, motivos, areas, plazos, puedeEditar, saturado }: {
  acciones: Accion[];
  carga: Carga[];
  nombres: Record<string, string>;
  zonas: Zona[];
  motivos: Motivo[];
  areas: { clave: string; nombre: string }[];
  plazos: Record<string, { horas: number; etiqueta: string }>;
  puedeEditar: boolean;
  saturado: number;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [reportando, setReportando] = useState(false);
  const [asignando, setAsignando] = useState<string | null>(null);
  const [escogido, setEscogido] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);

  const [f, setF] = useState({ estado: "vivas", area: "", prioridad: "", texto: "" });

  const lista = acciones.filter((a) => {
    if (f.estado === "vivas" && !a.viva) return false;
    if (f.estado === "vencidas" && !a.vencida) return false;
    if (f.estado === "sin" && (a.responsable || !a.viva)) return false;
    if (f.estado === "cerradas" && a.estado !== "cerrada") return false;
    if (f.area && a.area !== f.area) return false;
    if (f.prioridad && a.prioridad !== f.prioridad) return false;
    const q = f.texto.trim().toLowerCase();
    if (q && !(a.codigo + " " + a.titulo + " " + (a.zona_nombre ?? a.ubicacion ?? ""))
      .toLowerCase().includes(q)) return false;
    return true;
  });

  const vencidas = acciones.filter((a) => a.vencida).length;
  const criticas = acciones.filter((a) => a.viva && a.prioridad === "alta").length;
  const sinDueno = acciones.filter((a) => a.viva && !a.responsable).length;
  const porVerificar = acciones.filter((a) => a.estado === "cerrada").length;

  async function asignar(id: string, aQuien: string | null) {
    setMandando(true);
    setMal(null);
    const { error } = await supabase.rpc("accion_asignar", {
      p_id: id, p_responsable: aQuien,
    });
    setMandando(false);
    if (error) { setMal(error.message); return }
    setAsignando(null);
    setEscogido(null);
    router.refresh();
  }

  const elEscogido = carga.find((c) => c.id === escogido);

  return (
    <>
      {reportando && (
        <Reportar zonas={zonas} motivos={motivos} plazos={plazos}
                  cerrar={() => setReportando(false)} />
      )}

      <section className="cifras">
        <div className={"cifra" + (vencidas ? " mal" : "")}>
          <div className="rot">VENCIDAS</div>
          <div className="n">{vencidas}</div>
          <div className="u">se pasaron del plazo de su prioridad</div>
        </div>
        <div className={"cifra" + (criticas ? " mal" : "")}>
          <div className="rot">CRÍTICAS ABIERTAS</div>
          <div className="n">{criticas}</div>
          <div className="u">prioridad alta sin cerrar</div>
        </div>
        <div className={"cifra" + (sinDueno ? " ojo" : "")}>
          <div className="rot">SIN RESPONSABLE</div>
          <div className="n">{sinDueno}</div>
          <div className="u">nadie las está haciendo</div>
        </div>
        <div className="cifra ojo">
          <div className="rot">POR VERIFICAR</div>
          <div className="n">{porVerificar}</div>
          <div className="u">cerradas, falta ir a mirar si sirvió</div>
        </div>
      </section>

      <div className="filtros">
        <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
          <option value="vivas">Abiertas y reabiertas</option>
          <option value="vencidas">Solo vencidas</option>
          <option value="sin">Sin responsable</option>
          <option value="cerradas">Cerradas sin verificar</option>
          <option value="">Todas</option>
        </select>
        <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
          <option value="">Toda la bodega</option>
          {areas.map((a) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
        </select>
        <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })}>
          <option value="">Cualquier prioridad</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })}
               placeholder="Buscar código, título o zona" />
        {(f.estado !== "vivas" || f.area || f.prioridad || f.texto) && (
          <button type="button" className="btn plano"
                  onClick={() => setF({ estado: "vivas", area: "", prioridad: "", texto: "" })}>
            Quitar filtros
          </button>
        )}
      </div>

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{lista.length} acción{lista.length === 1 ? "" : "es"}</h2>
            <p>
              Ordenadas por lo que vence primero. El plazo salió de la prioridad al reportar:
              nadie escribió esa fecha.
            </p>
          </div>
        </div>

        <div className="rueda">
          {lista.length === 0 && (
            <div className="vacio">
              <b>Nada por aquí</b>
              {acciones.length
                ? "Con estos filtros no queda ninguna."
                : "Todavía no se ha reportado nada. El botón + abre el reporte."}
            </div>
          )}

          {lista.map((a) => (
            <Fila key={a.id} a={a} nombres={nombres}
                  derecha={puedeEditar && a.viva ? (
                    <button type="button" className="btn"
                            onClick={() => {
                              setAsignando(asignando === a.id ? null : a.id);
                              setEscogido(a.responsable);
                              setMal(null);
                            }}>
                      {a.responsable ? "Cambiar responsable" : "Asignar"}
                    </button>
                  ) : null}>
              {asignando === a.id && (
                <div className="panel">
                  <div>
                    <label>A QUIÉN LE TOCA</label>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ac-gris)" }}>
                      Antes de asignar, mira cuánto tiene encima cada quien. Doce acciones en la
                      misma persona no se cierran: se acumulan.
                    </p>
                  </div>

                  <div style={{ border: "1px solid var(--ac-linea)", borderRadius: 9, overflow: "hidden", background: "#fff" }}>
                    {carga.map((c) => {
                      const tope = Math.max(saturado, ...carga.map((x) => x.abiertas), 1);
                      return (
                        <button key={c.id} type="button"
                                className={"quien" + (escogido === c.id ? " on" : "") + (c.saturado ? " sat" : "")}
                                onClick={() => setEscogido(c.id)}>
                          <span className="ini">
                            {(c.nombre || c.usuario || "?").split(/\s+/).slice(0, 2)
                              .map((p) => p[0]).join("").toUpperCase()}
                          </span>
                          <span>
                            <span className="n">{c.nombre || c.usuario}</span>
                            <span className="c">{c.rol}</span>
                          </span>
                          <span className="barra">
                            <i style={{ width: `${Math.min(100, (c.abiertas / tope) * 100)}%` }} />
                          </span>
                          <span className="num">
                            <b>{c.abiertas}</b>
                            abiertas
                            {c.vencidas > 0 && <span className="v"> {c.vencidas} vencidas</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {elEscogido?.saturado && (
                    <div className="aviso rojo">
                      <b>{elEscogido.nombre || elEscogido.usuario} está saturado.</b>{" "}
                      {elEscogido.abiertas} acciones abiertas
                      {elEscogido.vencidas > 0 ? ` y ${elEscogido.vencidas} vencidas` : ""}. Si le
                      asignas esta, el plazo es una promesa que el sistema ya sabe que no se va a
                      cumplir.
                    </div>
                  )}

                  {mal && <div className="aviso rojo">{mal}</div>}

                  <div className="acciones-panel">
                    <button type="button" className="btn si" disabled={mandando || !escogido}
                            onClick={() => escogido && asignar(a.id, escogido)}>
                      {mandando ? "Asignando…"
                        : escogido ? `Asignar a ${carga.find((c) => c.id === escogido)?.nombre
                            ?? carga.find((c) => c.id === escogido)?.usuario}`
                        : "Escoge a alguien"}
                    </button>
                    {a.responsable && (
                      <button type="button" className="btn" disabled={mandando}
                              onClick={() => asignar(a.id, null)}>
                        Dejar sin asignar
                      </button>
                    )}
                    <button type="button" className="btn plano" onClick={() => setAsignando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {a.estado === "cerrada" && a.que_se_hizo && (
                <div className="meta" style={{ marginTop: 6 }}>
                  <span>Se hizo: {a.que_se_hizo} — {quien(nombres, a.cerrada_por)}</span>
                </div>
              )}
            </Fila>
          ))}
        </div>
      </section>

      {puedeEditar && (
        <button type="button" className="mas" onClick={() => setReportando(true)}
                aria-label="Reportar una acción">+</button>
      )}
    </>
  );
}
