"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { usePedirTexto } from "@/components/PedirTexto";
import type { Accion, Motivo, Zona } from "@/modulos/acciones/datos";
import { Fila, quien } from "./comunes";
import { Evidencia } from "./Evidencia";
import { Reportar } from "./Reportar";

/**
 * TODAS LAS ACCIONES — la bandeja del módulo, y donde se asigna.
 *
 * ASIGNAR ES LA DECISIÓN MÁS IMPORTANTE DE ESTE MÓDULO y la que más
 * fácil se toma mal: se le da al primero que aparece en la lista. Por eso
 * la lista de personas no es un desplegable con nombres — es la carga de
 * cada quien, con cuántas tiene abiertas y cuántas vencidas, ordenada por
 * quién tiene menos encima. Doce acciones en la misma persona no se
 * cierran: se acumulan, y el plazo de 48 horas pasa a ser una promesa que
 * el sistema ya sabe que no se va a cumplir.
 */
export function Todas({ acciones, nombres, zonas, motivos, areas, plazos, gente, puedeEditar, manda }: {
  acciones: Accion[];
  nombres: Record<string, string>;
  zonas: Zona[];
  motivos: Motivo[];
  areas: { clave: string; nombre: string }[];
  plazos: Record<string, { horas: number; etiqueta: string }>;
  /* La carga de cada quien, para poder asignar al terminar de reportar
     sin salir de la pantalla. */
  gente?: { id: string; nombre: string | null; usuario: string | null;
            rol: string; abiertas: number; vencidas: number; saturado: boolean }[];
  puedeEditar: boolean;
  /** El administrador: el único que corrige y quita del seguimiento. */
  manda: boolean;
}) {
  const [reportando, setReportando] = useState(false);
  /* Cuál acción está abierta. Una sola a la vez: dos paneles de
     evidencia abiertos es una lista que ya no se puede recorrer. */
  const [abierta, setAbierta] = useState<string | null>(null);

  const [f, setF] = useState({ estado: "vivas", area: "", prioridad: "", texto: "" });

  /* LO QUE ESTÁ ESCOGIDO PARA ELIMINAR.
     «Que al súper admin le permita eliminar una, varias o todas.»

     UN Set Y NO UN ARREGLO: se pregunta «¿está esta?» una vez por fila
     en cada pintada, y con trescientas acciones un `includes` dentro
     del map es recorrer la lista trescientas veces.

     SE GUARDA EL id Y NO LA FILA: lo que vino del servidor se reemplaza
     en cada `router.refresh()`, y una selección que guarde objetos
     viejos borraría lo que ya no está en pantalla. */
  const [escogidas, setEscogidas] = useState<Set<string>>(new Set());
  const [borrando, setBorrando] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedirTexto, cuadro] = usePedirTexto();

  /* CUALQUIER CAMBIO DE FILTRO SUELTA LA SELECCIÓN, también el texto
     del buscador: escribir tres letras puede sacar de pantalla
     exactamente lo que estaba marcado. */
  function cambiarFiltro(cambio: Partial<typeof f>) {
    setF({ ...f, ...cambio });
    setEscogidas(new Set());
  }

  function alternar(id: string) {
    setEscogidas((antes) => {
      const n = new Set(antes);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const lista = acciones.filter((a) => {
    if (f.estado === "vivas" && !a.viva) return false;
    if (f.estado === "vencidas" && !a.vencida) return false;
    if (f.estado === "sin" && (!a.sin_dueno || !a.viva)) return false;
    if (f.estado === "cerradas" && a.estado !== "cerrada") return false;
    if (f.area && a.area !== f.area) return false;
    if (f.prioridad && a.prioridad !== f.prioridad) return false;
    const q = f.texto.trim().toLowerCase();
    if (q && !(a.codigo + " " + a.titulo + " " + (a.zona_nombre ?? a.ubicacion ?? ""))
      .toLowerCase().includes(q)) return false;
    return true;
  });

  /* «TODAS» ES TODAS LAS QUE SE VEN, no todas las que hay: con el
     filtro en «solo vencidas», marcar arriba y eliminar se llevaría las
     que no están en pantalla — y eso no se ve hasta después. */
  const escogidasVisibles = lista.filter((a) => escogidas.has(a.id));
  const todasPuestas = lista.length > 0 && escogidasVisibles.length === lista.length;
  const cerradasEscogidas = escogidasVisibles.filter((a) => a.estado === "cerrada").length;

  async function eliminarEscogidas() {
    const n = escogidasVisibles.length;
    if (n === 0) return;

    /* ELIMINAR NO ES ANULAR. Anular deja la fila con su motivo y quién;
       esto se lleva la acción, su hilo y sus fotos. Por eso pide el
       motivo Y teclear la cuenta: en una lista de trescientas con la
       casilla en la misma columna, marcar una de más es cuestión de
       tiempo. El motivo queda en Administración → Inicio, con los
       códigos de lo que se fue — es lo único que queda. */
    const motivo = await pedirTexto({
      titulo: n === 1 ? `¿Eliminar ${escogidasVisibles[0].codigo}?` : `¿Eliminar ${n} acciones?`,
      dice: (
        <>
          Se van con <b>su hilo y sus fotos</b>. <b>No se puede deshacer.</b>
          {cerradasEscogidas > 0 && (
            <> {cerradasEscogidas === 1
              ? <>Una de ellas <b>ya está cerrada</b>: eso es historia que alguien verificó.</>
              : <><b>{cerradasEscogidas} ya están cerradas</b>: eso es historia que alguien verificó.</>}</>
          )}
          {" "}Si lo que quieres es que dejen de contar, <b>anúlalas</b> — eso deja la fila
          y el motivo.
        </>
      ),
      rotulo: "Por qué se eliminan",
      marcador: "Queda en Administración → Inicio con los códigos",
      confirmar: `Eliminar ${n}`,
      peligro: true,
      minimo: 8,
      largo: true,
      debesEscribir: `ELIMINAR ${n}`,
    });
    if (motivo === null) return;

    setBorrando(true);
    /* UNA SOLA LLAMADA CON TODOS LOS ids: trescientas llamadas son
       trescientas formas de quedar a medias. */
    const { data, error } = await supabase.rpc("accion_eliminar", {
      p_ids: escogidasVisibles.map((a) => a.id), p_motivo: motivo,
    });
    setBorrando(false);
    if (error) {
      const falta = /does not exist|schema cache|could not find the function/i.test(error.message);
      avisar.mal(falta
        ? "Falta correr supabase/migraciones/2026-09-acciones-depurar.sql en Supabase."
        : error.message);
      return;
    }
    /* SE DICE EL NÚMERO QUE CONTESTÓ LA BASE, no el que la pantalla
       creía tener escogido: si alguien borró una desde otro lado
       mientras tanto, los dos números no son el mismo. */
    const cuantas = Number(data ?? n);
    avisar.bien(cuantas === 1 ? "Se eliminó 1 acción." : `Se eliminaron ${cuantas} acciones.`);
    setEscogidas(new Set());
    router.refresh();
  }

  const vencidas = acciones.filter((a) => a.vencida).length;
  const criticas = acciones.filter((a) => a.viva && a.prioridad === "alta").length;
  /* SIN DUEÑO de verdad: ni equipo ni persona. "Easy, sin persona" ya
     tiene dueño —el OL responde—, y contarla aquí mandaría a alguien a
     reasignar algo que ya está asignado. */
  const sinDueno = acciones.filter((a) => a.viva && a.sin_dueno).length;
  const porVerificar = acciones.filter((a) => a.estado === "cerrada").length;

  return (
    <>
      {avisos}{cuadro}

      {reportando && (
        <Reportar zonas={zonas} motivos={motivos} plazos={plazos} gente={gente}
                  cerrar={() => setReportando(false)} />
      )}

      <section className="cifras">
        <div className={"cifra" + (vencidas ? " mal" : "")}>
          <div className="rot">VENCIDAS</div>
          <div className="n">{vencidas}</div>
          <div className="u">se pasaron del plazo de su prioridad</div>
        </div>
        <div className={"cifra" + (criticas ? " mal" : "")}>
          <div className="rot">CRÍTICAS ABIERTAS</div>
          <div className="n">{criticas}</div>
          <div className="u">prioridad alta sin cerrar</div>
        </div>
        <div className={"cifra" + (sinDueno ? " ojo" : "")}>
          <div className="rot">SIN RESPONSABLE</div>
          <div className="n">{sinDueno}</div>
          <div className="u">nadie las está haciendo</div>
        </div>
        <div className="cifra ojo">
          <div className="rot">POR VERIFICAR</div>
          <div className="n">{porVerificar}</div>
          <div className="u">cerradas, falta ir a mirar si sirvió</div>
        </div>
      </section>

      {/* ===================================================
          ESCOGER Y ELIMINAR — solo quien administra

          LA BARRA SOLO APARECE CON ALGO ESCOGIDO. Un «Eliminar 0»
          permanente es un botón rojo que se aprende a ignorar, y el
          día que sí tiene algo escogido ya nadie lo lee.

          «TODAS» ES TODAS LAS QUE SE VEN, no todas las que hay: con el
          filtro en «solo vencidas», marcar arriba y eliminar se
          llevaría las que no están en pantalla — y eso no se ve hasta
          después.
          =================================================== */}
      <div className="filtros">
        {/* CAMBIAR DE FILTRO SUELTA LA SELECCIÓN. Si no, se escogen
            tres en «abiertas», se pasa a «todas», y el botón sigue
            diciendo «Eliminar 3» sin que se vea cuáles: se estaría
            eliminando a ciegas. Lo cazó el arnés. */}
        <select value={f.estado} onChange={(e) => cambiarFiltro({ estado: e.target.value })}>
          <option value="vivas">Abiertas y reabiertas</option>
          <option value="vencidas">Solo vencidas</option>
          <option value="sin">Sin responsable</option>
          <option value="cerradas">Cerradas sin verificar</option>
          <option value="">Todas</option>
        </select>
        <select value={f.area} onChange={(e) => cambiarFiltro({ area: e.target.value })}>
          <option value="">Toda la bodega</option>
          {areas.map((a) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
        </select>
        <select value={f.prioridad} onChange={(e) => cambiarFiltro({ prioridad: e.target.value })}>
          <option value="">Cualquier prioridad</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <input value={f.texto} onChange={(e) => cambiarFiltro({ texto: e.target.value })}
               placeholder="Buscar código, título o zona" />
        {(f.estado !== "vivas" || f.area || f.prioridad || f.texto) && (
          <button type="button" className="btn plano"
                  onClick={() => { setF({ estado: "vivas", area: "", prioridad: "", texto: "" });
                                   setEscogidas(new Set()) }}>
            Quitar filtros
          </button>
        )}
      </div>

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{lista.length} acción{lista.length === 1 ? "" : "es"}</h2>
            <p>
              Ordenadas por lo que vence primero. El plazo salió de la prioridad al reportar:
              nadie escribió esa fecha.
            </p>
          </div>
          {/* Un enlace y no un botón con fetch: el navegador ya sabe
              descargar, y así funciona igual con el clic derecho. */}
          <a href="/api/acciones/exportar" className="btn">Exportar a Excel</a>
        </div>

        {manda && lista.length > 0 && (
          <div className="ac-barra">
            <label className="ac-todas">
              <input type="checkbox" checked={todasPuestas}
                     aria-label="Escoger todas las que se ven"
                     onChange={() => setEscogidas(todasPuestas
                       ? new Set()
                       : new Set(lista.map((a) => a.id)))} />
              <span>
                {todasPuestas
                  ? `Las ${lista.length} están escogidas`
                  : `Escoger las ${lista.length} que se ven`}
              </span>
            </label>

            {escogidasVisibles.length > 0 && (
              <div className="ac-acc">
                <span className="ac-cuenta">
                  <b>{escogidasVisibles.length}</b> escogida{escogidasVisibles.length === 1 ? "" : "s"}
                  {/* LO QUE YA SE CERRÓ SE AVISA: eso es historia que
                      alguien ya verificó, y no es lo mismo que borrar
                      un error de dedo de esta mañana. */}
                  {cerradasEscogidas > 0 && (
                    <em className="ac-ojo">
                      {" · "}{cerradasEscogidas} ya cerrada{cerradasEscogidas === 1 ? "" : "s"}
                    </em>
                  )}
                </span>
                <button type="button" className="btn plano" disabled={borrando}
                        onClick={() => setEscogidas(new Set())}>
                  Quitar la selección
                </button>
                <button type="button" className="btn mal" disabled={borrando}
                        onClick={eliminarEscogidas}>
                  {borrando ? "Eliminando…" : `Eliminar ${escogidasVisibles.length}`}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="rueda">
          {lista.length === 0 && (
            <div className="vacio">
              <b>Nada por aquí</b>
              {acciones.length
                ? "Con estos filtros no queda ninguna."
                : "Todavía no se ha reportado nada. El botón + abre el reporte."}
            </div>
          )}

          {lista.map((a) => (
            <Fila key={a.id} a={a} nombres={nombres}
                  casilla={manda ? (
                    <label className="ac-caja">
                      <input type="checkbox" checked={escogidas.has(a.id)}
                             aria-label={`Escoger ${a.codigo}`}
                             onChange={() => alternar(a.id)} />
                    </label>
                  ) : undefined}
                  derecha={
                    <div className="par">
                      <button type="button" className="btn"
                              onClick={() => setAbierta(abierta === a.id ? null : a.id)}>
                        {abierta === a.id ? "Cerrar" : `Ver${a.fotos ? ` · ${a.fotos} foto${a.fotos === 1 ? "" : "s"}` : ""}`}
                      </button>
                      {puedeEditar && a.viva && (
                        /* A una PANTALLA, no a un cajón aquí mismo. Escoger
                           a quién le toca es la decisión más importante del
                           módulo y no se toma bien en un panel de 200 px
                           con el resto de la lista distrayendo alrededor. */
                        <Link href={`/acciones/asignar/${a.id}`} className="btn">
                          {a.sin_dueno ? "Asignar" : "Cambiar responsable"}
                        </Link>
                      )}
                    </div>
                  }>
              {a.estado === "cerrada" && a.que_se_hizo && (
                <div className="meta" style={{ marginTop: 6 }}>
                  <span>Se hizo: {a.que_se_hizo} — {quien(nombres, a.cerrada_por)}</span>
                </div>
              )}

              {abierta === a.id && <Evidencia accion={a} puedeEditar={puedeEditar} manda={manda} areas={areas} />}
            </Fila>
          ))}
        </div>
      </section>

      {puedeEditar && (
        <button type="button" className="mas" onClick={() => setReportando(true)}
                aria-label="Reportar una acción">+</button>
      )}
    </>
  );
}
