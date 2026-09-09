"use client";

/**
 * DEJA ANOTADO EN ESTE EQUIPO CON QUÉ TEMA SE ENTRÓ.
 *
 * Lo lee la pantalla de entrada para pintarse igual la próxima vez, en
 * vez de abrir siempre en azul marino y saltar al tema de la persona
 * después de entrar.
 *
 * Es lo único que se guarda: el NOMBRE del tema. No el usuario, no el
 * rol, no nada que diga quién es. Es una preferencia del equipo.
 *
 * La cookie la escribe el navegador y no el servidor porque el layout es
 * un componente de servidor y esos no pueden poner cookies; y ponerla en
 * el middleware obligaría a consultar el perfil en cada navegación.
 * Aquí se escribe una sola vez, cuando cambia.
 */

import { useEffect } from "react";

export function RecordarTema({ tema }: { tema: string }) {
  useEffect(() => {
    const nombre = "tema_equipo";
    const yaEsta = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${nombre}=`))
      ?.slice(nombre.length + 1);
    if (yaEsta === tema) return;
    /* SameSite=Lax para que no viaje en peticiones de otros sitios, y un
       año de vida: es una preferencia, no una sesión. Sin Secure porque
       en desarrollo se corre en http y el navegador la descartaría. */
    document.cookie =
      `${nombre}=${encodeURIComponent(tema)}; path=/; max-age=31536000; samesite=lax`;
  }, [tema]);

  return null;
}
