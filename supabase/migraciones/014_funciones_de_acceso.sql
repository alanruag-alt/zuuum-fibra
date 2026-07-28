-- ============================================================================
-- 014 · Las tres funciones de las que cuelga toda la seguridad
-- ============================================================================
-- Van con `security definer` para poder leer las tablas de permisos sin que
-- el propio RLS se muerda la cola, y con `search_path = ''` para que nadie
-- pueda engañarlas creando una tabla con el mismo nombre en otro esquema.
-- ============================================================================

-- ¿De qué organización es quien está preguntando?
create or replace function public.auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.org_id from public.profiles p
   where p.id = (select auth.uid()) and p.is_active
   limit 1;
$$;

-- ¿Tiene este permiso? Rol + individuales, con el candado de los sensibles.
create or replace function public.auth_has(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with yo as (
    select p.id from public.profiles p
     where p.id = (select auth.uid()) and p.is_active
  ),
  perm as (
    select id, is_sensitive from public.permissions where code = p_permiso
  ),
  solo_operativo as (
    select coalesce(bool_and(r.code in ('technician','warehouse','customer')), true) as si
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = (select id from yo)
  ),
  quitado as (
    select 1 from public.user_permissions up
     where up.user_id = (select id from yo)
       and up.permission_id = (select id from perm)
       and up.granted = false
  ),
  por_rol as (
    select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
     where ur.user_id = (select id from yo)
       and rp.permission_id = (select id from perm)
  ),
  dado as (
    select 1 from public.user_permissions up
     where up.user_id = (select id from yo)
       and up.permission_id = (select id from perm)
       and up.granted = true
  )
  select
    exists (select 1 from yo)
    and not exists (select 1 from quitado)
    and (exists (select 1 from por_rol) or exists (select 1 from dado))
    -- El candado: un permiso de dinero nunca aplica a alguien solo operativo.
    and not ((select is_sensitive from perm) and (select si from solo_operativo));
$$;

comment on function public.auth_has is
  'Permiso efectivo: lo que da el rol, más lo individual, menos lo quitado, '
  'y con los permisos de dinero bloqueados para roles operativos.';

-- ¿Ve toda la empresa, o solo sus zonas?
create or replace function public.auth_alcance_total()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = (select auth.uid()) and r.scope_type = 'all'
  );
$$;

-- ¿Puede ver esta zona?
create or replace function public.auth_ve_zona(p_zona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_alcance_total()
      or exists (select 1 from public.user_zones uz
                  where uz.user_id = (select auth.uid()) and uz.zone_id = p_zona);
$$;

-- ¿Puede cobrar en esta zona?
create or replace function public.auth_cobra_zona(p_zona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_alcance_total()
      or exists (select 1 from public.user_zones uz
                  where uz.user_id = (select auth.uid())
                    and uz.zone_id = p_zona and uz.can_collect);
$$;

-- ¿Esta orden está asignada a quien pregunta?
create or replace function public.auth_orden_propia(p_orden uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.work_order_assignments a
                  where a.work_order_id = p_orden
                    and a.technician_id = (select auth.uid()));
$$;

-- ¿Este cliente tiene una orden asignada hoy a quien pregunta?
-- Es lo que le deja al técnico ver al cliente del domicilio al que va, y a nadie más.
create or replace function public.auth_cliente_de_mi_orden(p_cliente uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.work_orders o
      join public.work_order_assignments a on a.work_order_id = o.id
     where o.customer_id = p_cliente
       and a.technician_id = (select auth.uid())
       and o.status in ('scheduled','in_progress')
  );
$$;
