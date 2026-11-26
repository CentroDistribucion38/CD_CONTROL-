-- =====================================================================
-- TIEMPOS GPS · EL VIGÍA (cada minuto, sin Vercel ni nada externo)
--
-- Supabase llama solo, cada minuto, a CONTROL (/api/traspasos/gps/vigia). CONTROL revisa los viajes en curso y, si
-- un vehículo dejó de mandar su ubicación hace 3 minutos o más (celular bloqueado, sin datos, app cerrada), le avisa
-- al celular de las personas que tengan marcado «Sin señal» en Tiempos GPS → Avisos al celular. Un aviso por cada
-- vez que se queda callado (cuando vuelve a mandar y se calla otra vez, avisa otra vez).
--
-- Usa pg_cron (el reloj de Supabase) y pg_net (para llamar a la dirección). La clave del vigía se genera aquí y queda
-- en app_config (la valida CONTROL). La dirección de CONTROL también queda en app_config: cámbiala ahí si cambia el
-- dominio. Va DESPUÉS de 2026-11-config-servidor.sql y 2026-11-gps-avisos.sql. SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $bloque$
begin
  if to_regclass('public.app_config') is null then raise exception 'Falta correr antes: 2026-11-config-servidor.sql'; end if;
  if to_regclass('public.gps_alerta_destinatarios') is null then raise exception 'Falta correr antes: 2026-11-gps-avisos.sql'; end if;
end $bloque$;

insert into public.app_config (clave, valor) values ('vigia_clave', md5(random()::text || clock_timestamp()::text) || md5(random()::text))
  on conflict (clave) do nothing;
insert into public.app_config (clave, valor) values ('vigia_url', 'https://cd-control-one.vercel.app/api/traspasos/gps/vigia')
  on conflict (clave) do nothing;

/* «Sin señal» como tipo de aviso */
alter table public.gps_alerta_destinatarios drop constraint if exists gps_alerta_tipos;
alter table public.gps_alerta_destinatarios add constraint gps_alerta_tipos
  check (tipos <@ array['parado', 'espera', 'llego', 'salio', 'tramo', 'senal']::text[]);

/* el reloj: cada minuto */
create or replace function public.gps_llamar_vigia() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u text; k text;
begin
  select valor into u from public.app_config where clave = 'vigia_url';
  select valor into k from public.app_config where clave = 'vigia_clave';
  if u is null or k is null then return; end if;
  perform net.http_post(url := u, headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 20000);
end $$;
revoke all on function public.gps_llamar_vigia() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'gps-vigia';
  perform cron.schedule('gps-vigia', '* * * * *', 'select public.gps_llamar_vigia()');
  raise notice 'Listo: el vigía del GPS corre cada minuto.';
end $$;
