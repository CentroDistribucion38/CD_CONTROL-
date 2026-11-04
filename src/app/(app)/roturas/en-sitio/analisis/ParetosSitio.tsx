"use client";

import { useState } from "react";
import type { Pareto as Datos } from "@/modulos/roturas/pareto";
import { MEDIDAS, type Dim, type Medida } from "@/modulos/roturas/medidas";
import { Pareto } from "./Pareto";

/**
 * LOS TRES PARETOS, REALES: causa, área y quién.
 *
 * «Me preocupa que los OPM no han reportado: la mayoría ha sido summar. Quiero esas gráficas reales.»
 *
 * «QUIÉN» TIENE DOS LECTURAS Y SE DICEN LAS DOS —antes había una sola y mezclaba las cosas—:
 *   · Quién registró   el usuario que la escribió en la plataforma (summar, etc.).
 *   · OPM              el operario que la reportó en piso con su PIN; si nadie, «Sin OPM».
 * Una frase arriba dice los dos números, para que no haya que sumar de cabeza.
 *
 * Y SE MIDE EN LO QUE SE QUIERA: HL, unidades (botellas) o cajas. Lo registrado son cajas; las
 * otras dos salen del maestro (ver `modulos/roturas/medidas`). NO CALCULA NADA: las barras ya
 * vienen hechas de la página (servidor), una por medida y por dimensión.
 */
export type PaYs = Record<Medida, Record<Dim, Datos>>;
export type Lectura = { n: number; conOpm: number; pctOpm: number; usuario: string | null; delUsuario: number; pctUsuario: number };

export function ParetosSitio({ paretos, lectura, hayHL, sinHL }: {
  paretos: PaYs; lectura: Lectura; hayHL: boolean; sinHL: number;
}) {
  const [medida, setMedida] = useState<Medida>(hayHL ? "hl" : "cajas");
  const [quien, setQuien] = useState<"registro" | "opm">("registro");
  const med = MEDIDAS.find((m) => m.id === medida)!;
  const p = paretos[medida];
  const nf = (v: number) => v.toLocaleString("es-CO");

  return (
    <>
      <div className="rq-h">
        <b>Qué poco explica lo mucho</b>
        <span>{med.nombre.toLowerCase()} movidos: rotas más contaminadas</span>
      </div>

      <div className="rq-med" role="radiogroup" aria-label="Medir en">
        <span className="rq-med-t">Medir en</span>
        {MEDIDAS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={medida === m.id}
            className={"rq-med-b" + (medida === m.id ? " on" : "")}
            disabled={m.id === "hl" && !hayHL}
            title={m.id === "hl" && !hayHL ? "Falta el HL por unidad en el maestro de Pasivos (o no tienes permiso para leerlo)" : undefined}
            onClick={() => setMedida(m.id)}>{m.nombre}</button>
        ))}
      </div>

      <p className="rq-paretos-lee">
        La última columna de cada lista es el <b>acumulado</b>: dónde pasa del 80 % es hasta
        dónde hay que atacar para tapar la mayor parte.
      </p>

      {/* LO QUE PASA CON QUIÉN REPORTA, EN UNA FRASE. */}
      {lectura.n > 0 && (
        <p className="rq-paretos-quien">
          De <b>{nf(lectura.n)}</b> roturas, <b>{lectura.pctUsuario} %</b> las registró{" "}
          <b>{lectura.usuario ?? "—"}</b> ({nf(lectura.delUsuario)}) y solo{" "}
          <b>{lectura.pctOpm} %</b> ({nf(lectura.conOpm)}) las reportó un OPM con su PIN.
        </p>
      )}
      {!hayHL && (
        <p className="rq-paretos-quien aviso-hl">
          Los HL no se pueden calcular: falta el HL por unidad en el maestro de Pasivos, o tu usuario
          no lo puede leer. Se mide en cajas.
        </p>
      )}
      {hayHL && sinHL > 0 && medida === "hl" && (
        <p className="rq-paretos-quien aviso-hl">
          {nf(sinHL)} {sinHL === 1 ? "rotura no tiene" : "roturas no tienen"} HL en el maestro y no suman aquí.
        </p>
      )}

      <div className="rq-paretos-tres">
        <div>
          <p className="rot">POR CAUSA · QUÉ PASÓ</p>
          <Pareto d={p.causa} medida={med.nombre.toLowerCase()} col={med.unidad} />
        </div>
        <div>
          <p className="rot">POR ÁREA · DÓNDE PASÓ</p>
          <Pareto d={p.area} medida={med.nombre.toLowerCase()} col={med.unidad} />
        </div>
        <div>
          <div className="rq-quien-t">
            <p className="rot">POR QUIÉN · {quien === "registro" ? "QUIÉN LA REGISTRÓ" : "OPM QUE LA REPORTÓ"}</p>
            <div className="rq-quien-sw" role="radiogroup" aria-label="Quién">
              <button type="button" role="radio" aria-checked={quien === "registro"} className={quien === "registro" ? "on" : ""} onClick={() => setQuien("registro")}>Registró</button>
              <button type="button" role="radio" aria-checked={quien === "opm"} className={quien === "opm" ? "on" : ""} onClick={() => setQuien("opm")}>OPM</button>
            </div>
          </div>
          <Pareto d={p[quien]} medida={med.nombre.toLowerCase()} col={med.unidad} />
        </div>
      </div>
    </>
  );
}
