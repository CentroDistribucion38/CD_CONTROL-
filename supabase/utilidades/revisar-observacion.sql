-- ¿Corrió la migración de la foto de observación, y hay alguna guardada?
select
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = 'ranura_foto' and e.enumlabel = 'observacion')  as ranura_existe,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'sider_certificaciones'
             and column_name = 'foto_obs')                                    as columna_existe,
  (select count(*) from public.sider_fotos where ranura::text = 'observacion') as fotos_de_observacion;
