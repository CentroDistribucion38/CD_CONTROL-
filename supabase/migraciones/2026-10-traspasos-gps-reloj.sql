-- =====================================================================
-- TIEMPOS GPS — EL RELOJ DE FONDO (cada minuto, con la pantalla cerrada)
--
-- Llama a /api/traspasos/gps/cron cada minuto para que las entradas y
-- salidas de las zonas se registren aunque nadie tenga la pantalla abierta.
--
-- ANTES de correr esto:
--   1. En Vercel → Settings → Environment Variables, crea GPS_CRON_SECRET con una
--      clave larga al azar (mínimo 16 caracteres) y haz Redeploy.
--      Debe existir también SUPABASE_SERVICE_ROLE_KEY (ya la usa Admin → Usuarios).
--   2. Cambia abajo  TU-DOMINIO  (el de CONTROL, sin https://)  y  TU-CLAVE  (la misma de GPS_CRON_SECRET).
--
-- Va DESPUÉS de 2026-10-traspasos-gps.sql. SE PUEDE CORRER VARIAS VECES
-- (reemplaza el reloj anterior, no lo duplica).
--
-- Para pararlo:   select cron.unschedule('gps-tiempos');
-- Para ver cómo le va:
--   select start_time, status, return_message from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'gps-tiempos') order by start_time desc limit 5;
--   select id, status_code, content from net._http_response order by created desc limit 5;
-- =====================================================================
create extension if not exists pg_net  with schema extensions;
create extension if not exists pg_cron;

do $reloj$
begin
  if exists (select 1 from cron.job where jobname = 'gps-tiempos') then
    perform cron.unschedule('gps-tiempos');
  end if;
end $reloj$;

select cron.schedule(
  'gps-tiempos',
  '* * * * *',
  $job$
    select net.http_post(
      url     := 'https://TU-DOMINIO/api/traspasos/gps/cron',
      headers := jsonb_build_object('Authorization', 'Bearer TU-CLAVE', 'Content-Type', 'application/json'),
      body    := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$
);
