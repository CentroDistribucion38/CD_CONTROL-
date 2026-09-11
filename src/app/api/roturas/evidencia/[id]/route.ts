/**
 * Las fotos firmadas de una rotura.
 *
 * Va por API y no como prop de la lista porque las fotos no se traen
 * hasta que alguien abre la rotura: firmar quinientas URL para que
 * alguien mire una es trabajo que se paga en espera.
 *
 * Las políticas de RLS siguen aplicando —el cliente lleva la sesión del
 * usuario, no una llave de servicio—, así que esta ruta no puede mostrar
 * nada que ese usuario no pudiera leer por su cuenta.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fotosDeRotura } from "@/modulos/roturas/datos";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Un uuid, y nada más: así una ruta rara no llega hasta la base.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const fotos = await fotosDeRotura(id);

  /* Las URL firmadas vencen en minutos: que un intermediario las guarde
     no tiene sentido y sí tiene riesgo. */
  return NextResponse.json({ fotos }, { headers: { "Cache-Control": "no-store" } });
}
