"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Accion, Motivo, Zona } from "@/modulos/acciones/datos";
import { useAvisos } from "@/components/Aviso";
import { Fila, fecha } from "../comunes";
import { Reportar } from "../Reportar";

/**
 * MIS ACCIONES — lo que le toca a quien entró.
 *
 * Es la pantalla del celular y la primera del módulo a propósito: quien
 * abre Acciones casi siempre viene a ver lo suyo, no el tablero de todos.
 * El tablero es de la reunión.
 *
 * CERRAR PIDE ESCRIBIR QUÉ SE HIZO, y no es burocracia: quien verifica
 * después necesita saber qué fue lo que se intentó para poder decir si
 * sirvió. "Listo" no le sirve a nadie, y la base lo rechaza.
 */
export function Mias({ acciones, zonas, motivos, plazos, puedeEditar }: {
  acciones: Accion[];
  zonas: Zona[];
  motivos: Motivo[];
  plazos: Record<string, { horas: number; etiqueta: string }>;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [reportando, setReportando] = useState(false);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [mandando, setMandando] = useState(false);

  /* Lo vivo arriba y lo demás abajo. Dentro de lo vivo manda el plazo,
     que ya viene ordenado de la base. */
  const vivas = acciones.filter((a) => a.viva);
  const resto = acciones.filter((a) => !a.viva);
  const vencidas = vivas.filter((a) => a.vencida).length;

  async function cerrar(id: string) {
    setMandando(true);
    const { error } = await supabase.rpc("accion_cerrar", {
      p_id: id, p_que_se_hizo: texto.trim(),
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien("Quedó a la espera de que alguien verifique si sirvió.");
    setCerrando(null);
    setTexto("");
    router.refresh();
  }

  return (
    <>
      {avisos}

      {reportando && (
        <Reportar zonas={zonas} motivos={motivos} plazos={plazos}
                  cerrar={() => setReportando(false)} />
      )}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{vivas.length} pendiente{vivas.length === 1 ? "" : "s"}</h2>
            <p>
              {vencidas > 0
                ? `${vencidas} ya se pasó del plazo. Esas son las que se van a nombrar en el arranque de turno.`
                : "Ninguna vencida. Lo que vence primero va arriba."}
            </p>
          </div>
        </div>

        <div className="rueda">
          {vivas.length === 0 && resto.length === 0 && (
            <div className="vacio">
              <b>No tienes nada asignado</b>
              Cuando alguien te asigne una acción, aparece aquí con su plazo.
            </div>
          )}

          {vivas.map((a) => (
            <Fila key={a.id} a={a} nombres={{}}
                  derecha={
                    <button type="button" className="btn si"
                            onClick={() => {
                              setCerrando(cerrando === a.id ? null : a.id);
                              setTexto("");
                            }}>
                      Ya lo hice
                    </button>
                  }>
              {a.descripcion && (
                <div className="meta" style={{ marginTop: 5 }}><span>{a.descripcion}</span></div>
              )}

              {a.estado === "reabierta" && a.nota_verificacion && (
                <div className="aviso rojo" style={{ marginTop: 9 }}>
                  <b>Se verificó y no sirvió:</b> {a.nota_verificacion}
                  {" — "}el plazo no se estiró, sigue siendo el de la prioridad original.
                </div>
              )}

              {cerrando === a.id && (
                <div className="panel">
                  <div>
                    <label>¿QUÉ HICISTE?</label>
                    <textarea rows={3} value={texto} autoFocus
                              onChange={(e) => setTexto(e.target.value)}
                              placeholder="Se reapilaron las tres estibas a dos alturas y se marcó el piso del lado del rack." />
                  </div>
                  <div className="aviso">
                    Esto no cierra el tema: lo manda a verificación. Alguien va a ir a mirar si de
                    verdad sirvió, y lo que escribas aquí es lo que va a ir a comprobar.
                  </div>
                  <div className="acciones-panel">
                    <button type="button" className="btn si"
                            disabled={mandando || texto.trim().length < 4}
                            onClick={() => cerrar(a.id)}>
                      {mandando ? "Guardando…" : "Mandar a verificación"}
                    </button>
                    <button type="button" className="btn plano" onClick={() => setCerrando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </Fila>
          ))}

          {resto.length > 0 && (
            <>
              <div className="cab" style={{ borderTop: "1px solid var(--ac-linea)" }}>
                <div>
                  <h2>Ya resueltas</h2>
                  <p>Lo cerrado esperando verificación, y lo que ya se verificó.</p>
                </div>
              </div>
              {resto.map((a) => (
                <Fila key={a.id} a={a} nombres={{}}>
                  <div className="meta" style={{ marginTop: 5 }}>
                    {a.estado === "cerrada" && (
                      <span>Cerrada el {fecha(a.cerrada_en)} · esperando que alguien verifique</span>
                    )}
                    {a.estado === "verificada" && (
                      <span>
                        Verificada el {fecha(a.verificada_en)} ·{" "}
                        {a.efectiva ? "fue efectiva" : "no fue efectiva"}
                      </span>
                    )}
                  </div>
                </Fila>
              ))}
            </>
          )}
        </div>
      </section>

      {puedeEditar && (
        <button type="button" className="mas" onClick={() => setReportando(true)}
                aria-label="Reportar una acción">+</button>
      )}
    </>
  );
}
