"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Rotura } from "@/modulos/roturas/datos";
import { Fila } from "../../comunes";
import { Evidencia } from "../../Evidencia";

/**
 * LOS DESACUERDOS — la última palabra de ABI.
 *
 * «Si no está de acuerdo llega la notificación a ABI, y ABI culmina de
 *  decir si se cobra o no.»
 *
 * AQUÍ SOLO LLEGA LO QUE ALGUIEN OBJETÓ, y esa es la mitad de la razón
 * de haber invertido la cadena. Antes ABI tenía que mirar las cien
 * roturas del mes para decir cuáles cobraba; ahora mira las que Easy
 * no aceptó, que son las únicas donde su criterio cambia algo. Lo
 * demás se concilia solo.
 *
 * LO MÁS VIEJO ARRIBA, por fecha del descargo y no del registro: lo que
 * lleva más tiempo esperando una respuesta es lo que la necesita.
 *
 * LAS DOS VERSIONES, UNA AL LADO DE LA OTRA. Quien decide tiene que
 * poder leer lo que dijo el que registró Y lo que dijo el que objetó,
 * sin abrir dos pantallas. Una decisión tomada viendo solo un lado es
 * la que se vuelve a discutir el mes entrante.
 *
 * NO HAY «DEVOLVER». Una vez ABI resuelve, se acabó: es lo que quiere
 * decir «la última palabra». Si de verdad se equivocó, se corrige donde
 * se corrigen los errores —con el rastro que eso deja— y no con un
 * botón que deja la cadena dando vueltas.
 */
export function Desacuerdos({ roturas, nombres, puedeResolver }: {
  roturas: Rotura[];
  nombres: Record<string, string>;
  /** Quien tenga «Editar» en esta pantalla: ABI. */
  puedeResolver: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [abierta, setAbierta] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState<{ id: string; cuenta: boolean } | null>(null);
  const [nota, setNota] = useState("");
  const [mandando, setMandando] = useState(false);

  async function resolver(id: string, cuenta: boolean, texto: string) {
    setMandando(true);
    const { error } = await supabase.rpc("rotura_resolver", {
      p_id: id, p_cuenta: cuenta, p_nota: texto.trim(),
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    const r = roturas.find((x) => x.id === id);
    avisar.bien(cuenta
      ? `${r?.codigo ?? "La rotura"} se cobra. Queda escrito que fue ABI quien lo sostuvo.`
      : `${r?.codigo ?? "La rotura"} no se cobra. El descargo tenía razón.`);
    setResolviendo(null); setNota("");
    router.refresh();
  }

  const dias = (iso?: string | null) => {
    if (!iso) return 0;
    return Math.round((Date.now() - Date.parse(iso)) / 86400_000);
  };

  return (
    <>
      {avisos}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{roturas.length} {roturas.length === 1 ? "desacuerdo" : "desacuerdos"}</h2>
            <p>
              Solo lo que el operador logístico no aceptó. Lo que aceptó ya se fue a cobro sin
              pasar por aquí — por eso esta bandeja es corta, y por eso vale la pena mirarla
              entera. Lo que decidas aquí es definitivo.
            </p>
          </div>
        </div>
      </section>

      <div className="filas">
        {roturas.length === 0 && (
          <div className="caja"><div className="vacio">
            <b>Ningún desacuerdo</b>
            Todo lo que se registró se aceptó y ya está en cobro. No hay nada que resolver.
          </div></div>
        )}

        {roturas.map((r) => {
          const espera = dias(r.ol_en);
          return (
            <Fila key={r.id} r={r} nombres={nombres}
                  derecha={
                    <div className="par">
                      <button type="button" className="btn"
                              onClick={() => setAbierta(abierta === r.id ? null : r.id)}>
                        {abierta === r.id ? "Cerrar" : `Ver las fotos${r.fotos ? ` · ${r.fotos}` : ""}`}
                      </button>
                      {puedeResolver && (
                        <>
                          <button type="button" className="btn bien"
                                  onClick={() => { setResolviendo({ id: r.id, cuenta: true }); setNota("") }}>
                            Se cobra igual
                          </button>
                          <button type="button" className="btn mal"
                                  onClick={() => { setResolviendo({ id: r.id, cuenta: false }); setNota("") }}>
                            No se cobra
                          </button>
                        </>
                      )}
                    </div>
                  }>
              {/* EL DESCARGO, DESTACADO. Es lo nuevo de esta pantalla:
                  el resto ya se veía en la bandeja de antes. Sin
                  resaltarlo, quien decide lee la rotura y decide sin
                  haber leído la objeción, que es el error entero. */}
              <div className="panel-f" style={{ marginTop: 10 }}>
                <div className="aviso rojo">
                  <b>Dice el operador logístico:</b> «{r.ol_nota}»
                  <div className="meta" style={{ marginTop: 6 }}>
                    {r.ol_por ? (nombres[r.ol_por] ?? "alguien") : "alguien"}
                    {espera > 0 && ` · hace ${espera} ${espera === 1 ? "día" : "días"}`}
                    {" · "}
                    {r.fotos_descargo
                      ? `${r.fotos_descargo} foto${r.fotos_descargo === 1 ? "" : "s"} de descargo`
                      : "sin foto de descargo"}
                  </div>
                </div>
              </div>

              {resolviendo?.id === r.id && (
                <div className="panel">
                  <label htmlFor={`res-${r.id}`}>
                    {resolviendo.cuenta
                      ? "Por qué se cobra igual — obligatorio"
                      : "Por qué no se cobra — obligatorio"}
                  </label>
                  <textarea id={`res-${r.id}`} rows={2} value={nota}
                            onChange={(e) => setNota(e.target.value)}
                            placeholder={resolviendo.cuenta
                              ? "El acta de entrega del turno los tiene a ellos con el montacargas."
                              : "Tienen razón: ese día el equipo era de la planta."} />
                  {/* LOS DOS LADOS EXIGEN MOTIVO, y no solo el que va
                      en contra de alguien. Un desacuerdo que se cierra
                      sin una línea es el que se vuelve a discutir el
                      mes entrante, gane quien gane. */}
                  <div className="aviso">
                    Esto es definitivo y es lo que queda en el acta del mes. Sea cual sea la
                    decisión, la línea es lo que la sostiene cuando alguien la lea en enero.
                  </div>
                  <div className="acciones-panel">
                    <button type="button"
                            className={"btn " + (resolviendo.cuenta ? "bien" : "mal")}
                            disabled={mandando || nota.trim().length < 4}
                            onClick={() => resolver(r.id, resolviendo.cuenta, nota)}>
                      {mandando ? "Guardando…"
                        : nota.trim().length < 4 ? "Falta decir por qué"
                        : resolviendo.cuenta ? "Confirmar: se cobra" : "Confirmar: no se cobra"}
                    </button>
                    <button type="button" className="btn plano"
                            onClick={() => { setResolviendo(null); setNota("") }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {abierta === r.id && <Evidencia id={r.id} />}
            </Fila>
          );
        })}
      </div>
    </>
  );
}
