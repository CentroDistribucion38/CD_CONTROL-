/**
 * REDACTAR UN HALLAZGO EN PALABRAS TÉCNICAS.
 *
 * «Luego nosotros darle como que reescribir en palabras técnicas.»
 *
 * ---------------------------------------------------------------------
 * POR QUÉ ESTO VIVE EN EL SERVIDOR Y NO EN LA PANTALLA
 * ---------------------------------------------------------------------
 * La llave del modelo NO puede ir al navegador. Todo lo que el
 * navegador recibe se puede leer, así que una llave ahí es una llave
 * pública: cualquiera la saca del código de la página y la usa a costa
 * de esta cuenta. Aquí vive en la variable de entorno del servidor y no
 * sale nunca de él.
 *
 * ---------------------------------------------------------------------
 * ESTO **PROPONE**, NO DECIDE
 * ---------------------------------------------------------------------
 * Lo que devuelve esta ruta NO se guarda como la redacción del informe.
 * Vuelve a la pantalla, queda editable, y solo se guarda cuando alguien
 * aprieta Aprobar — y ahí se escribe en `redaccion`, mientras lo que
 * propuso la máquina queda aparte en `ia_borrador`. Así se puede
 * contestar «¿esto lo revisó alguien?», que es la pregunta que se hace
 * cuando un informe se cae.
 *
 * ---------------------------------------------------------------------
 * SIN LLAVE, LA PANTALLA SIGUE FUNCIONANDO
 * ---------------------------------------------------------------------
 * Si no hay `ANTHROPIC_API_KEY`, esto contesta 503 con un mensaje que
 * dice QUÉ FALTA Y DÓNDE ponerlo. La pantalla lo muestra y deja
 * escribir la redacción a mano: la IA es una ayuda, no un requisito.
 * Un módulo que se traba porque falta una llave es un módulo que no se
 * puede usar el día que se venza.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* EL MODELO VA EN UNA VARIABLE Y NO ESCRITO AQUÍ: cambiarlo no debería
   ser un despliegue. Con un valor por defecto para que funcione sin
   configurar nada más que la llave. */
const MODELO = process.env.MODELO_REDACCION ?? "claude-sonnet-4-5";

/* LA INSTRUCCIÓN, ESCRITA UNA VEZ Y AQUÍ.
   Dice lo que NO puede hacer, que es lo que importa: una redacción
   técnica que agrega un detalle que nadie vio convierte el informe en
   algo que no se puede sostener cuando lo discutan. */
const INSTRUCCION = `Eres el redactor técnico de los informes de auditoría interna de un
centro de distribución de cervecería en Colombia.

Te dan lo que un auditor dictó caminando por la bodega, con guante y de pie. Tu trabajo es
reescribirlo en el lenguaje de un informe formal de auditoría.

REGLAS, EN ORDEN DE IMPORTANCIA:

1. NO AGREGUES NADA QUE NO ESTÉ EN LO QUE TE DIERON. Ni causas, ni cantidades, ni normas, ni
   consecuencias. Si el auditor no dijo cuántas estibas eran, tú tampoco lo dices. Inventar un
   detalle es lo único que puede tumbar un informe entero.
2. NO QUITES NINGÚN DATO CONCRETO: sitios, cantidades, materiales, nombres de equipos.
3. Escribe en TERCERA PERSONA e impersonal, en pasado, en español de Colombia.
   «Se evidencia…», «Se observó…». Nunca «yo vi» ni «vimos».
4. Una o dos frases. Un informe con párrafos de ocho líneas no lo lee nadie.
5. Sin juicios de valor, sin adjetivos de opinión («pésimo», «inaceptable») y sin culpar a
   personas. Se describe la condición, no a quien la dejó así.
6. No propongas la solución: eso va en otro campo del hallazgo.

Devuelve SOLO el texto reescrito, sin comillas, sin títulos y sin explicar lo que hiciste.`;

export async function POST(req: Request) {
  /* LA SESIÓN PRIMERO. Sin esto, cualquiera con la dirección de la ruta
     gasta el saldo de la cuenta desde afuera. */
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  /* Y EL PERMISO DESPUÉS: estar dentro de la plataforma no es estar en
     ABI. Se pregunta a la base, que es la que manda; la pantalla ya lo
     comprueba también, pero a una ruta se llega escribiéndola. */
  const { data: puede } = await supabase.rpc("hallazgo_puede_editar");
  if (!puede) {
    return NextResponse.json(
      { error: "Redactar hallazgos es de quien tiene Editar en ABI." }, { status: 403 });
  }

  const llave = process.env.ANTHROPIC_API_KEY;
  if (!llave) {
    return NextResponse.json({
      error: "Falta la llave del modelo. Se pone en Vercel → Settings → Environment "
           + "Variables como ANTHROPIC_API_KEY, y después hay que volver a desplegar. "
           + "Mientras tanto la redacción se puede escribir a mano: el campo de abajo "
           + "funciona igual.",
    }, { status: 503 });
  }

  let cuerpo: { texto?: string; recomendacion?: string };
  try { cuerpo = await req.json() } catch { cuerpo = {} }
  const texto = (cuerpo.texto ?? "").trim();
  if (texto.length < 10) {
    return NextResponse.json(
      { error: "Escribe primero qué se vio: sin eso no hay nada que reescribir." },
      { status: 400 });
  }
  /* UN TOPE AL TEXTO QUE ENTRA. No es por el costo: es porque un campo
     sin tope es por donde alguien pega un documento entero y la
     respuesta tarda medio minuto sin que se sepa por qué. */
  if (texto.length > 4000) {
    return NextResponse.json(
      { error: "Ese texto es muy largo para un solo hallazgo. Si de verdad es todo eso, "
             + "probablemente sean dos hallazgos." },
      { status: 400 });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": llave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 400,
        system: INSTRUCCION,
        messages: [{ role: "user", content: `Lo que dictó el auditor:\n\n${texto}` }],
      }),
      /* SE CORTA A LOS 25 SEGUNDOS. Sin esto, una llamada colgada deja
         la pantalla diciendo «Redactando…» para siempre y la persona no
         sabe si esperar o volver a tocar. */
      signal: AbortSignal.timeout(25_000),
    });

    if (!r.ok) {
      /* NO SE DEVUELVE EL CUERPO DEL ERROR TAL CUAL: puede traer de
         vuelta pedazos de la petición, y ahí va la llave en las
         cabeceras. Se traduce el código a algo que se entienda. */
      const msg = r.status === 401 ? "La llave del modelo no sirve o está vencida."
        : r.status === 429 ? "El modelo está ocupado. Intenta en un momento."
        : `El modelo contestó ${r.status}.`;
      return NextResponse.json(
        { error: msg + " Mientras tanto puedes escribir la redacción a mano." },
        { status: 502 });
    }

    const j = await r.json();
    const salida = (j?.content ?? [])
      .filter((c: { type?: string }) => c?.type === "text")
      .map((c: { text?: string }) => c.text ?? "")
      .join("").trim();

    if (!salida) {
      return NextResponse.json(
        { error: "El modelo no devolvió nada. Escribe la redacción a mano." }, { status: 502 });
    }
    /* SE DEVUELVE, NO SE GUARDA. Guardarlo aquí sería decidir por la
       persona: lo que sale en el informe lo aprueba alguien. */
    return NextResponse.json({ texto: salida });
  } catch (e) {
    const abortado = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json({
      error: abortado
        ? "El modelo se demoró más de 25 segundos. Escribe la redacción a mano o vuelve a intentar."
        : "No se pudo hablar con el modelo. Escribe la redacción a mano.",
    }, { status: 502 });
  }
}
