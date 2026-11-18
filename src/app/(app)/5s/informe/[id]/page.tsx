import { createClient } from "@/lib/supabase/server";
import { LAS_S, type Inspeccion5S, type ItemInspeccion } from "@/modulos/cinco-s/cinco-s";
import { Informe5S } from "./Informe5S";
import { Falta5S } from "../../Falta";
import "../../cinco-s.css";
import "./informe.css";

export const dynamic = "force-dynamic";

/**
 * 5S · INFORME DE UNA INSPECCIÓN — hojas carta listas para PDF.
 * Se lee todo aquí (la inspección, sus puntos, sus fotos firmadas, la anterior del área y el consecutivo del año)
 * y la pantalla solo lo acomoda en hojas y lo convierte en PDF.
 */
export default async function Informe5SPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ pdf?: string }>;
}) {
  const { id } = await params;
  const { pdf } = await searchParams;
  const sb = await createClient();
  const { data: insp, error } = await sb.from("v_s5_inspecciones").select("*").eq("id", id).maybeSingle();
  if (error || !insp) return <Falta5S titulo="Informe" error={error?.message ?? "Esa inspección no existe o no tienes permiso para verla."} />;
  const i = { ...insp, cumplimiento: Number(insp.cumplimiento), meta: Number(insp.meta) } as Inspeccion5S;

  const anio = i.fecha.slice(0, 4);
  const [it, ft, ant, cuenta, area] = await Promise.all([
    sb.from("s5_inspeccion_puntos").select("*").eq("inspeccion_id", id),
    sb.from("s5_fotos").select("item_id, ruta").eq("inspeccion_id", id).order("ruta"),
    i.area_id
      ? sb.from("s5_inspecciones").select("cumplimiento, fecha, creado").eq("area_id", i.area_id)
          .or(`fecha.lt.${i.fecha},and(fecha.eq.${i.fecha},creado.lt.${i.creado})`)
          .order("fecha", { ascending: false }).order("creado", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as { cumplimiento: number }[] }),
    sb.from("s5_inspecciones").select("id", { count: "exact", head: true })
      .gte("fecha", `${anio}-01-01`).lte("creado", i.creado),
    i.area_id ? sb.from("s5_areas").select("responsable_id").eq("id", i.area_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  let cargo: string | null = null;
  const respId = (area.data as { responsable_id: string | null } | null)?.responsable_id;
  if (respId) {
    const { data } = await sb.from("s5_responsables").select("cargo").eq("id", respId).maybeSingle();
    cargo = data?.cargo ?? null;
  }
  const rutas = (ft.data ?? []).map((f) => f.ruta as string);
  const firmadas = rutas.length ? await sb.storage.from("cinco-s").createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas.data ?? []).map((x) => [x.path, x.signedUrl]));
  const iS = (s: string) => LAS_S.findIndex((x) => x.clave === s);
  const items = ((it.data ?? []) as ItemInspeccion[]).map((x) => ({ ...x, peso: Number(x.peso), zona: x.zona ?? null }))
    .sort((a, b) => iS(a.s) - iS(b.s) || a.orden - b.orden);
  const prev = (ant.data ?? [])[0] as { cumplimiento: number } | undefined;

  return (
    <Informe5S
      datos={{
        insp: i, items, cargo,
        fotos: (ft.data ?? []).map((f) => ({ item_id: f.item_id as string, url: url.get(f.ruta as string) ?? "" })).filter((f) => f.url),
        anterior: prev ? Number(prev.cumplimiento) : null,
        numero: `5S-${anio}-${String(cuenta.count ?? 1).padStart(4, "0")}`,
      }}
      descargar={pdf === "1"}
    />
  );
}
