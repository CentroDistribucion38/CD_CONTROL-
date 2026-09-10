import { createClient } from "@/lib/supabase/server";
import { datosQuiebra } from "@/modulos/quiebra/datos";
import "./quiebra.css";
import { TableroQuiebra } from "@/components/TableroQuiebra";

export const dynamic = "force-dynamic";

export default async function QuiebraPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* El simulador es del MES EN CURSO, no del rango que se esté mirando:
     el disponible de septiembre no cambia porque alguien abra mayo. */
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth() + 1;

  const [{ data: perfil }, datos, { data: sim }] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    datosQuiebra(),
    /* maybeSingle y no single: lo normal es que el mes todavía no tenga
       CONA puesto, y eso no es un error. */
    supabase
      .from("quiebra_simulador")
      .select("cona, pct_quiebra, actualizado_en, perfiles:actualizado_por(nombre, usuario)")
      .eq("anio", anio).eq("mes", mes)
      .maybeSingle(),
  ]);

  const esEditor = perfil?.rol === "admin" || perfil?.rol === "supervisor";

  /* Si la tabla todavía no existe —no se ha corrido la migración— sim
     llega null y la pantalla sale con el simulador en blanco, que es
     mejor que reventar el tablero entero por una tarjeta. */
  const quien = (sim as { perfiles?: { nombre?: string; usuario?: string } } | null)?.perfiles;
  const simulador = sim
    ? {
        cona: Number(sim.cona),
        pct: Number(sim.pct_quiebra),
        quien: quien?.nombre?.trim() || quien?.usuario || null,
        cuando: String(sim.actualizado_en),
      }
    : null;

  return (
    <TableroQuiebra
      bajas={datos.bajas}
      produccion={datos.produccion}
      metas={datos.metas}
      ultimaCarga={datos.ultimaCarga}
      esEditor={esEditor}
      meses={datos.meses}
      simulador={simulador}
    />
  );
}
