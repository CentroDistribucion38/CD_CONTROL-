"use client";

import { useState } from "react";
import Link from "next/link";
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

  const vencidas = acciones.filter((a) => a.vencida).length;
  const criticas = acciones.filter((a) => a.viva && a.prioridad === "alta").length;
  /* SIN DUEÑO de verdad: ni equipo ni persona. "Easy, sin persona" ya
     tiene dueño —el OL responde—, y contarla aquí mandaría a alguien a
     reasignar algo que ya está asignado. */
  const sinDueno = acciones.filter((a) => a.viva && a.sin_dueno).length;
  const porVerificar = acciones.filter((a) => a.estado === "cerrada").length;

  return (
    <>
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

      <div className="filtros">
        <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
          <option value="vivas">Abiertas y reabiertas</option>
          <option value="vencidas">Solo vencidas</option>
          <option value="sin">Sin responsable</option>
          <option value="cerradas">Cerradas sin verificar</option>
          <option value="">Todas</option>
        </select>
        <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
          <option value="">Toda la bodega</option>
          {areas.map((a) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
        </select>
        <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })}>
          <option value="">Cualquier prioridad</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })}
               placeholder="Buscar código, título o zona" />
        {(f.estado !== "vivas" || f.area || f.prioridad || f.texto) && (
          <button type="button" className="btn plano"
                  onClick={() => setF({ estado: "vivas", area: "", prioridad: "", texto: "" })}>
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

              {abierta === a.id && <Evidencia accion={a} puedeEditar={puedeEditar} manda={manda} />}
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
