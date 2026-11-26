-- =====================================================================
-- CONFIGURACIÓN DEL SERVIDOR GUARDADA EN LA BASE (sin depender de Vercel)
--
-- Claves que el servidor genera solo la primera vez que las necesita y deja guardadas aquí:
--   gps_clave_traccar  la clave de la dirección que se pone en la app Traccar Client
--   vapid              las llaves para mandar avisos al celular (pública y privada)
-- Si en Vercel existe la variable (GPS_CLAVE_TRACCAR, NEXT_PUBLIC_VAPID_PUBLICA / VAPID_PRIVADA), manda la variable.
-- NADIE la lee desde el navegador: RLS activo y sin políticas; solo el servidor con la llave de servicio.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;
create table if not exists public.app_config (
  clave      text primary key,
  valor      text not null,
  creado_en  timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
do $$ begin raise notice 'Listo: app_config creada (solo la usa el servidor).'; end $$;
commit;
