"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { TipoViaje } from "@/modulos/traspasos/datos";
import { TURNOS } from "@/modulos/traspasos/formato";

/**
 * LOS FILTROS Y LOS DOS BOTONES.
 *
 * LOS FILTROS VIVEN EN LA DIRECCIÓN, no en el estado de esta pantalla.
 * Es lo que permite mandar por WhatsApp "mira el turno C de ayer" y que
 * al otro le abra exactamente eso; y lo que hace que el botón de atrás
 * del navegador deshaga el filtro en vez de salirse del módulo. De paso,
 * el filtrado lo hace la base: con un año de viajes, filtrar en el
 * navegador obligaría a bajarlos todos para mirar un turno.
 *
 * EL PDF LO HACE EL NAVEGADOR. No hay librería ni servidor que lo arme:
 * lo que imprime es exactamente lo que se está viendo —con los filtros
 * puestos—, que es justo lo que nunca cuadra cuando el PDF se genera
 * aparte.
 */
export function Barra({ tipos, soloBotones, soloFiltros }: {
  tipos: TipoViaje[];
  /* Se parte en dos porque las dos mitades van en sitios distintos de
     la página —los botones arriba a la derecha, los filtros a lo ancho
     debajo del título— y separarlas en dos componentes obligaría a
     repetir el manejo de la dirección en los dos. */
  soloBotones?: boolean;
  soloFiltros?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function poner(clave: string, valor: string) {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(clave, valor); else p.delete(clave);
    router.push(`${pathname}?${p.toString()}`);
  }

  const hay = params.get("dias") || params.get("turno") || params.get("tipo");

  return (
    <>
      {!soloFiltros && (
      <div className="acciones-informe">
        <button type="button" className="accion" onClick={() => router.refresh()}>
          <svg viewBox="0 0 24 24"><path d="M20 11.5A8 8 0 1 1 17.7 6" /><path d="M20 4v6h-6" /></svg>
          Actualizar
        </button>
        <button type="button" className="accion" onClick={() => window.print()}>
          <svg viewBox="0 0 24 24"><path d="M8 3.5h5.5L18 8v12.5H6V3.5z" /><path d="M13.5 3.5V8H18" /></svg>
          Generar PDF
        </button>
      </div>
      )}

      {!soloBotones && (
      <section className="filtros">
        <div className="arriba">
          <label className="sel">
            <span>Período</span>
            <select value={params.get("dias") ?? "0"}
                    onChange={(e) => poner("dias", e.target.value === "0" ? "" : e.target.value)}>
              <option value="0">Hoy</option>
              <option value="1">Ayer y hoy</option>
              <option value="6">Últimos 7 días</option>
              <option value="29">Últimos 30 días</option>
            </select>
          </label>

          <label className="sel">
            <span>Turno</span>
            <select value={params.get("turno") ?? ""}
                    onChange={(e) => poner("turno", e.target.value)}>
              <option value="">Todos los turnos</option>
              {TURNOS.map((t) => <option key={t} value={t}>Turno {t}</option>)}
            </select>
          </label>

          <label className="sel">
            <span>Tipo de viaje</span>
            <select value={params.get("tipo") ?? ""}
                    onChange={(e) => poner("tipo", e.target.value)}>
              <option value="">Todos los tipos</option>
              {tipos.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
            </select>
          </label>

          {hay && (
            <button type="button" className="limpiar" onClick={() => router.push(pathname)}>
              Restablecer
            </button>
          )}
        </div>
      </section>
      )}
    </>
  );
}
