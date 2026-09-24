"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { usePedirTexto } from "@/components/PedirTexto";
import type { Salida } from "@/modulos/roturas/datos";
import { fecha, kilos, quien } from "../comunes";

/**
 * LAS SALIDAS DE VIDRIO — lo que se pesa, en KILOS.
 *
 * Una salida es un Vh: se van pesando tolvas, y cuando está completo
 * se firma. Las dos firmas van en cadena y en orden —supervisor (a),
 * validación— y CADA UNA VIVE EN SU PROPIA PANTALLA, porque son dos
 * personas distintas y cada una trabaja en un sitio distinto. Con los
 * botones en una sola hoja, la misma persona los tocaba todos y la base
 * le contestaba que no: la regla estaba bien, la pantalla la convertía
 * en un regaño.
 *
 * ERAN TRES Y AHORA SON DOS: se quitó Verificación. Lo que no se quitó
 * es que sean dos PERSONAS: quien pesa no da la salida.
 *
 * Esta pantalla es la del SUPERVISOR (A): solo enseña lo que todavía se
 * está pesando. Lo cerrado ya no es suyo.
 *
 * El neto NO se guarda en ninguna parte: sale de sumar las tolvas cada
 * vez que se mira. Un neto guardado queda desfasado de su bruto el día
 * que alguien corrija uno de los dos, y la salida diría un número que no
 * sale de sus propias tolvas.
 */
/* =====================================================================
   EL ESTADO, EN UN SOLO SITIO

   Cuatro estados y UN chip. Antes la fila pintaba tres etiquetas
   sueltas —CERRADA, COMPLETA, 1 DE 2 FIRMAS— que se leían como tres
   cosas distintas cuando son la misma: en qué punto va esta salida.

   Y LA CUENTA VIVE AQUÍ Y NO EN LA FILA: «esperando Vh» se calcula
   igual en el chip, en el filtro y en el resumen de arriba. Tres sitios
   preguntándoselo por su cuenta son tres sitios donde puede contestarse
   distinto el día que cambie la regla.
   ===================================================================== */
function estadoDe(s: Salida): { txt: string; clase: string; detalle: string } {
  if (s.estado === "anulada")
    return { txt: "ANULADA", clase: "sx-anulada",
             detalle: "Anulada: no cuenta en los kilos del mes" };
  if (s.estado === "abierta")
    return { txt: "PESÁNDOSE", clase: "sx-pesando",
             detalle: "Todavía se está pesando: falta cerrarla" };
  if (s.despachada_en)
    return { txt: "DESPACHADA", clase: "sx-despachada",
             detalle: s.viaje_codigo
               ? `Despachada en el viaje ${s.viaje_codigo}`
               : "Ya salió por la puerta" };
  /* «ESPERANDO VH» Y NO «ESPERANDO FIRMA»: lo que espera una cédula
     desde que se quitó Validación es un camión, no una firma. Decir
     «esperando firma» manda a alguien a buscar una pantalla que ya no
     existe. */
  return { txt: "ESPERANDO VH", clase: "sx-esperando",
           detalle: `Cédula lista, esperando el Vh ${s.placa ?? ""}`.trim() };
}

export function Salidas({ salidas, nombres, puedeAbrir, manda }: {
  salidas: Salida[];
  nombres: Record<string, string>;
  puedeAbrir: boolean;
  /* CORREGIR Y ANULAR SON DE QUIEN MANDA, y solo de quien manda. La
     base lo impide igual —`salida_reabrir` y `salida_anular` preguntan
     por `manda()`—; esto es para que a los demás ni siquiera les salga
     el botón. Una pantalla que ofrece algo y después la base lo niega
     convierte una regla correcta en un regaño. */
  manda: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedirTexto, cuadro] = usePedirTexto();

  const [abriendo, setAbriendo] = useState(false);
  const [placa, setPlaca] = useState("");
  const [obs, setObs] = useState("");
  const [mandando, setMandando] = useState(false);
  const [ver, setVer] = useState<"abiertas" | "todas">("abiertas");

  /* LO QUE ESTÁ ESCOGIDO PARA BORRAR.
     «Que el súper admin pueda seleccionar una o varias y eliminarlas,
     por si quiero empezar mi data de cero.»

     UN Set Y NO UN ARREGLO: se pregunta «¿está esta?» una vez por fila
     en cada pintada, y con once da igual, pero con trescientas un
     `includes` dentro del map es recorrer la lista trescientas veces.

     SE GUARDA EL id Y NO LA FILA: la fila que vino del servidor se
     reemplaza en cada `router.refresh()`, y una selección que guarde
     objetos viejos borraría lo que ya no está en pantalla. */
  const [escogidas, setEscogidas] = useState<Set<string>>(new Set());

  /* QUÉ MENÚ «···» ESTÁ ABIERTO. Uno solo a la vez: dos abiertos se
     solapan y se toca el de la fila de abajo creyendo que es el de
     arriba — en una lista cuyo menú tiene «Anular». */
  const [menu, setMenu] = useState<string | null>(null);

  const lista = salidas.filter((s) =>
    ver === "todas" ? true : s.estado === "abierta");

  /* Se limpia igual que en la base —fuera espacios y guiones, todo en
     mayúsculas— para que lo que se ve mientras se escribe sea lo que va
     a quedar guardado. Si la pantalla dejara "abc-123" y la base
     guardara "ABC123", el primer reclamo sería por qué no aparece la
     placa que alguien juró haber escrito. */
  const placaLimpia = placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  /* REABRIR Y ANULAR, LOS DOS CON MOTIVO OBLIGATORIO. La base lo exige;
     aquí se pide antes para no mandar una llamada que se sabe que va a
     fallar. Un cuadro y no un panel propio en la pantalla, a propósito:
     son dos acciones de administrador que se usan una vez al mes, y un
     panel más aquí es una pantalla más difícil para quien la usa a
     diario.

     EL CUADRO ES EL DE LA CASA. Esto usaba `window.prompt`, que sale
     con «cd-control-one.vercel.app dice» encima, en gris y con los
     botones del navegador. Y el navegador puede ofrecer «no permitir
     más cuadros de este sitio»: desde ahí, anular dejaba de funcionar
     en silencio. */
  async function corregir(s: Salida, que: "reabrir" | "anular") {
    const motivo = await pedirTexto(que === "reabrir"
      ? {
          titulo: `¿Reabrir ${s.codigo}?`,
          dice: <>Se le <b>caen las firmas</b> y hay que volver a cerrarla. Es para corregir
                 sus tolvas.</>,
          rotulo: "Por qué se reabre",
          confirmar: "Reabrir",
          minimo: 4, largo: true,
        }
      : {
          titulo: `¿Anular ${s.codigo}?`,
          dice: <>No se borra: la salida <b>se queda</b> con el motivo y con quién lo
                 hizo, y deja de contar en los kilos del mes.</>,
          rotulo: "Por qué se anula",
          confirmar: "Anular",
          peligro: true,
          minimo: 4, largo: true,
        });
    if (motivo === null) return;
    setMandando(true);
    const { error } = await supabase.rpc(
      que === "reabrir" ? "salida_reabrir" : "salida_anular",
      { p_id: s.id, p_motivo: motivo });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(que === "reabrir"
      ? `${s.codigo} quedó abierta otra vez. Corrige las tolvas y vuelve a cerrarla.`
      : `${s.codigo} quedó anulada.`);
    router.refresh();
  }

  /* SE CIERRA AL TOCAR FUERA Y CON ESCAPE. Un menú que solo se cierra
     volviendo a tocar «···» se queda abierto encima de la fila
     siguiente, y lo que queda tapado es justamente la columna de
     acciones de esa fila. */
  useEffect(() => {
    if (!menu) return;
    const fuera = (ev: MouseEvent) => {
      if (!(ev.target as HTMLElement)?.closest?.(".sx-menu")) setMenu(null);
    };
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") setMenu(null) };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [menu]);

  /* AL CAMBIAR DE FILTRO SE SUELTA LA SELECCIÓN. Si no, se escogen
     tres en «las que estoy pesando», se cambia a «todas», y el botón
     sigue diciendo «borrar 3» sin que se vea cuáles: se estaría
     borrando a ciegas. */
  function cambiarFiltro(v: "abiertas" | "todas") {
    setVer(v); setEscogidas(new Set()); setMenu(null);
  }

  function alternar(id: string) {
    setEscogidas((antes) => {
      const n = new Set(antes);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const escogidasVisibles = lista.filter((s) => escogidas.has(s.id));
  const todasPuestas = lista.length > 0 && escogidasVisibles.length === lista.length;
  const kgEscogidos = escogidasVisibles.reduce((t, s) => t + Number(s.neto_kg), 0);
  const despachadasEscogidas = escogidasVisibles.filter((s) => !!s.despachada_en).length;

  async function borrarEscogidas() {
    const n = escogidasVisibles.length;
    if (n === 0) return;

    /* BORRAR NO ES ANULAR, Y LA DIFERENCIA NO ES DE GUSTO: anular deja
       la fila con su motivo y su firma; esto se lleva la salida Y SUS
       TOLVAS —el peso que alguien leyó en la báscula y la tara con la
       que se pesó ese día—. Por eso se pide el motivo y se pide
       teclearlo: en una lista de once filas con la casilla en la misma
       columna, marcar una de más es cuestión de tiempo. */
    const motivo = await pedirTexto({
      titulo: n === 1 ? `¿Borrar ${escogidasVisibles[0].codigo}?` : `¿Borrar ${n} salidas?`,
      dice: (
        <>
          Se van con <b>sus tolvas</b>: el peso que se leyó en la báscula y la tara con la
          que se pesó ese día. <b>No se puede deshacer.</b> Son{" "}
          <b>{kilos(kgEscogidos)} kg</b> netos.
          {despachadasEscogidas > 0 && (
            <> Y {despachadasEscogidas === 1
              ? <>una de ellas <b>ya se despachó</b>: ese número se facturó.</>
              : <><b>{despachadasEscogidas} ya se despacharon</b>: esos números se facturaron.</>}</>
          )}
          {" "}Si solo quieres que dejen de contar, <b>anúlalas</b> — eso deja la fila y el motivo.
        </>
      ),
      rotulo: "Por qué se borran",
      marcador: "Queda en el registro de borradas, no en la fila",
      confirmar: `Borrar ${n}`,
      peligro: true,
      minimo: 8,
      largo: true,
      debesEscribir: `BORRAR ${n}`,
    });
    if (motivo === null) return;

    setMandando(true);
    /* UNA SOLA LLAMADA CON TODOS LOS ids, no una por salida. Once
       llamadas son once formas de quedar a medias: se borran cinco, se
       cae la red, y quedan seis que nadie sabe si iban a irse. Así o se
       van todas o no se va ninguna. */
    const { data, error } = await supabase.rpc("salidas_borrar", {
      p_ids: escogidasVisibles.map((s) => s.id), p_motivo: motivo,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    /* SE DICE EL NÚMERO QUE CONTESTÓ LA BASE, no el que la pantalla
       creía tener escogido: si alguien borró una desde otro lado
       mientras tanto, los dos números no son el mismo. */
    const cuantas = Number(data ?? n);
    avisar.bien(cuantas === 1 ? "Se borró 1 salida." : `Se borraron ${cuantas} salidas.`);
    setEscogidas(new Set());
    router.refresh();
  }

  async function abrir() {
    setMandando(true);
    const { data, error } = await supabase.rpc("salida_abrir", {
      p_placa: placaLimpia,
      p_observacion: obs.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    const fila = Array.isArray(data) ? data[0] : data;
    setAbriendo(false); setPlaca(""); setObs("");
    /* Se entra derecho a pesar. Quien abre una salida está al lado de la
       báscula con la primera tolva ya montada: devolverlo a la lista
       para que busque la que acaba de crear es un paso de más. */
    router.push(`/roturas/salida/${fila?.id}`);
  }

  return (
    <>
      {avisos}{cuadro}

      <div className="filtros">
        <select value={ver} onChange={(e) => cambiarFiltro(e.target.value as "abiertas" | "todas")}>
          <option value="abiertas">Las que estoy pesando</option>
          <option value="todas">Todas, incluidas las que ya salieron</option>
        </select>
      </div>

      {abriendo && (
        <section className="caja">
          <div className="cab"><div><h2>Abrir una salida</h2>
            <p>
              El código lo pone el sistema. La placa es obligatoria: es lo que amarra el vidrio
              al Vh que se lo llevó, y por lo que se busca el día que haya un reclamo.
            </p>
          </div></div>
          <div className="panel" style={{ margin: 12 }}>
            <label htmlFor="placa">Placa del Vh</label>
            <input id="placa" value={placa} autoFocus
                   onChange={(e) => setPlaca(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter" && placaLimpia.length >= 5) abrir() }}
                   placeholder="ABC123"
                   style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: ".08em" }} />
            {placa && placaLimpia.length < 5 && (
              <span style={{ fontSize: 12.5, color: "var(--rt-mal)" }}>
                Una placa lleva al menos cinco caracteres. Van {placaLimpia.length}.
              </span>
            )}
            {placaLimpia.length >= 5 && placaLimpia !== placa.toUpperCase() && (
              /* Se enseña lo que va a quedar guardado ANTES de guardarlo.
                 Normalizar en silencio es la manera más rápida de que
                 alguien jure que escribió otra cosa. */
              <span style={{ fontSize: 12.5, color: "var(--rt-gris)" }}>
                Se va a guardar como <b>{placaLimpia}</b>.
              </span>
            )}

            <label htmlFor="obs">Observación (opcional)</label>
            <input id="obs" value={obs} onChange={(e) => setObs(e.target.value)}
                   placeholder="Destino, transportadora, o lo que haya que anotar" />
            <div className="acciones-panel">
              <button type="button" className="btn si"
                      disabled={mandando || placaLimpia.length < 5} onClick={abrir}>
                {mandando ? "Abriendo…"
                  : placaLimpia.length < 5 ? "Falta la placa" : "Abrir y empezar a pesar"}
              </button>
              <button type="button" className="btn plano"
                      onClick={() => { setAbriendo(false); setPlaca(""); setObs("") }}>
                Cancelar
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{lista.length} salida{lista.length === 1 ? "" : "s"}</h2>
            <p>
              El neto sale de sumar las tolvas, siempre. No hay ningún total guardado que pueda
              quedar desfasado de sus propias tolvas.
            </p>
          </div>
          {puedeAbrir && !abriendo && (
            <button type="button" className="btn si" onClick={() => setAbriendo(true)}>
              Abrir una salida
            </button>
          )}
        </div>

        {/* ===================================================
            ESCOGER VARIAS Y BORRARLAS

            «Que el súper admin pueda seleccionar una o varias y
             eliminarlas, por si quiero empezar mi data de cero.»

            LA BARRA SOLO APARECE CUANDO HAY ALGO ESCOGIDO. Un
            «Borrar 0 salidas» permanente es un botón rojo que se
            aprende a ignorar, y el día que sí tiene algo escogido
            ya nadie lo lee.

            «TODAS» ES TODAS LAS QUE SE VEN, no todas las que hay.
            Con el filtro en «las que estoy pesando», marcar la
            casilla de arriba y borrar se llevaría también las que
            no están en pantalla — y eso no se ve hasta después.
            =================================================== */}
        {manda && lista.length > 0 && (
          <div className="sl-sel">
            <label className="sl-todas">
              <input type="checkbox" checked={todasPuestas}
                     aria-label="Escoger todas las que se ven"
                     onChange={() => setEscogidas(todasPuestas
                       ? new Set()
                       : new Set(lista.map((s) => s.id)))} />
              {/* NO DICE «QUITAR LA SELECCIÓN»: eso ya lo dice el botón
                  de la derecha, y dos controles con el mismo texto en la
                  misma barra hacen dudar de cuál es cuál. Aquí dice en
                  qué estado está. */}
              <span>
                {todasPuestas
                  ? `Las ${lista.length} están escogidas`
                  : `Escoger las ${lista.length} que se ven`}
              </span>
            </label>

            {escogidasVisibles.length > 0 && (
              <div className="sl-acc">
                <span className="sl-cuenta">
                  <b>{escogidasVisibles.length}</b> escogida{escogidasVisibles.length === 1 ? "" : "s"}
                  {" · "}<b>{kilos(kgEscogidos)} kg</b> netos
                  {despachadasEscogidas > 0 && (
                    <em className="sl-ojo">
                      {" · "}{despachadasEscogidas} ya despachada{despachadasEscogidas === 1 ? "" : "s"}
                    </em>
                  )}
                </span>
                <button type="button" className="btn plano" disabled={mandando}
                        onClick={() => setEscogidas(new Set())}>
                  Quitar la selección
                </button>
                <button type="button" className="btn mal" disabled={mandando}
                        onClick={borrarEscogidas}>
                  {mandando ? "Borrando…" : `Borrar ${escogidasVisibles.length}`}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* =====================================================================
          LA LISTA ES UNA TABLA Y NO TARJETAS

          «Deben verse mejor así, porque mira la tercera foto cómo se ve.»

          Y LA RAZÓN ES REAL, no de gusto. Eran tarjetas porque «una
          salida es una cosa con la que se trabaja»: eso vale mientras
          hay tres. Con once ya no se trabaja con una, SE BUSCA UNA
          ENTRE ONCE —o se mira de un barrido cuántas están esperando el
          Vh—, y para eso las columnas tienen que alinearse. En tarjetas,
          el peso de la SR-0011 y el de la SR-0005 caen en sitios
          distintos y hay que leer cada una.

          LO QUE SE GANA AL PASAR A TABLA:
           · El kilaje en su columna: el ojo baja en línea recta.
           · UN SOLO chip de estado, siempre del mismo tamaño y en el
             mismo sitio. Antes eran tres etiquetas sueltas —CERRADA,
             COMPLETA, MISMA PERSONA— que cambiaban de ancho por fila y
             movían todo lo demás.
           · Las firmas como cadena S—V: cuál falta se ve sin leer. «1 de
             2» obliga a ir a mirar cuál.
           · Las acciones raras (Reabrir, Anular) detrás de «···». Estaban
             a la misma altura que «Ver», que es la que se usa siempre, y
             «Anular» en rojo al lado de «Ver» se toca por error.

          LO QUE SE PIERDE, Y LO DIGO: la observación y el aviso de
          reabierta ya no caben en el renglón. Van en el título del chip
          —se ven al pasar el puntero— y enteras al entrar a la salida.
          ===================================================================== */}
      <section className={"caja sx-lista" + (manda ? " sl-lista" : "")}>
        {lista.length === 0 ? (
          <div className="vacio">
            <b>Sin salidas</b>
            {salidas.length
              ? "No hay ninguna abierta. Cambia el filtro para ver las que ya salieron."
              : "Todavía no se ha abierto ninguna salida de vidrio."}
          </div>
        ) : (
          <div className="sx-rueda">
            <div className="sx-tabla" role="table"
                 aria-label="Las salidas de vidrio y su estado">
              <div className="sx-cab" role="row">
                {manda && <span role="columnheader" aria-label="Escoger" />}
                <span role="columnheader">Salida</span>
                <span role="columnheader">Placa</span>
                <span role="columnheader">Peso</span>
                <span role="columnheader">Estado</span>
                <span role="columnheader">Firmas</span>
                <span role="columnheader" aria-label="Acciones" />
              </div>

              {lista.map((s) => {
                const e = estadoDe(s);
                /* REABRIR SOLO EN LO CERRADO Y NO DESPACHADO; ANULAR en
                   todo lo que no esté ya anulado ni despachado. Lo
                   abierto se corrige pesando; lo que ya salió por la
                   puerta lleva un número que se facturó, y para tocarlo
                   hay que deshacer el despacho en Facturación primero. */
                const puedeReabrir = manda && s.estado === "cerrada" && !s.despachada_en;
                const puedeAnular = manda && s.estado !== "anulada" && !s.despachada_en;
                const hayMenu = puedeReabrir || puedeAnular;

                return (
                  <div key={s.id} role="row"
                       className={"sx-fila" + (s.estado === "anulada" ? " sx-anu" : "")
                                  + (escogidas.has(s.id) ? " sl-puesta" : "")}>
                    {manda && (
                      <label className="sl-caja" role="cell">
                        <input type="checkbox" checked={escogidas.has(s.id)}
                               aria-label={`Escoger ${s.codigo}`}
                               onChange={() => alternar(s.id)} />
                      </label>
                    )}

                    <span className="sx-id" role="cell">{s.codigo}</span>

                    <span role="cell">
                      {s.placa
                        ? <span className="sx-placa">{s.placa}</span>
                        : <span className="sx-sinplaca">Sin placa</span>}
                    </span>

                    <span className="sx-peso" role="cell">
                      <b>{kilos(s.neto_kg)} kg</b>
                      <i>{s.tolvas} tolva{s.tolvas === 1 ? "" : "s"}</i>
                      <em title={s.observacion ?? undefined}>
                        abierta {fecha(s.creada_en)} · {quien(nombres, s.creada_por)}
                        {(s.reaperturas ?? 0) > 0 &&
                          ` · reabierta ${s.reaperturas! > 1 ? `${s.reaperturas} veces` : "1 vez"}`}
                      </em>
                    </span>

                    <span role="cell">
                      {/* UN SOLO CHIP, SIEMPRE DEL MISMO TAMAÑO. El
                          título lleva la frase larga: qué está
                          esperando exactamente. */}
                      <span className={"sx-est " + e.clase} title={e.detalle}>
                        <i aria-hidden />{e.txt}
                      </span>
                    </span>

                    <span role="cell">
                      {/* LA CADENA S—V: CUÁL falta se ve sin leer. «1 de
                          2» obliga a ir a mirar cuál de las dos es.
                          En lo abierto y en lo anulado no hay firmas que
                          enseñar, y un «0 de 2» ahí parecería un
                          pendiente cuando no lo es. */}
                      {s.estado === "abierta" || s.estado === "anulada" ? (
                        <span className="sx-nada">—</span>
                      ) : (
                        <>
                          <span className="sx-fir">
                            <b className={s.supervisora_en ? "ok" : ""}
                               title={s.supervisora_en ? "Pesó y cerró" : "Falta pesar y cerrar"}>S</b>
                            <u className={s.verificador_en ? "ok" : ""} />
                            <b className={s.verificador_en ? "ok" : ""}
                               title={s.verificador_en ? "Verificada" : "Falta verificar"}>V</b>
                            <em>{s.firmas} de 2</em>
                          </span>
                          {s.mismo_firmante && (
                            <span className="sx-alerta">⚠ firmó la misma persona</span>
                          )}
                        </>
                      )}
                    </span>

                    <span className="sx-acc" role="cell">
                      {hayMenu && (
                        <span className="sx-menu">
                          <button type="button" className="btn sx-mas"
                                  aria-label={`Más acciones de ${s.codigo}`}
                                  aria-expanded={menu === s.id}
                                  disabled={mandando}
                                  onClick={() => setMenu(menu === s.id ? null : s.id)}>
                            ···
                          </button>
                          {menu === s.id && (
                            <span className="sx-lista-menu" role="menu">
                              {puedeReabrir && (
                                <button type="button" role="menuitem"
                                        onClick={() => { setMenu(null); corregir(s, "reabrir") }}>
                                  Reabrir
                                </button>
                              )}
                              {puedeAnular && (
                                <button type="button" role="menuitem" className="sx-rojo"
                                        onClick={() => { setMenu(null); corregir(s, "anular") }}>
                                  Anular
                                </button>
                              )}
                            </span>
                          )}
                        </span>
                      )}
                      <Link href={`/roturas/salida/${s.id}`}
                            className={"btn" + (s.estado === "abierta" ? " si" : "")}>
                        {s.estado === "abierta" ? "Pesar" : "Ver"}
                      </Link>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
