create table if not exists public.fuel_pump_meter_reading_events (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id),
  pump_id uuid not null references public.fuel_pumps(id),
  product_id uuid references public.fuel_products(id),
  product_code_snapshot text not null,
  reading_date date not null default current_date,
  reading_at timestamptz not null default now(),
  shift_report_id uuid references public.fuel_shift_reports(id),
  capture_session_id uuid references public.fuel_shift_capture_sessions(id),
  source text not null check (source in ('baseline','web','mobile','shift_report','import','adjustment')),
  opening_meter_reading numeric not null,
  closing_meter_reading numeric not null,
  liters_out numeric generated always as (closing_meter_reading - opening_meter_reading) stored,
  entered_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (pump_id, reading_at, source)
);

create index if not exists idx_fuel_pump_meter_events_station_reading_at on public.fuel_pump_meter_reading_events(station_id, reading_at desc);
create index if not exists idx_fuel_pump_meter_events_pump_reading_at on public.fuel_pump_meter_reading_events(pump_id, reading_at desc);
create index if not exists idx_fuel_pump_meter_events_product_code on public.fuel_pump_meter_reading_events(product_code_snapshot);
create index if not exists idx_fuel_pump_meter_events_shift_report on public.fuel_pump_meter_reading_events(shift_report_id);
create index if not exists idx_fuel_pump_meter_events_capture_session on public.fuel_pump_meter_reading_events(capture_session_id);

create or replace function public.fuel_get_station_pump_meter_state(station_id uuid)
returns table (
  pump_id uuid,
  station_id uuid,
  pump_label text,
  product_id uuid,
  product_code text,
  product_name text,
  latest_opening_meter_reading numeric,
  latest_closing_meter_reading numeric,
  latest_reading_at timestamptz,
  latest_source text
)
language sql
security definer
set search_path = public
as $$
with active_pumps as (
  select p.id as pump_id, p.station_id, p.pump_label, a.product_id
  from public.fuel_pumps p
  left join lateral (
    select product_id from public.fuel_pump_product_assignments pa
    where pa.pump_id = p.id and pa.is_active = true and pa.effective_to is null
    order by pa.effective_from desc
    limit 1
  ) a on true
  where p.station_id = fuel_get_station_pump_meter_state.station_id and p.is_active = true
), latest_event as (
  select distinct on (e.pump_id) e.pump_id, e.opening_meter_reading, e.closing_meter_reading, e.reading_at, e.source
  from public.fuel_pump_meter_reading_events e
  where e.station_id = fuel_get_station_pump_meter_state.station_id
  order by e.pump_id, e.reading_at desc, e.created_at desc
), latest_baseline as (
  select distinct on (b.pump_id) b.pump_id, b.opening_meter_reading, fb.baseline_at
  from public.fuel_station_meter_baselines b
  join public.fuel_station_fuel_baselines fb on fb.id = b.baseline_id and fb.status='finalized'
  where b.station_id = fuel_get_station_pump_meter_state.station_id
  order by b.pump_id, fb.baseline_at desc, b.created_at desc
)
select ap.pump_id, ap.station_id, ap.pump_label, ap.product_id, fp.code, fp.name,
  coalesce(le.opening_meter_reading, lb.opening_meter_reading) as latest_opening_meter_reading,
  coalesce(le.closing_meter_reading, lb.opening_meter_reading) as latest_closing_meter_reading,
  coalesce(le.reading_at, lb.baseline_at) as latest_reading_at,
  coalesce(le.source, case when lb.pump_id is not null then 'baseline' else null end) as latest_source
from active_pumps ap
left join public.fuel_products fp on fp.id = ap.product_id
left join latest_event le on le.pump_id = ap.pump_id
left join latest_baseline lb on lb.pump_id = ap.pump_id
order by case fp.code when 'DIESEL' then 1 when 'SPECIAL' then 2 when 'UNLEADED' then 3 else 4 end, ap.pump_label;
$$;

grant execute on function public.fuel_get_station_pump_meter_state(uuid) to authenticated;

create or replace function public.fuel_record_pump_meter_readings(payload jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  role_value text := public.fuel_current_role();
  station_id_value uuid := nullif(payload->>'station_id','')::uuid;
  reading_date_value date := coalesce(nullif(payload->>'reading_date','')::date, current_date);
  reading_at_value timestamptz := coalesce(nullif(payload->>'reading_at','')::timestamptz, now());
  source_value text := lower(trim(coalesce(payload->>'source','web')));
  row_reading record;
  opening_value numeric;
  latest_event record;
  baseline_value record;
  inserted_id uuid;
  ids uuid[] := '{}'::uuid[];
  pump_label_value text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if station_id_value is null then raise exception 'station_id is required'; end if;
  if not public.fuel_user_can_access_station(station_id_value) then raise exception 'Not allowed to submit readings for this station'; end if;
  if source_value = 'adjustment' and role_value not in ('Owner','Admin') then raise exception 'Only Owner/Admin can submit adjustments'; end if;

  for row_reading in select * from jsonb_to_recordset(coalesce(payload->'readings','[]'::jsonb)) as x(pump_id uuid, closing_meter_reading numeric, notes text)
  loop
    select p.pump_label into pump_label_value from public.fuel_pumps p where p.id = row_reading.pump_id and p.station_id = station_id_value;
    if pump_label_value is null then raise exception 'Pump not found for station'; end if;

    select e.* into latest_event from public.fuel_pump_meter_reading_events e where e.pump_id = row_reading.pump_id order by e.reading_at desc, e.created_at desc limit 1;
    if latest_event.id is not null then
      opening_value := latest_event.closing_meter_reading;
    else
      select b.opening_meter_reading, b.product_id, b.product_code_snapshot into baseline_value
      from public.fuel_station_meter_baselines b
      join public.fuel_station_fuel_baselines fb on fb.id = b.baseline_id and fb.status = 'finalized'
      where b.station_id = station_id_value and b.pump_id = row_reading.pump_id
      order by fb.baseline_at desc, b.created_at desc
      limit 1;
      if baseline_value.opening_meter_reading is null then
        raise exception 'No opening meter reading found for pump %. Create and finalize a baseline first.', pump_label_value;
      end if;
      opening_value := baseline_value.opening_meter_reading;
    end if;

    if row_reading.closing_meter_reading < opening_value and source_value <> 'adjustment' then
      raise exception 'closing_meter_reading cannot be less than opening_meter_reading for pump %', pump_label_value;
    end if;

    insert into public.fuel_pump_meter_reading_events(station_id,pump_id,product_id,product_code_snapshot,reading_date,reading_at,shift_report_id,capture_session_id,source,opening_meter_reading,closing_meter_reading,entered_by,notes)
    select station_id_value, p.id, a.product_id, fp.code, reading_date_value, reading_at_value,
      nullif(payload->>'shift_report_id','')::uuid, nullif(payload->>'capture_session_id','')::uuid, source_value,
      opening_value, row_reading.closing_meter_reading, actor_id, nullif(row_reading.notes,'')
    from public.fuel_pumps p
    left join lateral (select product_id from public.fuel_pump_product_assignments pa where pa.pump_id=p.id and pa.is_active=true and pa.effective_to is null order by pa.effective_from desc limit 1) a on true
    left join public.fuel_products fp on fp.id = a.product_id
    where p.id = row_reading.pump_id
    returning id into inserted_id;

    ids := array_append(ids, inserted_id);
  end loop;

  return ids;
end;
$$;
grant execute on function public.fuel_record_pump_meter_readings(jsonb) to authenticated;
