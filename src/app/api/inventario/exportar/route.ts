/**
 * EL CONSOLIDADO DEL DÍA EN EXCEL — GET /api/inventario/exportar?fecha=YYYY-MM-DD
 *
 * Busca los recorridos ENVIADOS de ese día en la bodega, sus renglones y
 * el maestro, y se los da a src/modulos/inventario/libro.ts, que arma el
 * libro. Con la sesión del usuario (RLS): nadie exporta lo que no podría
 * ver en pantalla.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { maestroInventario, type Renglon, type ConteoFefo } from "@/modulos/inventario/fefo";
import { armarLibroDia } from "@/modulos/inventario/libro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const permisos = await misPermisos();
  if (!permisos.puedeVer("/inventario/base")) return NextResponse.json({ error: "Tu rol no ve la base del inventario." }, { status: 403 });

  const fecha = new URL(req.url).searchParams.get("fecha") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Falta el día (fecha=AAAA-MM-DD)." }, { status: 400 });

  const m = await maestroInventario();
  if (m.falta) return NextResponse.json({ error: "Falta preparar el módulo de inventario en Supabase." }, { status: 503 });
  const conUbi = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => b.activo && conUbi.has(b.id)) ?? m.bodegas[0] ?? null;
  if (!bodega) return NextResponse.json({ error: "No hay bodega." }, { status: 404 });

  const { data: c, error } = await supabase.from("v_conteos_fefo").select("*")
    .eq("bodega_id", bodega.id).eq("fecha_analisis", fecha).eq("estado", "cerrado")
    .order("enviado_en", { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const conteos = (c ?? []) as ConteoFefo[];
  if (!conteos.length) return NextResponse.json({ error: `El ${fecha} no tiene recorridos enviados.` }, { status: 404 });

  const { data: l } = await supabase.from("v_conteo_fefo").select("*")
    .in("conteo_id", conteos.map((x) => x.id)).limit(20000);
  const { data: yo } = await supabase.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle();
  const logo = await readFile(path.join(process.cwd(), "public", "marca", "logo-bavaria.png")).catch(() => null);

  const archivo = await armarLibroDia({
    fecha, bodega: bodega.codigo, quien: yo?.nombre || yo?.usuario || "—",
    conteos, lineas: (l ?? []) as Renglon[], materiales: m.materiales,
    ubicaciones: m.ubicaciones.filter((u) => u.bodega_id === bodega.id), logo,
  });
  const nombre = `inventario-consolidado-${bodega.codigo}-${fecha}.xlsx`;
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Content-Length": String(archivo.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
