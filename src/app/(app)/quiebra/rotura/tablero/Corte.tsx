"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * POR QUÉ SE MIRA EL PARETO, Y POR QUÉ SE PUEDE CAMBIAR.
 *
 * Un pareto no es una gráfica, es una PREGUNTA: «¿unas pocas causas
 * explican casi todo?». Y la respuesta depende de qué se llame causa.
 * Medido sobre los datos de 2026:
 *
 *   por máquina  →  hacen falta 10 de 13 para el 80 %   (no se concentra)
 *   por envase   →  hacen falta  4 de 12                (sí se concentra)
 *   por línea    →  hacen falta  3 de 4                 (son cuatro: no dice mucho)
 *
 * POR MÁQUINA NO SE CONCENTRA, Y NO ES CASUALIDAD: las trece máquinas
 * son las trece estaciones que TODAS las líneas tienen. Preguntar «cuál
 * máquina» junta la desempacadora de la línea 1 con la de la 2, la 4 y
 * la 6 en una sola barra, y cuatro máquinas distintas promediadas dan
 * siempre algo parecido a la media. Por eso salían diez de trece: no
 * porque la cuenta estuviera mal, sino porque la pregunta estaba mal
 * hecha.
 *
 * ESTO NO SE RESUELVE ESCOGIENDO POR EL USUARIO. Cuál corte importa
 * depende de qué se pueda cambiar: si hay plata para cambiar envase,
 * manda el envase; si el turno tiene que ajustar una máquina, manda la
 * máquina aunque no concentre. El botón está para que la pregunta la
 * haga quien sabe la respuesta.
 */
export const CORTES = [
  { id: "maquina", rotulo: "Por máquina" },
  { id: "envase",  rotulo: "Por envase" },
  { id: "linea",   rotulo: "Por línea" },
] as const;
export type Corte = (typeof CORTES)[number]["id"];

export function EscogerCorte({ corte }: { corte: Corte }) {
  const router = useRouter();
  const params = useSearchParams();
  const [cargando, empezar] = useTransition();

  const ir = (c: Corte) => {
    const p = new URLSearchParams(params.toString());
    if (c === "maquina") p.delete("corte"); else p.set("corte", c);
    const q = p.toString();
    empezar(() => router.push(`/quiebra/rotura/tablero${q ? "?" + q : ""}`));
  };

  return (
    <div className={"rl-cortes" + (cargando ? " cargando" : "")} role="group"
         aria-label="Qué se compara en el pareto">
      {CORTES.map((c) => (
        <button key={c.id} type="button" className={corte === c.id ? "on" : ""}
                aria-current={corte === c.id ? "true" : undefined}
                onClick={() => ir(c.id)}>{c.rotulo}</button>
      ))}
    </div>
  );
}
