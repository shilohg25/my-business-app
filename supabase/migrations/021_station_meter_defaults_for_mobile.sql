-- Adds default opening reading support for the Expo mobile Meter Readings screen.
-- This updates public.fuel_get_station_meters(target_station_id uuid) so mobile can
-- load station meter configuration plus an optional default opening reading.

create or replace function public.fuel_get_station_meters(target_station_id uuid)
returns table (
  id uuid,
  station_id uuid,
  product_type text,
  meter_label text,
  display_order integer,
  is_active boolean,
  default_opening_reading numeric,
  default_opening_source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if target_station_id is null then
    raise exception 'target_station_id is required';
  end if;

  if not public.fuel_user_can_access_station(target_station_id) then
    raise exception 'Not allowed to view station meters';
  end if;

  return query
  with meter_rows as (
    select
      m.id,
      m.station_id,
      m.product_type,
      m.meter_label,
      m.display_order,
      m.is_active,
      lower(trim(m.meter_label)) as meter_label_key,
      public.fuel_normalize_product_code(m.product_type) as product_code_normalized
    from public.fuel_station_meters m
    where m.station_id = target_station_id
      and m.is_active = true
  ),
  latest_previous_closing as (
    select distinct on (mr.id)
      mr.id as meter_id,
      fm.after_reading as default_opening_reading,
      'previous_closing_shift_report'::text as default_opening_source,
      fsr.report_date::timestamptz as reading_anchor_at
    from meter_rows mr
    join public.fuel_shift_reports fsr
      on fsr.station_id = mr.station_id
     and fsr.archived_at is null
     and fsr.status in ('submitted', 'reviewed', 'approved')
    join public.fuel_meter_readings fm
      on fm.shift_report_id = fsr.id
     and lower(trim(fm.pump_label_snapshot)) = mr.meter_label_key
     and public.fuel_normalize_product_code(fm.product_code_snapshot) = mr.product_code_normalized
    where fm.after_reading is not null
    order by mr.id, fsr.report_date desc, fm.created_at desc
  ),
  latest_configured_opening as (
    select distinct on (mr.id)
      mr.id as meter_id,
      smb.opening_meter_reading as default_opening_reading,
      'configured_opening_baseline'::text as default_opening_source,
      coalesce(sfb.finalized_at, sfb.baseline_at, smb.created_at)::timestamptz as reading_anchor_at
    from meter_rows mr
    join public.fuel_station_meter_baselines smb
      on smb.station_id = mr.station_id
     and lower(trim(smb.pump_label_snapshot)) = mr.meter_label_key
     and public.fuel_normalize_product_code(smb.product_code_snapshot) = mr.product_code_normalized
    left join public.fuel_station_fuel_baselines sfb
      on sfb.id = smb.baseline_id
    where coalesce(sfb.status, 'finalized') = 'finalized'
      and smb.opening_meter_reading is not null
    order by mr.id, coalesce(sfb.finalized_at, sfb.baseline_at, smb.created_at) desc
  )
  select
    mr.id,
    mr.station_id,
    mr.product_type,
    mr.meter_label,
    mr.display_order,
    mr.is_active,
    case
      when lc.default_opening_reading is null and lo.default_opening_reading is null then null
      when lc.default_opening_reading is null then lo.default_opening_reading
      when lo.default_opening_reading is null then lc.default_opening_reading
      when lc.reading_anchor_at >= lo.reading_anchor_at then lc.default_opening_reading
      else lo.default_opening_reading
    end as default_opening_reading,
    case
      when lc.default_opening_reading is null and lo.default_opening_reading is null then null
      when lc.default_opening_reading is null then lo.default_opening_source
      when lo.default_opening_reading is null then lc.default_opening_source
      when lc.reading_anchor_at >= lo.reading_anchor_at then lc.default_opening_source
      else lo.default_opening_source
    end as default_opening_source
  from meter_rows mr
  left join latest_previous_closing lo on lo.meter_id = mr.id
  left join latest_configured_opening lc on lc.meter_id = mr.id
  order by mr.product_type asc, mr.display_order asc, mr.meter_label asc;
end;
$$;

revoke all on function public.fuel_get_station_meters(uuid) from anon;
grant execute on function public.fuel_get_station_meters(uuid) to authenticated;

-- SQL Editor quick test for mobile RPC payload:
-- select *
-- from public.fuel_get_station_meters('00000000-0000-0000-0000-000000000000'::uuid)
-- order by product_type, display_order, meter_label;
