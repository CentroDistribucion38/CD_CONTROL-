"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * UNA LISTA QUE SE FILTRA TECLEANDO.
 *
 * POR QUÉ NO UN `<select>`. Las ubicaciones del CD38 son 428, y el
 * desplegable del navegador solo deja saltar por la primera letra: para
 * llegar a E06 hay que pulsar «E» y luego rodar. Contando de pie, con el
 * celular en una mano, eso es la mitad del tiempo de cada renglón.
 * Aquí se teclea «e06» y queda una opción.
 *
 * Y POR QUÉ NO UN `<datalist>`, que sería menos código: el navegador
 * decide si lo muestra y cómo, y en Android a veces no aparece. Una
 * lista que a veces no sale es peor que ninguna, porque nadie sabe si
 * escribió mal o si la opción no existe.
 *
 * EL FILTRO BUSCA EN CUALQUIER PARTE del texto, no solo al principio.
 * «RB» encuentra «A01 · RB F1000», que es como la gente busca de verdad:
 * por lo que hay guardado, no por el código que a veces no recuerda.
 *
 * SE ESCRIBE CON EL TECLADO ENTERO: flechas para moverse, Enter para
 * escoger, Escape para cerrar. No es accesibilidad de adorno — el
 * computador del patio se usa sin ratón.
 */
export type Opcion = { valor: string; texto: string; pista?: string | null };

export function Buscador({
  valor, opciones, onEscoge, marcador, id, sinOpciones, teclado = "texto", campo: fuera,
}: {
  valor: string;
  opciones: Opcion[];
  onEscoge: (v: string) => void;
  marcador?: string;
  id?: string;
  /** Qué decir cuando la lista viene vacía por completo. */
  sinOpciones?: string;
  /**
   * QUÉ TECLADO ABRE EN EL CELULAR. Contando de pie, el teclado del
   * sistema tapa media pantalla y la lista queda debajo.
   *
   *   "ninguno"  no lo abre — la lista es todo lo que hace falta, como
   *              en una calle, que son doce opciones de una letra.
   *   "numerico" abre el numérico, que tiene las teclas al doble de
   *              tamaño. Solo sirve si lo que se escribe son dígitos.
   *   "texto"    el de siempre.
   *
   * Se hace con `inputMode` y NO con `readOnly`: readOnly apagaría
   * también el teclado de verdad de un PC, y esta pantalla se usa en
   * las dos. Con `inputMode="none"` el celular no levanta el teclado y
   * el PC sigue filtrando al escribir.
   */
  teclado?: "texto" | "numerico" | "ninguno";
  /**
   * El campo de adentro, para quien necesite mandarle el foco desde
   * fuera — la pantalla de conteo lo usa para volver a la calle después
   * de anotar un renglón. Va como referencia y no como un `autoFocus`
   * porque el momento lo decide quien llama, no el componente.
   */
  campo?: RefObject<HTMLInputElement | null>;
}) {
  const auto = useId();
  const idLista = `${id ?? auto}-lista`;
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const propia = useRef<HTMLInputElement>(null);
  const campo = fuera ?? propia;

  const escogida = opciones.find((o) => o.valor === valor) ?? null;

  /* Lo que se ve en el campo: mientras está cerrado, la opción escogida;
     mientras se busca, lo tecleado. Sin esto el campo se queda con el
     texto de la búsqueda después de escoger y parece que no se escogió
     nada. */
  const visible = abierto ? texto : (escogida?.texto ?? "");

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!abierto || q === "") return opciones;
    return opciones.filter((o) =>
      (o.texto + " " + (o.pista ?? "")).toLowerCase().includes(q));
  }, [opciones, texto, abierto]);

  /* Si la lista se encoge por debajo del resaltado, el resaltado se sale
     y Enter escogería algo que no se ve. */
  useEffect(() => {
    setActivo((i) => Math.min(i, Math.max(0, filtradas.length - 1)));
  }, [filtradas.length]);

  /* Cerrar al tocar fuera. Va en `mousedown` y no en `click` para que
     cerrar no le robe el toque al campo de al lado: con `click` hay que
     tocar dos veces para pasar al siguiente campo. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function escoger(o: Opcion) {
    onEscoge(o.valor);
    setTexto("");
    setAbierto(false);
    campo.current?.blur();
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) { setAbierto(true); return }
      setActivo((i) => {
        const n = filtradas.length;
        if (n === 0) return 0;
        return e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n;
      });
      return;
    }
    if (e.key === "Enter") {
      if (!abierto) return;
      e.preventDefault();
      const o = filtradas[activo];
      if (o) escoger(o);
      return;
    }
    if (e.key === "Escape") { setAbierto(false); setTexto("") }
  }

  return (
    <div className="bs" ref={caja}>
      <input
        ref={campo}
        id={id}
        type="text"
        className="bs-campo"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        inputMode={teclado === "ninguno" ? "none" : teclado === "numerico" ? "numeric" : "text"}
        placeholder={marcador}
        value={visible}
        onFocus={() => { setAbierto(true); setTexto("") }}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActivo(0) }}
        onKeyDown={teclas}
      />
      {/* La flecha es un adorno: el campo entero abre la lista, así que
          no puede robarse el toque. */}
      <span className="bs-flecha" aria-hidden="true">▾</span>

      {abierto && (
        <ul className="bs-lista" id={idLista} role="listbox">
          {filtradas.length === 0 && (
            <li className="bs-nada">
              {opciones.length === 0
                ? (sinOpciones ?? "No hay nada que escoger.")
                : <>Nada coincide con «{texto.trim()}».</>}
            </li>
          )}
          {filtradas.map((o, i) => (
            <li key={o.valor}
                role="option"
                aria-selected={o.valor === valor}
                className={(i === activo ? "on " : "") + (o.valor === valor ? "puesta" : "")}
                /* `mousedown` y no `click`: el `blur` del campo se
                   dispara antes que el click y cerraría la lista debajo
                   del dedo. */
                onMouseDown={(e) => { e.preventDefault(); escoger(o) }}
                onMouseEnter={() => setActivo(i)}>
              <b>{o.texto}</b>
              {o.pista && <em>{o.pista}</em>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
