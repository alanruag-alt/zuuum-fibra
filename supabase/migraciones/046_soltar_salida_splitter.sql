-- ============================================================================
-- 046 · Soltar la salida de un splitter (y liberar el hilo)
-- ----------------------------------------------------------------------------
-- `conectar_salida(..., p_estado => 'disponible')` deja la salida libre, pero
-- NO regresa el hilo destino a "disponible": el hilo se queda mostrándose "en
-- servicio" aunque ya no le llegue nada. Esta función suelta la salida Y libera
-- el hilo que tenía —con la misma prudencia de siempre: solo si ese hilo ya no
-- tiene otro uso.
-- ============================================================================

create or replace function public.soltar_salida_splitter(p_salida uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_sal  record;
  v_hilo uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select sp.id, sp.port_number, sp.out_strand_id, s.code as splitter
    into v_sal
    from public.splitter_ports sp
    join public.splitters s on s.id = sp.splitter_id
   where sp.id = p_salida and sp.org_id = v_org;

  if v_sal.id is null then
    raise exception 'Esa salida no existe';
  end if;

  v_hilo := v_sal.out_strand_id;

  -- Soltar la salida.
  update public.splitter_ports
     set status = 'disponible',
         out_strand_id = null,
         out_nap_port_id = null,
         out_element_id = null,
         updated_at = now()
   where id = p_salida;

  -- Regresar el hilo destino a disponible, salvo que todavía tenga otro uso.
  if v_hilo is not null then
    update public.fiber_strands
       set status = 'disponible', updated_at = now()
     where id = v_hilo
       and public.fuente_del_hilo(v_hilo) is null
       and public.destino_del_hilo(v_hilo) is null;
  end if;

  return format('Salida %s de %s liberada.', v_sal.port_number, v_sal.splitter);
end;
$$;

comment on function public.soltar_salida_splitter(uuid) is
  'Suelta la salida de un splitter y regresa el hilo destino a disponible (si ya no tiene otro uso).';

revoke all on function public.soltar_salida_splitter(uuid) from public, anon;
grant execute on function public.soltar_salida_splitter(uuid) to authenticated;
