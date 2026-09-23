"use client";

import type { Salida } from "@/modulos/roturas/datos";
import { fecha, quien } from "@/modulos/roturas/formato";

/**
 * LA CADENA DE LAS DOS FIRMAS, para mirar.
 *
 * ERAN TRES Y AHORA SON DOS. «Quita lo de Verificación: que solo sean
 * dos firmas, dos procesos.» Se va el paso de en medio; lo que NO se va
 * es la razón de ser de la cadena: siguen siendo DOS PERSONAS. Quien
 * pesó no se da el aval a sí mismo.
 *
 * AQUÍ NO SE FIRMA. Esto solo cuenta en qué punto va la salida; firmar
 * se hace en la pantalla de cada etapa —Pesar, Validación—, porque las
 * dos firmas son de dos personas distintas y cada una trabaja en un
 * sitio distinto.
 *
 * La primera versión ponía los botones juntos. La misma persona los
 * veía todos, tocaba dos, y la base le contestaba "quien pesó no
 * valida". La regla estaba bien; la pantalla la convertía en un regaño
 * en vez de en un camino.
 *
 * El número de cada firma no es adorno: es lo que hace ver, sin leer,
 * que no se puede validar antes de pesar.
 *
 * LO YA VERIFICADO SE SIGUE MOSTRANDO —ver `verificoAntes`—: las
 * salidas de los meses pasados pasaron por tres manos y la pantalla
 * tiene que poder decirlo. Se muestra como lo que es: algo que ocurrió
 * cuando había tres firmas, no un paso que falte hoy.
 */

export const PAPELES = [
  { id: "supervisora", n: 1, t: "Supervisor (a)", h: "pesa y cierra la salida" },
  { id: "validador", n: 2, t: "Validación", h: "da el aval de salida" },
] as const;

export type Papel = (typeof PAPELES)[number]["id"];

/** En qué etapa está la salida. null = ya están las dos. */
export function etapaDe(s: Salida): Papel | null {
  if (!s.supervisora_en) return "supervisora";
  if (!s.validador_en) return "validador";
  return null;
}

export function Firmas({ salida, nombres }: {
  salida: Salida;
  nombres: Record<string, string>;
}) {
  const etapa = etapaDe(salida);

  return (
    <>
      {/* DOS FIRMAS DE LA MISMA MANO. Solo el administrador puede, y a
          propósito: un domingo sin nadie más la bodega no se puede
          quedar parada, y en pruebas una sola persona tiene que poder
          recorrer la cadena. Pero se DICE. Una excepción silenciosa
          convierte la regla de las tres personas en un adorno: al mes
          nadie recuerda que existía. */}
      {salida.mismo_firmante && (
        <div className="aviso" style={{ marginBottom: 12 }}>
          <b>Las dos firmas son de la misma persona.</b> Lo permitió el rol de
          administrador. La regla es que sean dos: quien pesa no da la salida.
        </div>
      )}
    <div className="firmas">
      {PAPELES.map((p) => {
        const en = p.id === "supervisora" ? salida.supervisora_en : salida.validador_en;
        const por = p.id === "supervisora" ? salida.supervisora_por : salida.validador_por;
        const nota = p.id === "supervisora" ? salida.supervisora_nota : salida.validador_nota;
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
            {/* LO QUE DIJO QUIEN FIRMÓ. Va debajo de SU firma y no en un
                campo común de la salida: "el bruto de la 2 no cuadraba"
                dicho por quien valida no es lo mismo que dicho por quien
                pesó, y juntarlas borra quién vio qué. */}
            {nota && <div className="nota-firma">{nota}</div>}
          </div>
        );
      })}
    </div>

    {/* LA FIRMA QUE YA NO SE PIDE, en las salidas que la tienen.

        No es una etapa de la cadena —no lleva número, no espera a
        nadie— y por eso va debajo y no dentro de la fila: si se pintara
        como una tercera firma, una salida vieja parecería estar en un
        paso que hoy no existe. Es un dato del histórico: esa salida
        pasó por tres manos porque cuando salió había tres. */}
    {salida.verificador_en && (
      <div className="firma-vieja">
        <b>Verificada por {quien(nombres, salida.verificador_por)}</b>
        <span>
          {fecha(salida.verificador_en)} · La salida llevaba tres firmas cuando esto pasó.
          Hoy son dos: pesar y validar.
        </span>
        {salida.verificador_nota && <span className="nota">{salida.verificador_nota}</span>}
      </div>
    )}
    </>
  );
}
