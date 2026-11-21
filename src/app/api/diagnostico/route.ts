import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * DIAGNÓSTICO DE VELOCIDAD — «todo demora en abrir».
 *
 * Mide, desde el servidor de Vercel que arma las pantallas, cuánto tarda un viaje a Supabase. Si Vercel corre en un país y
 * Supabase en otro, cada consulta cruza el continente y TODAS las pantallas tardan, sin importar cuál. Devuelve:
 *   · la región de Vercel donde corrió (VERCEL_REGION: iad1 = Washington, gru1 = São Paulo, …)
 *   · cuánto tarda validar la sesión
 *   · cinco consultas mínimas seguidas (lo que tarda UN viaje, cinco veces) y cinco a la vez
 * Solo con sesión iniciada (el middleware lo protege); no lee datos de nadie.
 */
export async function GET() {
  const t = () => performance.now();
  const ms = (a: number) => Math.round(t() - a);
  const supabase = await createClient();

  let a = t();
  const user = await usuarioActual();
  const sesion = ms(a);
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const una = () => supabase.from("roles").select("clave").limit(1);
  const seguidas: number[] = [];
  for (let i = 0; i < 5; i++) { a = t(); await una(); seguidas.push(ms(a)) }
  a = t();
  await Promise.all(Array.from({ length: 5 }, una));
  const aLaVez = ms(a);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const viaje = Math.min(...seguidas);
  return NextResponse.json({
    vercel_region: process.env.VERCEL_REGION ?? "local",
    supabase_proyecto: url.replace(/^https:\/\//, "").split(".")[0],
    sesion_ms: sesion,
    consultas_seguidas_ms: seguidas,
    cinco_a_la_vez_ms: aLaVez,
    un_viaje_ms: viaje,
    lectura: viaje <= 40 ? "Vercel y Supabase están cerca: la demora no es la distancia."
      : viaje <= 90 ? "Distancia media: cada consulta suma algo; vale la pena acercarlos."
      : "Vercel y Supabase están lejos: cada consulta cruza el continente. Hay que poner las funciones de Vercel en la región de Supabase.",
  }, { headers: { "cache-control": "no-store" } });
}
