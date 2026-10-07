/**
 * BORRAR DATOS PUNTUALES — la copia en Excel y el borrado.
 *
 * GET  ?claves=a.b,c.d&desde=&hasta=   baja en Excel lo que se va a borrar
 *      (una hoja por tabla de cada dato marcado; `clave=` de uno solo también sirve).
 * POST {claves, desde, hasta, confirmacion, esperadas: {clave: filas vistas}}   borra
 *      cada dato marcado, uno tras otro, y dice qué pasó con cada uno.
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
/** Lista de claves: sin repetir y todas válidas; si una no lo es, no se acepta la lista. */
const claves = (s: unknown): string[] | null => {
  const l = (Array.isArray(s) ? s : typeof s === "string" ? s.split(",") : []).map((x) => clave(typeof x === "string" ? x.trim() : x));
  if (!l.length || l.length > 60 || l.some((x) => !x)) return null;
  return [...new Set(l as string[])];
};

export async function GET(req: Request) {
  const u = new URL(req.url);
  const cs = claves(u.searchParams.get("claves") ?? u.searchParams.get("clave"));
  const desde = fecha(u.searchParams.get("desde")), hasta = fecha(u.searchParams.get("hasta"));
  if (!cs) return NextResponse.json({ error: "Falta qué exportar" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  /* DE A MIL: PostgREST corta en mil filas sin avisar, y un Excel de
     respaldo al que le faltan filas es peor que no tener respaldo. */
  const filas: { hoja: string; fila: Record<string, unknown> }[] = [];
  for (const c of cs) {
    for (let desdeFila = 0; ; desdeFila += 1000) {
      const { data, error } = await supabase
        .rpc("admin_borrado_filas", { p_clave: c, p_desde: desde, p_hasta: hasta })
        .range(desdeFila, desdeFila + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 403 });
      const lote = (data ?? []) as { hoja: string; fila: Record<string, unknown> }[];
      filas.push(...lote);
      if (lote.length < 1000) break;
    }
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
  const que = cs.length === 1 ? cs[0].replace(".", "-") : `${cs.length}-datos`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="respaldo-${que}-${rango}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const cs = claves(b.claves ?? b.clave);
  if (!cs) return NextResponse.json({ error: "Falta qué borrar" }, { status: 400 });
  const esp = (b.esperadas !== null && typeof b.esperadas === "object" ? b.esperadas : { [cs[0]]: b.esperadas }) as Record<string, unknown>;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  /* UNO TRAS OTRO. Cada borrado es su propia operación en la base y vuelve a
     contar contra lo que se vio: si uno falla —alguien registró algo en el
     medio— los demás siguen y se dice cuál no pasó. */
  type Resultado = { clave: string; filas?: number; archivos?: number; quedaron?: number; error?: string };
  const resultados: Resultado[] = [];
  let admin: ReturnType<typeof clienteDeServicio> | undefined;
  for (const c of cs) {
    const { data, error } = await supabase.rpc("admin_borrar", {
      p_clave: c, p_desde: fecha(b.desde), p_hasta: fecha(b.hasta),
      p_confirmacion: typeof b.confirmacion === "string" ? b.confirmacion : "",
      p_esperadas: Number(esp[c]),
    });
    if (error) { resultados.push({ clave: c, error: error.message }); continue }
    const r = (Array.isArray(data) ? data[0] : data) as { filas: number; bucket: string | null; rutas: string[] | null };

    /* LOS ARCHIVOS, de a cien. Si la llave no está o Storage falla, las
       filas YA se borraron: se dice cuántos archivos quedaron, sin
       disfrazarlo de error del borrado. */
    const rutas = r?.rutas ?? [];
    let archivos = 0, quedaron = 0;
    if (r?.bucket && rutas.length) {
      if (admin === undefined) admin = clienteDeServicio();
      if (!admin) quedaron = rutas.length;
      else {
        for (let i = 0; i < rutas.length; i += 100) {
          const lote = rutas.slice(i, i + 100);
          const { error: e } = await admin.storage.from(r.bucket).remove(lote);
          if (e) quedaron += lote.length; else archivos += lote.length;
        }
      }
    }
    resultados.push({ clave: c, filas: Number(r?.filas ?? 0), archivos, quedaron });
  }
  const todosMal = resultados.every((x) => x.error);
  return NextResponse.json(
    todosMal ? { error: resultados[0]?.error ?? "No se pudo borrar.", resultados } : { resultados },
    { status: todosMal ? 400 : 200 });
}
