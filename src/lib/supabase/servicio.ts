/**
 * EL CLIENTE CON LLAVE DE SERVICIO.
 *
 * Esta llave SE SALTA EL RLS ENTERO: con ella se lee y se escribe
 * cualquier fila de cualquier tabla, y se crean y borran cuentas. Es la
 * llave del edificio, no la de una oficina.
 *
 * Por eso:
 *   · vive en SUPABASE_SERVICE_ROLE_KEY, SIN el prefijo NEXT_PUBLIC_.
 *     Con ese prefijo, Next la empaqueta en el JavaScript que baja al
 *     navegador y cualquiera la lee con F12.
 *   · este archivo solo se importa desde rutas de API o Server
 *     Components. Si alguien lo importa desde un componente "use client",
 *     el import de arriba revienta el build en vez de filtrar la llave.
 *   · quien la use TIENE que comprobar antes, por su cuenta, que quien
 *     pidió la acción puede hacerla. Con esta llave no hay red de
 *     seguridad debajo: el RLS ya no está.
 *
 * Se usa para UNA cosa: crear la cuenta de un usuario nuevo. Crear en
 * auth.users no se puede hacer de ninguna otra forma.
 */

import "server-only";
import { createClient as crear } from "@supabase/supabase-js";

/** null si la llave no está puesta, para poder decirlo en pantalla. */
export function clienteDeServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) return null;

  return crear(url, llave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Para que la pantalla avise en vez de fallar al guardar. */
export const hayLlaveDeServicio = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY;
