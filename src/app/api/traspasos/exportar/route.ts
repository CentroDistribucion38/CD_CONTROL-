/**
 * EL INFORME DE TRASPASOS EN EXCEL —
 * GET /api/traspasos/exportar?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&turno=A,C&tipo=casco
 *
 * Trae lo mismo que la pantalla de Control está viendo —el mismo rango y
 * los mismos filtros— y se lo da a modulos/traspasos/libro.ts. Con la
 * sesión del usuario (RLS): nadie exporta lo que no podría ver.
 *
 * EL FILTRO DE TURNO Y TIPO SE APLICA AQUÍ, igual que en la pantalla, y
 * a las mismas filas de la misma vista. Si el Excel filtrara distinto,
 * daría otra cifra que el tablero y la reunión se iría en discutir cuál
 * de los dos miente.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { controlRango, vaciosRango, viajesRango } from "@/modulos/traspasos/datos";
import { nombresTodos } from "@/modulos/sider/datos";
import { armarInformeTraspasos } from "@/modulos/traspasos/libro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) {
    return NextResponse.json({ error: "Falta el rango (desde=AAAA-MM-DD&hasta=AAAA-MM-DD)." }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "El «desde» es posterior al «hasta»." }, { status: 400 });
  }
  /* UN AÑO ES EL TOPE. Más que eso no es un informe, es una descarga de
     la base, y se arma entero en memoria. */
  const dias = (Date.parse(hasta + "T12:00:00") - Date.parse(desde + "T12:00:00")) / 86400_000;
  if (dias > 366) {
    return NextResponse.json({ error: "El rango no puede pasar de un año." }, { status: 400 });
  }

  const listaDe = (v: string | null) =>
    [...new Set((v ?? "").split(",").map((x) => x.trim()).filter(Boolean))];
  const turnos = listaDe(q.get("turno")), tipos = listaDe(q.get("tipo"));

  const [ctl, vacios, vj, nombres] = await Promise.all([
    controlRango(desde, hasta), vaciosRango(desde, hasta), viajesRango(desde, hasta), nombresTodos(),
  ]);
  if (ctl.falta) {
    return NextResponse.json({ error: "Falta preparar el módulo de traspasos en Supabase." }, { status: 503 });
  }

  const filas = ctl.filas.filter((f) =>
    (!turnos.length || turnos.includes(f.turno)) && (!tipos.length || tipos.includes(f.tipo)));
  const viajes = vj.viajes.filter((v) =>
    (!turnos.length || turnos.includes(v.turno)) &&
    (!tipos.length || (v.tipo != null && tipos.includes(v.tipo))));

  if (!filas.length && !viajes.length) {
    return NextResponse.json({
      error: "En ese rango, con esos filtros, no hay ni plan ni viajes que mostrar.",
    }, { status: 404 });
  }

  const { data: yo } = await supabase.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle();
  const logo = await readFile(path.join(process.cwd(), "public", "marca", "logo-b.png")).catch(() => null);
  /* Los colores del tema de quien exporta; si no llegan o no son un
     color, los de la marca. */
  const esHex = (x: string | null) => !!x && /^[0-9a-f]{6}$/i.test(x);
  const colores = esHex(q.get("tinta")) && esHex(q.get("banda"))
    ? { tinta: q.get("tinta")!, banda: q.get("banda")! } : undefined;

  const archivo = await armarInformeTraspasos({
    desde, hasta, quien: yo?.nombre || yo?.usuario || "—",
    filas, viajes, vacios, turnos, tipos, nombres, logo, colores,
  });

  const nombre = `traspasos-${desde}${desde === hasta ? "" : `-a-${hasta}`}`
    + `${turnos.length ? `-turno-${turnos.join("")}` : ""}.xlsx`;
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Content-Length": String(archivo.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
