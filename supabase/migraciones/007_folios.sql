-- ============================================================================
-- 007 · Folios por zona:  OI-CUE-0001, TK-VEL-0007, RC-PAS-0123
-- ============================================================================
-- Cada zona lleva su propia numeración. El cobrador y el técnico reconocen de
-- inmediato si un folio es suyo, y los reportes por zona cuadran solos.
-- ============================================================================

create table public.folio_counters (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  zone_id     uuid not null references public.zones(id) on delete cascade,
  kind        text not null check (kind in ('order','ticket','receipt','contract','customer')),
  last_number bigint not null default 0,
  primary key (org_id, zone_id, kind)
);

comment on table public.folio_counters is
  'Un contador por zona y por tipo. La fila se bloquea al pedir folio, así que '
  'dos cobradores no pueden sacar el mismo número aunque graben al mismo tiempo.';

create or replace function public.siguiente_folio(
  p_org uuid, p_zone uuid, p_kind text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text;
  v_num    bigint;
  v_pre    text;
begin
  select z.code into v_codigo from public.zones z
   where z.id = p_zone and z.org_id = p_org;

  if v_codigo is null then
    raise exception 'La zona no existe o no es de esta organización';
  end if;

  insert into public.folio_counters (org_id, zone_id, kind, last_number)
       values (p_org, p_zone, p_kind, 1)
  on conflict (org_id, zone_id, kind)
    do update set last_number = public.folio_counters.last_number + 1
    returning last_number into v_num;

  v_pre := case p_kind
             when 'order'    then 'OI'
             when 'ticket'   then 'TK'
             when 'receipt'  then 'RC'
             when 'contract' then 'CT'
             when 'customer' then 'CL'
           end;

  return v_pre || '-' || v_codigo || '-' || lpad(v_num::text, 4, '0');
end;
$$;

comment on function public.siguiente_folio is
  'Devuelve el siguiente folio de esa zona y lo aparta. Nunca repite.';
