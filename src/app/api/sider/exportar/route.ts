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
import { nombreRango, mesCompleto, type Viaje, type FilaSeguimiento } from "@/modulos/sider/comun";
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
  const conFotos = url.searchParams.get("fotos") !== "no";

  /* EL MISMO RANGO QUE SE ESTÁ VIENDO, no el mes suelto. Exportar tiene
     que dar el archivo de lo que está en pantalla; si aquí llegara solo
     el mes, alguien que mira del 3 al 17 se llevaría agosto completo y
     no se enteraría. Se sigue aceptando ?mes= —la forma vieja— para no
     romper un enlace guardado. */
  const F = /^\d{4}-\d{2}-\d{2}$/;
  const qd = url.searchParams.get("desde"), qh = url.searchParams.get("hasta");
  const qm = url.searchParams.get("mes");
  let rango: { desde: string; hasta: string } | null = null;
  if (qd && qh && F.test(qd) && F.test(qh)) {
    rango = qd <= qh ? { desde: qd, hasta: qh } : { desde: qh, hasta: qd };
  } else if (qm && /^\d{4}-\d{2}$/.test(qm)) {
    rango = mesCompleto(qm);
  }

  /* ---------- Los viajes ---------- */
  let q = supabase.from("v_sider_viajes").select("*").order("creado_en", { ascending: false });
  if (rango) {
    /* El filtro es por FECHA del viaje —la de la salida— y no por
       creado_en: un viaje que se despachó el 31 y se registró el 1 es
       del mes en que salió.
       El día de cierre entra completo: < hasta+1, no <= hasta, que se
       comería las horas de ese día. */
    const [a, m, d] = rango.hasta.split("-").map(Number);
    const finExclusivo = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
    q = q.gte("fecha", rango.desde).lt("fecha", finExclusivo);
  }
  const { data: crudos, error } = await q.limit(2000);
  if (error) {
    return NextResponse.json(
      { error: "Falta crear el módulo en Supabase: ejecuta supabase/modulos/sider.sql." },
      { status: 500 }
    );
  }
  const viajes = (crudos ?? []) as unknown as Viaje[];

  /* ---------- El seguimiento del rango ---------- */
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const cli = supabase as any;
  const { data: segCrudo } = rango
    ? await cli.rpc("sider_seguimiento", { p_desde: rango.desde, p_hasta: rango.hasta })
    : { data: [] };
  const seg = ((segCrudo ?? []) as unknown as FilaSeguimiento[])
    .sort((a, b) => Number(b.hl_recibido) - Number(a.hl_recibido));

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
  /* POR TANDAS. Un .in() con dos mil UUID arma una URL de setenta kilos
     y el servidor la rechaza —o peor, la corta— sin decir por qué: el
     export saldría sin evidencia y sin avisar. De trescientos en
     trescientos son siete llamadas cortas y siempre cabe. */
  const idsViaje = viajes.map((v) => v.id);
  const TANDA = 300;
  const enTandas = async <T,>(ids: string[], col: string, tabla: string, cols: string) => {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += TANDA) {
      const { data } = await supabase.from(tabla).select(cols).in(col, ids.slice(i, i + TANDA));
      out.push(...((data ?? []) as T[]));
    }
    return out;
  };

  let certs: FilaCert[] = [];
  let fotos: FilaFoto[] = [];
  if (idsViaje.length) {
    certs = await enTandas<FilaCert>(
      idsViaje, "viaje_id", "sider_certificaciones",
      "id, viaje_id, punta, lat, lng, precision_m, direccion, nota, hecha_por, hecha_en"
    );
    if (certs.length) {
      fotos = await enTandas<FilaFoto>(
        certs.map((x) => x.id), "certificacion_id", "sider_fotos",
        "certificacion_id, ranura, ruta"
      );
    }
  }

  const titulo = rango ? nombreRango(rango.desde, rango.hasta) : "Todo el histórico";

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

  /* El nombre del archivo lleva el rango: dos exportaciones distintas no
     pueden llamarse igual, o la segunda tapa la primera en Descargas. */
  const trozo = rango
    ? (rango.desde === rango.hasta ? rango.desde
       : rango.desde.slice(0, 7) === rango.hasta.slice(0, 7)
         && rango.desde.endsWith("-01")
         && rango.hasta === mesCompleto(rango.desde.slice(0, 7)).hasta
           ? rango.desde.slice(0, 7)
           : `${rango.desde} a ${rango.hasta}`)
    : "historico";
  const nombre = `T1 T2 ${trozo}.xlsx`;
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
