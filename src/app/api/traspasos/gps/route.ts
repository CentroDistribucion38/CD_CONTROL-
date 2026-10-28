/**
 * TIEMPOS GPS — el puente con Traccar.
 *   GET  /api/traspasos/gps                       → { conectado }   (¿están puestas las llaves de Traccar?)
 *   POST /api/traspasos/gps {accion:"sincronizar"} → lee posiciones nuevas, saca entradas y salidas de las zonas y las guarda
 *   POST /api/traspasos/gps {accion:"zonas"}       → trae las geocercas de Traccar como zonas (necesita permiso de editar)
 *
 * Con la sesión de quien pide (RLS). La pantalla llama «sincronizar» cada pocos segundos mientras está abierta.
 * Con la pantalla cerrada lo hace /api/traspasos/gps/cron (reloj de fondo, ver ese archivo).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocercas, traccarConfigurado } from "@/modulos/traspasos/gps/traccar";
import { sincronizarGps } from "@/modulos/traspasos/gps/sincronizar";
import { zonaDeTraccar } from "@/modulos/traspasos/gps/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANTALLA = "/traspasos/tiempos-gps";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  return NextResponse.json({ conectado: traccarConfigurado() });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const { data: nivel } = await supabase.rpc("mi_nivel", { p_seccion: PANTALLA });
  if (!nivel || nivel === "ninguno") return NextResponse.json({ error: "No tienes permiso para esta pantalla." }, { status: 403 });
  if (!traccarConfigurado()) return NextResponse.json({ conectado: false });

  let cuerpo: { accion?: string } = {};
  try { cuerpo = await req.json() } catch { /* sin cuerpo */ }

  try {
    /* ---------------------------------------------------------------- zonas desde Traccar */
    if (cuerpo.accion === "zonas") {
      if (nivel !== "editar") return NextResponse.json({ error: "Traer las zonas necesita permiso de editar." }, { status: 403 });
      const cercas = await geocercas();
      let nuevas = 0, omitidas = 0;
      for (const g of cercas) {
        const poli = zonaDeTraccar(g.area);
        if (!poli) { omitidas++; continue }
        const { data: ya } = await supabase.from("gps_zonas").select("id").eq("traccar_id", g.id).maybeSingle();
        if (ya) { omitidas++; continue }
        const { error } = await supabase.from("gps_zonas").insert({ nombre: g.name, poligono: poli, origen: "traccar", traccar_id: g.id });
        if (error) { omitidas++; continue }
        nuevas++;
      }
      return NextResponse.json({ conectado: true, nuevas, omitidas, total: cercas.length });
    }

    /* ---------------------------------------------------------------- sincronizar */
    const r = await sincronizarGps(supabase);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
    return NextResponse.json({ conectado: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo hablar con Traccar." }, { status: 502 });
  }
}
