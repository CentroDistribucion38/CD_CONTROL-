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
     *  · api/version — es solo el número de despliegue, no toca datos.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api/version|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
