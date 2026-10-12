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
  "/sin-conexion.html",
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

  /**
   * getUser() pregunta al servidor de Supabase. Si Supabase tarda, Vercel corta
   * todo con «504 MIDDLEWARE_INVOCATION_TIMEOUT» y nadie puede entrar. Por eso
   * se le dan 4 s; si no responde, se decide con la sesión guardada en la
   * cookie del propio navegador (no sale a la red). Los datos siguen
   * protegidos: cada consulta a la base vuelve a validar al usuario.
   */
  const user = await usuarioConTope(supabase);

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

const TOPE_MS = 4000;

async function usuarioConTope(
  supabase: ReturnType<typeof createServerClient>
): Promise<{ id: string } | null> {
  const tarde = new Promise<"tarde">((r) => setTimeout(() => r("tarde"), TOPE_MS));
  try {
    const r = await Promise.race([supabase.auth.getUser(), tarde]);
    if (r !== "tarde") return r.data.user;
  } catch {
    /* sigue con la cookie */
  }
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}
