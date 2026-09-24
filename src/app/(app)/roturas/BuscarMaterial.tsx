"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Material } from "@/modulos/roturas/datos";

/**
 * ESCOGER UN MATERIAL ENTRE CUATROCIENTOS NOVENTA Y CUATRO.
 *
 * «Agregaste producto, perfecto, pero que yo pueda ir escribiendo y a
 *  la vez filtrando.»
 *
 * UN `<select>` NATIVO DEJÓ DE SERVIR EN CUANTO EL DESPLEGABLE PASÓ DE
 * SIETE A 494. Con siete, abrir y escoger es un toque; con 494 es una
 * lista de treinta pantallazos donde «Aguila Cero Lta 355Cc X 24 Pro»
 * está a ochenta renglones de «Aguila Cero Lta 355Cc X 24». El
 * navegador deja teclear para saltar, pero solo por el PRINCIPIO del
 * nombre: quien busca «355» no encuentra nada.
 *
 * ASÍ QUE SE BUSCA EN CUALQUIER PARTE DEL TEXTO, y también por SKU —el
 * código es lo que está pegado en la estiba—, sin tildes y sin
 * mayúsculas, porque nadie teclea «Águila» con acento con guante.
 *
 * SE PARECE A LOS CHIPS DE LOS FILTROS A PROPÓSITO: es el mismo gesto
 * —tocar, escribir, escoger— en las dos pantallas del módulo. Lo que
 * cambia es que aquí hay que poder DESHACER la escogencia, porque es
 * un formulario y no un filtro.
 *
 * LO QUE SE PIERDE, Y SE DICE: en el teléfono, un `<select>` nativo
 * abre la ruedita del sistema operativo, que se maneja con el pulgar
 * sin mirar. Esto es una lista en la página. A cambio, es lo único que
 * permite encontrar uno entre 494; con siete materiales el nativo era
 * mejor y por eso no estaba esto.
 */
const pelado = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function BuscarMaterial({ id, materiales, valor, cambiar, vacio }: {
  id: string;
  materiales: Material[];
  valor: string;
  cambiar: (clave: string) => void;
  /** Lo que se dice cuando no hay ninguno que ofrecer. */
  vacio?: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [marcado, setMarcado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const puesto = materiales.find((m) => m.clave === valor) ?? null;

  const lista = useMemo(() => {
    const t = pelado(q.trim());
    if (!t) return materiales;
    /* SE BUSCA EN EL NOMBRE **Y** EN EL SKU: el código es lo que está
       pegado en la estiba, y quien lo tiene a la vista lo teclea. */
    return materiales.filter((m) => pelado(`${m.nombre} ${m.clave}`).includes(t));
  }, [materiales, q]);

  useEffect(() => { setMarcado(0) }, [q]);

  /* SE CIERRA AL TOCAR FUERA. Sin esto, la lista se queda abierta
     encima del resto del formulario y tapa el contador de unidades. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function escoger(m: Material) {
    cambiar(m.clave);
    setAbierto(false);
    setQ("");
  }

  return (
    <div className="bm" ref={caja}>
      {!abierto ? (
        <button type="button" id={id} className={"campo-suelto bm-campo" + (puesto ? " on" : "")}
                onClick={() => { setAbierto(true); setQ("");
                                 setTimeout(() => campo.current?.focus(), 0) }}>
          <span>{puesto ? `${puesto.nombre} · ${puesto.clave}` : "Escribe para buscar el material"}</span>
          <i aria-hidden>▾</i>
        </button>
      ) : (
        <input ref={campo} type="search" className="campo-suelto bm-campo bm-teclea" value={q}
               autoComplete="off"
               placeholder={`Escribe parte del nombre o el código — ${materiales.length} en el maestro`}
               aria-label="Buscar el material"
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
        <div className="bm-lista" role="listbox">
          {materiales.length === 0 ? (
            <p className="bm-nada">{vacio ?? "No hay materiales que ofrecer."}</p>
          ) : lista.length === 0 ? (
            /* SE DICE QUE NO HAY NINGUNO, y con qué se buscó: una lista
               que se queda en blanco hace pensar que la pantalla se
               rompió. */
            <p className="bm-nada">Ninguno dice «{q}». Prueba con otra parte del nombre o con el código.</p>
          ) : (
            <>
              {/* SE PINTAN 60 Y SE DICE CUÁNTOS QUEDAN. Pintar 494
                  renglones cuelga el teléfono medio segundo cada vez
                  que se teclea una letra, y nadie baja hasta el 300. */}
              {lista.slice(0, 60).map((m, i) => (
                <button key={m.clave} type="button" role="option"
                        aria-selected={m.clave === valor}
                        className={"bm-op" + (i === marcado ? " marcado" : "")
                                   + (m.clave === valor ? " puesto" : "")}
                        onMouseEnter={() => setMarcado(i)}
                        onClick={() => escoger(m)}>
                  <b>{m.nombre}</b>
                  <span>{m.clave}</span>
                </button>
              ))}
              {lista.length > 60 && (
                <p className="bm-nada">
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
