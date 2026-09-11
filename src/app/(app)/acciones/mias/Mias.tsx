"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Accion, Motivo, Zona } from "@/modulos/acciones/datos";
import { useAvisos } from "@/components/Aviso";
import { usePosicion, sellar, type Foto } from "@/lib/evidencia";
import { Fila, fecha } from "../comunes";
import { Evidencia } from "../Evidencia";
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
 *
 * Y PIDE —sin obligar— LA FOTO DE CÓMO QUEDÓ. Con la del hallazgo al
 * lado, el antes y el después se ven de un vistazo y verificar deja de
 * ser creerle a un texto. No es obligatoria a propósito: hay cosas que
 * no se pueden fotografiar, y una foto obligatoria en esos casos produce
 * fotos del piso con tal de pasar al siguiente paso. Lo que sí se dice,
 * con esas palabras, es qué pierde un cierre sin foto.
 */
export function Mias({ acciones, zonas, motivos, plazos, gente, puedeEditar, manda }: {
  acciones: Accion[];
  zonas: Zona[];
  motivos: Motivo[];
  plazos: Record<string, { horas: number; etiqueta: string }>;
  /** Para asignar sin salir de la pantalla de "quedó reportada". */
  gente?: { id: string; nombre: string | null; usuario: string | null;
            rol: string; abiertas: number; vencidas: number; saturado: boolean }[];
  puedeEditar: boolean;
  /** El administrador: el único que corrige y quita del seguimiento. */
  manda: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [reportando, setReportando] = useState(false);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [mandando, setMandando] = useState(false);
  const [viendo, setViendo] = useState<string | null>(null);

  /* La foto de cómo quedó. Se sella aquí, en el teléfono, igual que
     la del hallazgo: entre tomarla y subirla pueden pasar veinte
     minutos sin señal, y la hora que quedaría escrita sería la de
     la subida. */
  const [foto, setFoto] = useState<Foto | null>(null);
  const [sellando, setSellando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const { ubi, direccion, pedir } = usePosicion();

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url) }, [foto]);

  async function tomarFoto(e: React.ChangeEvent<HTMLInputElement>, codigo: string) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSellando(true);
    try {
      const f = await sellar(archivo, {
        titulo: codigo, ubi, direccion, etiqueta: "CÓMO QUEDÓ",
      });
      if (foto) URL.revokeObjectURL(foto.url);
      setFoto(f);
    } catch {
      avisar.mal("No se pudo procesar esa foto. Vuelve a tomarla.");
    }
    setSellando(false);
  }

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
    if (error) { setMandando(false); avisar.mal(error.message); return }

    /* La foto va DESPUÉS del cierre, porque su ruta lleva el id. Si
       falla, la acción YA quedó cerrada y eso es lo correcto: perder el
       cierre porque no subió una imagen sería cambiar lo importante por
       lo accesorio. Se dice que faltó la foto y se sigue. */
    if (foto) {
      const ruta = `${id}/cierre.jpg`;
      const { error: eSubir } = await supabase.storage
        .from("acciones").upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
      if (eSubir) {
        avisar.info("Quedó cerrada, pero la foto no subió. Se puede agregar después.");
      } else {
        await supabase.from("acciones_fotos").insert({
          accion_id: id, ranura: "cierre", ruta,
          ancho: foto.ancho, alto: foto.alto, bytes: foto.blob.size,
          tomada_en: ubi?.en ?? new Date().toISOString(),
          lat: ubi?.lat ?? null, lng: ubi?.lng ?? null,
          precision_m: ubi ? Math.round(ubi.precision) : null,
        });
      }
      URL.revokeObjectURL(foto.url);
    }

    setMandando(false);
    avisar.bien("Quedó a la espera de que alguien verifique si sirvió.");
    setCerrando(null);
    setTexto("");
    setFoto(null);
    router.refresh();
  }

  return (
    <>
      {avisos}

      {reportando && (
        <Reportar zonas={zonas} motivos={motivos} plazos={plazos} gente={gente}
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
                    <div className="par">
                      <button type="button" className="btn"
                              onClick={() => setViendo(viendo === a.id ? null : a.id)}>
                        {viendo === a.id ? "Cerrar" : `Ver${a.fotos ? ` · ${a.fotos} foto${a.fotos === 1 ? "" : "s"}` : ""}`}
                      </button>
                      <button type="button" className="btn si"
                              onClick={() => {
                                setCerrando(cerrando === a.id ? null : a.id);
                                setTexto("");
                                if (foto) { URL.revokeObjectURL(foto.url); setFoto(null) }
                                pedir();
                              }}>
                        Ya lo hice
                      </button>
                    </div>
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
                  <div>
                    <label>LA FOTO DE CÓMO QUEDÓ (opcional)</label>
                    <div className="cerrar-foto">
                      {foto ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={foto.url} alt="Cómo quedó" />
                      ) : (
                        <div className="hueco">{sellando ? "Sellando…" : "Sin foto"}</div>
                      )}
                      <div>
                        <input ref={camara} type="file" accept="image/*" capture="environment"
                               onChange={(e) => tomarFoto(e, a.codigo)} hidden />
                        <button type="button" className="btn" disabled={sellando}
                                onClick={() => camara.current?.click()}>
                          {foto ? "Tomar otra" : "Abrir la cámara"}
                        </button>
                        <p>
                          Con la del hallazgo al lado, el antes y el después se ven de un vistazo.
                          No es obligatoria — pero sin ella, verificar es creerle a un texto.
                        </p>
                      </div>
                    </div>
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
              {viendo === a.id && <Evidencia accion={a} puedeEditar={puedeEditar} manda={manda} />}
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
                <Fila key={a.id} a={a} nombres={{}}
                      derecha={
                        <button type="button" className="btn"
                                onClick={() => setViendo(viendo === a.id ? null : a.id)}>
                          {viendo === a.id ? "Cerrar" : "Ver"}
                        </button>
                      }>
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
                  {viendo === a.id && <Evidencia accion={a} puedeEditar={puedeEditar} manda={manda} />}
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
