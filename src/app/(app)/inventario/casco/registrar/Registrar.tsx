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
      {/* DOS HOJAS: la baja de SAP y el movimiento entre almacenes. Una a la vez. */}
      <div className="reg-hojas" role="tablist" aria-label="Qué vas a registrar">
        <button type="button" role="tab" aria-selected={tipo === "baja"} className={tipo === "baja" ? "on" : ""} onClick={() => setTipo("baja")}>
          Baja
        </button>
        <button type="button" role="tab" aria-selected={tipo === "movimiento"} className={tipo === "movimiento" ? "on" : ""} onClick={() => setTipo("movimiento")}>
          Movimiento
        </button>
      </div>

      <section className="cabeza reg-cabeza">
        <div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · REGISTRAR</p>
          <h1>Registrar</h1>
          <p className="sub">
            Lo que registres se suma o se resta en <Link href="/inventario/casco">Control</Link>, y de Control sale el{" "}
            <Link href="/inventario/casco/tablero">tablero</Link>.
          </p>
        </div>
      </section>

      {tipo === "baja"
        ? <Baja sitios={sitios} materiales={materiales} puedeEditar={puedeEditar} hoy={hoy} />
        : <Movimiento sitios={sitios} materiales={materiales} puedeEditar={puedeEditar} hoy={hoy} />}
    </>
  );
}
