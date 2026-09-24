"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Rotura } from "@/modulos/roturas/datos";
import { Cifras } from "../../comunes";
import { Evidencia } from "../../Evidencia";

/**
 * LOS DESACUERDOS — la última palabra de ABI.
 *
 * «Si no está de acuerdo llega la notificación a ABI, y ABI culmina de
 *  decir si se cobra o no.»
 *
 * AQUÍ SOLO LLEGA LO QUE ALGUIEN OBJETÓ, y esa es la mitad de la razón
 * de haber invertido la cadena. Antes ABI tenía que mirar las cien
 * roturas del mes para decir cuáles cobraba; ahora mira las que el
 * operador logístico no aceptó, que son las únicas donde su criterio
 * cambia algo. Lo demás se concilia solo.
 *
 * ---------------------------------------------------------------------
 * MISMA FORMA QUE EL VISTO BUENO, Y UNA COSA DE MÁS
 * ---------------------------------------------------------------------
 * Filas y no tarjetas, la misma fila de cifras arriba, los mismos
 * botones al final del renglón. Es la bandeja hermana: quien conoce una
 * no tiene que aprender la otra.
 *
 * LO QUE CAMBIA ES QUE AQUÍ HAY DOS VERSIONES Y SE VEN LAS DOS, una al
 * lado de la otra y SIN ABRIR NADA. Ese es el trabajo de esta pantalla.
 * Si el descargo estuviera detrás de un «Ver», la decisión se toma
 * habiendo leído un solo lado — y eso no es decidir, es firmar.
 *
 * NO HAY «DEVOLVER». Una vez ABI resuelve, se acabó: es lo que quiere
 * decir «la última palabra». Si de verdad se equivocó, se corrige donde
 * se corrigen los errores —con el rastro que eso deja— y no con un
 * botón que deja la cadena dando vueltas.
 */

const dm = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });

/** «hace 3 días», «ayer», «hoy». La antigüedad es la que apura. */
function hace(iso: string | null | undefined) {
  if (!iso) return { txt: "—", viejo: false };
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400_000);
  if (d <= 0) return { txt: "hoy", viejo: false };
  if (d === 1) return { txt: "ayer", viejo: false };
  return { txt: `hace ${d} días`, viejo: d >= 3 };
}

export function Desacuerdos({ roturas, nombres, puedeResolver, cifras }: {
  roturas: Rotura[];
  nombres: Record<string, string>;
  /** Quien tenga «Editar» en esta pantalla: ABI. */
  puedeResolver: boolean;
  /** Las otras tres cifras del mes, para no tener que ir a otra pantalla. */
  cifras: { porAcuerdo: number; loSostuvoAbi: number; noSeCobran: number };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [abierta, setAbierta] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState<{ id: string; cuenta: boolean } | null>(null);
  const [nota, setNota] = useState("");
  const [mandando, setMandando] = useState(false);

  /* LO MÁS VIEJO ARRIBA, por fecha del DESCARGO y no del registro: lo
     que lleva más tiempo esperando una respuesta es lo que la
     necesita, y una rotura vieja objetada ayer no espera hace un mes. */
  const lista = [...roturas].sort(
    (a, b) => Date.parse(a.ol_en ?? a.reportada_en) - Date.parse(b.ol_en ?? b.reportada_en));
  const enJuego = lista.reduce((s, r) => s + r.unidades, 0);

  function cerrar() { setResolviendo(null); setNota("") }

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
    cerrar();
    router.refresh();
  }

  return (
    <>
      {avisos}

      <Cifras cifras={[
        { n: lista.length, rot: "ESPERAN TU DECISIÓN", pie: "decides tú, y es definitivo", aqui: true },
        { n: cifras.porAcuerdo, rot: "A COBRO POR ACUERDO", pie: "el OL las aceptó, no pasaron por aquí" },
        { n: cifras.loSostuvoAbi, rot: "LO SOSTUVO ABI", pie: "se cobraron tras el pleito" },
        { n: cifras.noSeCobran, rot: "NO SE COBRAN", pie: "el descargo tenía razón", mal: true },
      ]} />

      <section className="caja vb-caja">
        <div className="vb-cab">
          <div className="vb-izq">
            <h2>{lista.length} {lista.length === 1 ? "desacuerdo" : "desacuerdos"}</h2>
            <p className="vb-como">
              Solo lo que el operador logístico <b>no aceptó</b>. Lo que aceptó ya se fue a
              cobro sin pasar por aquí — por eso esta bandeja es corta y vale la pena mirarla
              entera. Lo que decidas es <b>definitivo</b>.
            </p>
          </div>
          <div className="vb-der">
            <span className="vb-nota">
              la que lleva más esperando, arriba · <b>{enJuego} und</b> en juego
            </span>
          </div>
        </div>

        {lista.length === 0 && (
          <div className="vacio">
            <b>Ningún desacuerdo</b>
            Todo lo que se registró se aceptó y ya está en cobro. No hay nada que resolver.
          </div>
        )}

        {lista.map((r) => {
          const h = hace(r.ol_en);
          return (
            <div key={r.id} className="vb-grupo">
              <div className="vb-fila ds-fila">
                {/* LA MINIATURA ABRE LAS FOTOS DE LAS DOS PARTES. */}
                <button type="button" className={"vb-foto" + (r.fotos ? "" : " sin")}
                        onClick={() => setAbierta(abierta === r.id ? null : r.id)}
                        aria-label={r.fotos ? "Ver las fotos" : "No hay fotos"}>
                  {r.fotos > 0 && <i>{r.fotos} foto{r.fotos === 1 ? "" : "s"}</i>}
                </button>

                <div className="vb-que">
                  <div className="vb-tit">{r.material_nombre}</div>
                  <div className="vb-sub">
                    <span className="vb-cod">{r.codigo}</span> · {r.proceso_nombre}
                  </div>
                </div>

                <div className="vb-und">
                  <b>{r.unidades}</b>
                  <span>UNIDADES</span>
                </div>

                <div className="vb-causa">
                  <div className={r.grupo === "no_asumida" ? "vb-no" : ""}>{r.causa_nombre}</div>
                  <div className="vb-sub">
                    {r.grupo === "no_asumida" ? "no asumida" : "la asume el OL"}
                  </div>
                </div>

                <div className="vb-quien">
                  <div>objetada {dm(r.ol_en ?? r.reportada_en)}</div>
                  <div className={"vb-sub" + (h.viejo ? " vb-viejo" : "")}>
                    esperándote {h.txt}
                  </div>
                </div>

                {puedeResolver && (
                  <div className="vb-btns">
                    <button type="button" className="btn mal" disabled={mandando}
                            onClick={() => {
                              if (resolviendo?.id === r.id && !resolviendo.cuenta) { cerrar(); return }
                              cerrar(); setResolviendo({ id: r.id, cuenta: false });
                            }}>
                      No se cobra
                    </button>
                    <button type="button" className="btn si" disabled={mandando}
                            onClick={() => {
                              if (resolviendo?.id === r.id && resolviendo.cuenta) { cerrar(); return }
                              cerrar(); setResolviendo({ id: r.id, cuenta: true });
                            }}>
                      Se cobra igual
                    </button>
                  </div>
                )}
              </div>

              {/* =========================================================
                  LAS DOS VERSIONES, ENFRENTADAS Y SIN ABRIR NADA

                  ES EL TRABAJO DE ESTA PANTALLA. Con el descargo detrás
                  de un «Ver», la decisión se toma habiendo leído un solo
                  lado — y el lado que se lee siempre es el de arriba.

                  DEL MISMO ANCHO LAS DOS, a propósito: una columna más
                  angosta que la otra dice, sin decirlo, cuál de las dos
                  versiones pesa más.
                  ======================================================== */}
              <div className="ds-caras">
                <div className="ds-cara">
                  <span className="ds-quien">
                    DICE QUIEN LA REGISTRÓ · {nombres[r.reportada_por ?? ""] ?? "—"}
                  </span>
                  <p className="ds-dice">
                    {r.descripcion?.trim()
                      ? `«${r.descripcion.trim()}»`
                      : <i className="ds-nada">No escribió nada: solo registró la rotura.</i>}
                  </p>
                  <span className="ds-pruebas">
                    {dm(r.reportada_en)}
                    {" · "}
                    {r.fotos - (r.fotos_descargo ?? 0) > 0
                      ? `${r.fotos - (r.fotos_descargo ?? 0)} foto${r.fotos - (r.fotos_descargo ?? 0) === 1 ? "" : "s"} de la rotura`
                      : <b className="vb-falta">sin foto de la rotura</b>}
                  </span>
                </div>

                <div className="ds-cara ds-contra">
                  <span className="ds-quien">
                    DICE EL OPERADOR LOGÍSTICO · {nombres[r.ol_por ?? ""] ?? "—"}
                  </span>
                  <p className="ds-dice">«{r.ol_nota}»</p>
                  <span className="ds-pruebas">
                    {dm(r.ol_en ?? r.reportada_en)}
                    {" · "}
                    {r.fotos_descargo
                      ? `${r.fotos_descargo} foto${r.fotos_descargo === 1 ? "" : "s"} de descargo`
                      : <b className="vb-falta">sin foto de descargo</b>}
                  </span>
                </div>
              </div>

              {resolviendo?.id === r.id && (
                <div className="vb-obj">
                  <span className="vb-rot">
                    {resolviendo.cuenta
                      ? "¿POR QUÉ SE COBRA IGUAL?"
                      : "¿POR QUÉ NO SE COBRA?"}
                  </span>
                  {/* LOS DOS LADOS EXIGEN MOTIVO, y no solo el que va en
                      contra de alguien. Un desacuerdo que se cierra sin
                      una línea es el que se vuelve a discutir el mes
                      entrante, gane quien gane. */}
                  <div className="vb-linea" style={{ marginTop: 8 }}>
                    <input className="vb-detalle" value={nota}
                           aria-label="Por qué"
                           placeholder={resolviendo.cuenta
                             ? "El acta de entrega del turno los tiene a ellos con el montacargas"
                             : "Tienen razón: ese día el equipo era de la planta"}
                           onChange={(e) => setNota(e.target.value)} />
                    <button type="button" className="btn plano" onClick={cerrar}>Cancelar</button>
                    <button type="button"
                            className={"btn vb-enviar" + (resolviendo.cuenta ? "" : " ds-no")}
                            disabled={mandando || nota.trim().length < 4}
                            onClick={() => resolver(r.id, resolviendo.cuenta, nota)}>
                      {/* EL BOTÓN DICE QUÉ FALTA: apagado y mudo se toca
                          tres veces y después se llama a preguntar. */}
                      {mandando ? "Guardando…"
                        : nota.trim().length < 4 ? "Escribe por qué"
                        : resolviendo.cuenta ? "Confirmar: se cobra" : "Confirmar: no se cobra"}
                    </button>
                  </div>
                  <p className="ds-acta">
                    Esto es <b>definitivo</b> y es lo que queda en el acta del mes. Sea cual
                    sea la decisión, esa línea es lo que la sostiene cuando alguien la lea en
                    enero.
                  </p>
                </div>
              )}

              {abierta === r.id && <div className="vb-ev"><Evidencia id={r.id} /></div>}
            </div>
          );
        })}
      </section>
    </>
  );
}
