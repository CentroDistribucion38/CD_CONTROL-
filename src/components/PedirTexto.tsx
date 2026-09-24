"use client";

/**
 * PEDIR UNA LÍNEA ESCRITA, CON LA CARA DE LA APLICACIÓN.
 *
 * Reemplaza a window.prompt(), que es el cuadro gris del sistema: sale
 * con el dominio encima —«cd-control-one.vercel.app dice»—, con un
 * campo pelado que no dice de qué habla, con botones «Aceptar /
 * Cancelar» del navegador y sin los colores de la plataforma. En una
 * pantalla que alguien enseña en una reunión se ve como si la app se
 * hubiera roto. Y PEOR QUE FEO: el navegador puede ofrecer «no permitir
 * más cuadros de este sitio», y a partir de ahí anular deja de
 * funcionar en silencio.
 *
 * VA APARTE DE `useConfirmar` A PROPÓSITO. Aquel pregunta sí o no y por
 * eso pone el foco en CANCELAR y deja que Enter cancele: con Enter
 * apretado por costumbre, un foco en «Borrar» borra sin leer. Aquí hay
 * algo que escribir, así que el foco arranca EN EL CAMPO y Enter
 * confirma — que es lo que espera quien acaba de teclear. Meter las dos
 * cosas en un mismo componente obligaba a que una de las dos reglas
 * fuera la equivocada.
 *
 *     const [pedirTexto, cuadro] = usePedirTexto();
 *     const motivo = await pedirTexto({ titulo: `¿Anular ${r.codigo}?`, ... });
 *     if (motivo === null) return;          // canceló
 *     ...
 *     return (<>{cuadro}...</>)
 *
 * DEVUELVE `null` SI CANCELA y la cadena ya recortada si confirma. Un
 * `""` no puede volver: cuando el texto es obligatorio —que es el caso
 * de todos los motivos— el botón está apagado hasta que haya algo.
 *
 * `debesEscribir` ES LA FRICCIÓN DE LO QUE NO SE DESHACE. Obliga a
 * teclear exactamente un texto —el código de la fila— antes de dejar
 * confirmar. No es un obstáculo decorativo: es la diferencia entre
 * borrar la fila que se quería y borrar la de al lado.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type PedidoTexto = {
  titulo: string;
  /** El párrafo que explica la consecuencia. */
  dice?: React.ReactNode;
  /** El rótulo del campo. Por defecto, «Motivo». */
  rotulo?: string;
  marcador?: string;
  /** Varias líneas en vez de una. Para un motivo largo. */
  largo?: boolean;
  /** Lo que dice el botón que confirma. Un verbo, no «Aceptar». */
  confirmar?: string;
  cancelar?: string;
  /** true = la acción destruye algo y el botón va en rojo. */
  peligro?: boolean;
  /** Hay que teclear EXACTAMENTE esto para poder confirmar. */
  debesEscribir?: string;
  /** Mínimo de letras del motivo. Por defecto 1: basta con que diga algo. */
  minimo?: number;
};

export function usePedirTexto():
  [(p: PedidoTexto) => Promise<string | null>, React.ReactNode] {
  const [pedido, setPedido] = useState<PedidoTexto | null>(null);
  const [valor, setValor] = useState("");
  const [copia, setCopia] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);
  const volverA = useRef<HTMLElement | null>(null);
  const campo = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const pedirTexto = useCallback((p: PedidoTexto) => {
    volverA.current = document.activeElement as HTMLElement | null;
    setValor(""); setCopia("");
    setPedido(p);
    return new Promise<string | null>((res) => { resolver.current = res });
  }, []);

  const cerrar = useCallback((v: string | null) => {
    setPedido(null);
    resolver.current?.(v);
    resolver.current = null;
    /* El foco vuelve a donde estaba. Sin esto, quien usa teclado queda
       al principio de la página y tiene que bajar otra vez hasta la
       fila en la que estaba trabajando. */
    volverA.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!pedido) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(null) };
    document.addEventListener("keydown", tecla);
    /* EL FOCO ARRANCA EN EL CAMPO. Hay algo que escribir: dejarlo en un
       botón obliga a un tabulador de más y, en el celular, a un toque
       más para abrir el teclado. */
    const t = setTimeout(() => campo.current?.focus(), 0);
    return () => { document.removeEventListener("keydown", tecla); clearTimeout(t) };
  }, [pedido, cerrar]);

  if (!pedido) return [pedirTexto, null];

  const minimo = pedido.minimo ?? 1;
  const faltaTexto = valor.trim().length < minimo;
  const faltaCopia = !!pedido.debesEscribir && copia.trim() !== pedido.debesEscribir;
  const puede = !faltaTexto && !faltaCopia;

  /* EL BOTÓN DICE QUÉ FALTA. Apagado y mudo se toca tres veces y
     después se llama a preguntar. */
  const queFalta = faltaTexto
    ? (minimo > 1 ? `Escribe al menos ${minimo} letras` : `Escribe el ${(pedido.rotulo ?? "motivo").toLowerCase()}`)
    : faltaCopia ? `Escribe ${pedido.debesEscribir}`
    : (pedido.confirmar ?? "Continuar");

  const Campo = pedido.largo ? "textarea" : "input";

  return [pedirTexto, (
    <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="pt-titulo"
         onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(null) }}>
      <div className={"cf-caja" + (pedido.peligro ? " peligro" : "")}>
        <h2 id="pt-titulo">{pedido.titulo}</h2>
        {pedido.dice && <div className="cf-dice">{pedido.dice}</div>}

        <label className="pt-campo">
          <span>{pedido.rotulo ?? "Motivo"}</span>
          <Campo
            ref={campo as never}
            rows={pedido.largo ? 3 : undefined}
            value={valor}
            placeholder={pedido.marcador}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              setValor(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              /* Enter confirma en el campo de una línea, no en el largo:
                 ahí Enter es un renglón. */
              if (e.key === "Enter" && !pedido.largo && puede) { e.preventDefault(); cerrar(valor.trim()) }
            }}
          />
        </label>

        {pedido.debesEscribir && (
          <label className="pt-campo pt-copia">
            <span>Escribe <b>{pedido.debesEscribir}</b> para confirmar</span>
            <input value={copia} autoComplete="off" spellCheck={false}
                   onChange={(e) => setCopia(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === "Enter" && puede) { e.preventDefault(); cerrar(valor.trim()) }
                   }} />
          </label>
        )}

        <div className="cf-botones">
          <button type="button" className="cf-btn plano" onClick={() => cerrar(null)}>
            {pedido.cancelar ?? "Cancelar"}
          </button>
          <button type="button" className={"cf-btn" + (pedido.peligro ? " mal" : "")}
                  disabled={!puede} onClick={() => cerrar(valor.trim())}>
            {queFalta}
          </button>
        </div>
      </div>
    </div>
  )];
}
