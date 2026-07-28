-- ============================================================================
--  ZUUUM FIBRA · CREAR TU USUARIO PROPIETARIO
-- ----------------------------------------------------------------------------
--  ANTES: crea la cuenta en Authentication → Users → Add user.
--  Aquí NO hace falta copiar el UUID: lo busca solo por el correo.
--
--  Cambia únicamente las dos líneas marcadas con  ←  y dale Run.
-- ============================================================================

do $$
declare
  -- ↓↓↓ LAS ÚNICAS DOS LÍNEAS QUE HAY QUE TOCAR ↓↓↓
  v_correo text := 'alan@panelzuuumfibra.com';   -- ← el correo con el que creaste la cuenta
  v_nombre text := 'Alan Ramos';                 -- ← tu nombre, como quieres que aparezca
  -- ↑↑↑ -------------------------------------- ↑↑↑

  v_org  uuid := '00000000-0000-0000-0000-000000000001';
  v_uid  uuid;
  v_rol  uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(trim(v_correo));

  if v_uid is null then
    raise exception using message =
      E'No encuentro ese correo en Authentication → Users.\n'
      '  Buscabas: ' || v_correo || E'\n'
      '  Correos dados de alta: ' ||
      coalesce((select string_agg(email, ', ' order by email) from auth.users), '(ninguno todavía)') ||
      E'\n  Crea la cuenta primero, o corrige el correo aquí arriba.';
  end if;

  select id into v_rol from public.roles where org_id = v_org and code = 'owner';
  if v_rol is null then
    raise exception using message =
      E'No existe el rol "owner".\n  ¿Corriste ESQUEMA_COMPLETO.sql completo?';
  end if;

  insert into public.profiles (id, org_id, full_name, email)
  values (v_uid, v_org, v_nombre, lower(trim(v_correo)))
  on conflict (id) do update
     set full_name = excluded.full_name,
         email     = excluded.email,
         is_active = true;

  insert into public.user_roles (user_id, role_id)
  values (v_uid, v_rol)
  on conflict do nothing;

  raise notice 'Listo. % quedó como Propietario, con alcance total.', v_correo;
end $$;

-- ----------------------------------------------------------------------------
-- Comprobación: debe salir tu nombre con el rol Propietario.
-- ----------------------------------------------------------------------------
select p.full_name    as nombre,
       p.email        as correo,
       r.name         as rol,
       r.scope_type   as alcance,
       (select count(*) from public.role_permissions rp where rp.role_id = r.id) as permisos
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  join public.roles r on r.id = ur.role_id
 order by p.full_name;
