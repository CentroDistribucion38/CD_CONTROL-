"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import type { Rotura } from "@/modulos/roturas/datos";
import { Evidencia } from "../../Evidencia";
import { Cifras } from "../../comunes";

/**
 * EL VISTO BUENO — DEL OPERADOR LOGÍSTICO.
 *
 * «Registran, llega a Visto bueno, allí EASY dice si está de acuerdo o
 *  no. Si está de acuerdo va para cobro de una y no llega notificación.
 *  Si no está de acuerdo llega la notificación a ABI. Y en todo se
 *  requiere evidencia.»
 *
 * ---------------------------------------------------------------------
 * ES UNA LISTA DE FILAS Y NO DE TARJETAS
 * ---------------------------------------------------------------------
 * La versión anterior era una tarjeta por rotura, como las bandejas de
 * firma. Se cambió contra la maqueta y la razón es que aquí NO se lee
 * una y se decide: se barren quince de corrido, y en quince tarjetas
 * apiladas la unidad, la causa y el botón caen en sitios distintos en
 * cada una. En filas, la columna de unidades es una columna: el ojo
 * baja en línea recta y compara sin leer.
 *
 * ---------------------------------------------------------------------
 * LOS MOTIVOS SON BOTONES, NO UN CAMPO DE TEXTO
 * ---------------------------------------------------------------------
 * Objetar exige decir por qué. Pedirlo escribiendo, con guante y de
 * pie, es lo que hace que la gente acepte por no teclear — y entonces
 * la conciliación deja de medir lo que pasa y mide quién tiene tiempo.
 * Cuatro motivos cubren lo que de verdad se objeta; el detalle libre
 * queda, pero OPCIONAL.
 *
 * LA FOTO SÍ ES OBLIGATORIA, y el detalle no. No es incoherente: sin
 * foto, ABI resuelve un pleito donde una parte trajo pruebas y la otra
 * una opinión. El detalle lo puede suplir el motivo; la prueba no la
 * suple nada.
 *
 * ---------------------------------------------------------------------
 * «ACEPTAR TODAS» EXISTE Y PIDE CONFIRMACIÓN
 * ---------------------------------------------------------------------
 * Es lo que se hace casi siempre —la mayoría de las roturas son del
 * OL y nadie las discute—, y sin ese botón son tres toques por cada
 * una. Pero manda TODAS a cobro de una vez y eso no se deshace desde
 * aquí, así que se confirma diciendo cuántas y cuántas unidades.
 */

const MOTIVOS = [
  "No fue en nuestro turno",
  "La causa está mal",
  "La cantidad no cuadra",
  "Ya se había reportado",
] as const;

const dm = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });

/** «hace 3 días», «ayer», «hoy». La antigüedad es la que apura. */
function hace(iso: string) {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400_000);
  if (d <= 0) return { txt: "hoy", viejo: false };
  if (d === 1) return { txt: "ayer", viejo: false };
  return { txt: `hace ${d} días`, viejo: d >= 3 };
}

export function VistoBueno({ roturas, nombres, puedeDecidir, cifras }: {
  roturas: Rotura[];
  nombres: Record<string, string>;
  puedeDecidir: boolean;
  /** Las tres cifras del mes que van al lado de «esperan tu respuesta». */
  cifras: { aCobro: number; enDesacuerdo: number; noSeCobran: number };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();

  const [objetando, setObjetando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string>("");
  const [detalle, setDetalle] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);

  /* LA MÁS VIEJA ARRIBA. Al revés, lo de hace tres días no se mira
     nunca porque cada mañana entra algo encima. */
  const lista = [...roturas].sort(
    (a, b) => Date.parse(a.reportada_en) - Date.parse(b.reportada_en));
  const enJuego = lista.reduce((s, r) => s + r.unidades, 0);

  function cerrar() { setObjetando(null); setMotivo(""); setDetalle(""); setFoto(null) }

  async function aceptar(r: Rotura) {
    setMandando(true);
    const { error } = await supabase.rpc("rotura_visto_bueno", {
      p_id: r.id, p_de_acuerdo: true, p_nota: null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${r.codigo} pasa a cobro. No le llega a ABI.`);
    router.refresh();
  }

  async function aceptarTodas() {
    /* LAS QUE NO SE PUEDEN ACEPTAR NO SE MANDAN. La pantalla YA sabe
       cuáles son —su causa exige foto y no la tienen, y su botón está
       apagado diciéndolo—, así que mandarlas para que la base las
       rechace y después contarlas como fallo es hacerle creer a alguien
       que algo salió mal cuando estaba dicho desde antes. Se dice
       cuántas quedan fuera y por qué. */
    const puedo = lista.filter((r) => !(r.exige_foto && !r.fotos));
    const fuera = lista.length - puedo.length;
    if (puedo.length === 0) {
      avisar.mal("Ninguna se puede aceptar: a todas les falta la foto que exige su causa.");
      return;
    }
    const unidades = puedo.reduce((s, r) => s + r.unidades, 0);
    if (!(await pedir({
      titulo: `¿Aceptar ${puedo.length === lista.length ? `las ${puedo.length}` : puedo.length}?`,
      dice: `Son ${unidades} unidades que pasan a cobro de una vez. No le llegan a ABI: ` +
            "quedan en la data del mes. Desde aquí no se deshace." +
            (fuera ? ` ${fuera} se queda${fuera === 1 ? "" : "n"} fuera: le${fuera === 1 ? "" : "s"} ` +
                     "falta la foto que exige su causa." : ""),
      confirmar: `Aceptar ${puedo.length}`,
    }))) return;

    setMandando(true);
    /* UNA POR UNA Y EN SERIE, no todas a la vez: la función comprueba
       la foto que exige cada causa, así que unas pueden pasar y otras
       no. Se cuenta cuántas quedaron y se dice — «se aceptaron todas»
       cuando dos fallaron es peor que no tener el botón. */
    let bien = 0; const mal: string[] = [];
    for (const r of puedo) {
      const { error } = await supabase.rpc("rotura_visto_bueno", {
        p_id: r.id, p_de_acuerdo: true, p_nota: null,
      });
      if (error) mal.push(r.codigo); else bien++;
    }
    setMandando(false);
    if (mal.length === 0) avisar.bien(`${bien} a cobro. Ninguna le llegó a ABI.`);
    else avisar.mal(`${bien} pasaron a cobro. ${mal.length} no: ${mal.join(", ")}. ` +
                    "Casi siempre es que les falta la foto que exige su causa.");
    router.refresh();
  }

  async function enviarObjecion(r: Rotura) {
    if (!motivo) { avisar.mal("Falta escoger por qué no estás de acuerdo."); return }
    if (!foto) { avisar.mal("Falta la evidencia: sin foto, ABI resuelve con una sola versión."); return }

    setMandando(true);
    /* LA FOTO VA ANTES QUE LA RESPUESTA. La función la EXIGE: al revés,
       la base rechazaría la objeción y la persona vería un error
       críptico teniendo la foto en la mano. */
    const ruta = `${r.id}/descargo-${Date.now()}.jpg`;
    const { error: eSubir } = await supabase.storage
      .from("roturas").upload(ruta, foto, { contentType: foto.type || "image/jpeg" });
    if (eSubir) {
      setMandando(false);
      avisar.mal("La evidencia no subió, y sin ella la objeción no se sostiene: " + eSubir.message);
      return;
    }
    const { error: eFila } = await supabase.from("roturas_fotos").insert({
      rotura_id: r.id, ruta, papel: "descargo", tomada_en: new Date().toISOString(),
    });
    if (eFila) {
      setMandando(false);
      avisar.mal("La evidencia subió pero no quedó registrada: " + eFila.message);
      return;
    }

    /* EL MOTIVO VA PRIMERO EN LA NOTA y el detalle detrás: es lo que
       ABI lee de un vistazo en su bandeja. */
    const nota = detalle.trim() ? `${motivo} — ${detalle.trim()}` : motivo;
    const { error } = await supabase.rpc("rotura_visto_bueno", {
      p_id: r.id, p_de_acuerdo: false, p_nota: nota,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${r.codigo} va a ABI con tu descargo. ABI tiene la última palabra.`);
    cerrar();
    router.refresh();
  }

  return (
    <>
      {avisos}{dialogo}

      {/* LAS CUATRO CIFRAS DEL MES, y la primera es la que decide él:
          las otras tres están para que sepa cómo va la conciliación sin
          tener que ir a otra pantalla.

          LA DIBUJA <Cifras>, que es la MISMA de los desacuerdos: las
          dos bandejas miden el mismo montón en momentos distintos, y
          dos copias del dibujo se desincronizan —una cuenta anuladas y
          la otra no— hasta decir números distintos del mismo mes. */}
      <Cifras cifras={[
        { n: lista.length, rot: "ESPERAN TU RESPUESTA", pie: "decides tú", aqui: true },
        { n: cifras.aCobro, rot: "A COBRO", pie: "aceptadas este mes" },
        { n: cifras.enDesacuerdo, rot: "EN DESACUERDO · ABI", pie: "ABI tiene la última palabra" },
        { n: cifras.noSeCobran, rot: "NO SE COBRAN", pie: "ABI dijo que no cuentan", mal: true },
      ]} />

      <section className="caja vb-caja">
        <div className="vb-cab">
          <div className="vb-izq">
            <h2>{lista.length} esperando tu respuesta</h2>
            <p className="vb-como">
              Lo que <b>aceptas</b> pasa a cobro de una y <b>no le llega a ABI</b>: queda en
              la data del mes. Lo que <b>objetas</b> va a ABI con tu foto, y ABI decide.
            </p>
          </div>
          <div className="vb-der">
            <span className="vb-nota">
              la más vieja arriba · <b>{enJuego} und</b> en juego
            </span>
            {/* QUÉ PASA CON CADA BOTÓN, ESCRITO. Es la mitad del pedido
                —«si está de acuerdo va para cobro de una y NO LLEGA
                NOTIFICACIÓN; si no, llega la notificación a ABI»— y es
                justo la parte que una pantalla se traga sin que se
                note: los dos botones se ven igual de inocentes, y uno
                de los dos cierra el cobro sin que nadie más lo mire. */}
            {puedeDecidir && lista.length > 1 && (
              <button type="button" className="btn" disabled={mandando}
                      onClick={aceptarTodas}>
                Aceptar todas
              </button>
            )}
          </div>
        </div>

        {lista.length === 0 && (
          <div className="vacio">
            <b>Bandeja limpia</b>
            No hay nada esperando tu respuesta. Lo que aceptes pasa a cobro; lo que objetes
            va a ABI.
          </div>
        )}

        {lista.map((r) => {
          const h = hace(r.reportada_en);
          return (
            <div key={r.id} className="vb-grupo">
              <div className="vb-fila">
                {/* LA FOTO EN MINIATURA, y cuando no hay se dice: una
                    causa que exige foto y no la tiene no se puede
                    aceptar, y eso hay que verlo ANTES de tocar. */}
                <button type="button" className={"vb-foto" + (r.fotos ? "" : " sin")}
                        onClick={() => setAbierta(abierta === r.id ? null : r.id)}
                        aria-label={r.fotos ? "Ver la foto" : "No tiene foto"}>
                  {r.fotos > 0 && <i>foto</i>}
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
                    {r.exige_foto && <> · {r.fotos ? "con foto" : <b className="vb-falta">SIN FOTO</b>}</>}
                  </div>
                </div>

                <div className="vb-quien">
                  <div>{nombres[r.reportada_por ?? ""] ?? "—"} · {dm(r.reportada_en)}</div>
                  <div className={"vb-sub" + (h.viejo ? " vb-viejo" : "")}>{h.txt}</div>
                </div>

                {puedeDecidir && (
                  <div className="vb-btns">
                    <button type="button" className="btn" disabled={mandando}
                            onClick={() => {
                              if (objetando === r.id) { cerrar(); return }
                              cerrar(); setObjetando(r.id);
                            }}>
                      Objetar
                    </button>
                    {/* EL BOTÓN DICE QUÉ FALTA, igual que el de enviar.
                        La causa de esta rotura EXIGE foto y no la tiene:
                        la base va a rechazar la aceptación. Un «Aceptar»
                        normal que revienta al tocarlo se toca tres veces
                        y después se llama a preguntar; y un «SIN FOTO»
                        en rojo al lado no dice que por eso no se pueda.

                        NO SE OCULTA EL BOTÓN: escondido parecería que a
                        esa rotura no hay nada que hacerle. Se apaga y
                        dice por qué. */}
                    <button type="button"
                            className={"btn si" + (r.exige_foto && !r.fotos ? " vb-sin" : "")}
                            disabled={mandando || (r.exige_foto && !r.fotos)}
                            title={r.exige_foto && !r.fotos
                              ? "No se puede aceptar sin la foto que exige esta causa"
                              : undefined}
                            onClick={() => aceptar(r)}>
                      {r.exige_foto && !r.fotos ? "No se puede aceptar" : "Aceptar"}
                    </button>
                  </div>
                )}
              </div>

              {objetando === r.id && (
                <div className="vb-obj">
                  <span className="vb-rot">¿POR QUÉ NO ESTÁS DE ACUERDO?</span>
                  <div className="vb-motivos">
                    {MOTIVOS.map((m) => (
                      <button key={m} type="button"
                              className={"btn" + (motivo === m ? " vb-on" : "")}
                              onClick={() => setMotivo(m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="vb-linea">
                    <input className="vb-detalle" value={detalle}
                           placeholder="Detalle para ABI (opcional)"
                           aria-label="Detalle para ABI"
                           onChange={(e) => setDetalle(e.target.value)} />
                    <input ref={camara} type="file" accept="image/*" capture="environment"
                           style={{ display: "none" }}
                           onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
                    <button type="button" className={"vb-foto-bt" + (foto ? " puesta" : "")}
                            onClick={() => camara.current?.click()}>
                      {foto ? `✓ ${foto.name.slice(0, 18)}` : "+ Foto de evidencia"}
                    </button>
                    <button type="button" className="btn plano" onClick={cerrar}>Cancelar</button>
                    <button type="button" className="btn vb-enviar"
                            disabled={mandando || !motivo || !foto}
                            onClick={() => enviarObjecion(r)}>
                      {/* EL BOTÓN DICE QUÉ FALTA: apagado y mudo se toca
                          tres veces y después se llama a preguntar. */}
                      {mandando ? "Enviando…"
                        : !motivo ? "Escoge el motivo"
                        : !foto ? "Falta la foto"
                        : "Enviar a ABI"}
                    </button>
                  </div>
                </div>
              )}

              {abierta === r.id && <div className="vb-ev"><Evidencia id={r.id} /></div>}
            </div>
          );
        })}
      </section>

      <div className="aviso">
        <b>Unidades, no kilos.</b> Lo que aceptas aquí alimenta el conteo por proceso y por
        causa. El peso del vidrio que sale de la bodega se mide aparte, en Salida, y los dos
        números nunca se cuadran entre sí.
      </div>
    </>
  );
}
