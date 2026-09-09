/**
 * EXPORTAR SIDER CERTIFICADO — se rellena la plantilla de
 * public/plantillas/sider.xlsx: portada, base, panel de consulta,
 * evidencia y fotos incrustadas.
 *
 * POR QUÉ EN EL SERVIDOR
 * Las fotos viven en un bucket privado. Armar esto en el navegador
 * obligaría a bajar cada foto al teléfono, meterla en el archivo en
 * memoria y guardarlo: en un celular con veinte viajes eso son sesenta
 * imágenes en RAM. Aquí se bajan y se pegan del lado del servidor, y al
 * navegador le llega un archivo.
 *
 * Y SIGUE APLICANDO RLS: el cliente lleva la sesión del usuario, no una
 * llave de servicio. Nadie exporta lo que no podría ver en pantalla.
 *
 * Esta ruta solo BUSCA los datos. Armar el libro es de
 * src/modulos/sider/libro.ts, que se puede correr con datos de prueba y
 * abrir el archivo resultante para ver si de verdad quedó bien.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MESES_LARGO, type Viaje, type FilaSeguimiento } from "@/modulos/sider/comun";
import { armarLibro, type FilaCert, type FilaFoto } from "@/modulos/sider/libro";

export const dynamic = "force-dynamic";
/* Bajar fotos y armar el libro toma su rato; el techo por defecto de la
   plataforma es demasiado corto para veinte viajes con seis fotos. */
export const maxDuration = 60;

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const url = new URL(req.url);
  const mesParam = url.searchParams.get("mes"); // "2026-08"
  const conFotos = url.searchParams.get("fotos") !== "no";
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : null;

  /* ---------- Los viajes ---------- */
  let q = supabase.from("v_sider_viajes").select("*").order("creado_en", { ascending: false });
  if (mes) {
    /* El filtro es por FECHA del viaje —la de la salida— y no por
       creado_en: un viaje que se despachó el 31 y se registró el 1 es
       del mes en que salió. */
    const desde = `${mes}-01`;
    const [a, m] = mes.split("-").map(Number);
    const hasta = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
    q = q.gte("fecha", desde).lt("fecha", hasta);
  }
  const { data: crudos, error } = await q.limit(2000);
  if (error) {
    return NextResponse.json(
      { error: "Falta crear el módulo en Supabase: ejecuta supabase/modulos/sider.sql." },
      { status: 500 }
    );
  }
  const viajes = (crudos ?? []) as unknown as Viaje[];

  /* ---------- El seguimiento del mes ---------- */
  const { data: segCrudo } = mes
    ? await supabase.from("v_sider_seguimiento").select("*").eq("mes", `${mes}-01`)
        .order("hl_recibido", { ascending: false })
    : { data: [] };
  const seg = (segCrudo ?? []) as unknown as FilaSeguimiento[];

  /* ---------- Quién hizo cada cosa ---------- */
  const ids = [...new Set(viajes.map((v) => v.creado_por).filter(Boolean))] as string[];
  const nombres: Record<string, string> = {};
  if (ids.length) {
    const { data } = await supabase.from("perfiles").select("id, usuario, nombre").in("id", ids);
    for (const p of (data ?? []) as { id: string; usuario: string | null; nombre: string | null }[]) {
      nombres[p.id] = p.usuario || p.nombre || "—";
    }
  }

  /* ---------- Las certificaciones y sus fotos ---------- */
  const idsViaje = viajes.map((v) => v.id);
  let certs: FilaCert[] = [];
  let fotos: FilaFoto[] = [];
  if (idsViaje.length) {
    const { data: c } = await supabase
      .from("sider_certificaciones")
      .select("id, viaje_id, punta, lat, lng, precision_m, direccion, nota, hecha_por, hecha_en")
      .in("viaje_id", idsViaje);
    certs = (c ?? []) as FilaCert[];
    if (certs.length) {
      const { data: f } = await supabase
        .from("sider_fotos")
        .select("certificacion_id, ranura, ruta")
        .in("certificacion_id", certs.map((x) => x.id));
      fotos = (f ?? []) as FilaFoto[];
    }
  }

  const titulo = mes
    ? `${MESES_LARGO[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
    : "Todo el histórico";

  const { archivo, recortadas } = await armarLibro({
    titulo,
    quien: user.email ?? "—",
    viajes, seg, certs, fotos, nombres,
    bajarFoto: conFotos
      ? async (ruta: string) => {
          const { data, error: e } = await supabase.storage.from("sider").download(ruta);
          if (e || !data) return null;
          return Buffer.from(await (data as Blob).arrayBuffer());
        }
      : null,
  });

  const nombre = `Sider Certificado ${mes ?? "historico"}.xlsx`;
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Content-Length": String(archivo.byteLength),
      "Cache-Control": "no-store",
      /* Si se recortaron fotos hay que poder saberlo sin abrir el
         archivo: se dice en una cabecera y también en la hoja. */
      "X-Fotos-Recortadas": String(recortadas),
    },
  });
}
