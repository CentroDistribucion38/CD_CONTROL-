/**
 * LOS VIAJES DE UN CIERRE —
 * GET /api/traspasos/cierre?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&turno=A
 *
 * Solo lo que la ficha del cierre NO tiene ya en pantalla: los viajes
 * del turno, quién los registró, y cuántos salieron vacíos. Las cifras
 * de adherencia no se piden aquí a propósito —ya están dibujadas en el
 * tablero y la ficha las suma de ahí—: si esta ruta las devolviera,
 * habría dos sitios calculando lo mismo y algún día darían distinto.
 *
 * SE PIDE AL ABRIR LA FICHA, no al cargar el tablero: el tablero se
 * queda puesto refrescándose cada dos minutos, y esto se abre tres
 * veces al día.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { viajesRango, vaciosRango } from "@/modulos/traspasos/datos";
import { nombresTodos } from "@/modulos/sider/datos";

export const dynamic = "force-dynamic";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const permisos = await misPermisos();
  if (!permisos.puedeVer("/traspasos/control")) {
    return NextResponse.json({ error: "Tu rol no ve el control de traspasos." }, { status: 403 });
  }

  const q = new URL(req.url).searchParams;
  const desde = q.get("desde") ?? "", hasta = q.get("hasta") ?? "";
  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "Falta el rango del cierre." }, { status: 400 });
  }
  const dias = (Date.parse(hasta + "T12:00:00") - Date.parse(desde + "T12:00:00")) / 86400_000;
  if (dias > 366) return NextResponse.json({ error: "El rango no puede pasar de un año." }, { status: 400 });

  /* UNO, DOS O LOS TRES. Se valida contra las letras que existen: un
     `?turno=` cualquiera devolvería una lista vacía que se lee como
     «ese turno no movió nada», que es una afirmación falsa. */
  const turnos = [...new Set((q.get("turno") ?? "").split(",")
    .map((x) => x.trim().toUpperCase()).filter(Boolean))];
  const malo = turnos.find((t) => !["A", "B", "C"].includes(t));
  if (malo) return NextResponse.json({ error: `El turno «${malo}» no existe.` }, { status: 400 });

  const [vj, vacios, nombres] = await Promise.all([
    viajesRango(desde, hasta), vaciosRango(desde, hasta), nombresTodos(),
  ]);
  if (vj.falta) {
    return NextResponse.json({ error: "Falta preparar el módulo de traspasos en Supabase." }, { status: 503 });
  }

  const viajes = vj.viajes.filter((v) => !turnos.length || turnos.includes(v.turno));
  /* Los vacíos del turno se cuentan sobre los viajes ya filtrados; el
     total del rango solo sirve cuando el cierre es del día entero. */
  const vaciosTurno = turnos.length
    ? viajes.filter((v) => v.vacio && v.estado === "registrado").reduce((a, v) => a + (v.viajes ?? 1), 0)
    : vacios;

  return NextResponse.json({ viajes, vacios: vaciosTurno, nombres },
    { headers: { "Cache-Control": "no-store" } });
}
