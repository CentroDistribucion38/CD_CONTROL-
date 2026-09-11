"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Rotura } from "@/modulos/roturas/datos";
import { Fila } from "../../comunes";
import { Evidencia } from "../../Evidencia";

/**
 * EL VISTO BUENO DE ABI — cuenta o no cuenta.
 *
 * Dos botones y nada más, porque la decisión es de dos. Lo que la
 * pantalla agrega es el orden: LO MÁS VIEJO ARRIBA. Una bandeja ordenada
 * por lo más nuevo deja lo de hace tres días sin mirar para siempre,
 * porque cada mañana entra algo encima.
 *
 * "NO CUENTA" PIDE MOTIVO Y "CUENTA" NO. No es por hacerlo difícil: una
 * rotura que no cuenta es plata que alguien más va a tener que asumir, y
 * el día que reclamen, "no cuenta" sin una línea que lo explique no se
 * puede defender. La base lo rechaza también, así que el campo no es
 * un adorno de la pantalla.
 */
export function VistoBueno({ roturas, nombres, puedeDecidir }: {
  roturas: Rotura[];
  nombres: Record<string, string>;
  /** Solo ABI y el administrador. El resto mira la bandeja. */
  puedeDecidir: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [abierta, setAbierta] = useState<string | null>(null);
  const [decidiendo, setDecidiendo] = useState<{ id: string; cuenta: boolean } | null>(null);
  const [nota, setNota] = useState("");
  const [mandando, setMandando] = useState(false);

  async function decidir(id: string, cuenta: boolean, texto: string) {
    setMandando(true);
    const { error } = await supabase.rpc("rotura_visto_bueno", {
      p_id: id, p_cuenta: cuenta, p_nota: texto.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    const r = roturas.find((x) => x.id === id);
    avisar.bien(`${r?.codigo ?? "La rotura"} quedó como ${cuenta ? "que CUENTA" : "que NO cuenta"}.`);
    setDecidiendo(null); setNota("");
    router.refresh();
  }

  const sinFoto = roturas.filter((r) => r.le_falta_foto).length;

  return (
    <>
      {avisos}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{roturas.length} esperando</h2>
            <p>
              Lo más viejo arriba: al revés, lo de hace tres días no se mira nunca porque cada
              mañana entra algo encima.
              {sinFoto > 0 && ` ${sinFoto} no tiene${sinFoto === 1 ? "" : "n"} la foto que su causa exige.`}
            </p>
          </div>
        </div>

        <div className="rueda">
          {roturas.length === 0 && (
            <div className="vacio">
              <b>Bandeja limpia</b>
              No hay nada esperando visto bueno.
            </div>
          )}

          {roturas.map((r) => (
            <Fila key={r.id} r={r} nombres={nombres}
                  derecha={
                    <div className="par">
                      <button type="button" className="btn"
                              onClick={() => setAbierta(abierta === r.id ? null : r.id)}>
                        {abierta === r.id ? "Cerrar" : `Ver${r.fotos ? ` · ${r.fotos} foto${r.fotos === 1 ? "" : "s"}` : ""}`}
                      </button>
                      {puedeDecidir && (
                        <>
                          <button type="button" className="btn bien"
                                  onClick={() => { setDecidiendo({ id: r.id, cuenta: true }); setNota("") }}>
                            Cuenta
                          </button>
                          <button type="button" className="btn mal"
                                  onClick={() => { setDecidiendo({ id: r.id, cuenta: false }); setNota("") }}>
                            No cuenta
                          </button>
                        </>
                      )}
                    </div>
                  }>
              {r.le_falta_foto && (
                <div className="aviso rojo" style={{ marginTop: 8 }}>
                  Esta causa dice que la rotura no fue del OL y no tiene foto. No se puede
                  marcar como que cuenta hasta que alguien suba una.
                </div>
              )}

              {decidiendo?.id === r.id && (
                <div className="panel">
                  <label htmlFor={`nota-${r.id}`}>
                    {decidiendo.cuenta
                      ? "Nota (opcional)"
                      : "Por qué NO cuenta — obligatorio"}
                  </label>
                  <textarea id={`nota-${r.id}`} rows={2} value={nota}
                            onChange={(e) => setNota(e.target.value)}
                            placeholder={decidiendo.cuenta
                              ? "La foto muestra el daño; se acepta."
                              : "La foto es de otra estiba: no corresponde a esta rotura."} />
                  {!decidiendo.cuenta && (
                    <div className="aviso">
                      Esto es plata que alguien más va a tener que asumir. El día que reclamen,
                      esta línea es lo que sostiene la decisión.
                    </div>
                  )}
                  <div className="acciones-panel">
                    <button type="button"
                            className={"btn " + (decidiendo.cuenta ? "bien" : "mal")}
                            disabled={mandando || (!decidiendo.cuenta && nota.trim().length < 4)}
                            onClick={() => decidir(r.id, decidiendo.cuenta, nota)}>
                      {mandando ? "Guardando…"
                        : decidiendo.cuenta ? "Confirmar que cuenta" : "Confirmar que no cuenta"}
                    </button>
                    <button type="button" className="btn plano"
                            onClick={() => { setDecidiendo(null); setNota("") }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {abierta === r.id && <Evidencia id={r.id} />}
            </Fila>
          ))}
        </div>
      </section>
    </>
  );
}
