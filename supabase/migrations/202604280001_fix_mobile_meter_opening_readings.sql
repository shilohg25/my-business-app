-- Fix Expo mobile Meter Readings opening values.
--
-- The mobile app calls:
--   supabase.rpc('fuel_get_station_meters', { target_station_id })
--
-- Keep the original meter configuration columns and add optional opening-reading
-- fields that the mobile app already knows how to consume:
--   default_opening_reading
--   opening_reading_source
--   opening_reading_editable

-- Changing a RETURNS TABLE signature requires dropping the old function first.
drop function if exists public.fuel_get_station_meters(uuid);

create or replace function public.fuel_get_station_meters(target_station_id uuid)
returns table (
  id uuid,
  station_id uuid,
  product_type text,
  meter_label text,
  display_order integer,
  is_active boolean,
  default_opening_reading numeric,
  opening_reading_source text,
  opening_reading_editable boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_meter_state_rpc boolean := to_regprocedure('public.fuel_get_station_pump_meter_state(uuid)') is not null;
  has_meter_baseline_tables boolean :=
    to_regclass('public.fuel_station_meter_baselines') is not null
    and to_regclass('public.fuel_station_fuel_baselines') is not null;
  has_assignment_rpc boolean := to_regprocedure('public.fuel_get_my_station_assignments()') is not null;
  access_filter text := '';
begin
  if auth.uid() is null then
    return;
  end if;

  -- When the assignment RPC is installed, only Owner/Admin or assigned users can read station meters.
  if has_assignment_rpc then
    access_filter := '
      and (
        public.fuel_can_write()
        or exists (
          select 1
          from public.fuel_get_my_station_assignments() assigned
          where assigned.station_id::uuid = p.station_id
        )
      )';
  end if;

  if has_meter_state_rpc and has_meter_baseline_tables then
    return query execute '
      select
        p.id,
        p.station_id,
        fp.code::text as product_type,
        p.pump_label::text as meter_label,
        p.display_order::integer,
        p.is_active,
        coalesce(
          state.latest_closing_meter_reading,
          state.latest_opening_meter_reading,
          baseline.opening_meter_reading
        )::numeric as default_opening_reading,
        case
          when state.latest_closing_meter_reading is not null then coalesce(state.latest_source, ''previous_closing'')::text
          when state.latest_opening_meter_reading is not null then coalesce(state.latest_source, ''baseline'')::text
          when baseline.opening_meter_reading is not null then ''baseline''::text
          else null::text
        end as opening_reading_source,
        true::boolean as opening_reading_editable
      from public.fuel_pumps p
      join public.fuel_pump_product_assignments ppa on ppa.pump_id = p.id
      join public.fuel_products fp on fp.id = ppa.product_id
      left join public.fuel_get_station_pump_meter_state($1) state on state.pump_id = p.id
      left join lateral (
        select mb.opening_meter_reading
        from public.fuel_station_meter_baselines mb
        join public.fuel_station_fuel_baselines b on b.id = mb.baseline_id
        where mb.station_id = p.station_id
          and upper(mb.product_code_snapshot) = upper(fp.code)
          and (
            mb.pump_id = p.id
            or (mb.pump_id is null and btrim(mb.pump_label_snapshot) = btrim(p.pump_label))
          )
          and b.status = ''finalized''
        order by b.baseline_at desc, mb.created_at desc
        limit 1
      ) baseline on true
      where p.station_id = $1
        and p.is_active = true
        and ppa.is_active = true
        and fp.is_active = true
        and (ppa.effective_to is null or ppa.effective_to > now())'
      || access_filter || '
      order by fp.code, p.display_order, p.pump_label'
    using target_station_id;
    return;
  end if;

  if has_meter_state_rpc then
    return query execute '
      select
        p.id,
        p.station_id,
        fp.code::text as product_type,
        p.pump_label::text as meter_label,
        p.display_order::integer,
        p.is_active,
        coalesce(state.latest_closing_meter_reading, state.latest_opening_meter_reading)::numeric as default_opening_reading,
        case
          when state.latest_closing_meter_reading is not null then coalesce(state.latest_source, ''previous_closing'')::text
          when state.latest_opening_meter_reading is not null then coalesce(state.latest_source, ''baseline'')::text
          else null::text
        end as opening_reading_source,
        true::boolean as opening_reading_editable
      from public.fuel_pumps p
      join public.fuel_pump_product_assignments ppa on ppa.pump_id = p.id
      join public.fuel_products fp on fp.id = ppa.product_id
      left join public.fuel_get_station_pump_meter_state($1) state on state.pump_id = p.id
      where p.station_id = $1
        and p.is_active = true
        and ppa.is_active = true
        and fp.is_active = true
        and (ppa.effective_to is null or ppa.effective_to > now())'
      || access_filter || '
      order by fp.code, p.display_order, p.pump_label'
    using target_station_id;
    return;
  end if;

  if has_meter_baseline_tables then
    return query execute '
      select
        p.id,
        p.station_id,
        fp.code::text as product_type,
        p.pump_label::text as meter_label,
        p.display_order::integer,
        p.is_active,
        baseline.opening_meter_reading::numeric as default_opening_reading,
        case when baseline.opening_meter_reading is not null then ''baseline''::text else null::text end as opening_reading_source,
        true::boolean as opening_reading_editable
      from public.fuel_pumps p
      join public.fuel_pump_product_assignments ppa on ppa.pump_id = p.id
      join public.fuel_products fp on fp.id = ppa.product_id
      left join lateral (
        select mb.opening_meter_reading
        from public.fuel_station_meter_baselines mb
        join public.fuel_station_fuel_baselines b on b.id = mb.baseline_id
        where mb.station_id = p.station_id
          and upper(mb.product_code_snapshot) = upper(fp.code)
          and (
            mb.pump_id = p.id
            or (mb.pump_id is null and btrim(mb.pump_label_snapshot) = btrim(p.pump_label))
          )
          and b.status = ''finalized''
        order by b.baseline_at desc, mb.created_at desc
        limit 1
      ) baseline on true
      where p.station_id = $1
        and p.is_active = true
        and ppa.is_active = true
        and fp.is_active = true
        and (ppa.effective_to is null or ppa.effective_to > now())'
      || access_filter || '
      order by fp.code, p.display_order, p.pump_label'
    using target_station_id;
    return;
  end if;

  return query execute '
    select
      p.id,
      p.station_id,
      fp.code::text as product_type,
      p.pump_label::text as meter_label,
      p.display_order::integer,
      p.is_active,
      null::numeric as default_opening_reading,
      null::text as opening_reading_source,
      true::boolean as opening_reading_editable
    from public.fuel_pumps p
    join public.fuel_pump_product_assignments ppa on ppa.pump_id = p.id
    join public.fuel_products fp on fp.id = ppa.product_id
    where p.station_id = $1
      and p.is_active = true
      and ppa.is_active = true
      and fp.is_active = true
      and (ppa.effective_to is null or ppa.effective_to > now())'
    || access_filter || '
    order by fp.code, p.display_order, p.pump_label'
  using target_station_id;
end;
$$;

grant execute on function public.fuel_get_station_meters(uuid) to authenticated;

-- Refresh Supabase/PostgREST schema cache so Expo receives the new RPC signature.
select pg_notify('pgrst', 'reload schema');

-- Manual SQL test after applying this migration:
-- select *
-- from public.fuel_get_station_meters(
--   (select id from public.fuel_stations where code = 'AKY_BORACAY_GAS' limit 1)
-- );
