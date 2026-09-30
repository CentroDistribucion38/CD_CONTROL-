/**
 * ELIMINAR DE VERDAD UNOS CAMIONES YA ANULADOS.
 *
 * POST {ids: string[], confirmacion: "ELIMINAR"}
 *
 * QUIÉN PUEDE y QUÉ se puede eliminar lo decide la base
 * (`sider_viaje_eliminar`): solo quien administra, solo lo que ya está
 * anulado y solo si se escribió ELIMINAR. Aquí se llama con LA SESIÓN de
 * quien pide, no con la llave de servicio.
 *
 * LA LLAVE DE SERVICIO se usa para una sola cosa, DESPUÉS de que la base
 * ya borró: quitar de Storage las fotos cuyas rutas devolvió la función.
 * Desde SQL Supabase no deja borrar archivos. Si la llave no está o
 * Storage falla, las filas YA se borraron y se dice cuántos archivos
 * quedaron, sin disfrazarlo de error.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];
  if (!ids.length) return NextResponse.json({ error: "No hay ningún viaje para eliminar." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const { data, error } = await supabase.rpc("sider_viaje_eliminar", {
    p_ids: ids,
    p_confirmacion: typeof b.confirmacion === "string" ? b.confirmacion : "",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const r = (Array.isArray(data) ? data[0] : data) as { filas: number; rutas: string[] | null };

  const rutas = r?.rutas ?? [];
  let archivos = 0, quedaron = 0;
  if (rutas.length) {
    const admin = clienteDeServicio();
    if (!admin) quedaron = rutas.length;
    else {
      for (let i = 0; i < rutas.length; i += 100) {
        const lote = rutas.slice(i, i + 100);
        const { error: e } = await admin.storage.from("sider").remove(lote);
        if (e) quedaron += lote.length; else archivos += lote.length;
      }
    }
  }
  return NextResponse.json({ filas: Number(r?.filas ?? 0), archivos, quedaron });
}
