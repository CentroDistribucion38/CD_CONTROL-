"use client";

/**
 * LOS AVISOS — lo que la aplicación contesta cuando algo pasa.
 *
 * Va con useConfirmar: aquel PREGUNTA antes de hacer algo, este CUENTA
 * lo que ya pasó. Entre los dos se reemplaza todo lo que el navegador
 * hace feo —alert(), y los errores de Postgres puestos en crudo en la
 * pantalla—, que es lo que hace que una aplicación se vea como si se
 * hubiera roto justo cuando alguien la está enseñando.
 *
 * CÓMO SE USA, igual que useConfirmar:
 *
 *     const [avisar, avisos] = useAvisos();
 *     ...
 *     if (error) { avisar.mal(error.message); return }
 *     avisar.bien(`${codigo} asignada a ${nombre}`);
 *     ...
 *     return (<>{avisos}...</>)
 *
 * DECISIONES QUE NO SON DE ADORNO
 *   · Los errores NO se van solos. Un error que desaparece a los cuatro
 *     segundos es un error que nadie leyó: quien lo provocó estaba
 *     mirando el campo, no la esquina. Se cierran a mano.
 *   · Lo que salió bien SÍ se va solo. Nadie necesita cerrar "listo".
 *   · El texto pasa por traducirError(), así que ningún mensaje de
 *     Postgres llega crudo a la pantalla aunque quien llama se olvide.
 *   · Van abajo a la derecha en PC y ARRIBA en celular: abajo estarían
 *     tapados por el teclado y por la barra de navegación del módulo.
 *   · role="status" y aria-live: quien usa lector de pantalla se entera
 *     de lo que pasó sin tener que ir a buscarlo.
 */

import { useCallback, useRef, useState } from "react";
import { traducirError } from "@/lib/errores";

type Tipo = "bien" | "mal" | "info";
type Nota = { id: number; tipo: Tipo; texto: string };

const SE_VA = { bien: 4500, info: 6000, mal: 0 } as const;

export function useAvisos() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const siguiente = useRef(1);

  const quitar = useCallback((id: number) => {
    setNotas((n) => n.filter((x) => x.id !== id));
  }, []);

  const poner = useCallback((tipo: Tipo, texto: string) => {
    const id = siguiente.current++;
    /* Todo pasa por el traductor, incluso lo que ya está en español:
       si no coincide con ningún patrón vuelve igual, así que no cuesta
       nada y cierra la puerta a que un mensaje crudo se escape. */
    setNotas((n) => [...n, { id, tipo, texto: traducirError(texto) }].slice(-3));
    const ms = SE_VA[tipo];
    if (ms) setTimeout(() => quitar(id), ms);
  }, [quitar]);

  const avisar = useRef({
    bien: (t: string) => poner("bien", t),
    mal: (t: string) => poner("mal", t),
    info: (t: string) => poner("info", t),
  });
  avisar.current = {
    bien: (t: string) => poner("bien", t),
    mal: (t: string) => poner("mal", t),
    info: (t: string) => poner("info", t),
  };

  const vista = notas.length ? (
    <div className="av-pila" role="status" aria-live="polite">
      {notas.map((n) => (
        <div key={n.id} className={"av " + n.tipo}>
          <span className="av-icono" aria-hidden>
            {n.tipo === "bien" ? (
              <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            ) : n.tipo === "mal" ? (
              <svg viewBox="0 0 24 24"><path d="M12 7v6.5" /><circle cx="12" cy="17" r=".6" fill="currentColor" /><circle cx="12" cy="12" r="9" /></svg>
            ) : (
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></svg>
            )}
          </span>
          <span className="av-txt">{n.texto}</span>
          <button type="button" className="av-x" onClick={() => quitar(n.id)}
                  aria-label="Cerrar el aviso">✕</button>
        </div>
      ))}
    </div>
  ) : null;

  return [avisar.current, vista] as const;
}
