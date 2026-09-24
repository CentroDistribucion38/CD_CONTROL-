"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Rotura } from "@/modulos/roturas/datos";
import { Fila } from "../../comunes";
import { Evidencia } from "../../Evidencia";

/**
 * EL VISTO BUENO — AHORA ES DEL OPERADOR LOGÍSTICO.
 *
 * «Registran, llega a Visto bueno, allí EASY dice si está de acuerdo o
 *  no. Si está de acuerdo va para cobro de una y no llega notificación.
 *  Si no está de acuerdo llega la notificación a ABI, y ABI culmina de
 *  decir si se cobra o no. Y en todo se requiere evidencia.»
 *
 * ESTA PANTALLA CAMBIÓ DE DUEÑO. Era de ABI —«cuenta / no cuenta»— y
 * ahora es de Easy —«de acuerdo / en desacuerdo»—. No es el mismo
 * botón con otro nombre: antes una de las dos partes decidía sola
 * cuánto le cobraba a la otra, y la otra se enteraba cuando le llegaba
 * la cuenta. Eso no se concilia: se discute a fin de mes sobre una
 * lista que nadie objetó a tiempo porque nadie tuvo dónde objetarla.
 *
 * «DE ACUERDO» NO PIDE NADA Y «EN DESACUERDO» PIDE DOS COSAS —motivo y
 * foto—, y esa asimetría es deliberada: quien acepta no está probando
 * nada, y cobrarle un trámite por estar de acuerdo es exactamente lo
 * que enseña a rechazar por costumbre. Quien objeta sí tiene que
 * traer con qué, porque ABI va a resolver con eso.
 *
 * LO MÁS VIEJO ARRIBA. Una bandeja ordenada por lo más nuevo deja lo de
 * hace tres días sin mirar para siempre, porque cada mañana entra algo
 * encima.
 */
export function VistoBueno({ roturas, nombres, puedeDecidir }: {
  roturas: Rotura[];
  nombres: Record<string, string>;
  /** Quien tenga «Editar» en esta pantalla: el operador logístico. */
  puedeDecidir: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [abierta, setAbierta] = useState<string | null>(null);
  const [decidiendo, setDecidiendo] = useState<{ id: string; deAcuerdo: boolean } | null>(null);
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [mandando, setMandando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);

  async function decidir(id: string, deAcuerdo: boolean, texto: string) {
    setMandando(true);

    /* LA FOTO DEL DESCARGO VA ANTES QUE LA RESPUESTA, y no después.
       La función la EXIGE: si se mandara después, el rechazo sería
       rechazado por la base y la persona vería un error críptico
       teniendo la foto en la mano. Al revés, si la foto sube y la
       respuesta falla, lo que queda es una evidencia de más — que no
       le hace daño a nadie y se puede volver a intentar. */
    if (!deAcuerdo && foto) {
      const ruta = `${id}/descargo-${Date.now()}.jpg`;
      const { error: eSubir } = await supabase.storage
        .from("roturas").upload(ruta, foto, { contentType: foto.type || "image/jpeg" });
      if (eSubir) {
        setMandando(false);
        avisar.mal("La evidencia no subió, y sin ella el desacuerdo no se puede sostener: " + eSubir.message);
        return;
      }
      const { error: eFila } = await supabase.from("roturas_fotos").insert({
        rotura_id: id, ruta, papel: "descargo", tomada_en: new Date().toISOString(),
      });
      if (eFila) {
        setMandando(false);
        avisar.mal("La evidencia subió pero no quedó registrada: " + eFila.message);
        return;
      }
    }

    const { error } = await supabase.rpc("rotura_visto_bueno", {
      p_id: id, p_de_acuerdo: deAcuerdo, p_nota: texto.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }

    const r = roturas.find((x) => x.id === id);
    avisar.bien(deAcuerdo
      ? `${r?.codigo ?? "La rotura"} queda para cobro. No pasa por ABI.`
      : `${r?.codigo ?? "La rotura"} va a ABI con tu descargo. ABI tiene la última palabra.`);
    setDecidiendo(null); setNota(""); setFoto(null);
    router.refresh();
  }

  const sinFoto = roturas.filter((r) => r.le_falta_foto).length;
  const puedeMandar = decidiendo
    && (decidiendo.deAcuerdo || (nota.trim().length >= 4 && !!foto));

  return (
    <>
      {avisos}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{roturas.length} esperando tu respuesta</h2>
            <p>
              Lo más viejo arriba: al revés, lo de hace tres días no se mira nunca porque cada
              mañana entra algo encima. <b>Lo que aceptes pasa a cobro y no le llega a ABI</b>:
              queda en la data del mes. Lo que objetes va a ABI con tu motivo y tu evidencia,
              y ahí ABI tiene la última palabra.
              {sinFoto > 0 && ` ${sinFoto} no tiene${sinFoto === 1 ? "" : "n"} la foto que su causa exige.`}
            </p>
          </div>
        </div>
      </section>

      {/* Cada rotura es una DECISIÓN, y una decisión necesita su propio
          marco. En una tabla con líneas divisorias los ojos saltan de
          columna a columna; en tarjetas separadas se lee una, se decide,
          y se baja a la siguiente. */}
      <div className="filas">
        {roturas.length === 0 && (
          <div className="caja"><div className="vacio">
            <b>Bandeja limpia</b>
            No hay nada esperando tu visto bueno.
          </div></div>
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
                                onClick={() => { setDecidiendo({ id: r.id, deAcuerdo: true }); setNota(""); setFoto(null) }}>
                          De acuerdo
                        </button>
                        <button type="button" className="btn mal"
                                onClick={() => { setDecidiendo({ id: r.id, deAcuerdo: false }); setNota(""); setFoto(null) }}>
                          En desacuerdo
                        </button>
                      </>
                    )}
                  </div>
                }>
            {r.le_falta_foto && (
              <div className="aviso rojo" style={{ marginTop: 8 }}>
                Esta causa dice que la rotura no fue del OL y no tiene foto. No se puede
                aceptar hasta que alguien suba una: sería un cobro sin con qué sostenerlo.
              </div>
            )}

            {decidiendo?.id === r.id && (
              <div className="panel">
                {decidiendo.deAcuerdo ? (
                  <>
                    <div className="aviso">
                      <b>Esto pasa a cobro de una.</b> No llega a ninguna bandeja de ABI:
                      queda en la data del mes tal como está.
                    </div>
                    <label htmlFor={`nota-${r.id}`}>Nota (opcional)</label>
                    <textarea id={`nota-${r.id}`} rows={2} value={nota}
                              onChange={(e) => setNota(e.target.value)}
                              placeholder="La estiba estaba mal arrumada, fue nuestro." />
                  </>
                ) : (
                  <>
                    <label htmlFor={`nota-${r.id}`}>Por qué NO estás de acuerdo — obligatorio</label>
                    <textarea id={`nota-${r.id}`} rows={2} value={nota}
                              onChange={(e) => setNota(e.target.value)}
                              placeholder="El montacargas de ese turno no era nuestro: el acta de entrega lo dice." />

                    {/* «Y EN TODO SE REQUIERE EVIDENCIA.» Sin foto del
                        descargo, ABI resolvería un pleito donde una
                        parte trajo pruebas y la otra una opinión. */}
                    <label>Evidencia de tu descargo — obligatoria</label>
                    <input ref={camara} type="file" accept="image/*" capture="environment"
                           style={{ display: "none" }}
                           onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
                    <div className="acciones-panel">
                      <button type="button" className="btn" onClick={() => camara.current?.click()}>
                        {foto ? "Cambiar la foto" : "Tomar o escoger la foto"}
                      </button>
                      {foto && <span className="meta">{foto.name}</span>}
                    </div>
                    <div className="aviso">
                      Esto va a ABI y ABI decide con esto. Una objeción sin con qué sostenerla
                      se resuelve en contra sola.
                    </div>
                  </>
                )}

                <div className="acciones-panel">
                  <button type="button"
                          className={"btn " + (decidiendo.deAcuerdo ? "bien" : "mal")}
                          disabled={mandando || !puedeMandar}
                          onClick={() => decidir(r.id, decidiendo.deAcuerdo, nota)}>
                    {/* EL BOTÓN DICE QUÉ FALTA. Un botón apagado sin
                        explicación se toca tres veces y después se
                        reporta como «la app no sirve». */}
                    {mandando ? "Guardando…"
                      : decidiendo.deAcuerdo ? "Confirmar: pasa a cobro"
                      : nota.trim().length < 4 ? "Falta decir por qué"
                      : !foto ? "Falta la evidencia"
                      : "Mandar el desacuerdo a ABI"}
                  </button>
                  <button type="button" className="btn plano"
                          onClick={() => { setDecidiendo(null); setNota(""); setFoto(null) }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {abierta === r.id && <Evidencia id={r.id} />}
          </Fila>
        ))}
      </div>

      {/* La frase que sostiene el módulo entero, donde se toma la
          decisión: lo que se aprueba aquí cuenta unidades, y los kilos
          del vidrio que sale son otra medida que nunca se cuadra con
          esta. Puesta al final de la bandeja y no en un manual. */}
      <div className="aviso">
        <b>Unidades, no kilos.</b> Lo que se acepta aquí alimenta el conteo por proceso y por
        causa. El peso del vidrio que sale de la bodega se mide aparte, en Salida, y los dos
        números nunca se cuadran entre sí.
      </div>
    </>
  );
}
