/**
 * EL CONSOLIDADO DEL DÍA (O DEL PERÍODO) EN EXCEL —
 *   GET /api/inventario/exportar?desde=YYYY-MM-DD&hasta=YYYY-MM-DD   (o ?fecha= para un solo día)
 *
 * Busca los recorridos ENVIADOS de esos días en la bodega, sus renglones y
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
import { armarLibroDia, type EvidenciaRenglon } from "@/modulos/inventario/libro";
import { todas, porTandas } from "@/modulos/inventario/paginas";
import { validarCasco } from "@/modulos/casco/validar-casco";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Techos para que el .xlsx siga abriéndose. */
const MAX_FOTOS_LIBRO = 150;
const MAX_BYTES_FOTO = 3 * 1024 * 1024;

/** «20261007-1136»: la fecha y la hora de Colombia, para que cada descarga tenga su propio nombre. */
const sello = () => new Date().toLocaleString("sv", { timeZone: "America/Bogota" }).replace(/[-:]/g, "").replace(" ", "-").slice(0, 13);

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const permisos = await misPermisos();
  if (!permisos.puedeVer("/inventario/base")) return NextResponse.json({ error: "Tu rol no ve la base del inventario." }, { status: 403 });

  const qs = new URL(req.url).searchParams;
  const esDia = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
  let fecha = qs.get("desde") ?? qs.get("fecha") ?? "";
  let hasta = qs.get("hasta") ?? fecha;
  if (!esDia(fecha) || !esDia(hasta)) return NextResponse.json({ error: "Falta el día (desde=AAAA-MM-DD&hasta=AAAA-MM-DD)." }, { status: 400 });
  if (hasta < fecha) [fecha, hasta] = [hasta, fecha];
  /* Un período largo trae renglones de más y el Excel se pone pesado: tres meses es de sobra. */
  if ((Date.parse(hasta) - Date.parse(fecha)) / 86400000 > 93) return NextResponse.json({ error: "El período es muy largo: máximo tres meses por Excel." }, { status: 400 });

  const m = await maestroInventario();
  if (m.falta) return NextResponse.json({ error: "Falta preparar el módulo de inventario en Supabase." }, { status: 503 });
  const conUbi = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => b.activo && conUbi.has(b.id)) ?? m.bodegas[0] ?? null;
  if (!bodega) return NextResponse.json({ error: "No hay bodega." }, { status: 404 });

  const { data: c, error } = await todas<ConteoFefo>((d, h) => supabase.from("v_conteos_fefo").select("*")
    .eq("bodega_id", bodega.id).gte("fecha_analisis", fecha).lte("fecha_analisis", hasta).eq("estado", "cerrado")
    .order("fecha_analisis", { ascending: true }).order("enviado_en", { ascending: true }).order("id").range(d, h));
  if (error) return NextResponse.json({ error }, { status: 400 });
  /* ?ids=a,b: solo los FEFO que se marcaron. Se cruzan con los del día:
     un id de otro día o sin enviar no entra aunque llegue en la URL. */
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const delDia = c;
  const conteos = ids.length ? delDia.filter((x) => ids.includes(x.id)) : delDia;
  if (!conteos.length) return NextResponse.json({ error: ids.length ? "Ninguno de los FEFO escogidos es de ese día." : (fecha === hasta ? `El ${fecha} no tiene recorridos enviados.` : `Del ${fecha} al ${hasta} no hay recorridos enviados.`) }, { status: 404 });

  const { data: l, error: eL } = await porTandas<Renglon>(conteos.map((x) => x.id), (t, d, h) => supabase.from("v_conteo_fefo").select("*").in("conteo_id", t).order("id").range(d, h));
  if (eL) return NextResponse.json({ error: eL }, { status: 400 });
  /* LAS FOTOS DE LOS RENGLONES (la camarita de Contar). Van a su propia hoja
     «Evidencias». Si la tabla todavía no existe —falta correr el SQL— o no
     hay fotos, el libro sale exactamente como siempre. Se baja a lo más
     MAX_FOTOS_LIBRO: cada foto pesa ~0,5 MB y un .xlsx de cientos de MB
     no abre; si se recortan, la hoja lo dice. */
  const lineas = l;
  const evidencias: EvidenciaRenglon[] = [];
  let recortadas = 0;
  try {
    const ids = lineas.map((x) => x.id);
    const filas: { linea_id: string; ruta: string; ancho: number | null; alto: number | null; tomada_en: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: f, error: eF } = await supabase.from("conteo_fotos")
        .select("linea_id, ruta, ancho, alto, tomada_en").in("linea_id", ids.slice(i, i + 200));
      if (eF) { filas.length = 0; break }
      filas.push(...((f ?? []) as typeof filas));
    }
    for (const f of filas) {
      if (evidencias.length >= MAX_FOTOS_LIBRO) { recortadas++; continue }
      const { data: blob, error: eB } = await supabase.storage.from("inventario").download(f.ruta);
      if (eB || !blob) { recortadas++; continue }
      const buf = Buffer.from(await (blob as Blob).arrayBuffer());
      if (buf.byteLength > MAX_BYTES_FOTO) { recortadas++; continue }
      evidencias.push({ linea_id: f.linea_id, foto: buf, ancho: f.ancho, alto: f.alto, tomada_en: f.tomada_en });
    }
  } catch { /* sin fotos: el libro de siempre */ }
  const { data: yo } = await supabase.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle();
  /* El sello de la B, como el resumen que se escogió; los colores del
     tema de quien exporta (si no llegan o no son un color, los de la marca). */
  const logo = await readFile(path.join(process.cwd(), "public", "marca", "logo-b.png")).catch(() => null);
  const q = new URL(req.url).searchParams, esHex = (x: string | null) => !!x && /^[0-9a-f]{6}$/i.test(x);
  const colores = esHex(q.get("tinta")) && esHex(q.get("banda")) ? { tinta: q.get("tinta")!, banda: q.get("banda")! } : undefined;

  /* LA VALIDACIÓN CON EL CASCO DE VIDRIO (lo que no cuadra va como comentario en «Análisis»). */
  const validacion = await validarCasco(lineas, new Map(conteos.map((c) => [c.id, String(c.fecha_analisis).slice(0, 10)])), hasta);
  const archivo = await armarLibroDia({
    validacionCasco: validacion.avisos, validacionError: validacion.error ?? undefined,
    fecha, hasta, bodega: bodega.codigo, quien: yo?.nombre || yo?.usuario || "—",
    conteos, lineas, evidencias, fotosRecortadas: recortadas, materiales: m.materiales,
    ubicaciones: m.ubicaciones.filter((u) => u.bodega_id === bodega.id), logo, colores, totalDelDia: delDia.length,
  });
  const nombre = `inventario-consolidado-${bodega.codigo}-${fecha}${hasta !== fecha ? `_${hasta}` : ""}${conteos.length < delDia.length ? `-${conteos.length}de${delDia.length}` : ""}-${sello()}.xlsx`;
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Content-Length": String(archivo.byteLength),
      "Cache-Control": "no-store",
      /* Si se quedaron fotos por fuera, que se pueda saber sin abrir el archivo. */
      ...(recortadas > 0 ? { "X-Fotos-Recortadas": String(recortadas) } : {}),
    },
  });
}
