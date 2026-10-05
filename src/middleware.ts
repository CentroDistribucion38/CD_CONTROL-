import type { NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  matcher: [
    /**
     * Todo pasa por aquí menos:
     *  · lo estático de Next y las imágenes
     *  · manifest.webmanifest y sw.js — el navegador los pide SIN sesión, y
     *    si les cae la redirección al login recibe HTML en vez del archivo.
     *    Esa era la razón por la que Chrome no ofrecía instalar la app.
     *  · sin-conexion.html — la página de aviso que el service worker guarda al instalarse,
     *    antes de que haya sesión: con redirección al login guardaría el login como aviso.
     *  · api/version — es solo el número de despliegue, no toca datos.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|sin-conexion.html|api/version|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
