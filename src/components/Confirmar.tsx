"use client";

/**
 * PEDIR CONFIRMACIÓN, CON LA CARA DE LA APLICACIÓN.
 *
 * Reemplaza a window.confirm(), que es el cuadro gris del sistema: sale
 * con el dominio encima —"cd-control-one.vercel.app dice:"—, con dos
 * botones en inglés o en el idioma del sistema, sin los colores de la
 * plataforma y sin poder explicar nada más largo que una línea. En una
 * pantalla que alguien enseña en una reunión, eso se ve como si la app
 * se hubiera roto.
 *
 * CÓMO SE USA. confirm() es síncrono y esto no puede serlo, así que
 * devuelve una promesa y el sitio que lo llama casi no cambia:
 *
 *     const [pedir, dialogo] = useConfirmar();
 *     ...
 *     if (!(await pedir({ titulo: "¿Borrar el rol?", ... }))) return;
 *     ...
 *     return (<>{dialogo}...</>)
 *
 * DECISIONES QUE NO SON DE ADORNO
 *   · El botón peligroso NO es el que tiene el foco al abrir. Con Enter
 *     apretado por costumbre, un foco en "Borrar" borra sin leer.
 *   · Escape y el clic afuera cancelan; nunca confirman.
 *   · El foco se devuelve a donde estaba al cerrar, o quien usa teclado
 *     queda al principio de la página.
 *   · No lleva su propio CSS por módulo: las clases van con prefijo cf-
 *     y viven en globals.css, para que los siete temas lo vistan solos.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type Pedido = {
  titulo: string;
  /** El párrafo que explica la consecuencia. Opcional pero casi siempre útil. */
  dice?: React.ReactNode;
  /** Lo que dice el botón que confirma. Un verbo, no "Aceptar". */
  confirmar?: string;
  cancelar?: string;
  /** true = la acción destruye algo y el botón va en rojo. */
  peligro?: boolean;
};

export function useConfirmar(): [(p: Pedido) => Promise<boolean>, React.ReactNode] {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const volverA = useRef<HTMLElement | null>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);

  const pedir = useCallback((p: Pedido) => {
    volverA.current = document.activeElement as HTMLElement | null;
    setPedido(p);
    return new Promise<boolean>((res) => { resolver.current = res });
  }, []);

  const cerrar = useCallback((valor: boolean) => {
    setPedido(null);
    resolver.current?.(valor);
    resolver.current = null;
    /* Devolver el foco a donde estaba. Sin esto, quien navega con
       teclado vuelve al principio de la página cada vez que cancela. */
    volverA.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!pedido) return;
    /* El foco arranca en CANCELAR, nunca en el botón peligroso: con
       Enter apretado por costumbre, un foco en "Borrar" borra sin que
       nadie haya leído. */
    cancelarRef.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(false) };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pedido, cerrar]);

  const dialogo = pedido ? (
    <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="cf-titulo"
         onClick={(e) => { if (e.target === e.currentTarget) cerrar(false) }}>
      <div className={"cf-caja" + (pedido.peligro ? " peligro" : "")}>
        <h2 id="cf-titulo">{pedido.titulo}</h2>
        {pedido.dice && <div className="cf-dice">{pedido.dice}</div>}
        <div className="cf-botones">
          <button type="button" ref={cancelarRef} className="cf-btn plano"
                  onClick={() => cerrar(false)}>
            {pedido.cancelar ?? "Cancelar"}
          </button>
          <button type="button" className={"cf-btn" + (pedido.peligro ? " mal" : "")}
                  onClick={() => cerrar(true)}>
            {pedido.confirmar ?? "Continuar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [pedir, dialogo];
}
