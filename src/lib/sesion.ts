import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * QUIÉN ENTRÓ, PREGUNTADO UNA SOLA VEZ POR PANTALLA.
 *
 * supabase.auth.getUser() no lee una cookie: manda la sesión al servidor
 * de Supabase para que la VALIDE, y eso es un viaje de ida y vuelta por
 * internet. Está bien que lo sea —una cookie se puede falsificar y la
 * validación es la que impide entrar con una inventada—, pero se estaba
 * pagando varias veces para pintar UNA pantalla:
 *
 *   el middleware        pregunta quién entró
 *   el armazón (layout)  vuelve a preguntar, y otra vez dentro de misPermisos
 *   la página            vuelve a preguntar, y otra vez dentro de misPermisos
 *
 * Cinco viajes, uno detrás del otro, antes de la primera consulta de
 * datos de verdad. Con la conexión de un celular en la bodega eso es
 * medio segundo largo en el que la pantalla no hace nada.
 *
 * cache() de React guarda la respuesta MIENTRAS SE ARMA ESTA PÁGINA y
 * nada más: la primera llamada pregunta, las demás reciben la misma
 * respuesta sin salir a la red. No es memoria entre visitas —la petición
 * siguiente vuelve a validar—, así que no debilita nada: la sesión se
 * sigue comprobando contra Supabase en cada pantalla, una vez.
 */
export const usuarioActual = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
