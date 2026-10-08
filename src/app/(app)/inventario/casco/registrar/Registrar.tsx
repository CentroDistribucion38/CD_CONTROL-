"use client";

import { useState } from "react";
import Link from "next/link";
import type { MaterialCasco, SitioCasco } from "@/modulos/casco/datos";
import { Baja } from "./Baja";
import { Movimiento } from "./Movimiento";

/**
 * CASCO DE VIDRIO · REGISTRAR — la puerta de entrada de lo que mueve el casco.
 *
 * «Dentro de Registrar debe estar si haré un MOVIMIENTO o una BAJA.»
 *
 *  · BAJA: la hoja «Baja» de SAP (unidades → estibas con el maestro). Queda el historial de archivos.
 *  · MOVIMIENTO: origen → receptor o cliente, con entrega y placa. Se digita aquí.
 *
 * Lo que se registra alimenta CONTROL (las cuatro tablas), y de Control sale el tablero.
 */

type Tipo = "baja" | "movimiento";

export function Registrar({ sitios, materiales, puedeEditar, hoy }: {
  sitios: SitioCasco[]; materiales: MaterialCasco[]; puedeEditar: boolean; hoy: string;
}) {
  const [tipo, setTipo] = useState<Tipo>("baja");

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · REGISTRAR</p>
          <h1>Registrar</h1>
          <p className="sub">
            Aquí entra lo que mueve el casco: una <b>baja</b> o un <b>movimiento</b>. Lo que registres se suma o se resta
            en <Link href="/inventario/casco">Control</Link>, y de Control sale el <Link href="/inventario/casco/tablero">tablero</Link>.
          </p>
        </div>
      </section>

      <div className="reg-tipos" role="group" aria-label="Qué vas a registrar">
        <button type="button" className="reg-tipo" aria-pressed={tipo === "baja"} onClick={() => setTipo("baja")}>
          <b>Baja</b>
          <span>La hoja «Baja» de SAP: viene en unidades y aquí se pasa a estibas con el maestro. Guarda el historial de archivos.</span>
        </button>
        <button type="button" className="reg-tipo" aria-pressed={tipo === "movimiento"} onClick={() => setTipo("movimiento")}>
          <b>Movimiento</b>
          <span>Origen → almacén receptor o cliente, con material, estibas, entrega y placa.</span>
        </button>
      </div>

      {tipo === "baja"
        ? <Baja sitios={sitios} materiales={materiales} puedeEditar={puedeEditar} hoy={hoy} />
        : <Movimiento sitios={sitios} materiales={materiales} puedeEditar={puedeEditar} hoy={hoy} />}
    </>
  );
}
