"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Viaje } from "@/modulos/traspasos/datos";
import { FilaViaje } from "./comunes";

/**
 * LOS VIAJES DEL DÍA, lo último arriba.
 *
 * ANULAR PIDE MOTIVO Y NO BORRA. El script anterior borraba la fila de
 * la hoja: un viaje que existió y desapareció deja el plan cuadrando
 * por arte de magia y sin nadie a quien preguntarle. Aquí el viaje
 * sigue, marcado, con quién lo anuló y por qué — y deja de contar para
 * el cumplido en el mismo segundo.
 */
export function Viajes({ viajes, nombres, puedeEditar }: {
  viajes: Viaje[];
  nombres: Record<string, string>;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [mandando, setMandando] = useState(false);

  async function anular(id: string) {
    setMandando(true);
    const { error } = await supabase.rpc("traspaso_anular_viaje", {
      p_id: id, p_motivo: motivo,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    setAnulando(null); setMotivo("");
    avisar.bien("Viaje anulado. El cumplido del turno ya lo descontó.");
    router.refresh();
  }

  return (
    <section className="caja">
      {avisos}
      <div className="cab">
        <div>
          <h2>{viajes.length} viaje{viajes.length === 1 ? "" : "s"} hoy</h2>
          <p>Lo último arriba. Los anulados siguen a la vista, con su motivo.</p>
        </div>
      </div>

      {viajes.length === 0 ? (
        <div className="vacio">
          <b>Todavía no hay viajes hoy</b>
          El primero que se registre va a aparecer aquí y a contar en el plan del turno.
        </div>
      ) : (
        viajes.map((v) => (
          <div key={v.id}>
            <FilaViaje v={v} nombres={nombres} derecha={
              puedeEditar && v.vale ? (
                <button type="button" className="btn chico"
                        onClick={() => { setAnulando(anulando === v.id ? null : v.id); setMotivo(""); }}>
                  {anulando === v.id ? "Cancelar" : "Anular"}
                </button>
              ) : null
            } />

            {anulando === v.id && (
              <div style={{ padding: "0 16px 16px" }}>
                <div className="campo">
                  <label htmlFor={"m-" + v.id}>¿Por qué se anula?</label>
                  <input id={"m-" + v.id} value={motivo} autoFocus
                         placeholder="Se digitó dos veces, el viaje no salió…"
                         onChange={(e) => setMotivo(e.target.value)} />
                </div>
                <p className="guia" style={{ marginBottom: 10 }}>
                  El viaje no se borra: se queda marcado con este motivo y deja de contar para
                  el cumplido. Borrarlo dejaría el plan cuadrando sin que nadie sepa por qué.
                </p>
                <button type="button" className="btn si"
                        disabled={!motivo.trim() || mandando}
                        onClick={() => anular(v.id)}>
                  {mandando ? "Anulando…" : "Anular este viaje"}
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
