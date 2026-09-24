"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* =====================================================================
   ESCOGER UNO ENTRE CIENTOS — UNO SOLO, PARA TODOS LOS MÓDULOS

   «En producto pues está bien el desplegable, pero que a la vez la
    persona pueda escribir para buscar más rápido el producto, sea por
    código o material.»

   ES EL MISMO QUE YA ESTABA EN ROTURAS, extraído y no copiado. Copiar
   ciento cuarenta líneas de componente y cincuenta de CSS a Averías
   habría dado la misma caja de búsqueda HOY y dos cajas distintas
   dentro de tres meses: se arregla el teclado en una y no en la otra, y
   nadie se entera hasta que alguien lo ve. Es la misma decisión que se
   tomó con la lista del maestro.

   ---------------------------------------------------------------------
   POR QUÉ NO UN `<select>`
   ---------------------------------------------------------------------
   Un desplegable nativo dejó de servir en cuanto la lista pasó de siete
   a cuatrocientos noventa y cuatro. Con siete, abrir y escoger es un
   toque; con 494 es una lista de treinta pantallazos donde «Aguila Cero
   Lta 355Cc X 24 Pro» está a ochenta renglones de «Aguila Cero Lta
   355Cc X 24». El navegador deja teclear para saltar, pero solo por el
   PRINCIPIO del texto: quien busca «355» no encuentra nada.

   ASÍ QUE SE BUSCA EN CUALQUIER PARTE, y en las dos columnas —el
   nombre y el código—, sin tildes y sin mayúsculas, porque nadie teclea
   «Águila» con acento con guante puesto.

   LO QUE SE PIERDE, Y SE DICE: en el teléfono, un `<select>` nativo abre
   la ruedita del sistema, que se maneja con el pulgar sin mirar. Esto
   es una lista en la página. A cambio, es lo único que permite
   encontrar uno entre 494; con siete opciones el nativo era mejor y por
   eso no se usa esto en todas partes.

   Las clases van con prefijo `bl-` y viven en globals.css: las usan dos
   módulos, y una copia por módulo son dos sitios donde se
   desincronizan.
   ===================================================================== */

export type OpcionLista = {
  /** Lo que se guarda. */
  clave: string;
  /** Lo que se lee: el nombre del material. */
  nombre: string;
  /** Lo que está pegado en la estiba: el código. Se busca por él también. */
  codigo?: string;
};

const pelado = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function BuscarEnLista({ id, opciones, valor, cambiar, vacio,
                                rotulo = "Escribe para buscar", cuenta = "en el maestro" }: {
  id: string;
  opciones: OpcionLista[];
  valor: string;
  cambiar: (clave: string) => void;
  /** Lo que se dice cuando no hay ninguna que ofrecer. */
  vacio?: React.ReactNode;
  /** Lo que dice el campo vacío. */
  rotulo?: string;
  /** La coletilla del contador: «494 en el maestro». */
  cuenta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [marcado, setMarcado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const puesto = opciones.find((m) => m.clave === valor) ?? null;

  const lista = useMemo(() => {
    const t = pelado(q.trim());
    if (!t) return opciones;
    /* SE BUSCA EN EL NOMBRE **Y** EN EL CÓDIGO: el código es lo que está
       pegado en la estiba, y quien lo tiene a la vista lo teclea. */
    return opciones.filter((m) => pelado(`${m.nombre} ${m.codigo ?? m.clave}`).includes(t));
  }, [opciones, q]);

  useEffect(() => { setMarcado(0) }, [q]);

  /* SE CIERRA AL TOCAR FUERA. Sin esto, la lista se queda abierta
     encima del resto del formulario y tapa los campos de abajo. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    /* SE REGISTRA EN EL SIGUIENTE TICK, y no es un adorno:

       el mousedown que ABRE la lista sigue burbujeando hacia
       `document` mientras React ya pintó el campo de escribir. Si el
       listener se registra en el acto, atiende ESE MISMO mousedown; y
       como el botón que se tocó ya fue reemplazado, `contains` da
       falso y la lista se cierra en el mismo gesto que la abrió. Se
       veía como que el campo «no abre». */
    const t = setTimeout(() => document.addEventListener("mousedown", fuera), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", fuera) };
  }, [abierto]);

  function escoger(m: OpcionLista) {
    cambiar(m.clave);
    setAbierto(false);
    setQ("");
  }

  return (
    <div className="bl" ref={caja}>
      {!abierto ? (
        /* SE ABRE CON `onMouseDown` Y NO CON `onClick`, y esto arregla
           un defecto que venía de antes en Roturas:

           al escoger una opción, el desplegable SE VOLVÍA A ABRIR. El
           click sobre la opción cierra la lista y React pinta este
           botón en el mismo hueco del árbol; el MISMO evento, todavía
           en vuelo, terminaba cayendo sobre el botón recién pintado y
           lo abría otra vez. Con el ratón se veía como que «escoger no
           hace nada»: la lista parpadeaba y seguía ahí.

           Reaccionando al mousedown, el botón nuevo ya no puede
           atender ese click: el mousedown ocurrió sobre la opción, que
           es donde tenía que ocurrir. */
        <button type="button" id={id} className={"campo-suelto bl-campo" + (puesto ? " on" : "")}
                onMouseDown={(e) => { e.preventDefault(); setAbierto(true); setQ("");
                                      setTimeout(() => campo.current?.focus(), 0) }}
                /* Y EL TECLADO SIGUE ABRIENDO: `onMouseDown` no lo
                   cubre, y un campo que solo se abre con ratón deja
                   fuera a quien tabula. */
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault(); setAbierto(true); setQ("");
                    setTimeout(() => campo.current?.focus(), 0);
                  }
                }}>
          <span>{puesto
            ? `${puesto.nombre}${puesto.codigo ? ` · ${puesto.codigo}` : ""}`
            : rotulo}</span>
          <i aria-hidden>▾</i>
        </button>
      ) : (
        <input ref={campo} type="search" className="campo-suelto bl-campo bl-teclea" value={q}
               autoComplete="off"
               placeholder={`Escribe parte del nombre o el código — ${opciones.length} ${cuenta}`}
               aria-label={rotulo}
               onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === "Escape") { setAbierto(false); return }
                 if (e.key === "ArrowDown") {
                   e.preventDefault(); setMarcado((i) => Math.min(i + 1, lista.length - 1));
                 } else if (e.key === "ArrowUp") {
                   e.preventDefault(); setMarcado((i) => Math.max(i - 1, 0));
                 } else if (e.key === "Enter") {
                   e.preventDefault();
                   if (lista[marcado]) escoger(lista[marcado]);
                 }
               }} />
      )}

      {abierto && (
        <div className="bl-lista" role="listbox">
          {opciones.length === 0 ? (
            <p className="bl-nada">{vacio ?? "No hay nada que ofrecer."}</p>
          ) : lista.length === 0 ? (
            /* SE DICE QUE NO HAY NINGUNO, y con qué se buscó: una lista
               que se queda en blanco hace pensar que la pantalla se
               rompió. */
            <p className="bl-nada">Ninguno dice «{q}». Prueba con otra parte del nombre o con el código.</p>
          ) : (
            <>
              {/* SE PINTAN 60 Y SE DICE CUÁNTOS QUEDAN. Pintar 494
                  renglones cuelga el teléfono medio segundo cada vez que
                  se teclea una letra, y nadie baja hasta el 300. */}
              {lista.slice(0, 60).map((m, i) => (
                <button key={m.clave} type="button" role="option"
                        aria-selected={m.clave === valor}
                        className={"bl-op" + (i === marcado ? " marcado" : "")
                                   + (m.clave === valor ? " puesto" : "")}
                        onMouseEnter={() => setMarcado(i)}
                        onClick={() => escoger(m)}>
                  <b>{m.nombre}</b>
                  {m.codigo && <span>{m.codigo}</span>}
                </button>
              ))}
              {lista.length > 60 && (
                <p className="bl-nada">
                  y {lista.length - 60} más. Escribe algo más para acortar la lista.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
