"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { esDoc, type DocLienzo } from "@/modulos/gestion/lienzo/doc";

/**
 * GUARDAR EL LIENZO DE UN DIAGRAMA (gestion_mapas). Se guarda todo el diagrama de una vez con su versión: si alguien
 * más lo cambió mientras tanto, no se pisa — se avisa para recargar.
 */
const RUTA = "/gestion/procesos";
const TOPE = 1_500_000; // ~1,5 MB de JSON: de sobra para cientos de figuras

export async function guardarLienzo(id: string, doc: DocLienzo, version: number): Promise<{ ok: true; version: number } | { error: string; conflicto?: boolean }> {
  const p = await misPermisos();
  if (!p.puedeEditar(RUTA)) return { error: "No tienes permiso para editar el Mapa de procesos (Roles)." };
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return { error: "Diagrama no válido." };
  if (!esDoc(doc)) return { error: "El diagrama no tiene la forma esperada." };
  if (JSON.stringify(doc).length > TOPE) return { error: "El diagrama es demasiado grande para guardarlo." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (version === 0) {
    const { data, error } = await supabase.from("gestion_mapas")
      .upsert({ id, doc, version: 1, editado_por: user?.id ?? null, editado_en: new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: true })
      .select("version");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Alguien más guardó este diagrama mientras lo editabas. Recarga para ver sus cambios.", conflicto: true };
    return { ok: true, version: 1 };
  }
  const { data, error } = await supabase.from("gestion_mapas")
    .update({ doc, version: version + 1, editado_por: user?.id ?? null, editado_en: new Date().toISOString() })
    .eq("id", id).eq("version", version).select("version");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Alguien más guardó este diagrama mientras lo editabas. Recarga para ver sus cambios.", conflicto: true };
  return { ok: true, version: version + 1 };
}

/** VOLVER AL ORIGINAL: se borra lo guardado y el diagrama vuelve a salir como viene del Excel (ya ordenado). */
export async function restaurarLienzo(id: string): Promise<{ ok: true } | { error: string }> {
  const p = await misPermisos();
  if (!p.puedeEditar(RUTA)) return { error: "No tienes permiso para editar el Mapa de procesos (Roles)." };
  const supabase = await createClient();
  const { error } = await supabase.from("gestion_mapas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(RUTA);
  return { ok: true };
}
