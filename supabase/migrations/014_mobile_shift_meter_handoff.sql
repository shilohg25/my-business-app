-- Mobile shift meter handoff: previous closing readings become suggested opening readings.

create table if not exists public.fuel_shift_capture_handoffs (
  id uuid primary key default gen_random_uuid(),
  capture_session_id uuid not null references public.fuel_shift_capture_sessions(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id),
  source_session_id uuid references public.fuel_shift_capture_sessions(id),
  source_shift_report_id uuid references public.fuel_shift_reports(id),
  pump_id uuid references public.fuel_pumps(id),
  pump_label_snapshot text not null,
  product_code_snapshot text not null,
  nozzle_label text,
  suggested_opening_reading numeric(14,4) not null,
  confirmed_opening_reading numeric(14,4) not null,
  variance_from_suggested numeric(14,4) generated always as (confirmed_opening_reading - suggested_opening_reading) stored,
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_fuel_shift_capture_handoffs_capture_session
on public.fuel_shift_capture_handoffs(capture_session_id);

create index if not exists idx_fuel_shift_capture_handoffs_station_created
on public.fuel_shift_capture_handoffs(station_id, created_at desc);

create index if not exists idx_fuel_shift_capture_handoffs_source_session
on public.fuel_shift_capture_handoffs(source_session_id);

create index if not exists idx_fuel_shift_capture_handoffs_source_shift_report
on public.fuel_shift_capture_handoffs(source_shift_report_id);

alter table public.fuel_shift_capture_handoffs enable row level security;

revoke all on table public.fuel_shift_capture_handoffs from anon;
grant select, insert on table public.fuel_shift_capture_handoffs to authenticated;

drop policy if exists fuel_shift_capture_handoffs_read on public.fuel_shift_capture_handoffs;
create policy fuel_shift_capture_handoffs_read on public.fuel_shift_capture_handoffs
for select using (public.fuel_can_read());

drop policy if exists fuel_shift_capture_handoffs_insert on public.fuel_shift_capture_handoffs;
create policy fuel_shift_capture_handoffs_insert on public.fuel_shift_capture_handoffs
for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.fuel_shift_capture_sessions s
    where s.id = capture_session_id
      and s.status = 'draft'
      and (s.opened_by = auth.uid() or public.fuel_can_write())
  )
);

create or replace view public.fuel_latest_meter_handoff_readings as
with capture_rows as (
  select
    s.station_id,
    'field_capture'::text as source_type,
    s.id as source_session_id,
    null::uuid as source_shift_report_id,
    s.report_date as source_report_date,
    s.shift_label as source_shift_label,
    s.created_at as source_created_at,
    nullif(trim(coalesce(meter_row->>'pump_id', '')), '')::uuid as pump_id,
    coalesce(nullif(trim(meter_row->>'pump_label'), ''), nullif(trim(meter_row->>'pump_label_snapshot'), ''), 'Unknown Pump') as pump_label_snapshot,
    coalesce(nullif(trim(meter_row->>'product_code'), ''), nullif(trim(meter_row->>'product'), ''), 'OTHER') as product_code_snapshot,
    public.fuel_normalize_product_code(coalesce(nullif(trim(meter_row->>'product_code'), ''), nullif(trim(meter_row->>'product'), ''), 'OTHER')) as product_code_normalized,
    nullif(trim(coalesce(meter_row->>'nozzle_label', '')), '') as nozzle_label,
    coalesce(nullif(meter_row->>'closing_reading', '')::numeric, nullif(meter_row->>'after_reading', '')::numeric) as closing_meter_reading,
    case when s.status = 'ready_for_review' then 1 else 2 end as source_priority
  from public.fuel_shift_capture_sessions s
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.draft_payload->'meter_readings') = 'array' then s.draft_payload->'meter_readings' else '[]'::jsonb end) meter_row
  where s.status in ('ready_for_review', 'published')
),
report_rows as (
  select
    r.station_id,
    'final_shift_report'::text as source_type,
    null::uuid as source_session_id,
    r.id as source_shift_report_id,
    r.report_date as source_report_date,
    r.shift_time_label as source_shift_label,
    r.created_at as source_created_at,
    m.pump_id,
    m.pump_label_snapshot,
    m.product_code_snapshot,
    public.fuel_normalize_product_code(m.product_code_snapshot) as product_code_normalized,
    null::text as nozzle_label,
    m.after_reading as closing_meter_reading,
    3 as source_priority
  from public.fuel_shift_reports r
  join public.fuel_meter_readings m on m.shift_report_id = r.id
  where r.archived_at is null
    and r.status in ('submitted', 'reviewed', 'approved')
    and m.after_reading is not null
),
all_rows as (
  select * from capture_rows where closing_meter_reading is not null
  union all
  select * from report_rows
)
select
  station_id,
  source_type,
  source_session_id,
  source_shift_report_id,
  source_report_date,
  source_shift_label,
  source_created_at,
  pump_id,
  pump_label_snapshot,
  product_code_snapshot,
  product_code_normalized,
  nozzle_label,
  closing_meter_reading,
  row_number() over (
    partition by station_id, coalesce(pump_id::text, pump_label_snapshot), product_code_normalized, coalesce(nozzle_label, '')
    order by source_priority asc, source_report_date desc, source_created_at desc
  )::int as row_rank
from all_rows;

grant select on public.fuel_latest_meter_handoff_readings to authenticated;
revoke all on public.fuel_latest_meter_handoff_readings from anon;

create or replace function public.fuel_get_latest_meter_handoff(station_id uuid)
returns table (
  station_id uuid,
  source_type text,
  source_session_id uuid,
  source_shift_report_id uuid,
  source_report_date date,
  source_shift_label text,
  pump_id uuid,
  pump_label_snapshot text,
  product_code_snapshot text,
  product_code_normalized text,
  nozzle_label text,
  closing_meter_reading numeric
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

  if not public.fuel_can_read() then
    raise exception 'Not allowed to read fuel operations';
  end if;

  if station_id is null then
    raise exception 'station_id is required';
  end if;

  if not exists (select 1 from public.fuel_stations s where s.id = station_id) then
    raise exception 'Station not found';
  end if;

  return query
  select
    v.station_id,
    v.source_type,
    v.source_session_id,
    v.source_shift_report_id,
    v.source_report_date,
    v.source_shift_label,
    v.pump_id,
    v.pump_label_snapshot,
    v.product_code_snapshot,
    v.product_code_normalized,
    v.nozzle_label,
    v.closing_meter_reading
  from public.fuel_latest_meter_handoff_readings v
  where v.station_id = fuel_get_latest_meter_handoff.station_id
    and v.row_rank = 1
  order by v.product_code_normalized, v.pump_label_snapshot, v.nozzle_label;
end;
$$;

create or replace function public.fuel_confirm_shift_handoff(
  capture_session_id uuid,
  handoff_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.fuel_shift_capture_sessions%rowtype;
  row_item jsonb;
  meter_row jsonb;
  existing_meter_readings jsonb := '[]'::jsonb;
  merged_meter_readings jsonb := '[]'::jsonb;
  found_match boolean;

  row_source_session_id uuid;
  row_source_shift_report_id uuid;
  row_pump_id uuid;
  row_pump_label text;
  row_product_code text;
  row_nozzle text;
  row_suggested numeric;
  row_confirmed numeric;
  row_notes text;

  meter_pump_id uuid;
  meter_pump_label text;
  meter_product text;
  meter_nozzle text;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if capture_session_id is null then
    raise exception 'capture_session_id is required';
  end if;

  if jsonb_typeof(handoff_rows) <> 'array' or jsonb_array_length(handoff_rows) = 0 then
    raise exception 'handoff_rows must be a non-empty array';
  end if;

  select * into session_row
  from public.fuel_shift_capture_sessions s
  where s.id = capture_session_id
  for update;

  if session_row.id is null then
    raise exception 'Capture session not found';
  end if;

  if session_row.status <> 'draft' then
    raise exception 'Only draft sessions can confirm handoff readings';
  end if;

  if session_row.opened_by <> actor_id and not public.fuel_can_write() then
    raise exception 'Not allowed to confirm this draft handoff';
  end if;

  existing_meter_readings := case
    when jsonb_typeof(session_row.draft_payload->'meter_readings') = 'array' then session_row.draft_payload->'meter_readings'
    else '[]'::jsonb
  end;

  for row_item in select value from jsonb_array_elements(handoff_rows)
  loop
    row_source_session_id := nullif(trim(coalesce(row_item->>'source_session_id', '')), '')::uuid;
    row_source_shift_report_id := nullif(trim(coalesce(row_item->>'source_shift_report_id', '')), '')::uuid;
    row_pump_id := nullif(trim(coalesce(row_item->>'pump_id', '')), '')::uuid;
    row_pump_label := coalesce(nullif(trim(row_item->>'pump_label'), ''), 'Unknown Pump');
    row_product_code := public.fuel_normalize_product_code(coalesce(nullif(trim(row_item->>'product_code'), ''), 'OTHER'));
    row_nozzle := nullif(trim(coalesce(row_item->>'nozzle_label', '')), '');
    row_suggested := coalesce(nullif(row_item->>'suggested_opening_reading', '')::numeric, 0);
    row_confirmed := nullif(row_item->>'confirmed_opening_reading', '')::numeric;
    row_notes := nullif(trim(coalesce(row_item->>'notes', '')), '');

    if row_confirmed is null or row_confirmed < 0 then
      raise exception 'confirmed_opening_reading is required and must be >= 0';
    end if;

    insert into public.fuel_shift_capture_handoffs (
      capture_session_id,
      station_id,
      source_session_id,
      source_shift_report_id,
      pump_id,
      pump_label_snapshot,
      product_code_snapshot,
      nozzle_label,
      suggested_opening_reading,
      confirmed_opening_reading,
      confirmed_by,
      notes
    ) values (
      session_row.id,
      session_row.station_id,
      row_source_session_id,
      row_source_shift_report_id,
      row_pump_id,
      row_pump_label,
      row_product_code,
      row_nozzle,
      row_suggested,
      row_confirmed,
      actor_id,
      row_notes
    );

    found_match := false;
    merged_meter_readings := '[]'::jsonb;

    for meter_row in select value from jsonb_array_elements(existing_meter_readings)
    loop
      meter_pump_id := nullif(trim(coalesce(meter_row->>'pump_id', '')), '')::uuid;
      meter_pump_label := coalesce(nullif(trim(meter_row->>'pump_label'), ''), nullif(trim(meter_row->>'pump_label_snapshot'), ''), '');
      meter_product := public.fuel_normalize_product_code(coalesce(nullif(trim(meter_row->>'product_code'), ''), nullif(trim(meter_row->>'product'), ''), 'OTHER'));
      meter_nozzle := nullif(trim(coalesce(meter_row->>'nozzle_label', '')), '');

      if (
        (
          (row_pump_id is not null and meter_pump_id = row_pump_id)
          or (row_pump_id is null and meter_pump_id is null and lower(meter_pump_label) = lower(row_pump_label))
        )
        and meter_product = row_product_code
        and coalesce(lower(meter_nozzle), '') = coalesce(lower(row_nozzle), '')
      ) then
        meter_row := jsonb_set(meter_row, '{opening_reading}', to_jsonb(row_confirmed), true);
        meter_row := jsonb_set(meter_row, '{before_reading}', to_jsonb(row_confirmed), true);
        meter_row := jsonb_set(meter_row, '{pump_label}', to_jsonb(row_pump_label), true);
        meter_row := jsonb_set(meter_row, '{product_code}', to_jsonb(row_product_code), true);
        meter_row := jsonb_set(meter_row, '{handoff_confirmed}', 'true'::jsonb, true);
        found_match := true;
      end if;

      merged_meter_readings := merged_meter_readings || jsonb_build_array(meter_row);
    end loop;

    if not found_match then
      merged_meter_readings := merged_meter_readings || jsonb_build_array(
        jsonb_build_object(
          'pump_id', row_pump_id,
          'pump_label', row_pump_label,
          'product_code', row_product_code,
          'product', row_product_code,
          'nozzle_label', row_nozzle,
          'opening_reading', row_confirmed,
          'before_reading', row_confirmed,
          'closing_reading', null,
          'calibration_liters', 0,
          'handoff_confirmed', true
        )
      );
    end if;

    existing_meter_readings := merged_meter_readings;
  end loop;

  update public.fuel_shift_capture_sessions
  set
    draft_payload = jsonb_set(coalesce(draft_payload, '{}'::jsonb), '{meter_readings}', existing_meter_readings, true),
    opening_confirmed_by = actor_id,
    opening_confirmed_at = now(),
    updated_at = now()
  where id = session_row.id;

  insert into public.fuel_shift_capture_events(capture_session_id, station_id, actor_id, event_type, event_payload)
  values (
    session_row.id,
    session_row.station_id,
    actor_id,
    'handoff_confirmed',
    jsonb_build_object('handoff_count', jsonb_array_length(handoff_rows))
  );

  return session_row.id;
end;
$$;

grant execute on function public.fuel_get_latest_meter_handoff(uuid) to authenticated;
grant execute on function public.fuel_confirm_shift_handoff(uuid, jsonb) to authenticated;

create or replace function public.fuel_shift_report_append_handoff_warning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  capture_session_id_value uuid := nullif(coalesce(new.calculated_totals->>'source_capture_session_id', ''), '')::uuid;
  warning_text text := 'Opening meter handoff was not confirmed.';
  warnings jsonb := '[]'::jsonb;
begin
  if capture_session_id_value is null then
    return new;
  end if;

  if exists (
    select 1
    from public.fuel_shift_capture_handoffs h
    where h.capture_session_id = capture_session_id_value
  ) then
    return new;
  end if;

  if jsonb_typeof(new.calculated_totals->'publish_warnings') = 'array' then
    warnings := new.calculated_totals->'publish_warnings';
  end if;

  if not (warnings @> to_jsonb(array[warning_text])) then
    warnings := warnings || to_jsonb(warning_text);
  end if;

  new.calculated_totals := jsonb_set(coalesce(new.calculated_totals, '{}'::jsonb), '{publish_warnings}', warnings, true);
  return new;
end;
$$;

drop trigger if exists trg_fuel_shift_report_append_handoff_warning on public.fuel_shift_reports;
create trigger trg_fuel_shift_report_append_handoff_warning
before insert or update on public.fuel_shift_reports
for each row execute function public.fuel_shift_report_append_handoff_warning();

notify pgrst, 'reload schema';
