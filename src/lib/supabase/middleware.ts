import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Rutas que se sirven sin sesión. Las tres últimas son las que necesita el
 * navegador para poder instalar CONTROL como app: si se les responde con la
 * redirección al login, llega HTML donde se esperaba un manifest o un
 * service worker, y el navegador simplemente no ofrece instalarla.
 *
 * Se repiten en el matcher de src/middleware.ts (allí ni siquiera entran
 * aquí); esto es el respaldo por si ese filtro cambia.
 */
const RUTAS_PUBLICAS = [
  "/login",
  "/auth",
  "/manifest.webmanifest",
  "/sw.js",
  "/api/version",
];

export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esPublica = RUTAS_PUBLICAS.some((r) =>
    request.nextUrl.pathname.startsWith(r)
  );

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
