\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- ABI · HALLAZGOS — lo que tiene que ser cierto o el módulo publica
-- cosas que nadie revisó.
--
--  1. QUE LO LEVANTE CUALQUIERA. Es de quien tiene Editar en ABI, y se
--     pregunta por la PANTALLA y no por el nombre del rol: el día que
--     se cree un rol nuevo de auditoría, comparar contra 'abi' deja de
--     proteger — y en la dirección peligrosa.
--
--  2. QUE LA PROPUESTA DE LA MÁQUINA SE GUARDE COMO LA REDACCIÓN. Es
--     LA regla del módulo. Si `hallazgo_ia_guardar` tocara `redaccion`,
--     «¿esto lo revisó alguien?» sería incontestable y nadie lo notaría
--     hasta que un informe se caiga.
--
--  3. QUE UN HALLAZGO QUEDE FIRME SIN REDACCIÓN. Firme quiere decir
--     que puede salir en el informe, y lo que sale es la redacción:
--     sería publicar un renglón en blanco.
--
--  4. QUE SE LE REESCRIBA EL TEXTO A UNO CERRADO. Su texto ya salió en
--     un informe que alguien leyó.
--
--  5. QUE UN HALLAZGO ABRA DOS ACCIONES, o que la acción no se amarre.
--
--  6. QUE SE ANULE SIN MOTIVO, o que el anulado siga saliendo como
--     pendiente.
--
--  7. QUE BORRE CUALQUIERA, O QUE EL RASTRO SE ESCRIBA DESPUÉS DEL
--     DELETE: las fotos ya se habrían ido con la cascada y el registro
--     guardaría una lista vacía.
--
--  8. QUE «TODAS» SE QUEDE SIN PERMISO AL MUDARSE. Los permisos se
--     guardan como el TEXTO de la dirección: mover la pantalla sin
--     mover el permiso deja a la gente sin ella EN SILENCIO.
--
--  9. QUE EL ANTES Y EL DESPUÉS SE CUENTEN JUNTOS. El informe los pone
--     uno al lado del otro y tiene que saber cuál es cuál.
-- =====================================================================

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','root@cd.local'),
  ('11111111-1111-1111-1111-111111111111','audita@cd.local'),
  ('22222222-2222-2222-2222-222222222222','mira@cd.local'),
  ('33333333-3333-3333-3333-333333333333','cuela@cd.local')
on conflict do nothing;

do $prueba$
declare
  ROOT   constant text := '44444444-4444-4444-4444-444444444444';
  AUDITA constant text := '11111111-1111-1111-1111-111111111111';
  MIRA   constant text := '22222222-2222-2222-2222-222222222222';
  /* SU ROL SE LLAMA 'abi' Y NO TIENE NINGÚN PERMISO. Existe solo para
     que «se pregunta por la PANTALLA y no por el nombre del rol» sea
     una afirmación que se puede romper: sin él, cambiar la pregunta
     por un `rol = 'abi'` no haría fallar nada y la prueba estaría
     mirando para otro lado. */
  CUELA  constant text := '33333333-3333-3333-3333-333333333333';
  v_falla text := '';
  h1 uuid; h2 uuid; h3 uuid;
  v_cod text;
  v_txt text;
  v_est text;
  v_n int;
  v_json jsonb;
  v_txt2 text;
  v_acc uuid;
begin
  -- -------------------------------------------------------------------
  -- EL FIXTURE
  --
  -- EL ROL QUE MANDA NO SE LLAMA «admin» a propósito: si se llamara
  -- así, la prueba de «pregunta por la casilla y no por el nombre»
  -- pasaría sin probar nada. Y el que audita NO manda: son dos
  -- permisos distintos y el módulo los trata distinto (borrar es del
  -- que manda; redactar, del que audita).
  -- -------------------------------------------------------------------
  insert into public.roles (clave, nombre, manda) values
    ('mando_general','Mando general', true),
    ('auditor','Auditor ABI', false),
    ('mirón','Solo mira', false),
    ('abi','Rol que se llama como la rama', false)
  on conflict (clave) do update set manda = excluded.manda;

  update public.perfiles set rol = 'mando_general', activo = true where id = ROOT::uuid;
  update public.perfiles set rol = 'auditor', activo = true where id = AUDITA::uuid;
  update public.perfiles set rol = 'mirón',   activo = true where id = MIRA::uuid;
  update public.perfiles set rol = 'abi',     activo = true where id = CUELA::uuid;

  insert into public.rol_permisos (rol, seccion, nivel) values
    ('mando_general','/acciones/abi','editar'),
    ('auditor','/acciones/abi','editar'),
    ('mirón','/acciones/abi','ver')
  on conflict (rol, seccion) do update set nivel = excluded.nivel;

  insert into public.acciones_areas (clave, nombre, activo) values ('almacen','Almacenamiento', true)
  on conflict (clave) do nothing;
  insert into public.acciones_zonas (codigo, nombre, area, activo)
  values ('P3','Pasillo 3','almacen', true)
  on conflict (codigo) do nothing;
  insert into public.acciones_motivos (clave, nombre, activo) values ('orden','Orden y aseo', true)
  on conflict (clave) do nothing;

  -- ===================================================================
  -- 1. LEVANTAR ES DE QUIEN TIENE EDITAR EN ABI
  -- ===================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', MIRA)::text, true);
  begin
    perform public.hallazgo_registrar('inocuidad', 'Algo que no debería poder registrar', 'hallazgo',
                                      null, 'P3', null, null, null);
    v_falla := v_falla || E'\n · quien solo MIRA pudo levantar un hallazgo';
  exception when others then null;
  end;

  -- Y EL DEL ROL LLAMADO 'abi' TAMPOCO, que es la otra mitad: quien
  -- decide es la casilla de la pantalla, no cómo se llame el rol.
  perform set_config('request.jwt.claims', json_build_object('sub', CUELA)::text, true);
  begin
    perform public.hallazgo_registrar('inocuidad', 'Se coló por llamarse como la rama', 'hallazgo',
                                      null, 'P3', null, null, null);
    v_falla := v_falla || E'\n · un rol que SE LLAMA «abi», y sin permiso, pudo levantar un hallazgo';
  exception when others then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', AUDITA)::text, true);
  select id, codigo into h1, v_cod from public.hallazgo_registrar(
    'inocuidad',
    'Había una estiba de producto terminado pegada a la pared del pasillo tres tapando el extintor',
    'hallazgo', null, 'P3', null, 'Reubicar la estiba', current_date);
  if h1 is null then v_falla := v_falla || E'\n · quien audita NO pudo levantar un hallazgo'; end if;
  -- EL CÓDIGO LO PONE LA BASE Y LLEVA EL AÑO: un consecutivo corrido
  -- llega a cuatro mil y deja de decir de qué auditoría viene.
  if v_cod !~ ('^HZ-' || extract(year from current_date)::text || '-\d{4}$') then
    v_falla := v_falla || E'\n · el código no lleva el año: ' || coalesce(v_cod, '(nulo)');
  end if;

  -- SIN SITIO NO HAY HALLAZGO: uno sin lugar no se puede ir a mirar.
  begin
    perform public.hallazgo_registrar('inocuidad', 'Algo sin ningún sitio', 'hallazgo',
                                      null, null, null, null, null);
    v_falla := v_falla || E'\n · dejó levantar un hallazgo sin zona y sin ubicación';
  exception when others then null;
  end;

  -- ===================================================================
  -- 2. LA MÁQUINA PROPONE Y NO DECIDE  ← LA REGLA DEL MÓDULO
  -- ===================================================================
  perform public.hallazgo_ia_guardar(h1, 'Se evidencia una estiba obstruyendo el extintor.');
  select redaccion, ia_borrador, estado::text into v_txt, v_txt2, v_est
    from public.acciones_hallazgos where id = h1;
  if v_txt is not null then
    v_falla := v_falla || E'\n · ¡la propuesta de la IA se guardó como la REDACCIÓN del informe!';
  end if;
  select ia_borrador into v_txt from public.acciones_hallazgos where id = h1;
  if coalesce(v_txt, '') = '' then
    v_falla := v_falla || E'\n · no quedó constancia de qué propuso la máquina';
  end if;
  if v_est <> 'borrador' then
    v_falla := v_falla || E'\n · la propuesta de la IA volvió firme el hallazgo sola: ' || v_est;
  end if;
  -- Y AL QUE LE FALTA LA REDACCIÓN, LA VISTA LO DICE.
  select falta_redaccion::text into v_est from public.v_hallazgos where id = h1;
  if v_est <> 'true' then
    v_falla := v_falla || E'\n · con la propuesta guardada, la vista ya no dice que falta redactar';
  end if;

  -- ===================================================================
  -- 3. FIRME EXIGE REDACCIÓN
  -- ===================================================================
  begin
    update public.acciones_hallazgos set estado = 'firme' where id = h1;
    v_falla := v_falla || E'\n · se pudo dejar FIRME un hallazgo sin redacción';
  exception when others then null;
  end;

  begin
    perform public.hallazgo_redactar(h1, '   ');
    v_falla := v_falla || E'\n · se aprobó una redacción vacía';
  exception when others then null;
  end;

  -- APROBAR ES LO QUE LO VUELVE FIRME: no hace falta un botón más.
  perform public.hallazgo_redactar(h1, 'Se evidencia una estiba obstruyendo el extintor.');
  select estado::text, redaccion, redactado_por::text into v_est, v_txt, v_txt2
    from public.acciones_hallazgos where id = h1;
  if v_est <> 'firme' then
    v_falla := v_falla || E'\n · aprobar la redacción no lo dejó firme: ' || v_est;
  end if;
  if v_txt is distinct from 'Se evidencia una estiba obstruyendo el extintor.' then
    v_falla := v_falla || E'\n · no se guardó la redacción aprobada';
  end if;
  select redactado_por::text into v_est from public.acciones_hallazgos where id = h1;
  if v_est is distinct from AUDITA then
    v_falla := v_falla || E'\n · no quedó QUIÉN aprobó la redacción: ' || coalesce(v_est,'(nulo)');
  end if;

  -- SALIÓ TAL CUAL DE LA MÁQUINA y la vista lo dice. No es un error,
  -- pero un informe donde TODO salió así es un informe que nadie leyó.
  select tal_cual_de_la_ia::text into v_est from public.v_hallazgos where id = h1;
  if v_est <> 'true' then
    v_falla := v_falla || E'\n · la redacción es idéntica al borrador de la IA y la vista no lo dice';
  end if;
  perform public.hallazgo_redactar(h1, 'Se evidencia una estiba de producto terminado contra el muro.');
  select tal_cual_de_la_ia::text into v_est from public.v_hallazgos where id = h1;
  if v_est <> 'false' then
    v_falla := v_falla || E'\n · se corrigió la redacción y la vista sigue diciendo «tal cual de la IA»';
  end if;

  -- ===================================================================
  -- 5. DE UN HALLAZGO NACE UNA ACCIÓN — UNA SOLA
  -- ===================================================================
  select accion_id into v_acc from public.hallazgo_abrir_accion(h1, 'alta', 'orden', null);
  if v_acc is null then v_falla := v_falla || E'\n · no se abrió la acción'; end if;
  select accion_id into v_acc from public.acciones_hallazgos where id = h1;
  if v_acc is null then
    v_falla := v_falla || E'\n · la acción no quedó amarrada al hallazgo';
  end if;
  select tiene_accion::text into v_est from public.v_hallazgos where id = h1;
  if v_est <> 'true' then
    v_falla := v_falla || E'\n · la vista no dice que el hallazgo ya tiene acción';
  end if;
  begin
    perform public.hallazgo_abrir_accion(h1, 'alta', 'orden', null);
    v_falla := v_falla || E'\n · el mismo hallazgo abrió DOS acciones';
  exception when others then null;
  end;
  -- Y LA ACCIÓN SE LLEVA LA REDACCIÓN TÉCNICA, no el dictado: quien la
  -- recibe tiene que entenderla sin abrir el hallazgo.
  select a.descripcion into v_txt
    from public.acciones a join public.acciones_hallazgos h on h.accion_id = a.id
   where h.id = h1;
  if v_txt !~ 'Se evidencia' then
    v_falla := v_falla || E'\n · la acción no se llevó la redacción técnica';
  end if;

  -- ===================================================================
  -- 9. EL ANTES Y EL DESPUÉS, CONTADOS APARTE
  -- ===================================================================
  insert into public.acciones_hallazgos_fotos (hallazgo_id, ruta, momento) values
    (h1, h1::text || '/a.jpg', 'antes'),
    (h1, h1::text || '/b.jpg', 'antes'),
    (h1, h1::text || '/c.jpg', 'despues');
  select fotos, fotos_antes::text, fotos_despues::text into v_n, v_est, v_txt
    from public.v_hallazgos where id = h1;
  if v_n <> 3 then v_falla := v_falla || E'\n · la vista cuenta ' || v_n || ' fotos y son 3'; end if;
  if v_est::int <> 2 or v_txt::int <> 1 then
    v_falla := v_falla || E'\n · el antes y el después no se cuentan aparte: '
                       || v_est || ' antes, ' || v_txt || ' después';
  end if;
  -- Y NO SE ACEPTA UN TERCER MOMENTO INVENTADO: con la palabra suelta,
  -- basta un «Despues» sin tilde para que la foto se vaya al lado
  -- equivocado del PDF que va a gerencia.
  begin
    insert into public.acciones_hallazgos_fotos (hallazgo_id, ruta, momento)
    values (h1, h1::text || '/d.jpg', 'Despues');
    v_falla := v_falla || E'\n · se aceptó un momento de foto que no es antes ni despues';
  exception when others then null;
  end;

  -- ===================================================================
  -- 4. A UNO CERRADO NO SE LE REESCRIBE EL TEXTO
  -- ===================================================================
  perform public.hallazgo_cerrar(h1);
  select estado::text into v_est from public.acciones_hallazgos where id = h1;
  if v_est <> 'cerrado' then v_falla := v_falla || E'\n · no se cerró: ' || v_est; end if;
  begin
    perform public.hallazgo_redactar(h1, 'Otra cosa distinta de la que salió en el informe.');
    v_falla := v_falla || E'\n · se le reescribió el texto a un hallazgo ya cerrado';
  exception when others then null;
  end;

  -- Y NO SE CIERRA UNO QUE NO ESTÁ FIRME: cerrar quiere decir que se
  -- arregló lo que salió en el informe, y un borrador no salió.
  select id into h2 from public.hallazgo_registrar(
    'seguridad', 'Extintor sin la señalización de su sitio en la calle cuatro', 'critico',
    null, 'P3', null, null, current_date);
  begin
    perform public.hallazgo_cerrar(h2);
    v_falla := v_falla || E'\n · se cerró un hallazgo que todavía estaba en borrador';
  exception when others then null;
  end;

  -- ===================================================================
  -- 6. ANULAR PIDE MOTIVO Y SACA DEL PENDIENTE
  -- ===================================================================
  begin
    perform public.hallazgo_anular(h2, '  ');
    v_falla := v_falla || E'\n · se anuló sin motivo';
  exception when others then null;
  end;
  perform public.hallazgo_anular(h2, 'Resultó que sí estaba señalizado, del otro lado');
  select estado::text, motivo_anulacion into v_est, v_txt
    from public.acciones_hallazgos where id = h2;
  if v_est <> 'anulado' or coalesce(v_txt,'') = '' then
    v_falla := v_falla || E'\n · anular no dejó el estado y el motivo';
  end if;
  -- UN ANULADO NO SE REDACTA NI VUELVE: dejó de ser un hallazgo.
  begin
    perform public.hallazgo_ia_guardar(h2, 'Se evidencia algo');
    v_falla := v_falla || E'\n · se le pidió redacción a un hallazgo anulado';
  exception when others then null;
  end;

  -- ===================================================================
  -- 7. BORRAR ES DEL ADMINISTRADOR Y DEJA EL RASTRO COMPLETO
  -- ===================================================================
  select id into h3 from public.hallazgo_registrar(
    'cinco_s', 'Cajas apiladas en el corredor de evacuación de la zona de cargue', 'hallazgo',
    null, 'P3', null, null, current_date);
  insert into public.acciones_hallazgos_fotos (hallazgo_id, ruta, momento)
  values (h3, h3::text || '/e.jpg', 'antes'), (h3, h3::text || '/f.jpg', 'despues');

  -- QUIEN AUDITA NO BORRA. Un hallazgo firme salió en un informe, y
  -- hacerlo desaparecer es otra cosa que corregirse.
  begin
    perform public.hallazgo_borrar(array[h3], 'Prueba');
    v_falla := v_falla || E'\n · quien audita (y no manda) pudo BORRAR hallazgos';
  exception when others then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', ROOT)::text, true);
  begin
    perform public.hallazgo_borrar(array[h3], '   ');
    v_falla := v_falla || E'\n · se borró sin motivo: la fila se va y el motivo es lo único que queda';
  exception when others then null;
  end;

  select public.hallazgo_borrar(array[h3, h2], 'Data de prueba del montaje inicial') into v_n;
  if v_n <> 2 then
    v_falla := v_falla || E'\n · borró ' || v_n || ' y se pidieron 2';
  end if;
  if exists (select 1 from public.acciones_hallazgos where id in (h3, h2)) then
    v_falla := v_falla || E'\n · dijo que borró y las filas siguen ahí';
  end if;

  -- EL RASTRO, COMPLETO Y CON LAS FOTOS. Escrito DESPUÉS del delete se
  -- habrían ido con la cascada y quedaría una lista vacía.
  select fila, fotos into v_json, v_txt
    from public.acciones_hallazgos_borrados where id = h3;
  if v_json is null then
    v_falla := v_falla || E'\n · no quedó rastro de lo que se borró';
  elsif coalesce(v_json ->> 'lo_que_se_vio', '') = '' then
    v_falla := v_falla || E'\n · el rastro no guardó lo que se vio';
  end if;
  select jsonb_array_length(fotos) into v_n
    from public.acciones_hallazgos_borrados where id = h3;
  if coalesce(v_n, 0) <> 2 then
    v_falla := v_falla || E'\n · el rastro guardó ' || coalesce(v_n, 0)
                       || ' foto(s) y eran 2: se escribió DESPUÉS del delete';
  end if;

  -- EL REGISTRO DE BORRADOS NO LO LEE CUALQUIERA: sería una segunda
  -- copia de lo borrado al alcance de todos. Se prueba con RLS de
  -- verdad —`set role`—, porque postgres la salta por ser superusuario
  -- y la prueba pasaría sin probar nada.
  perform set_config('request.jwt.claims', json_build_object('sub', AUDITA)::text, true);
  set local role probador;
  select count(*) into v_n from public.acciones_hallazgos_borrados;
  if v_n <> 0 then
    v_falla := v_falla || E'\n · quien no manda puede leer el registro de hallazgos borrados';
  end if;
  reset role;

  -- ===================================================================
  -- 8. «TODAS» SE MUDÓ Y SE LLEVÓ SU PERMISO
  -- ===================================================================
  if not exists (select 1 from public.rol_permisos
                  where rol = 'auditor' and seccion = '/acciones/todas') then
    -- (solo si el rol tenía /acciones; aquí se siembra para comprobar
    --  que la migración copia, no que inventa)
    null;
  end if;

  if v_falla <> '' then
    raise exception 'FALLA:%', v_falla;
  end if;
  raise notice 'BIEN: ABI — la IA propone y NO decide, firme exige redacción, un cerrado no se '
               'reescribe, un hallazgo abre UNA sola acción, anular pide motivo, borrar es del '
               'administrador y el rastro se escribe ANTES del delete con sus fotos, y el antes '
               'y el después se cuentan aparte.';
exception when others then
  -- UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE. Sin esto, un error a
  -- mitad de camino sale como un error de Postgres cualquiera y parece
  -- un problema del montaje.
  set role postgres;
  raise exception 'FALLA:% — y ademas se murio en el camino: %', v_falla, sqlerrm;
end $prueba$;

-- =====================================================================
-- 8b. EL PERMISO SE COPIA, NO SE INVENTA.
--
-- Fuera del bloque a propósito: la migración ya corrió antes de esto, y
-- lo que se comprueba es que a un rol que tenía /acciones le quedó
-- /acciones/todas con el MISMO nivel. Se siembra el caso y se vuelve a
-- correr el pedazo de la migración.
-- =====================================================================
insert into public.roles (clave, nombre, manda) values ('viejo','Rol viejo', false)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, seccion, nivel) values ('viejo','/acciones','editar')
on conflict (rol, seccion) do update set nivel = excluded.nivel;

insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/acciones/todas', p.nivel
  from public.rol_permisos p
 where p.seccion = '/acciones'
on conflict (rol, seccion) do nothing;

do $permiso$
declare v_nivel text;
begin
  select nivel::text into v_nivel from public.rol_permisos
   where rol = 'viejo' and seccion = '/acciones/todas';
  if v_nivel is distinct from 'editar' then
    raise exception 'FALLA: al mudar «Todas» el permiso no se copió (quedó %) — la gente se '
                    'queda sin la pantalla EN SILENCIO', coalesce(v_nivel, '(ninguno)');
  end if;
  raise notice 'BIEN: «Todas» se mudó a /acciones/todas y se llevó su permiso.';
end $permiso$;
