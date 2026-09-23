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
 * Y DESPUÉS SE FUE VALIDACIÓN TAMBIÉN. El segundo par de ojos no
 * desapareció: SE MUDÓ a facturación, que da la salida al viaje y
 * despacha el vidrio en el mismo acto. Por eso el segundo paso ya no se
 * llama «Validación» —una pantalla que ya no existe— sino «Facturación»,
 * y lo que lo cierra no es una firma sino el DESPACHO.
 *
 * AQUÍ NO SE FIRMA. Esto solo cuenta en qué punto va la salida; el
 * pesaje se cierra en Pesar y el despacho se da en Traspasos →
 * Facturación, porque son dos personas distintas y cada una trabaja en
 * un sitio distinto.
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
  { id: "despacho", n: 2, t: "Facturación", h: "despacha el vidrio con el viaje" },
] as const;

export type Papel = (typeof PAPELES)[number]["id"];

/**
 * EN QUÉ ETAPA ESTÁ LA SALIDA. null = terminada.
 *
 * MIRA `despachada_en` Y NO `validador_en`. Antes miraba la firma de
 * validación; esa firma ya no se pone nunca, así que toda salida
 * cerrada se quedaba para siempre «esperando» un paso que nadie podía
 * dar. No rompía nada —por eso es de las que no se ven— pero la
 * pantalla mentía en cada salida del día.
 *
 * `despachada_en` es opcional en el tipo: sin la migración del vidrio
 * no viene, y entonces esto se comporta como antes en vez de caerse.
 */
export function etapaDe(s: Salida): Papel | null {
  if (!s.supervisora_en) return "supervisora";
  if (!s.despachada_en) return "despacho";
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
          <b>Quien pesó fue también quien despachó.</b> Lo permitió el rol de
          administrador. La regla es que sean dos: quien pesa no se da la salida a sí mismo.
        </div>
      )}
    <div className="firmas">
      {PAPELES.map((p) => {
        const esPesaje = p.id === "supervisora";
        const en  = esPesaje ? salida.supervisora_en  : salida.despachada_en ?? null;
        const por = esPesaje ? salida.supervisora_por : salida.despachada_por ?? null;
        const nota = esPesaje ? salida.supervisora_nota : null;
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
                : turno ? (esPesaje ? "Esperando" : "Esperando el Vh")
                : "Espera que se cierre el pesaje"}
            </div>
            {/* EN QUÉ VIAJE SE FUE. Es lo que contesta la pregunta del
                día que Peldar reclame: «¿con qué documento salió?» */}
            {!esPesaje && en && salida.viaje_codigo && (
              <div className="nota-firma">
                Viaje {salida.viaje_codigo}
                {salida.viaje_documento && <> · documento {salida.viaje_documento}</>}
                {salida.tolvas_contadas != null && <> · {salida.tolvas_contadas} tolva
                  {salida.tolvas_contadas === 1 ? "" : "s"} contadas</>}
              </div>
            )}
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
          Hoy son dos momentos: pesar y despachar.
        </span>
        {salida.verificador_nota && <span className="nota">{salida.verificador_nota}</span>}
      </div>
    )}
    </>
  );
}
