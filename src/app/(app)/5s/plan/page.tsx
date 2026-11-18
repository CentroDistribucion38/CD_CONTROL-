import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { leerHallazgos5S, leerMaestro5S } from "@/modulos/cinco-s/datos";
import { PlanAccion, type FotosH } from "./PlanAccion";
import { Falta5S } from "../Falta";
import "../cinco-s.css";

export const dynamic = "force-dynamic";

/**
 * 5S · PLAN DE ACCIÓN — cada «no cumple» con su plan (qué, quién, para cuándo) y su cierre con foto del después.
 * Se leen aquí los hallazgos, los responsables y las fotos (antes y después) firmadas por una hora.
 */
export default async function Plan5SPage() {
  const [h, m, permisos] = await Promise.all([leerHallazgos5S(), leerMaestro5S(), misPermisos()]);
  if (h.falta || h.error) return <Falta5S titulo="Plan de acción" error={h.error} sql="2026-11-cinco-s-3.sql" />;

  /* Las fotos: de todo lo que sigue abierto y de lo cerrado en los últimos 90 días (lo viejo se ve en su informe). */
  const hace90 = new Date(Date.now() - 90 * 864e5).toISOString();
  const ids = h.filas.filter((x) => !x.cerrada_el || x.cerrada_el >= hace90).map((x) => x.id);
  const sb = await createClient();
  const fotos: { item_id: string; ruta: string; momento: string }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await sb.from("s5_fotos").select("item_id, ruta, momento").in("item_id", ids.slice(i, i + 150)).order("ruta");
    fotos.push(...((data ?? []) as typeof fotos));
  }
  const firmadas = fotos.length ? await sb.storage.from("cinco-s").createSignedUrls(fotos.map((f) => f.ruta), 3600) : { data: [] };
  const url = new Map((firmadas.data ?? []).map((x) => [x.path, x.signedUrl]));
  const porItem: FotosH = {};
  for (const f of fotos) {
    const u = url.get(f.ruta); if (!u) continue;
    const x = (porItem[f.item_id] ??= { antes: [], despues: [] });
    (f.momento === "despues" ? x.despues : x.antes).push(u);
  }

  return (
    <PlanAccion filas={h.filas} areas={m.areas} responsables={m.responsables} fotos={porItem}
                puedeEditar={permisos.puedeEditar("/5s/plan")} />
  );
}
