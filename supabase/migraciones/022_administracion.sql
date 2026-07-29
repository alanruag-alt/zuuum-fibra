-- ============================================================================
-- 022 · Administración: gente, zonas, planes y reglas
-- ============================================================================
-- Todo lo que hasta hoy había que hacer entrando a Supabase a mano.
--
--   alta_persona()        liga una cuenta de Auth con su perfil, rol y zonas
--   editar_persona()      nombre, rol, activo/inactivo
--   asignar_zonas()       qué zonas ve y en cuáles cobra
--   ajustar_permiso()     un permiso suelto, por encima o por debajo del rol
--   guardar_zona()        alta y edición de zonas
--   guardar_plan()        alta y edición de planes
--   guardar_ajuste()      cambiar una regla de negocio
--
-- Las contraseñas NO pasan por aquí. Las guarda Supabase Auth y nadie más las
-- ve: ni el panel, ni la base, ni yo. Esta función recibe el id que Auth ya
-- creó, no una contraseña.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Dar de alta a una persona
-- ----------------------------------------------------------------------------
create or replace function public.alta_persona(
  p_auth_user   uuid,
  p_nombre      text,
  p_email       text,
  p_rol         text,
  p_zonas       uuid[] default '{}',
  p_cobra_en    uuid[] default '{}',
  p_telefono    text   default null,
  p_codigo      text   default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_rol  uuid;
  z      uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('users.write') then
    raise exception 'No tienes permiso para dar de alta gente' using errcode = '42501';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) < 3 then
    raise exception 'Falta el nombre completo';
  end if;

  select r.id into v_rol from public.roles r
   where r.org_id = v_org and r.code = p_rol and r.is_active;

  if v_rol is null then
    raise exception 'Ese rol no existe';
  end if;

  -- Nadie puede crear a alguien con más alcance del que uno mismo tiene.
  -- Sin esto, una persona de oficina podría fabricarse un propietario y
  -- darse a sí misma todo el sistema por la puerta de atrás.
  if p_rol in ('owner','admin') and not public.auth_alcance_total() then
    raise exception 'No puedes crear a alguien con más alcance del que tú tienes'
      using errcode = '42501';
  end if;

  insert into public.profiles (id, org_id, full_name, email, phone, employee_code, created_by)
  values (p_auth_user, v_org, btrim(p_nombre), lower(btrim(p_email)), p_telefono, p_codigo, auth.uid())
  on conflict (id) do update
    set full_name = excluded.full_name,
        email     = excluded.email,
        phone     = coalesce(excluded.phone, public.profiles.phone),
        is_active = true,
        updated_at = now(),
        updated_by = auth.uid();

  insert into public.user_roles (user_id, role_id, created_by)
  values (p_auth_user, v_rol, auth.uid())
  on conflict (user_id, role_id) do nothing;

  foreach z in array coalesce(p_zonas, '{}') loop
    insert into public.user_zones (user_id, zone_id, can_collect, created_by)
    values (p_auth_user, z, z = any(coalesce(p_cobra_en, '{}')), auth.uid())
    on conflict (user_id, zone_id) do update
      set can_collect = excluded.can_collect;
  end loop;

  return p_auth_user;
end;
$$;

comment on function public.alta_persona is
  'Liga una cuenta de Supabase Auth con su perfil, rol y zonas. No recibe ni '
  'guarda contraseñas: de eso se encarga Auth y nadie más las ve.';

-- ----------------------------------------------------------------------------
-- 2 · Editar a una persona
-- ----------------------------------------------------------------------------
create or replace function public.editar_persona(
  p_user     uuid,
  p_nombre   text    default null,
  p_rol      text    default null,
  p_activo   boolean default null,
  p_telefono text    default null,
  p_codigo   text    default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_rol uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('users.write') then
    raise exception 'No tienes permiso para editar gente' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and p.org_id = v_org) then
    raise exception 'Esa persona no existe';
  end if;

  -- Apagarse a uno mismo deja a la empresa sin quien administre si era el
  -- único. Se prohíbe siempre: para eso está otra persona con el permiso.
  if p_activo is false and p_user = auth.uid() then
    raise exception 'No puedes desactivarte a ti mismo' using errcode = '42501';
  end if;

  update public.profiles
     set full_name     = coalesce(nullif(btrim(p_nombre), ''), full_name),
         phone         = coalesce(p_telefono, phone),
         employee_code = coalesce(p_codigo, employee_code),
         is_active     = coalesce(p_activo, is_active),
         updated_at    = now(),
         updated_by    = auth.uid()
   where id = p_user;

  if p_rol is not null then
    select r.id into v_rol from public.roles r
     where r.org_id = v_org and r.code = p_rol and r.is_active;

    if v_rol is null then
      raise exception 'Ese rol no existe';
    end if;
    if p_rol in ('owner','admin') and not public.auth_alcance_total() then
      raise exception 'No puedes darle más alcance del que tú tienes'
        using errcode = '42501';
    end if;

    delete from public.user_roles where user_id = p_user;
    insert into public.user_roles (user_id, role_id, created_by)
    values (p_user, v_rol, auth.uid());

    -- Al cambiar de rol se limpian los permisos sueltos: si alguien pasa de
    -- oficina a técnico, los permisos de dinero que traía a mano tienen que
    -- irse con el cargo, no quedarse pegados a la persona.
    delete from public.user_permissions where user_id = p_user;
  end if;
end;
$$;

comment on function public.editar_persona is
  'Cambia nombre, rol o si está activa. Cambiar de rol borra los permisos '
  'sueltos: se van con el cargo, no se quedan pegados a la persona.';

-- ----------------------------------------------------------------------------
-- 3 · Zonas de una persona
-- ----------------------------------------------------------------------------
create or replace function public.asignar_zonas(
  p_user     uuid,
  p_zonas    uuid[],
  p_cobra_en uuid[] default '{}'
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  z     uuid;
  n     int := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('users.write') then
    raise exception 'No tienes permiso para asignar zonas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and p.org_id = v_org) then
    raise exception 'Esa persona no existe';
  end if;

  delete from public.user_zones where user_id = p_user;

  foreach z in array coalesce(p_zonas, '{}') loop
    if not exists (select 1 from public.zones zz where zz.id = z and zz.org_id = v_org) then
      raise exception 'Una de las zonas no existe';
    end if;
    insert into public.user_zones (user_id, zone_id, can_collect, created_by)
    values (p_user, z, z = any(coalesce(p_cobra_en, '{}')), auth.uid());
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4 · Un permiso suelto
-- ----------------------------------------------------------------------------
-- p_estado:  true = dárselo aunque el rol no lo traiga
--            false = quitárselo aunque el rol sí lo traiga
--            null = borrar la excepción y volver a lo que diga el rol
--
-- El candado de la 004 sigue mandando: si se intenta dar un permiso de dinero
-- a alguien puramente operativo, la base lo rechaza sola.
-- ----------------------------------------------------------------------------
create or replace function public.ajustar_permiso(
  p_user    uuid,
  p_permiso text,
  p_estado  boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_perm uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('users.write') then
    raise exception 'No tienes permiso para cambiar permisos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and p.org_id = v_org) then
    raise exception 'Esa persona no existe';
  end if;

  select id into v_perm from public.permissions where code = p_permiso;
  if v_perm is null then
    raise exception 'Ese permiso no existe';
  end if;

  -- Quitarse a uno mismo el permiso de administrar usuarios deja la puerta
  -- cerrada por dentro y sin llave.
  if p_user = auth.uid() and p_permiso = 'users.write' and p_estado is distinct from true then
    raise exception 'No puedes quitarte a ti mismo el permiso de administrar usuarios'
      using errcode = '42501';
  end if;

  if p_estado is null then
    delete from public.user_permissions where user_id = p_user and permission_id = v_perm;
  else
    insert into public.user_permissions (user_id, permission_id, granted, granted_by)
    values (p_user, v_perm, p_estado, auth.uid())
    on conflict (user_id, permission_id) do update
      set granted = excluded.granted, granted_by = auth.uid();
  end if;
end;
$$;

comment on function public.ajustar_permiso is
  'Da o quita un permiso por encima del rol. Con null, se borra la excepción. '
  'El candado de permisos sensibles sigue aplicando.';

-- ----------------------------------------------------------------------------
-- 5 · Zonas
-- ----------------------------------------------------------------------------
create or replace function public.guardar_zona(
  p_id      uuid    default null,
  p_nombre  text    default null,
  p_codigo  text    default null,
  p_activa  boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('zones.write') then
    raise exception 'No tienes permiso para editar zonas' using errcode = '42501';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then
    raise exception 'Falta el nombre de la zona';
  end if;

  if p_id is null then
    if p_codigo is null or length(btrim(p_codigo)) < 2 then
      raise exception 'Falta el código corto de la zona (va en los folios: OI-CUE-0001)';
    end if;

    insert into public.zones (org_id, name, code, is_active, created_by)
    values (v_org, btrim(p_nombre), upper(btrim(p_codigo)), p_activa, auth.uid())
    returning id into v_id;
  else
    -- El código NO se puede cambiar: ya está impreso en folios que existen.
    -- Cambiarlo dejaría recibos viejos apuntando a una zona que ya no se llama así.
    update public.zones
       set name = btrim(p_nombre), is_active = p_activa, updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa zona no existe';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function public.guardar_zona is
  'Alta y edición de zonas. El código corto no se puede cambiar una vez creado: '
  'ya está impreso en folios que existen.';

-- ----------------------------------------------------------------------------
-- 6 · Planes
-- ----------------------------------------------------------------------------
create or replace function public.guardar_plan(
  p_id        uuid    default null,
  p_codigo    text    default null,
  p_nombre    text    default null,
  p_precio    numeric default null,
  p_bajada    int     default null,
  p_subida    int     default null,
  p_red       text    default 'both',
  p_visible   boolean default true,
  p_activo    boolean default true,
  p_notas     text    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('plans.write') then
    raise exception 'No tienes permiso para editar planes' using errcode = '42501';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then
    raise exception 'Falta el nombre del plan';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ir vacío ni en negativo';
  end if;
  if p_red not in ('ftth','wisp','both') then
    raise exception 'El tipo de red solo puede ser fibra, inalámbrico o ambos';
  end if;

  if p_id is null then
    if p_codigo is null or length(btrim(p_codigo)) < 2 then
      raise exception 'Falta el código del plan';
    end if;

    insert into public.service_plans
      (org_id, code, name, price, download_mbps, upload_mbps, network_type,
       visible_for_sale, is_active, notes, created_by)
    values
      (v_org, upper(btrim(p_codigo)), btrim(p_nombre), p_precio, p_bajada, p_subida,
       p_red, p_visible, p_activo, p_notas, auth.uid())
    returning id into v_id;
  else
    -- Cambiar el precio del plan NO le cambia el precio a quien ya lo tiene:
    -- esos traen su `custom_price`. Subirle a un cliente es una decisión
    -- aparte, cliente por cliente, no un efecto secundario de editar un plan.
    update public.service_plans
       set name = btrim(p_nombre), price = p_precio,
           download_mbps = p_bajada, upload_mbps = p_subida,
           network_type = p_red, visible_for_sale = p_visible,
           is_active = p_activo, notes = coalesce(p_notas, notes),
           updated_at = now(), updated_by = auth.uid()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese plan no existe';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function public.guardar_plan is
  'Alta y edición de planes. Cambiar el precio no se lo cambia a los clientes '
  'que ya lo tienen: ésos traen su precio propio.';

-- ----------------------------------------------------------------------------
-- 7 · Reglas de negocio
-- ----------------------------------------------------------------------------
-- El día de corte, la tolerancia, el cargo de reconexión: todo eso vive en
-- `settings` y se cambia desde el panel. La idea es que cambiar una regla del
-- negocio nunca requiera que alguien toque código.
-- ----------------------------------------------------------------------------
create or replace function public.guardar_ajuste(p_key text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_tipo text;
  v_num  numeric;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('settings.write') then
    raise exception 'No tienes permiso para cambiar la configuración' using errcode = '42501';
  end if;

  select s.value_type into v_tipo
    from public.settings s where s.org_id = v_org and s.key = p_key;

  if v_tipo is null then
    raise exception 'Ese ajuste no existe';
  end if;

  -- Se valida antes de guardar. Un día de corte en "once" en vez de 11 no
  -- truena al guardarlo: truena el día 11, cuando ya nadie se acuerda.
  if v_tipo = 'number' then
    begin
      v_num := p_valor::numeric;
    exception when others then
      raise exception 'Ese ajuste tiene que ser un número';
    end;

    if p_key in ('billing.due_day','billing.cutoff_day') and (v_num < 1 or v_num > 28) then
      raise exception 'El día tiene que estar entre 1 y 28';
    end if;
    if p_key = 'billing.grace_days' and (v_num < 0 or v_num > 27) then
      raise exception 'Los días de gracia tienen que estar entre 0 y 27';
    end if;
    if p_key like 'billing.%fee%' and v_num < 0 then
      raise exception 'Un cargo no puede ser negativo';
    end if;

    update public.settings set value = to_jsonb(v_num), updated_at = now(),
                               updated_by = auth.uid()
     where org_id = v_org and key = p_key;

  elsif v_tipo = 'boolean' then
    if lower(p_valor) not in ('true','false') then
      raise exception 'Ese ajuste solo puede ser sí o no';
    end if;
    update public.settings set value = to_jsonb(lower(p_valor)::boolean), updated_at = now(),
                               updated_by = auth.uid()
     where org_id = v_org and key = p_key;

  else
    update public.settings set value = to_jsonb(p_valor), updated_at = now(),
                               updated_by = auth.uid()
     where org_id = v_org and key = p_key;
  end if;

  -- El día de corte no puede quedar antes del vencimiento. Se revisa después
  -- de guardar, dentro de la misma transacción, para que la combinación mala
  -- nunca llegue a existir aunque se cambien los tres ajustes de uno en uno.
  if p_key in ('billing.due_day','billing.grace_days','billing.cutoff_day') then
    if public.ajuste_numero(v_org, 'billing.cutoff_day', 11)
       <= public.ajuste_numero(v_org, 'billing.due_day', 5)
          + public.ajuste_numero(v_org, 'billing.grace_days', 5)
    then
      raise exception 'Con esos números el corte caería antes de que se acabe la gracia. '
                      'Ajusta primero el día de corte.';
    end if;
  end if;
end;
$$;

comment on function public.guardar_ajuste is
  'Cambia una regla de negocio, validando el valor antes de guardarlo y '
  'revisando que las fechas de cobranza sigan teniendo sentido entre sí.';

-- ----------------------------------------------------------------------------
-- 8 · La vista de la gente, con su rol, sus zonas y lo que puede hacer
-- ----------------------------------------------------------------------------
create or replace view public.v_personas with (security_invoker = true) as
select p.id,
       p.org_id,
       p.full_name,
       p.email,
       p.phone,
       p.employee_code,
       p.is_active,
       p.last_seen_at,
       p.created_at,
       r.code  as rol_codigo,
       r.name  as rol,
       r.scope_type as alcance,
       (select count(*) from public.user_zones uz where uz.user_id = p.id)                  as zonas,
       (select count(*) from public.user_zones uz where uz.user_id = p.id and uz.can_collect) as zonas_cobra,
       (select string_agg(z.name, ', ' order by z.name)
          from public.user_zones uz join public.zones z on z.id = uz.zone_id
         where uz.user_id = p.id)                                                            as zonas_nombres,
       (select count(*) from public.user_permissions up where up.user_id = p.id)             as permisos_especiales
  from public.profiles p
  left join public.user_roles ur on ur.user_id = p.id
  left join public.roles r on r.id = ur.role_id;

comment on view public.v_personas is
  'Quién es quién: su rol, sus zonas y cuántos permisos trae fuera del rol.';

-- ----------------------------------------------------------------------------
-- 9 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.alta_persona(uuid, text, text, text, uuid[], uuid[], text, text) from public, anon;
revoke all on function public.editar_persona(uuid, text, text, boolean, text, text)            from public, anon;
revoke all on function public.asignar_zonas(uuid, uuid[], uuid[])                              from public, anon;
revoke all on function public.ajustar_permiso(uuid, text, boolean)                             from public, anon;
revoke all on function public.guardar_zona(uuid, text, text, boolean)                          from public, anon;
revoke all on function public.guardar_plan(uuid, text, text, numeric, int, int, text, boolean, boolean, text) from public, anon;
revoke all on function public.guardar_ajuste(text, text)                                       from public, anon;

grant execute on function public.alta_persona(uuid, text, text, text, uuid[], uuid[], text, text) to authenticated;
grant execute on function public.editar_persona(uuid, text, text, boolean, text, text)            to authenticated;
grant execute on function public.asignar_zonas(uuid, uuid[], uuid[])                              to authenticated;
grant execute on function public.ajustar_permiso(uuid, text, boolean)                             to authenticated;
grant execute on function public.guardar_zona(uuid, text, text, boolean)                          to authenticated;
grant execute on function public.guardar_plan(uuid, text, text, numeric, int, int, text, boolean, boolean, text) to authenticated;
grant execute on function public.guardar_ajuste(text, text)                                       to authenticated;
