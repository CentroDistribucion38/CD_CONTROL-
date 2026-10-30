-- Historial diario del panel privado de consumo (/interno).
-- Una fila por día. Solo la lee y escribe el servidor con la llave de servicio: RLS activado y SIN políticas,
-- así que ningún usuario de CONTROL (ni administrador) puede verla desde la app.
create table if not exists public.consumo_foto (
  dia          date primary key,
  db_bytes     bigint  not null default 0,
  storage_bytes bigint not null default 0,
  activos_mes  integer not null default 0,
  llamadas     bigint,            -- consultas acumuladas de Postgres (la curva diaria es la diferencia entre días)
  vercel_usd   numeric,           -- costo acumulado del mes en Vercel
  creado       timestamptz not null default now()
);
alter table public.consumo_foto enable row level security;
revoke all on public.consumo_foto from anon, authenticated;
