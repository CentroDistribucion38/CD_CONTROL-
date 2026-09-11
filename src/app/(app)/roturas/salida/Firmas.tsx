"use client";

import type { Salida } from "@/modulos/roturas/datos";
import { fecha, quien } from "@/modulos/roturas/formato";

/**
 * LA CADENA DE LAS TRES FIRMAS, para mirar.
 *
 * AQUÍ NO SE FIRMA. Esto solo cuenta en qué punto va la salida; firmar
 * se hace en la pantalla de cada etapa —Pesar, Verificación,
 * Validación—, porque las tres firmas son de tres personas distintas y
 * cada una trabaja en un sitio distinto.
 *
 * La primera versión ponía los tres botones juntos. La misma persona
 * veía los tres, tocaba dos, y la base le contestaba "quien pesó no
 * verifica". La regla estaba bien; la pantalla la convertía en un
 * regaño en vez de en un camino.
 *
 * El número de cada firma no es adorno: es lo que hace ver, sin leer,
 * que no se puede validar antes de verificar.
 */

export const PAPELES = [
  { id: "supervisora", n: 1, t: "Supervisora", h: "pesa y cierra la salida" },
  { id: "verificador", n: 2, t: "Verificador", h: "revisa lo que va a salir" },
  { id: "validador", n: 3, t: "Validación", h: "da el aval de salida" },
] as const;

export type Papel = (typeof PAPELES)[number]["id"];

/** En qué etapa está la salida. null = ya están las tres. */
export function etapaDe(s: Salida): Papel | null {
  if (!s.supervisora_en) return "supervisora";
  if (!s.verificador_en) return "verificador";
  if (!s.validador_en) return "validador";
  return null;
}

/** ¿Esta persona puede poner ESTA firma? Mismo criterio que rotura_puede
 *  en la base. Las dos capas dicen lo mismo, pero la que protege es la
 *  de abajo: a una pantalla escondida se llega escribiendo la URL. */
export function puedeFirmar(papel: Papel, rol: string, manda: boolean) {
  if (manda) return true;
  if (papel === "supervisora") return rol === "supervisor";
  return rol === papel;
}

export function Firmas({ salida, nombres }: {
  salida: Salida;
  nombres: Record<string, string>;
}) {
  const etapa = etapaDe(salida);

  return (
    <div className="firmas">
      {PAPELES.map((p) => {
        const en = p.id === "supervisora" ? salida.supervisora_en
          : p.id === "verificador" ? salida.verificador_en : salida.validador_en;
        const por = p.id === "supervisora" ? salida.supervisora_por
          : p.id === "verificador" ? salida.verificador_por : salida.validador_por;
        const turno = etapa === p.id && salida.estado !== "anulada";

        return (
          <div key={p.id} className={"firma" + (en ? " lista" : turno ? " turno" : "")}>
            <div className="cab-f">
              <span className="n">{en ? "✓" : p.n}</span>
              <div style={{ minWidth: 0 }}>
                <div className="quien">{en ? quien(nombres, por) : p.t}</div>
                <div className="hace">{en ? p.t : p.h}</div>
              </div>
            </div>
            <div className="cuando">
              {en ? fecha(en)
                : turno ? "Esperando"
                : "Espera la firma anterior"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
