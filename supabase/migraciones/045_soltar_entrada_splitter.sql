-- ============================================================================
-- 045 · Soltar la entrada de un splitter
-- ----------------------------------------------------------------------------
-- La función `alimentar_splitter` exige siempre UNA fuente (hilo, puerto ODF o
-- salida de otro splitter): no permite vaciar la entrada. Para poder cambiar la
-- alimentación a otro hilo, primero hay que soltar la que tiene.
--
-- Esta función vacía la entrada y libera lo que la alimentaba —el hilo, o la
-- salida del otro splitter— pero SOLO si ese hilo ya no tiene otro uso (misma
-- prudencia que `eliminar_splitter`): no se libera algo que todavía sirve.
-- ============================================================================

create or replace function public.soltar_entrada_splitter(p_splitter uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_code text;
  v_hilo uuid;
  v_port uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select code, in_strand_id, in_splitter_port_id
    into v_code, v_hilo, v_port
    from public.splitters
   where id = p_splitter and org_id = v_org;

  if v_code is null then
    raise exception 'Ese splitter no existe';
  end if;

  -- Vaciar la entrada.
  update public.splitters
     set in_strand_id = null,
         in_odf_port_id = null,
         in_splitter_port_id = null,
         updated_at = now()
   where id = p_splitter and org_id = v_org;

  -- Si le entraba por la salida de otro splitter, esa salida vuelve a estar libre.
  if v_port is not null then
    update public.splitter_ports
       set status = 'disponible', updated_at = now()
     where id = v_port;
  end if;

  -- El hilo que lo alimentaba queda disponible, salvo que todavía tenga otro
  -- uso (que le entre luz de otro lado o que vaya a otro lado).
  if v_hilo is not null then
    update public.fiber_strands
       set status = 'disponible', updated_at = now()
     where id = v_hilo
       and public.fuente_del_hilo(v_hilo) is null
       and public.destino_del_hilo(v_hilo) is null;
  end if;

  return v_code;
end;
$$;

comment on function public.soltar_entrada_splitter(uuid) is
  'Vacía la entrada de un splitter y libera el hilo (o la salida) que lo alimentaba, para poder alimentarlo desde otro.';

revoke all on function public.soltar_entrada_splitter(uuid) from public, anon;
grant execute on function public.soltar_entrada_splitter(uuid) to authenticated;
