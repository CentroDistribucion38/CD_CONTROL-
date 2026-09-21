/**
 * BORRAR DATOS PUNTUALES — la copia en Excel y el borrado.
 *
 * GET  ?clave=&desde=&hasta=   baja en Excel lo que se va a borrar.
 * POST {clave, desde, hasta, confirmacion, esperadas}   borra.
 *
 * QUIÉN PUEDE lo decide la base: las funciones admin_borrado_* y
 * admin_borrar preguntan manda() con la sesión de quien pide. Aquí se
 * llama con ESA sesión, no con la llave de servicio, para que la regla
 * sea la misma venga por donde venga.
 *
 * LA LLAVE DE SERVICIO se usa para una sola cosa y DESPUÉS de que la base
 * dijo que sí y ya borró: quitar de Storage los PDF y las fotos cuyas
 * rutas devolvió la función. Desde SQL Supabase no deja borrar archivos.
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fecha = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const clave = (s: unknown) => (typeof s === "string" && /^[a-z]+\.[a-z]+$/.test(s) ? s : null);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const c = clave(u.searchParams.get("clave"));
  const desde = fecha(u.searchParams.get("desde")), hasta = fecha(u.searchParams.get("hasta"));
  if (!c) return NextResponse.json({ error: "Falta qué exportar" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  /* DE A MIL: PostgREST corta en mil filas sin avisar, y un Excel de
     respaldo al que le faltan filas es peor que no tener respaldo. */
  const filas: { hoja: string; fila: Record<string, unknown> }[] = [];
  for (let desdeFila = 0; ; desdeFila += 1000) {
    const { data, error } = await supabase
      .rpc("admin_borrado_filas", { p_clave: c, p_desde: desde, p_hasta: hasta })
      .range(desdeFila, desdeFila + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    const lote = (data ?? []) as { hoja: string; fila: Record<string, unknown> }[];
    filas.push(...lote);
    if (lote.length < 1000) break;
  }

  const libro = new ExcelJS.Workbook();
  libro.creator = "CONTROL";
  const hojas = new Map<string, ExcelJS.Worksheet>();
  for (const { hoja, fila } of filas) {
    let h = hojas.get(hoja);
    if (!h) {
      h = libro.addWorksheet(hoja.slice(0, 31));
      h.columns = Object.keys(fila).map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(12, k.length + 2)) }));
      h.getRow(1).font = { bold: true };
      h.views = [{ state: "frozen", ySplit: 1 }];
      hojas.set(hoja, h);
    }
    h.addRow(Object.fromEntries(Object.entries(fila).map(([k, v]) =>
      [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])));
  }
  if (hojas.size === 0) libro.addWorksheet("sin filas").addRow(["No hay filas en ese rango."]);

  const buffer = await libro.xlsx.writeBuffer();
  const rango = desde || hasta ? `${desde ?? "inicio"}-a-${hasta ?? "hoy"}` : "todo";
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="respaldo-${c.replace(".", "-")}-${rango}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const c = clave(b.clave);
  if (!c) return NextResponse.json({ error: "Falta qué borrar" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const { data, error } = await supabase.rpc("admin_borrar", {
    p_clave: c, p_desde: fecha(b.desde), p_hasta: fecha(b.hasta),
    p_confirmacion: typeof b.confirmacion === "string" ? b.confirmacion : "",
    p_esperadas: Number(b.esperadas),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const r = (Array.isArray(data) ? data[0] : data) as { filas: number; bucket: string | null; rutas: string[] | null };

  /* LOS ARCHIVOS, de a cien. Si la llave no está o Storage falla, las
     filas YA se borraron: se dice cuántos archivos quedaron, sin
     disfrazarlo de error del borrado. */
  const rutas = r?.rutas ?? [];
  let archivos = 0, quedaron = 0;
  if (r?.bucket && rutas.length) {
    const admin = clienteDeServicio();
    if (!admin) quedaron = rutas.length;
    else {
      for (let i = 0; i < rutas.length; i += 100) {
        const lote = rutas.slice(i, i + 100);
        const { error: e } = await admin.storage.from(r.bucket).remove(lote);
        if (e) quedaron += lote.length; else archivos += lote.length;
      }
    }
  }
  return NextResponse.json({ filas: Number(r?.filas ?? 0), archivos, quedaron });
}
