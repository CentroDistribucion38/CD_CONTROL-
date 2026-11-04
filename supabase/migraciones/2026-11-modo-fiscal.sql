-- ============================================================================
-- MODO FISCAL — «solo fiscal» para que la gente no se enrede.
--
-- Quien administra escoge desde Admin → Modo FISCAL a QUÉ ROLES y a QUÉ PERSONAS se les activa.
-- A esas personas la aplicación les muestra únicamente Inventario → Conteos → Contar, y dentro de
-- Contar solo el inventario fiscal que les habilitaron (o «en espera» si todavía no). Sin FEFO.
--
--   · Quien MANDA (administra la plataforma) nunca queda en modo fiscal, aunque su rol esté marcado.
--   · El modo esconde pantallas; los permisos de datos de la base siguen siendo los de siempre.
--   · Para escoger a quién se le activa hay que escribir el PIN (se guarda cifrado, nunca en pantalla).
--     Tras 5 PIN malos seguidos se bloquea 5 minutos. PIN inicial: el que se acordó; se puede cambiar
--     con  select public.modo_fiscal_cambiar_pin('PIN_ACTUAL', 'PIN_NUEVO');
--
-- Se puede correr varias veces sin romper nada.
-- ============================================================================

create table if not exists public.modo_fiscal_destinos (
  tipo       text not null check (tipo in ('rol', 'usuario')),
  clave      text not null,                       -- la clave del rol, o el id de la persona
  puesto_por uuid,
  puesto_en  timestamptz not null default now(),
  primary key (tipo, clave)
);
alter table public.modo_fiscal_destinos enable row level security;
drop policy if exists modo_fiscal_destinos_ver on public.modo_fiscal_destinos;
create policy modo_fiscal_destinos_ver on public.modo_fiscal_destinos for select to authenticated using (public.manda());
-- Escribir solo se puede por modo_fiscal_guardar (con el PIN): no hay política de insert/update/delete.

create table if not exists public.modo_fiscal_pin (
  id             boolean primary key default true check (id),
  hash           text not null,
  fallos         int  not null default 0,
  bloqueado_hasta timestamptz,
  cambiado_en    timestamptz not null default now()
);
alter table public.modo_fiscal_pin enable row level security;     -- sin políticas: solo las funciones lo tocan

insert into public.modo_fiscal_pin (id, hash)
values (true, encode(sha256(convert_to('cd38-modo-fiscal:2630', 'UTF8')), 'hex'))
on conflict (id) do nothing;

-- ¿Esta persona está en modo fiscal? (el menú y Contar lo preguntan)
create or replace function public.modo_fiscal_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not public.manda() and exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and coalesce(p.activo, true)
      and (
        exists (select 1 from public.modo_fiscal_destinos d where d.tipo = 'rol' and d.clave = p.rol::text)
        or exists (select 1 from public.modo_fiscal_destinos d where d.tipo = 'usuario' and d.clave = p.id::text)
      )
  );
$$;

-- Revisa el PIN y cuenta los fallos. Devuelve 'ok' | 'mal' | 'bloqueado' | 'no_admin'.
create or replace function public.modo_fiscal_revisar_pin(p_pin text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare r public.modo_fiscal_pin%rowtype;
begin
  if auth.uid() is null or not public.manda() then return 'no_admin'; end if;
  select * into r from public.modo_fiscal_pin where id for update;
  if r.bloqueado_hasta is not null and r.bloqueado_hasta > now() then return 'bloqueado'; end if;
  if r.hash = encode(sha256(convert_to('cd38-modo-fiscal:' || coalesce(p_pin, ''), 'UTF8')), 'hex') then
    update public.modo_fiscal_pin set fallos = 0, bloqueado_hasta = null where id;
    return 'ok';
  end if;
  update public.modo_fiscal_pin
     set bloqueado_hasta = case when fallos + 1 >= 5 then now() + interval '5 minutes' else null end,
         fallos = case when fallos + 1 >= 5 then 0 else fallos + 1 end
   where id;
  return 'mal';
end $$;

create or replace function public.modo_fiscal_pin_ok(p_pin text)
returns text language sql volatile security definer set search_path = public as $$
  select public.modo_fiscal_revisar_pin(p_pin);
$$;

-- Guarda a quién se le activa (reemplaza la lista completa). Pide el PIN.
create or replace function public.modo_fiscal_guardar(p_pin text, p_roles text[], p_usuarios text[])
returns text language plpgsql volatile security definer set search_path = public as $$
declare v text;
begin
  v := public.modo_fiscal_revisar_pin(p_pin);
  if v <> 'ok' then return v; end if;
  delete from public.modo_fiscal_destinos where true;
  insert into public.modo_fiscal_destinos (tipo, clave, puesto_por)
    select 'rol', x, auth.uid() from unnest(coalesce(p_roles, '{}'::text[])) x where x <> ''
    on conflict do nothing;
  insert into public.modo_fiscal_destinos (tipo, clave, puesto_por)
    select 'usuario', x, auth.uid() from unnest(coalesce(p_usuarios, '{}'::text[])) x where x <> ''
    on conflict do nothing;
  return 'ok';
end $$;

create or replace function public.modo_fiscal_cambiar_pin(p_actual text, p_nuevo text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v text;
begin
  v := public.modo_fiscal_revisar_pin(p_actual);
  if v <> 'ok' then return v; end if;
  if coalesce(p_nuevo, '') !~ '^[0-9]{4,8}$' then return 'formato'; end if;
  update public.modo_fiscal_pin
     set hash = encode(sha256(convert_to('cd38-modo-fiscal:' || p_nuevo, 'UTF8')), 'hex'), cambiado_en = now()
   where id;
  return 'ok';
end $$;

revoke all on function public.modo_fiscal_activo() from public;
revoke all on function public.modo_fiscal_revisar_pin(text) from public, authenticated;
revoke all on function public.modo_fiscal_pin_ok(text) from public;
revoke all on function public.modo_fiscal_guardar(text, text[], text[]) from public;
revoke all on function public.modo_fiscal_cambiar_pin(text, text) from public;
grant execute on function public.modo_fiscal_activo() to authenticated;
grant execute on function public.modo_fiscal_pin_ok(text) to authenticated;
grant execute on function public.modo_fiscal_guardar(text, text[], text[]) to authenticated;
grant execute on function public.modo_fiscal_cambiar_pin(text, text) to authenticated;
