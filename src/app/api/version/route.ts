import { NextResponse } from "next/server";

/**
 * Devuelve la versión del despliegue que está atendiendo AHORA. El navegador
 * la compara con la que trae horneada; si son distintas, es que hay una
 * versión nueva publicada.
 *
 * force-dynamic y no-store: si esto se cachea, nunca se entera de nada.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  return NextResponse.json(
    { version },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
