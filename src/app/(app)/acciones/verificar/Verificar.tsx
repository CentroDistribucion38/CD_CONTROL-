"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Accion, Carga } from "@/modulos/acciones/datos";
import { useAvisos } from "@/components/Aviso";
import { Fila, fecha, quien } from "../comunes";

/**
 * POR VERIFICAR — ir a mirar si de verdad sirvió.
 *
 * Es la pantalla que sostiene el indicador del mes. Sin ella, cerrar y
 * resolver serían lo mismo y bastaría con cerrar para que todo se viera
 * verde.
 *
 * Y es donde aparece EL BLOQUEO. Cuando alguien marca "no fue efectiva"
 * una acción cuyo motivo ya va tres veces en la misma zona, no se abre
 * otra corrección: se corta y se pide preventiva, que obliga a nombrar la
 * causa raíz y tiene responsable de PROCESO, no de turno. Abrir una
 * cuarta corrección sería repetir el ciclo que ya falló tres veces.
 */
export function Verificar({ acciones, carga, nombres, veces, puedeEditar }: {
  acciones: Accion[];
  carga: Carga[];
  nombres: Record<string, string>;
  /** Cuántas veces tiene que repetirse algo antes de exigir preventiva. */
  veces: number;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [abierta, setAbierta] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [mandando, setMandando] = useState(false);

  /* El bloqueo: cuál acción disparó la pantalla de preventiva. */
  const [bloqueo, setBloqueo] = useState<Accion | null>(null);
  const [causa, setCausa] = useState("");
  const [duenoProceso, setDueno] = useState("");

  async function verificar(a: Accion, efectiva: boolean) {
    /* Si no sirvió Y esto ya va las veces del parámetro en el mismo
       sitio, no se verifica y ya: se corta antes, porque marcarla no
       efectiva la devolvería a la misma rueda. */
    if (!efectiva && a.veces_aqui >= veces && a.zona) {
      setBloqueo(a);
      setCausa("");
      setDueno("");
      return;
    }
    setMandando(true);
    const { error } = await supabase.rpc("accion_verificar", {
      p_id: a.id, p_efectiva: efectiva, p_nota: nota.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(efectiva
      ? `${a.codigo} queda verificada como efectiva. Cuenta para el indicador del mes.`
      : `${a.codigo} vuelve a abrirse con el mismo código y el mismo plazo.`);
    setAbierta(null);
    setNota("");
    router.refresh();
  }

  async function abrirPreventiva() {
    if (!bloqueo) return;
    setMandando(true);

    /* Primero se cierra el ciclo viejo: la acción que falló queda
       verificada como NO efectiva, con su nota. Si se saltara este paso,
       la acción quedaría eternamente "cerrada esperando verificación" y
       el indicador del mes nunca cuadraría. */
    const { error: e1 } = await supabase.rpc("accion_verificar", {
      p_id: bloqueo.id, p_efectiva: false,
      p_nota: nota.trim() || "El problema volvió igual. Se pasa a acción preventiva.",
    });
    if (e1) { setMandando(false); avisar.mal(e1.message); return }

    const { error: e2 } = await supabase.rpc("accion_abrir_preventiva", {
      p_titulo: `Causa raíz: ${bloqueo.titulo}`,
      p_motivo: bloqueo.motivo,
      p_causa_raiz: causa.trim(),
      p_responsable_proceso: duenoProceso,
      p_zona: bloqueo.zona,
      p_ubicacion: bloqueo.ubicacion,
      p_origen: null,
      p_prioridad: "alta",
    });
    setMandando(false);
    if (e2) { avisar.mal(e2.message); return }

    avisar.bien("Preventiva abierta, con causa raíz y responsable de proceso.");
    setBloqueo(null);
    setNota("");
    router.refresh();
  }

  return (
    <>
      {avisos}

      {/* ------------------- EL BLOQUEO ------------------- */}
      {bloqueo && (
        /* Ventana centrada sobre la pantalla apagada, no pantalla
           completa: el bloqueo INTERRUMPE algo que se estaba haciendo, y
           dejar ver debajo la acción que se iba a verificar es lo que
           hace que se entienda como "espera" y no como "te sacaron a otro
           lado". */
        <div className="ac-modal" role="dialog" aria-modal="true"
             aria-labelledby="bloqueo-titulo">
          <button type="button" className="fondo" aria-label="Cerrar"
                  onClick={() => setBloqueo(null)} />
          <div className="ventana">
            <div className="cabezal">
              <span className="rot">TERCERA VEZ EN EL MISMO SITIO</span>
              <h2 id="bloqueo-titulo">Aquí ya no va otra correctiva</h2>
            </div>
          <div className="cuerpo">
            <p className="guia">
              “{bloqueo.motivo_nombre}” en {bloqueo.zona_nombre ?? bloqueo.ubicacion} lleva{" "}
              <b>{bloqueo.veces_aqui} apariciones</b> en la ventana que mira el sistema. Se
              cerraron y el problema volvió igual.
            </p>
            <p className="guia">
              Abrir una cuarta corrección repite el ciclo. Toca pasar a <b>acción preventiva</b>,
              que obliga a nombrar la causa raíz y tiene un responsable de proceso, no de turno.
            </p>

            <div className="campo">
              <label>¿Por qué vuelve a pasar? (causa raíz)</label>
              <textarea rows={4} value={causa} onChange={(e) => setCausa(e.target.value)}
                        placeholder="Ejemplo: el pasillo 3 recibe producto de dos líneas al mismo tiempo y no hay espacio demarcado para la segunda." />
            </div>

            <div className="campo">
              <label>Responsable del proceso</label>
              <select value={duenoProceso} onChange={(e) => setDueno(e.target.value)}>
                <option value="">Escoge a quién le toca el proceso…</option>
                {carga.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre || c.usuario} · {c.rol}
                  </option>
                ))}
              </select>
            </div>

            <div className="aviso rojo">
              Al abrir la preventiva, <b>{bloqueo.codigo}</b> queda verificada como no efectiva.
              Es lo que de verdad pasó, y dejarla “esperando verificación” para siempre torcería
              el indicador del mes.
            </div>

          </div>
          <div className="pie">
            <button type="button" className="si"
                    disabled={mandando || causa.trim().length < 15 || !duenoProceso}
                    onClick={abrirPreventiva}>
              {mandando ? "Abriendo…" : "Abrir acción preventiva"}
            </button>
            <button type="button" className="plano" onClick={() => setBloqueo(null)}>
              Atrás
            </button>
          </div>
          </div>
        </div>
      )}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{acciones.length} esperando verificación</h2>
            <p>
              Las más viejas primero: la que lleva días esperando es la que está falseando el
              indicador del mes. La efectividad se mide sobre lo verificado, no sobre lo cerrado.
            </p>
          </div>
        </div>

        <div className="rueda">
          {acciones.length === 0 && (
            <div className="vacio">
              <b>Nada esperando</b>
              Todo lo que se cerró ya se verificó.
            </div>
          )}

          {acciones.map((a) => {
            const espera = a.cerrada_en
              ? Math.floor((Date.now() - new Date(a.cerrada_en).getTime()) / 86400000)
              : 0;
            return (
              <Fila key={a.id} a={a} nombres={nombres}
                    derecha={puedeEditar ? (
                      <div className="par">
                        <button type="button" className="btn bien" disabled={mandando}
                                onClick={() => verificar(a, true)}>
                          Fue efectiva
                        </button>
                        <button type="button" className="btn mal" disabled={mandando}
                                onClick={() => { setAbierta(a.id); setNota(""); }}>
                          No fue efectiva
                        </button>
                      </div>
                    ) : null}>
                <div className="meta" style={{ marginTop: 5 }}>
                  <b>Se hizo:</b>
                  <span>{a.que_se_hizo}</span>
                  <span>·</span>
                  <span>{quien(nombres, a.cerrada_por)}, {fecha(a.cerrada_en)}</span>
                </div>
                {espera >= 2 && (
                  <div className="meta" style={{ marginTop: 3 }}>
                    <span className="plazo mal">Esperando hace {espera} días</span>
                  </div>
                )}

                {abierta === a.id && (
                  <div className="panel">
                    <div>
                      <label>¿QUÉ ENCONTRASTE?</label>
                      <textarea rows={3} value={nota} autoFocus
                                onChange={(e) => setNota(e.target.value)}
                                placeholder="Volvieron a apilar igual esa misma noche." />
                    </div>
                    <div className="aviso">
                      Al marcarla no efectiva, la acción <b>vuelve a abrirse con el mismo código y
                      el mismo plazo</b>. No se crea una nueva: así la reincidencia cuenta
                      problemas y no intentos, y el plazo no se estira.
                    </div>
                    <div className="acciones-panel">
                      <button type="button" className="btn mal"
                              disabled={mandando || nota.trim().length < 4}
                              onClick={() => verificar(a, false)}>
                        {mandando ? "Guardando…" : "Confirmar que no sirvió"}
                      </button>
                      <button type="button" className="btn plano" onClick={() => setAbierta(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </Fila>
            );
          })}
        </div>
      </section>
    </>
  );
}
