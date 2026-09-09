import { Suspense } from "react";
import { cookies } from "next/headers";
import { Formulario } from "./Formulario";
import "./acceso.css";

/**
 * LA PANTALLA DE ENTRADA.
 *
 * POR QUÉ ESTE ARCHIVO ES DE SERVIDOR Y EL FORMULARIO NO
 * La entrada no sabe quién va a entrar, así que no puede leer el tema de
 * nadie en la base. Se pinta con el tema de la ÚLTIMA persona que entró
 * en ese equipo, que es lo más cerca que se puede estar de acertar: en
 * el computador del patio siempre entra la misma gente.
 *
 * Ese recuerdo va en una COOKIE y no en localStorage a propósito. El
 * servidor puede leer una cookie y mandar el HTML ya pintado; con
 * localStorage habría que esperar a que arranque el JavaScript, y la
 * pantalla se vería un instante en azul marino y luego saltaría al tema
 * de la persona. Ese parpadeo se ve mal en cualquier pantalla y peor en
 * una tablet de piso, que arranca lenta.
 *
 * Es una preferencia DEL EQUIPO, no un dato de nadie: solo dice de qué
 * color pintar, no quién es ni qué puede ver.
 */
export const dynamic = "force-dynamic";

const TEMAS = new Set(["tinta", "pizarra", "ambar", "negro", "gris", "halo"]);

export default async function LoginPage() {
  /* Si la cookie trae basura o un tema que ya no existe, se ignora y
     entra el oficial. Un valor escrito a mano no puede dejar la entrada
     sin colores. */
  const guardado = (await cookies()).get("tema_equipo")?.value;
  const tema = guardado && TEMAS.has(guardado) ? guardado : undefined;

  return (
    <div className="acc" data-tema={tema}>
      <Suspense>
        <Formulario />
      </Suspense>
    </div>
  );
}
