import "server-only";
import { clienteDeServicio } from "@/lib/supabase/servicio";

/** Una «foto» por día de los números del panel. Supabase solo da el total de hoy; la curva se arma con estas fotos. */
export type Foto = { dia: string; db: number; alm: number; activos: number; llamadas: number | null; vercel: number | null };

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

/** Guarda la foto de hoy (una sola por día, se pisa si se abre varias veces) y devuelve las de los últimos 60 días. */
export async function fotosRecientes(actual: Omit<Foto, "dia"> | null): Promise<{ fotos: Foto[]; error?: string }> {
  const sb = clienteDeServicio();
  if (!sb) return { fotos: [], error: "Falta SUPABASE_SERVICE_ROLE_KEY para guardar el historial." };
  try {
    if (actual) {
      const { error } = await sb.from("consumo_foto").upsert(
        { dia: hoyBogota(), db_bytes: actual.db, storage_bytes: actual.alm, activos_mes: actual.activos, llamadas: actual.llamadas, vercel_usd: actual.vercel },
        { onConflict: "dia" },
      );
      if (error) throw new Error(error.message);
    }
    const desde = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    const { data, error } = await sb.from("consumo_foto").select("dia, db_bytes, storage_bytes, activos_mes, llamadas, vercel_usd").gte("dia", desde).order("dia");
    if (error) throw new Error(error.message);
    const n = (v: unknown) => (v == null ? null : Number(v));
    return {
      fotos: (data ?? []).map((r) => ({ dia: String(r.dia), db: Number(r.db_bytes), alm: Number(r.storage_bytes), activos: Number(r.activos_mes), llamadas: n(r.llamadas), vercel: n(r.vercel_usd) })),
    };
  } catch (e) {
    return { fotos: [], error: `Historial: ${(e as Error).message}` };
  }
}
