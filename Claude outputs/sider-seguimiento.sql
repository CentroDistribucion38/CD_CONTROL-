-- =====================================================================
-- SOLO LO QUE FALTA: la sección 9 de supabase/modulos/sider.sql
--
-- Si ya corriste el archivo completo antes de que creciera, esto es lo
-- único que te falta. Da lo mismo correr esto o el archivo entero: los
-- dos son idempotentes. Esto es más corto y no se puede confundir con la
-- versión vieja.
--
-- Supabase → SQL Editor → New query → pegar → Run.
-- =====================================================================

-- =====================================================================
-- 9. SEGUIMIENTO — el informe de la hoja "Seguimiento"
--
-- Son tres tablas encadenadas, y el orden importa porque cada una come
-- de la anterior:
--
--   1. HL EER RECIBIDO  ·  sale de ZLDE (Planta = Barranquilla,
--      Clase = EER), agrupado por CD de origen. Es cuánto envase
--      retornable llegó de verdad desde cada centro.
--   2. REAL MTD  ·  sale de NUESTRA Fuente principal: los HL de los
--      viajes certificados de ese CD en ese mes. Antes salía de la hoja
--      "Base de Datos" que alguien llenaba a mano.
--   3. EL INFORME  ·  se calcula de las dos:
--        BU MTD          = HL recibido × meta            (la meta es 10%)
--        % Certificación = Real MTD ÷ HL recibido
--
-- OJO CON EL PORCENTAJE: es Real contra RECIBIDO, no contra el BU. Se
-- verificó contra el informe de agosto, fila por fila:
--   Curumani  697 / 3.937   = 17,7%   ✓
--   Turbaco 2.462 / 31.042  =  7,9%   ✓
--   Total   8.359 / 246.268 =  3,4%   ✓
-- Si fuera contra el BU, Curumani daría 177% y el informe diría otra
-- cosa. El BU queda igual porque responde la otra pregunta: cuántos HL
-- faltan, no qué fracción se logró.
-- =====================================================================

-- Lo que ZLDE dice que llegó. No se calcula: se importa.
create table if not exists public.sider_zlde (
  -- Primer día del mes. Un mes es la unidad del informe (MTD), y guardar
  -- el día exacto invitaría a sumar dos veces el mismo mes.
  mes           date not null,
  cd_origen     text not null,
  hl            numeric(16,3) not null,
  importado_por uuid references public.perfiles(id) on delete set null,
  importado_en  timestamptz not null default now(),
  primary key (mes, cd_origen)
);

-- Cuatro CD salían del informe de agosto (Cúcuta, San Andrés, Caucasia,
-- KACartagena). En vez de escribir esos cuatro nombres en el código, la
-- razón se guarda como dato: un CD que no despacha sider se marca y el
-- informe lo deja fuera del total, pero lo sigue mostrando aparte. Nada
-- desaparece sin decir por qué.
alter table public.sider_origenes add column if not exists aplica_sider boolean not null default true;

insert into public.sider_parametros (clave, valor, nota) values
  ('meta_certificacion', 0.10,
   'Fracción del HL EER recibido que debe venir certificada. El BU MTD es esto por el HL recibido. En el Excel era el 10% escrito dentro de la fórmula.')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- La vista del informe. FULL JOIN a propósito: un CD que certificó pero
-- no aparece en ZLDE tiene que verse igual —es volumen real— y uno que
-- aparece en ZLDE sin certificar nada es justo el que hay que perseguir.
-- Con un join normal, uno de los dos casos se caería en silencio.
-- ---------------------------------------------------------------------
drop view if exists public.v_sider_seguimiento;
create view public.v_sider_seguimiento as
with m as (select valor as meta from public.sider_parametros where clave = 'meta_certificacion'),
recibido as (
  select z.mes, z.cd_origen, z.hl from public.sider_zlde z
),
certificado as (
  select date_trunc('month', v.fecha)::date as mes,
         v.cd_origen,
         sum(coalesce(v.hl, 0))  as hl,
         count(*)                as viajes,
         sum(v.estibas)          as estibas
  from public.v_sider_viajes v
  -- Un viaje anulado no certificó nada. Uno en tránsito sí: la salida ya
  -- quedó certificada con su ubicación y sus fotos, y es lo que la hoja
  -- "Base de Datos" registraba al despachar.
  where v.estado <> 'anulado'
  group by 1, 2
)
select
  coalesce(r.mes, c.mes)                    as mes,
  coalesce(r.cd_origen, c.cd_origen)        as cd_origen,
  o.planta,
  coalesce(o.aplica_sider, true)            as aplica_sider,
  -- Un nombre de CD que viene en el archivo de ZLDE y no está en el
  -- maestro: se muestra marcado en vez de descartarlo, porque puede ser
  -- un CD nuevo o un nombre escrito distinto, y las dos cosas hay que
  -- verlas.
  (o.planta is null)                        as fuera_del_maestro,
  coalesce(r.hl, 0)                         as hl_recibido,
  round(coalesce(r.hl, 0) * (select meta from m), 3) as bu_mtd,
  coalesce(c.hl, 0)                         as real_mtd,
  coalesce(c.viajes, 0)                     as viajes,
  coalesce(c.estibas, 0)                    as estibas,
  -- Sin HL recibido no hay contra qué comparar: queda en null y la app
  -- lo pinta neutro. Un 0% ahí diría "no cumpliste" cuando lo cierto es
  -- "no sé".
  case when coalesce(r.hl, 0) > 0
       then round(coalesce(c.hl, 0) / r.hl, 6) end as pct_certificacion,
  (select meta from m)                      as meta
from recibido r
full join certificado c on c.mes = r.mes and c.cd_origen = r.cd_origen
left join public.sider_origenes o on o.cd_origen = coalesce(r.cd_origen, c.cd_origen);

-- ---------------------------------------------------------------------
-- Guardar un mes de ZLDE. Reemplaza el mes completo y no fila por fila:
-- el archivo de ZLDE es la foto del mes entero, así que si un CD dejó de
-- aparecer es porque ya no tiene movimiento, y actualizar solo lo que
-- llegó dejaría el viejo ahí para siempre.
-- ---------------------------------------------------------------------
create or replace function public.sider_zlde_guardar(p_mes date, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_fila jsonb;
  n integer := 0;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede importar ZLDE';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No llegó ninguna fila que guardar';
  end if;

  delete from public.sider_zlde where mes = v_mes;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    if btrim(coalesce(v_fila->>'cd_origen', '')) = '' then
      raise exception 'Hay una fila sin CD de origen';
    end if;
    insert into public.sider_zlde (mes, cd_origen, hl, importado_por)
    values (v_mes,
            btrim(v_fila->>'cd_origen'),
            (v_fila->>'hl')::numeric,
            auth.uid())
    -- Si el archivo trae el mismo CD dos veces, se suman en vez de que
    -- la segunda tumbe a la primera sin avisar.
    on conflict (mes, cd_origen) do update set hl = public.sider_zlde.hl + excluded.hl;
    n := n + 1;
  end loop;

  return n;
end $$;

alter table public.sider_zlde enable row level security;
drop policy if exists sider_zlde_select on public.sider_zlde;
create policy sider_zlde_select on public.sider_zlde for select to authenticated using (true);
drop policy if exists sider_zlde_write on public.sider_zlde;
create policy sider_zlde_write on public.sider_zlde for all to authenticated
  using (public.es_editor()) with check (public.es_editor());

grant select on public.v_sider_seguimiento to authenticated;
grant execute on function public.sider_zlde_guardar(date, jsonb) to authenticated;
