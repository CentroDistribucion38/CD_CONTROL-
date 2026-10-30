import "server-only";

/** Lo que se lee de Supabase: del propio Postgres (tamaños, filas, consultas) y de la API de gestión (peticiones). */
export type TablaPesada = { tabla: string; bytes: number; filas: number };
export type BucketPesado = { bucket: string; objetos: number; bytes: number };
export type ConsultaPesada = { q: string; llamadas: number; segTotal: number; msMedio: number; filas: number };

export type DatosSupabase = {
  ok: boolean;
  error?: string;
  dbBytes?: number; storageBytes?: number; storageObjetos?: number;
  usuarios?: number; activosMes?: number;
  tablas?: TablaPesada[]; buckets?: BucketPesado[];
  consultas?: ConsultaPesada[] | null;
  /** Consultas acumuladas de Postgres (todas): la curva diaria sale de restar un día con el anterior. */
  llamadasTotal?: number | null;
  peticiones?: { total: number; rest: number; auth: number; storage: number; realtime: number } | null;
};

const API = "https://api.supabase.com/v1";
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 };
const json = <T,>(v: unknown, vacio: T): T => { if (typeof v === "string") { try { return JSON.parse(v) as T } catch { return vacio } } return (v ?? vacio) as T };

export const refProyecto = () => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0] || null } catch { return null } };

async function api(path: string, init?: RequestInit) {
  const r = await fetch(API + path, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(25_000),
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json() as Promise<unknown>;
}

const consulta = async (ref: string, query: string) => {
  const j = await api(`/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({ query }) });
  return (Array.isArray(j) ? j : []) as Record<string, unknown>[];
};

const SQL_PRINCIPAL = `
select
  pg_database_size(current_database()) as db_bytes,
  (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects) as storage_bytes,
  (select count(*) from storage.objects) as storage_objetos,
  (select count(*) from auth.users) as usuarios,
  (select count(*) from auth.users where last_sign_in_at >= date_trunc('month', now())) as activos_mes,
  (select coalesce(json_agg(t), '[]'::json) from (
     select c.relname as tabla, pg_total_relation_size(c.oid) as bytes, greatest(c.reltuples, 0)::bigint as filas
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc limit 10) t) as tablas,
  (select coalesce(json_agg(b), '[]'::json) from (
     select bucket_id as bucket, count(*) as objetos, coalesce(sum((metadata->>'size')::bigint), 0) as bytes
       from storage.objects group by bucket_id order by 3 desc limit 8) b) as buckets
`;

const SQL_CONSULTAS = `
select left(regexp_replace(query, '\\s+', ' ', 'g'), 170) as q, calls,
       round((total_exec_time / 1000)::numeric, 1) as seg_total, round(mean_exec_time::numeric, 1) as ms_medio, rows
  from pg_stat_statements
 where query not ilike '%pg_stat_statements%' and query not ilike '%pg_database_size%'
 order by total_exec_time desc limit 8
`;

const SQL_LLAMADAS = `select coalesce(sum(calls), 0) as llamadas from pg_stat_statements`;

export async function leerSupabase(): Promise<DatosSupabase> {
  const ref = refProyecto();
  if (!process.env.SUPABASE_ACCESS_TOKEN) return { ok: false, error: "Falta la variable SUPABASE_ACCESS_TOKEN en Vercel." };
  if (!ref) return { ok: false, error: "No pude sacar el proyecto de NEXT_PUBLIC_SUPABASE_URL." };
  try {
    const [pr, co, pe, ll] = await Promise.allSettled([
      consulta(ref, SQL_PRINCIPAL),
      consulta(ref, SQL_CONSULTAS),
      api(`/projects/${ref}/analytics/endpoints/usage.api-counts?interval=30day`).catch(() => api(`/projects/${ref}/analytics/endpoints/usage.api-counts`)),
      consulta(ref, SQL_LLAMADAS),
    ]);
    if (pr.status !== "fulfilled") throw pr.reason;
    const f = pr.value[0] ?? {};
    let peticiones: DatosSupabase["peticiones"] = null;
    if (pe.status === "fulfilled") {
      const j = pe.value as { result?: Record<string, unknown>[] } | Record<string, unknown>[];
      const filas = (Array.isArray(j) ? j : j?.result ?? []) as Record<string, unknown>[];
      const suma = (k: string) => filas.reduce((t, x) => t + num(x[k]), 0);
      const rest = suma("total_rest_requests"), auth = suma("total_auth_requests"), storage = suma("total_storage_requests"), realtime = suma("total_realtime_requests");
      if (filas.length) peticiones = { total: rest + auth + storage + realtime, rest, auth, storage, realtime };
    }
    return {
      ok: true,
      dbBytes: num(f.db_bytes), storageBytes: num(f.storage_bytes), storageObjetos: num(f.storage_objetos),
      usuarios: num(f.usuarios), activosMes: num(f.activos_mes),
      tablas: json<Record<string, unknown>[]>(f.tablas, []).map((t) => ({ tabla: String(t.tabla), bytes: num(t.bytes), filas: num(t.filas) })),
      buckets: json<Record<string, unknown>[]>(f.buckets, []).map((b) => ({ bucket: String(b.bucket), objetos: num(b.objetos), bytes: num(b.bytes) })),
      consultas: co.status === "fulfilled" ? co.value.map((c) => ({ q: String(c.q), llamadas: num(c.calls), segTotal: num(c.seg_total), msMedio: num(c.ms_medio), filas: num(c.rows) })) : null,
      peticiones,
      llamadasTotal: ll.status === "fulfilled" ? num(ll.value[0]?.llamadas) : null,
    };
  } catch (e) {
    return { ok: false, error: `Supabase respondió: ${(e as Error).message}` };
  }
}
