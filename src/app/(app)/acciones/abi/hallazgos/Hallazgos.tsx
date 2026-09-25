"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { sellar } from "@/lib/evidencia";
import { usePedirTexto } from "@/components/PedirTexto";
import { useConfirmar } from "@/components/Confirmar";
import type { Hallazgo } from "@/modulos/acciones/hallazgos";
import type { Motivo } from "@/modulos/acciones/datos";

/**
 * LOS HALLAZGOS — donde se redacta, se abre la acción y se cierra.
 *
 * ---------------------------------------------------------------------
 * LA MÁQUINA PROPONE, LA PERSONA APRUEBA
 * ---------------------------------------------------------------------
 * «Redactar técnico» manda lo que se dictó en la bodega y trae una
 * propuesta. Esa propuesta NO SE GUARDA: cae en un campo editable y
 * solo se escribe en la base cuando alguien aprieta Aprobar.
 *
 * Y SE GUARDAN LAS DOS COSAS APARTE: lo que propuso la máquina en
 * `ia_borrador` y lo que aprobó la persona en `redaccion`. Con una sola
 * columna no habría forma de contestar «¿esto lo revisó alguien?», que
 * es exactamente la pregunta que se hace cuando un informe se cae.
 * Cuando la redacción aprobada es idéntica al borrador, la fila lo dice
 * — no es un error, pero un informe donde TODO salió así es un informe
 * que nadie leyó.
 *
 * SIN LLAVE DEL MODELO, LA PANTALLA FUNCIONA IGUAL. El botón avisa qué
 * falta y el campo de texto sigue ahí: la IA es una ayuda, no un
 * requisito. Un módulo que se traba porque venció una llave es un
 * módulo que no se puede usar el día que más falta hace.
 *
 * ---------------------------------------------------------------------
 * LOS DOS TEXTOS, UNO AL LADO DEL OTRO
 * ---------------------------------------------------------------------
 * Lo que se vio a la izquierda y la redacción a la derecha, del mismo
 * ancho. Es lo único que deja comprobar que la segunda dice lo mismo
 * que la primera, y con una escondida detrás de un «Ver» nadie compara.
 */

const SEV: Record<string, { t: string; c: string }> = {
  observacion: { t: "OBSERVACIÓN", c: "hz-obs" },
  hallazgo:    { t: "HALLAZGO",    c: "hz-hal" },
  critico:     { t: "CRÍTICO",     c: "hz-cri" },
};
const ESTADO: Record<string, { t: string; c: string }> = {
  borrador: { t: "BORRADOR", c: "hz-e-bor" },
  firme:    { t: "FIRME",    c: "hz-e-fir" },
  cerrado:  { t: "CERRADO",  c: "hz-e-cer" },
  anulado:  { t: "ANULADO",  c: "hz-e-anu" },
};

const dma = (f: string) => f.split("-").reverse().join("/");

export function Hallazgos({ hallazgos, nombres, motivos, puedeEditar, manda }: {
  hallazgos: Hallazgo[];
  nombres: Record<string, string>;
  motivos: Motivo[];
  puedeEditar: boolean;
  manda: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedirTexto, cuadro] = usePedirTexto();
  const [pedir, dialogo] = useConfirmar();

  const [filtro, setFiltro] = useState<"pendientes" | "todos" | "cerrados">("pendientes");
  const [abierto, setAbierto] = useState<string | null>(null);
  /* EL BORRADOR DE CADA UNO, mientras se edita. Vive en la pantalla y
     no en la base: lo que está a medio escribir no es todavía el texto
     del informe. */
  const [texto, setTexto] = useState<Record<string, string>>({});
  const [mandando, setMandando] = useState(false);
  const [redactando, setRedactando] = useState<string | null>(null);
  const [escogidos, setEscogidos] = useState<Set<string>>(new Set());
  const [subiendo, setSubiendo] = useState<string | null>(null);

  const lista = hallazgos.filter((h) =>
    filtro === "todos" ? true
      : filtro === "cerrados" ? h.estado === "cerrado" || h.estado === "anulado"
      : h.estado === "borrador" || h.estado === "firme");

  const escogidosVisibles = lista.filter((h) => escogidos.has(h.id));
  const todosPuestos = lista.length > 0 && escogidosVisibles.length === lista.length;

  function cambiarFiltro(v: typeof filtro) {
    setFiltro(v); setEscogidos(new Set()); setAbierto(null);
  }
  function alternar(id: string) {
    setEscogidos((a) => { const n = new Set(a); n.has(id) ? n.delete(id) : n.add(id); return n });
  }
  const valor = (h: Hallazgo) => texto[h.id] ?? h.redaccion ?? "";

  /* ---------- LA IA PROPONE ---------- */
  async function redactarConIa(h: Hallazgo) {
    setRedactando(h.id);
    try {
      const r = await fetch("/api/acciones/redactar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: h.lo_que_se_vio }),
      });
      const j = await r.json();
      if (!r.ok) { avisar.mal(j?.error ?? "No se pudo redactar."); return }
      /* CAE EN EL CAMPO, NO EN LA BASE. Lo que sale en el informe lo
         aprueba una persona. */
      setTexto((t) => ({ ...t, [h.id]: j.texto as string }));
      /* Y SE DEJA CONSTANCIA DE QUE LA MÁQUINA PROPUSO ESTO, aunque
         después se edite: es la mitad de poder decir qué revisó
         alguien. */
      await supabase.rpc("hallazgo_ia_guardar", { p_id: h.id, p_texto: j.texto });
      avisar.bien("Propuesta lista. Léela, corrígela y apruébala: no se guardó todavía.");
    } catch {
      avisar.mal("No se pudo hablar con el servidor. Escribe la redacción a mano.");
    } finally {
      setRedactando(null);
    }
  }

  /* ---------- LA PERSONA APRUEBA ---------- */
  async function aprobar(h: Hallazgo) {
    const t = valor(h).trim();
    if (t.length < 15) { avisar.mal("La redacción está muy corta para un informe."); return }
    setMandando(true);
    const { error } = await supabase.rpc("hallazgo_redactar", { p_id: h.id, p_texto: t });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${h.codigo} queda firme: ya puede salir en el informe.`);
    setTexto((x) => { const n = { ...x }; delete n[h.id]; return n });
    router.refresh();
  }

  async function abrirAccion(h: Hallazgo) {
    const motivo = motivos[0]?.clave;
    if (!motivo) { avisar.mal("No hay motivos en el maestro de Acciones."); return }
    if (!(await pedir({
      titulo: `¿Abrir una acción desde ${h.codigo}?`,
      dice: <>Se crea en <b>OL</b> con su plazo y su responsable por defecto, y queda amarrada
             a este hallazgo. La descripción se lleva la redacción técnica.</>,
      confirmar: "Abrir la acción",
    }))) return;
    setMandando(true);
    const { data, error } = await supabase.rpc("hallazgo_abrir_accion", {
      p_id: h.id, p_prioridad: h.severidad === "critico" ? "alta" : "media", p_motivo: motivo,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    const fila = Array.isArray(data) ? data[0] : data;
    avisar.bien(`Se abrió ${fila?.accion_codigo ?? "la acción"} en OL, amarrada a ${h.codigo}.`);
    router.refresh();
  }

  /* ---------- LA FOTO DEL DESPUÉS ----------
     VA AQUÍ Y NO EN LEVANTAR. En Levantar solo existe el «antes»: el
     «después» es de semanas más tarde, cuando alguien ya arregló lo que
     se encontró. Es la que hace que el informe muestre el par, y sin un
     sitio donde subirla el informe saldría siempre con la mitad
     derecha vacía.

     Y ES UNA COLUMNA, NO UNA NOTA ESCRITA A MANO. Con la palabra
     escrita, basta que alguien ponga «Despues» sin tilde para que la
     foto se vaya al lado equivocado del PDF que va a gerencia. */
  async function subirDespues(h: Hallazgo, fs: FileList | null) {
    if (!fs || fs.length === 0) return;
    const archivos = Array.from(fs).slice(0, 4);
    setSubiendo(h.id);
    let malas = 0;
    for (const archivo of archivos) {
      /* SE SELLA ANTES DE SUBIR, igual que en todas partes: lee el
         archivo de verdad —en el iPhone una foto que sigue en iCloud
         llega con CERO bytes y Supabase contesta «No content
         provided»—, lo encoge de seis megas a medio, y le quema la
         hora. La del «después» es la que demuestra que se arregló:
         sin hora encima no demuestra cuándo. */
      let foto;
      try {
        foto = await sellar(archivo, {
          titulo: h.codigo, ubi: null, direccion: "", etiqueta: "DESPUÉS",
        });
      } catch { malas++; continue }

      const ruta = `${h.id}/despues-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: eSubir } = await supabase.storage
        .from("acciones").upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
      /* LA URL SE SUELTA SIEMPRE, salga bien o mal: son hasta cuatro
         fotos por vez y cada una deja una viva hasta que se suelta. */
      URL.revokeObjectURL(foto.url);
      if (eSubir) { malas++; continue }
      const { error: eFila } = await supabase.from("acciones_hallazgos_fotos").insert({
        hallazgo_id: h.id, ruta, momento: "despues", tomada_en: foto.tomada,
      });
      if (eFila) malas++;
    }
    setSubiendo(null);
    /* SE DICE CUÁNTAS FALLARON. «Listo» cuando tres de cuatro no
       subieron es peor que no decir nada: alguien cierra el informe
       creyendo que la evidencia está. */
    if (malas > 0) {
      avisar.mal(`${malas} de ${archivos.length} no subió. Si la escogiste del carrete, ` +
                 "ábrela primero en Fotos para que se descargue, y vuelve a intentar.");
    }
    else avisar.bien(`Evidencia del después guardada en ${h.codigo}.`);
    router.refresh();
  }

  async function cerrar(h: Hallazgo) {
    if (!(await pedir({
      titulo: `¿Cerrar ${h.codigo}?`,
      dice: <>Cerrar quiere decir que <b>ya se arregló</b>. Sigue saliendo en el informe —un
             hallazgo cerrado es de los que mejor se ven, con su antes y su después—; lo que
             cambia es que deja de estar pendiente.</>,
      confirmar: "Cerrar el hallazgo",
    }))) return;
    setMandando(true);
    const { error } = await supabase.rpc("hallazgo_cerrar", { p_id: h.id });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${h.codigo} quedó cerrado.`);
    router.refresh();
  }

  async function anular(h: Hallazgo) {
    const m = await pedirTexto({
      titulo: `¿Anular ${h.codigo}?`,
      dice: <>La fila <b>se queda</b> con el motivo y con quién la anuló, y deja de salir en el
             informe. Es lo que se hace con un hallazgo que resultó no serlo.</>,
      rotulo: "Por qué se anula", confirmar: "Anular", minimo: 4, largo: true,
    });
    if (m === null) return;
    setMandando(true);
    const { error } = await supabase.rpc("hallazgo_anular", { p_id: h.id, p_motivo: m });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${h.codigo} quedó anulado.`);
    router.refresh();
  }

  async function borrarEscogidos() {
    const n = escogidosVisibles.length;
    if (n === 0) return;
    const firmes = escogidosVisibles.filter((h) => h.estado !== "borrador").length;
    const m = await pedirTexto({
      titulo: n === 1 ? `¿Borrar ${escogidosVisibles[0].codigo}?` : `¿Borrar ${n} hallazgos?`,
      dice: (
        <>
          Se van con <b>sus evidencias</b>. <b>No se puede deshacer.</b>
          {firmes > 0 && (
            <> {firmes === 1
              ? <>Uno de ellos <b>ya está firme</b>: pudo haber salido en un informe.</>
              : <><b>{firmes} ya están firmes</b>: pudieron haber salido en un informe.</>}</>
          )}
          {" "}Si lo que quieres es que dejen de salir, <b>anúlalos</b> — eso deja la fila y el
          motivo.
        </>
      ),
      rotulo: "Por qué se borran",
      marcador: "Queda en el registro de borrados, no en la fila",
      confirmar: `Borrar ${n}`, peligro: true, minimo: 8, largo: true,
      debesEscribir: `BORRAR ${n}`,
    });
    if (m === null) return;
    setMandando(true);
    const { data, error } = await supabase.rpc("hallazgo_borrar", {
      p_ids: escogidosVisibles.map((h) => h.id), p_motivo: m,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`Se borraron ${Number(data ?? n)} hallazgo${Number(data ?? n) === 1 ? "" : "s"}.`);
    setEscogidos(new Set());
    router.refresh();
  }

  return (
    <>
      {avisos}{cuadro}{dialogo}

      <div className="filtros hz-filtros">
        {([["pendientes", "Sin cerrar"], ["cerrados", "Cerrados y anulados"],
           ["todos", "Todos"]] as const).map(([v, t]) => (
          <button key={v} type="button" className={"btn" + (filtro === v ? " si" : "")}
                  onClick={() => cambiarFiltro(v)}>
            {t} <em className="hz-n">
              {v === "todos" ? hallazgos.length
                : v === "cerrados"
                  ? hallazgos.filter((h) => h.estado === "cerrado" || h.estado === "anulado").length
                  : hallazgos.filter((h) => h.estado === "borrador" || h.estado === "firme").length}
            </em>
          </button>
        ))}
      </div>

      <section className="caja hz-caja">
        <div className="cab">
          <div>
            <h2>{lista.length} hallazgo{lista.length === 1 ? "" : "s"}</h2>
            <p>
              Lo que se vio a la izquierda, la redacción del informe a la derecha. Se guardan
              las dos: si se pierde la primera, nadie puede comprobar que la segunda dice lo
              mismo.
            </p>
          </div>
        </div>

        {/* BORRAR ES DEL ADMINISTRADOR. Un hallazgo firme pudo salir en
            un informe, y hacerlo desaparecer es otra cosa que
            corregirse — por eso no basta con editar ABI. */}
        {manda && lista.length > 0 && (
          <div className="hz-sel">
            <label className="hz-todos">
              <input type="checkbox" checked={todosPuestos}
                     aria-label="Escoger todos los que se ven"
                     onChange={() => setEscogidos(todosPuestos
                       ? new Set() : new Set(lista.map((h) => h.id)))} />
              <span>
                {todosPuestos ? `Los ${lista.length} están escogidos`
                              : `Escoger los ${lista.length} que se ven`}
              </span>
            </label>
            {escogidosVisibles.length > 0 && (
              <div className="hz-sel-acc">
                <span className="hz-cuenta"><b>{escogidosVisibles.length}</b> escogido
                  {escogidosVisibles.length === 1 ? "" : "s"}</span>
                <button type="button" className="btn plano" disabled={mandando}
                        onClick={() => setEscogidos(new Set())}>Quitar la selección</button>
                <button type="button" className="btn mal" disabled={mandando}
                        onClick={borrarEscogidos}>
                  {mandando ? "Borrando…" : `Borrar ${escogidosVisibles.length}`}
                </button>
              </div>
            )}
          </div>
        )}

        {lista.length === 0 && (
          <div className="vacio">
            <b>Nada por aquí</b>
            {hallazgos.length
              ? "Con este filtro no queda ninguno."
              : "Todavía no se ha levantado ningún hallazgo. Se levantan en la pantalla de al lado."}
          </div>
        )}

        {lista.map((h) => {
          const sev = SEV[h.severidad] ?? SEV.hallazgo;
          const est = ESTADO[h.estado] ?? ESTADO.borrador;
          const editable = puedeEditar && h.estado !== "cerrado" && h.estado !== "anulado";
          return (
            <div key={h.id} className={"hz-fila" + (escogidos.has(h.id) ? " hz-puesta" : "")}>
              <div className="hz-cab">
                {manda && (
                  <label className="hz-caja-sel">
                    <input type="checkbox" checked={escogidos.has(h.id)}
                           aria-label={`Escoger ${h.codigo}`}
                           onChange={() => alternar(h.id)} />
                  </label>
                )}
                <span className="hz-cod">{h.codigo}</span>
                <span className={"hz-eti " + sev.c}>{sev.t}</span>
                <span className={"hz-eti " + est.c}>{est.t}</span>
                <span className="hz-donde">
                  {h.tema_nombre} · {h.zona_nombre ?? h.ubicacion} · {dma(h.fecha)}
                </span>
                <span className="hz-der">
                  {h.fotos > 0 && (
                    <button type="button" className="btn"
                            onClick={() => setAbierto(abierto === h.id ? null : h.id)}>
                      {abierto === h.id ? "Esconder fotos"
                        : `Ver · ${h.fotos_antes} antes · ${h.fotos_despues} después`}
                    </button>
                  )}

                  {/* LA DEL DESPUÉS, A LA VISTA Y CON LA CUENTA ENCIMA.
                      Es la que falta casi siempre —se levanta el
                      hallazgo y nadie vuelve— y es la que deja el
                      informe con la mitad derecha en blanco. */}
                  {editable && (
                    <label className={"btn" + (h.fotos_despues === 0 ? " hz-pendiente" : "")}
                           style={{ cursor: subiendo === h.id ? "progress" : "pointer" }}>
                      {subiendo === h.id ? "Subiendo…"
                        : h.fotos_despues === 0 ? "+ Foto del después"
                        : `+ Después (${h.fotos_despues})`}
                      <input type="file" accept="image/*" multiple hidden
                             disabled={subiendo === h.id}
                             onChange={(e) => { subirDespues(h, e.target.files); e.target.value = "" }} />
                    </label>
                  )}

                  {editable && h.estado === "firme" && (
                    <button type="button" className="btn" disabled={mandando}
                            onClick={() => cerrar(h)}>Cerrar</button>
                  )}

                  {h.tiene_accion
                    ? <span className="hz-eti hz-e-acc">{h.accion_codigo}</span>
                    : editable && h.estado === "firme" && (
                      <button type="button" className="btn" disabled={mandando}
                              onClick={() => abrirAccion(h)}>Abrir acción</button>
                    )}
                  {editable && (
                    <button type="button" className="btn mal" disabled={mandando}
                            onClick={() => anular(h)}>Anular</button>
                  )}
                </span>
              </div>

              {/* LOS DOS TEXTOS, DEL MISMO ANCHO Y SIN «VER» DE POR
                  MEDIO. Es lo único que deja comprobar que la redacción
                  dice lo mismo que se vio, y con una escondida detrás
                  de un botón nadie compara. */}
              <div className="hz-caras">
                <div className="hz-cara">
                  <span className="hz-quien">
                    LO QUE SE VIO · {nombres[h.creado_por ?? ""] ?? "—"}
                  </span>
                  <p className="hz-dice">{h.lo_que_se_vio}</p>
                  {h.recomendacion && (
                    <p className="hz-reco"><b>Se recomienda:</b> {h.recomendacion}</p>
                  )}
                </div>

                <div className="hz-cara hz-tecnica">
                  <span className="hz-quien">
                    REDACCIÓN DEL INFORME
                    {h.redactado_en && <> · {nombres[h.redactado_por ?? ""] ?? "—"}</>}
                    {/* SALIÓ TAL CUAL DE LA MÁQUINA: no es un error,
                        pero un informe donde TODO salió así es un
                        informe que nadie leyó. */}
                    {h.tal_cual_de_la_ia && <em className="hz-ia"> · tal cual de la IA</em>}
                  </span>

                  {editable ? (
                    <>
                      <textarea rows={3} value={valor(h)}
                                placeholder="Escríbela aquí, o pide una propuesta con el botón de abajo."
                                onChange={(e) => setTexto({ ...texto, [h.id]: e.target.value })} />
                      <div className="hz-bot">
                        <button type="button" className="btn" disabled={redactando === h.id}
                                onClick={() => redactarConIa(h)}>
                          {redactando === h.id ? "Redactando…" : "Redactar técnico"}
                        </button>
                        <button type="button" className="btn si"
                                disabled={mandando || valor(h).trim().length < 15}
                                onClick={() => aprobar(h)}>
                          {/* EL BOTÓN DICE QUÉ FALTA: apagado y mudo se
                              toca tres veces y después se llama a
                              preguntar. */}
                          {valor(h).trim().length < 15 ? "Escribe la redacción"
                            : h.estado === "borrador" ? "Aprobar y dejar firme" : "Guardar"}
                        </button>
                      </div>
                      <p className="hz-pie">
                        Lo que propone la máquina <b>no se guarda</b>: cae aquí, se corrige y se
                        aprueba. Queda escrito qué propuso ella y qué aprobaste tú.
                      </p>
                    </>
                  ) : (
                    <p className="hz-dice">
                      {h.redaccion ?? <i className="hz-nada">Sin redactar.</i>}
                    </p>
                  )}
                </div>
              </div>

              {abierto === h.id && <Fotos id={h.id} />}
            </div>
          );
        })}
      </section>
    </>
  );
}

/**
 * LAS FOTOS, PEDIDAS AL ABRIR Y NO ANTES. Firmar las URL de quinientas
 * fotos para que alguien mire dos es trabajo que se paga en espera.
 */
function Fotos({ id }: { id: string }) {
  const [urls, setUrls] = useState<{ url: string; momento: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  if (urls === null && error === null) {
    supabase.from("acciones_hallazgos_fotos").select("ruta, momento").eq("hallazgo_id", id)
      .order("momento", { ascending: true })
      .then(async ({ data, error: e }) => {
        if (e) { setError(e.message); return }
        const filas = (data ?? []) as { ruta: string; momento: string }[];
        const firmadas = await Promise.all(filas.map(async (f) => {
          const { data: d } = await supabase.storage.from("acciones").createSignedUrl(f.ruta, 600);
          return { url: d?.signedUrl ?? "", momento: f.momento ?? "antes" };
        }));
        setUrls(firmadas.filter((f) => f.url));
      });
  }

  const antes = urls?.filter((u) => u.momento === "antes") ?? [];
  const despues = urls?.filter((u) => u.momento === "despues") ?? [];

  /* CADA UNA BAJO SU RÓTULO. Todas revueltas en una cuadrícula, la del
     antes y la del después se confunden — y es exactamente el par que
     alguien va a mirar para decidir si se arregló. */
  const grupo = (rot: string, fs: { url: string }[]) => (
    <div className="hz-grupo">
      <span className="hz-rot">{rot} · {fs.length}</span>
      {fs.length === 0
        ? <p className="hz-pie">Todavía no hay.</p>
        : (
          <div className="hz-ev">
            {fs.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={f.url} target="_blank" rel="noreferrer">
                <img src={f.url} alt={`${rot} ${i + 1}`} />
              </a>
            ))}
          </div>
        )}
    </div>
  );

  return (
    <div className="hz-evidencias">
      {error && <p className="hz-pie hz-falta">No se pudieron traer las fotos: {error}</p>}
      {urls === null && !error && <p className="hz-pie">Trayendo las fotos…</p>}
      {urls !== null && (
        <>
          {grupo("ANTES", antes)}
          {grupo("DESPUÉS", despues)}
        </>
      )}
    </div>
  );
}
