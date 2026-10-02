"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Area } from "@/modulos/roturas/datos";

/**
 * EL ÁREA DEL REGISTRO — un desplegable con buscador, como el de la maqueta.
 *
 * «¿En qué parte de la bodega?» El maestro crece (hoy son trece y se
 * agregan sin esperar un despliegue), y un <select> nativo en el teléfono
 * abre la ruedita del sistema: no deja buscar ni agrupar. Esto es una
 * lista en la página, flotante, que se cierra al tocar fuera o con Escape.
 *
 * DOS GRUPOS, SALIDOS DEL NOMBRE Y NO DE UNA COLUMNA NUEVA:
 *   Zonas   todo lo que no es una calle.
 *   Calles  las que se llaman «Calle A», «Calle B»… van como botones
 *           cortos (A, B, C…) porque son cinco o seis iguales y se
 *           escogen por la letra, no leyendo un renglón.
 * Si el maestro no tiene calles, ese grupo no sale.
 *
 * LA SUGERIDA ES UNA PISTA, NO UNA DECISIÓN: se marca con «Sugerida para
 * T1» y sube al principio, pero NO se escoge sola. El área es obligatoria
 * a propósito: un área puesta por defecto es la que se queda cuando nadie
 * la miró.
 */

const pelado = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const esCalle = (a: Area) => /^calle\s+\S+$/i.test(a.nombre.trim());
const letraDe = (a: Area) => a.nombre.trim().replace(/^calle\s+/i, "");

/** El área que se parece al proceso: «T1» → «Bahías T1», «Traspaso» →
 *  «Traspasos». Solo se sugiere si hay UNA sola que coincida; con dos, no
 *  se adivina. «Sin identificar» y «Otro» no sugieren nada. */
export function areaSugerida(areas: Area[], procesoNombre: string | undefined): string | null {
  const p = pelado(procesoNombre ?? "");
  if (p.length < 2 || p === "otro" || p.startsWith("sin ")) return null;
  const hit = areas.filter((a) => !esCalle(a) && pelado(a.nombre).includes(p));
  return hit.length === 1 ? hit[0].clave : null;
}

export function AreaSelect({ id, areas, valor, cambiar, sugerida, proceso }: {
  id: string;
  areas: Area[];
  valor: string;
  cambiar: (clave: string) => void;
  sugerida: string | null;
  /** Para decir «Sugerida para T1». */
  proceso?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const puesta = areas.find((a) => a.clave === valor) ?? null;

  const { zonas, calles } = useMemo(() => {
    const t = pelado(q);
    const filtradas = t ? areas.filter((a) => pelado(a.nombre).includes(t)) : areas;
    const zs = filtradas.filter((a) => !esCalle(a));
    /* LA SUGERIDA SUBE al principio, salvo que se esté buscando: ahí manda
       lo que se escribió. */
    if (!t && sugerida) zs.sort((a, b) => (b.clave === sugerida ? 1 : 0) - (a.clave === sugerida ? 1 : 0));
    return { zonas: zs, calles: filtradas.filter(esCalle) };
  }, [areas, q, sugerida]);

  /* Se cierra al tocar fuera: sin esto la lista se queda abierta encima
     de la causa y la tapa. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) { setAbierto(false); setQ("") }
    };
    document.addEventListener("mousedown", fuera);
    campo.current?.focus();
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const cerrar = () => { setAbierto(false); setQ("") };
  const escoger = (clave: string) => { cambiar(clave); cerrar(); boton.current?.focus() };

  const total = zonas.length + calles.length;

  return (
    <div className="rp3-sel" ref={caja}
         onKeyDown={(e) => { if (e.key === "Escape" && abierto) { e.stopPropagation(); cerrar(); boton.current?.focus() } }}>
      <button type="button" id={id} ref={boton} className={"rp3-selbtn" + (abierto ? " open" : "")}
              aria-haspopup="listbox" aria-expanded={abierto}
              onClick={() => (abierto ? cerrar() : setAbierto(true))}>
        <span className="ico" aria-hidden>
          <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
        </span>
        <span className={puesta ? "v" : "v ph"}>{puesta ? puesta.nombre : "¿En qué parte de la bodega?"}</span>
        <svg className="car" viewBox="0 0 24 24" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {abierto && (
        <div className="rp3-pop">
          <label className="rp3-srch">
            <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input ref={campo} type="search" value={q} placeholder="Buscar área" aria-label="Buscar área"
                   onChange={(e) => setQ(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === "Enter") { e.preventDefault(); const p = zonas[0] ?? calles[0]; if (p) escoger(p.clave) }
                   }} />
          </label>
          <div className="rp3-lista" role="listbox" aria-label="Áreas">
            {total === 0 && <p className="rp3-nada">Ninguna área coincide con «{q}».</p>}
            {zonas.length > 0 && <div className="rp3-gl">Zonas</div>}
            {zonas.map((a) => (
              <button key={a.clave} type="button" role="option" aria-selected={a.clave === valor}
                      className={"rp3-op" + (a.clave === valor ? " on" : "")} onClick={() => escoger(a.clave)}>
                <span className="oi" aria-hidden>
                  <svg viewBox="0 0 24 24"><path d="M3 9l9-5 9 5v11H3zM8 20v-6h8v6" /></svg>
                </span>
                <span className="nom">{a.nombre}</span>
                {a.clave === sugerida && proceso && <span className="tag">Sugerida para {proceso}</span>}
                {a.clave === valor && <span className="ck" aria-hidden>✓</span>}
              </button>
            ))}
            {calles.length > 0 && <div className="rp3-gl">Calles</div>}
            {calles.length > 0 && (
              <div className="rp3-calles">
                {calles.map((a) => (
                  <button key={a.clave} type="button" role="option" aria-selected={a.clave === valor}
                          aria-label={a.nombre} className={a.clave === valor ? "on" : ""}
                          onClick={() => escoger(a.clave)}>
                    {letraDe(a)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
