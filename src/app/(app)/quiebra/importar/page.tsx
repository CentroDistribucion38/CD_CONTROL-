import { createClient } from "@/lib/supabase/server";
import "../quiebra.css";
import { Importar, type Carga } from "./Importar";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const supabase = await createClient();

  // Se traen con el nombre de quien cargó: "quién subió qué" es la pregunta
  // que se hace cuando una cifra no cuadra.
  const { data } = await supabase
    .from("quiebra_cargas")
    .select("id, archivo, desde, hasta, filas_bajas, filas_produccion, cargado_en, cargado_por")
    .order("cargado_en", { ascending: false })
    .limit(8);

  const cargas = (data ?? []) as (Carga & { cargado_por: string | null })[];

  const ids = [...new Set(cargas.map((c) => c.cargado_por).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  if (ids.length) {
    const { data: perfiles } = await supabase
      .from("perfiles")
      .select("id, usuario, nombre")
      .in("id", ids);
    for (const p of perfiles ?? []) {
      nombres.set(p.id, p.usuario || p.nombre || "—");
    }
  }

  return (
    <Importar
      cargas={cargas.map((c) => ({
        ...c,
        usuario: c.cargado_por ? nombres.get(c.cargado_por) ?? "—" : "—",
      }))}
    />
  );
}
