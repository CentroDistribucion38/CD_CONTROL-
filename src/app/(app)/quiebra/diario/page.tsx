import { createClient } from "@/lib/supabase/server";
import { leerRango, rangoDelMes } from "@/modulos/quiebra/diario";
import "../quiebra.css";
import "./diario.css";
import { Diario } from "./Diario";

export const dynamic = "force-dynamic";

/** Hoy en Barranquilla (UTC−5), sin depender de la hora del servidor. */
function hoyAqui(): string {
  const t = new Date(Date.now() - 5 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

export default async function DiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const supabase = await createClient();
  const { f } = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hoy = hoyAqui();
  const fecha = f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : hoy;

  const [{ data: perfil }, mes] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    // Si todavía no se ha creado la tabla del diario, no se cae la página:
    // se entra en blanco y el aviso al guardar dice qué SQL falta.
    // Arranca con el MES de la fecha pedida. Desde ahí el calendario
    // cambia el rango a lo que se quiera.
    leerRango(supabase, ...rangoDelMes(fecha)).catch(() => {
      const [d, h] = rangoDelMes(fecha);
      return { desde: d, hasta: h, metas: {}, sap: {}, manual: {}, autores: {} };
    }),
  ]);

  const esEditor = perfil?.rol === "admin" || perfil?.rol === "supervisor";

  return <Diario inicial={mes} fechaInicial={fecha} esEditor={esEditor} hoy={hoy} />;
}
