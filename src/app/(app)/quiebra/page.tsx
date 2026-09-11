import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";
import { datosQuiebra } from "@/modulos/quiebra/datos";
import "./quiebra.css";
import { TableroQuiebra } from "@/components/TableroQuiebra";

export const dynamic = "force-dynamic";

export default async function QuiebraPage() {
  const supabase = await createClient();
  const user = await usuarioActual();

  const [{ data: perfil }, datos, { data: sims }] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    datosQuiebra(),
    /* TODOS los meses guardados de una vez, no solo uno: el simulador
       sigue al mes en que TERMINA el filtro —de enero a agosto habla de
       agosto—, así que el mes cambia sin recargar la página. Es una fila
       por mes: traerlas todas cuesta menos que ir a buscar una cada vez
       que alguien mueve el calendario. */
    supabase
      .from("quiebra_simulador")
      .select("anio, mes, cona, pct_quiebra, baja_manual, actualizado_en, perfiles:actualizado_por(nombre, usuario)")
      .order("anio").order("mes"),
  ]);

  const esEditor = perfil?.rol === "admin" || perfil?.rol === "supervisor";

  /* Si la tabla todavía no existe —no se ha corrido la migración— sims
     llega null y la lista queda vacía: el simulador sale en blanco en vez
     de reventar el tablero entero por una tarjeta. */
  type FilaSim = {
    anio: number; mes: number; cona: number; pct_quiebra: number;
    baja_manual: number | null;
    actualizado_en: string; perfiles?: { nombre?: string; usuario?: string } | null;
  };
  const simuladores = ((sims ?? []) as unknown as FilaSim[]).map((f) => ({
    anio: Number(f.anio),
    mes: Number(f.mes),
    cona: Number(f.cona),
    pct: Number(f.pct_quiebra),
    baja: f.baja_manual == null ? null : Number(f.baja_manual),
    quien: f.perfiles?.nombre?.trim() || f.perfiles?.usuario || null,
    cuando: String(f.actualizado_en),
  }));

  return (
    <TableroQuiebra
      bajas={datos.bajas}
      produccion={datos.produccion}
      metas={datos.metas}
      ultimaCarga={datos.ultimaCarga}
      esEditor={esEditor}
      meses={datos.meses}
      simuladores={simuladores}
    />
  );
}
