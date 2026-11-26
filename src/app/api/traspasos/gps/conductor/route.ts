/**
 * TIEMPOS GPS · LOS VIAJES DEL CONDUCTOR (parte 2, en prueba: solo superadmin).
 *   GET  /api/traspasos/gps/conductor?placa=ABC123          → los viajes que ya puede hacer esa placa
 *   POST /api/traspasos/gps/conductor {accion, placa, viaje?, recorrido?}
 *        accion: "iniciar" (check al viaje) · "cancelar" (se marcó el equivocado) · "llegue" (destino sin geocerca)
 *
 * Lee los viajes con la llave de servicio (el conductor no tiene permiso sobre Traspasos), pero SOLO
 * después de comprobar aquí la sesión y que quien pide es el superadmin mientras esto está en prueba.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { misPermisos } from "@/lib/permisos";
import { limpiarPlaca, placaValida } from "@/modulos/traspasos/gps/celular";
import { cerrarRecorrido, iniciarRecorrido, viajesDeConductor } from "@/modulos/traspasos/gps/recorridos";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function quien() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sin sesión." }, { status: 401 }) };
  const permisos = await misPermisos();
  if (!permisos.manda) return { error: NextResponse.json({ error: "Los viajes con seguimiento están en prueba: solo el superadministrador." }, { status: 403 }) };
  const db = clienteDeServicio();
  if (!db) return { error: NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }, { status: 503 }) };
  return { user, db };
}

export async function GET(req: Request) {
  const q = await quien();
  if ("error" in q) return q.error;
  const placa = limpiarPlaca(new URL(req.url).searchParams.get("placa") ?? "");
  if (!placaValida(placa)) return NextResponse.json({ error: "Escribe la placa del vehículo (ej. ABC123)." }, { status: 400 });
  const r = await viajesDeConductor(q.db, placa);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
  return NextResponse.json({ ok: true, viajes: r.viajes });
}

export async function POST(req: Request) {
  const q = await quien();
  if ("error" in q) return q.error;
  let c: { accion?: unknown; placa?: unknown; viaje?: unknown; recorrido?: unknown } = {};
  try { c = await req.json() } catch { return NextResponse.json({ error: "Datos ilegibles." }, { status: 400 }) }
  const placa = limpiarPlaca(String(c.placa ?? ""));
  if (!placaValida(placa)) return NextResponse.json({ error: "Escribe la placa del vehículo (ej. ABC123)." }, { status: 400 });
  const uuid = (x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x) ? x : null;

  let r;
  if (c.accion === "iniciar") {
    const viaje = uuid(c.viaje);
    if (!viaje) return NextResponse.json({ error: "Falta el viaje." }, { status: 400 });
    r = await iniciarRecorrido(q.db, placa, viaje, q.user.id);
  } else if (c.accion === "cancelar" || c.accion === "llegue") {
    const id = uuid(c.recorrido);
    if (!id) return NextResponse.json({ error: "Falta el recorrido." }, { status: 400 });
    r = await cerrarRecorrido(q.db, placa, id, c.accion);
  } else return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
  const lista = await viajesDeConductor(q.db, placa);
  return NextResponse.json({ ok: true, viajes: lista.ok ? lista.viajes : [] });
}
