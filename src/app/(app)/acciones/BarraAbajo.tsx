"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Motivo, Zona } from "@/modulos/acciones/datos";
import { Reportar } from "./Reportar";

/**
 * LA BARRA DE ABAJO DEL CELULAR.
 *
 * Cinco destinos y el "+" en el medio, levantado sobre la barra. Es la
 * navegación del módulo EN EL TELÉFONO, y existe aparte del riel lateral
 * por una razón concreta: el riel se abre con el pulgar en la esquina de
 * arriba a la izquierda, que es justo donde no llega la mano de alguien
 * que además está cargando algo. Abajo llega siempre.
 *
 * El "+" va en el centro y más grande que los demás porque es la acción
 * del módulo: reportar. Los otros cuatro son sitios; este es un verbo.
 *
 * En PC no aparece: allá está el riel, que muestra los mismos destinos y
 * no le quita 64 px de alto a la tabla.
 */
export function BarraAbajo({ zonas, motivos, plazos, gente, puedeEditar }: {
  zonas: Zona[];
  motivos: Motivo[];
  plazos: Record<string, { horas: number; etiqueta: string }>;
  /* La carga de cada quien, para poder asignar al terminar de reportar
     sin salir de la pantalla. */
  gente?: { id: string; nombre: string | null; usuario: string | null;
            rol: string; abiertas: number; vencidas: number; saturado: boolean }[];
  puedeEditar: boolean;
}) {
  const [reportando, setReportando] = useState(false);
  const ruta = usePathname();

  const items = [
    { r: "/acciones/verificar", t: "Verificar", i: (
      <svg viewBox="0 0 24 24"><path d="M4 6.5h10M4 12h10M4 17.5h6" /><path d="M15.5 18l2 2 4-4.5" /></svg>
    ) },
    { r: "/acciones/mias", t: "Mías", i: (
      <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5 20.5c.6-3.5 3.5-5.5 7-5.5s6.4 2 7 5.5" /></svg>
    ) },
    { r: "/acciones/tablero", t: "Tablero", i: (
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 16v-3.5M12 16V9M16 16v-5" /></svg>
    ) },
    { r: "/acciones/analisis", t: "Análisis", i: (
      <svg viewBox="0 0 24 24"><path d="M4 17.5l5-5.5 3.5 3L20 6.5" /><path d="M20 11V6.5h-4.5" /></svg>
    ) },
  ];

  return (
    <>
      {reportando && (
        <Reportar zonas={zonas} motivos={motivos} plazos={plazos} gente={gente}
                  cerrar={() => setReportando(false)} />
      )}

      <nav className="ac-abajo" aria-label="Acciones">
        {items.slice(0, 2).map((x) => (
          <Link key={x.r} href={x.r} className={ruta === x.r ? "on" : ""}>
            {x.i}<span>{x.t}</span>
          </Link>
        ))}

        {/* El hueco de en medio lo ocupa el botón, que va por encima de la
            barra: sin el hueco, el botón le taparía la etiqueta al vecino. */}
        <div className="hueco">
          {puedeEditar && (
            <button type="button" className="mas" onClick={() => setReportando(true)}
                    aria-label="Reportar una acción">+</button>
          )}
        </div>

        {items.slice(2).map((x) => (
          <Link key={x.r} href={x.r} className={ruta === x.r ? "on" : ""}>
            {x.i}<span>{x.t}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
