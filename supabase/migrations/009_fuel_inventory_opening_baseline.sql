-- Station-level fuel opening baseline workflow.

create table if not exists public.fuel_station_fuel_baselines (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id),
  baseline_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'voided')),
  notes text,
  finalized_by uuid references auth.users(id),
  finalized_at timestamptz,
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  void_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_fuel_station_fuel_baselines_one_finalized
on public.fuel_station_fuel_baselines(station_id)
where status = 'finalized';

create table if not exists public.fuel_station_fuel_baseline_products (
  id uuid primary key default gen_random_uuid(),
  baseline_id uuid not null references public.fuel_station_fuel_baselines(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id),
  product_id uuid references public.fuel_products(id),
  product_code_snapshot text not null,
  opening_liters numeric not null default 0,
  tank_id uuid references public.fuel_tanks(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (baseline_id, product_code_snapshot)
);

create table if not exists public.fuel_station_meter_baselines (
  id uuid primary key default gen_random_uuid(),
  baseline_id uuid not null references public.fuel_station_fuel_baselines(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id),
  pump_id uuid references public.fuel_pumps(id),
  pump_label_snapshot text not null,
  product_id uuid references public.fuel_products(id),
  product_code_snapshot text not null,
  nozzle_label text,
  opening_meter_reading numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_fuel_station_meter_baselines_unique_row
on public.fuel_station_meter_baselines(baseline_id, pump_label_snapshot, product_code_snapshot, coalesce(nozzle_label, ''));

alter table public.fuel_station_fuel_baselines enable row level security;
alter table public.fuel_station_fuel_baseline_products enable row level security;
alter table public.fuel_station_meter_baselines enable row level security;

revoke all on public.fuel_station_fuel_baselines from anon;
revoke all on public.fuel_station_fuel_baseline_products from anon;
revoke all on public.fuel_station_meter_baselines from anon;

grant select on public.fuel_station_fuel_baselines to authenticated;
grant select on public.fuel_station_fuel_baseline_products to authenticated;
grant select on public.fuel_station_meter_baselines to authenticated;
grant insert, update on public.fuel_station_fuel_baselines to authenticated;
grant insert, update on public.fuel_station_fuel_baseline_products to authenticated;
grant insert, update on public.fuel_station_meter_baselines to authenticated;

drop policy if exists fuel_station_fuel_baselines_read on public.fuel_station_fuel_baselines;
create policy fuel_station_fuel_baselines_read on public.fuel_station_fuel_baselines
for select using (public.fuel_can_read());
drop policy if exists fuel_station_fuel_baselines_write on public.fuel_station_fuel_baselines;
create policy fuel_station_fuel_baselines_write on public.fuel_station_fuel_baselines
for all using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_station_fuel_baseline_products_read on public.fuel_station_fuel_baseline_products;
create policy fuel_station_fuel_baseline_products_read on public.fuel_station_fuel_baseline_products
for select using (public.fuel_can_read());
drop policy if exists fuel_station_fuel_baseline_products_write on public.fuel_station_fuel_baseline_products;
create policy fuel_station_fuel_baseline_products_write on public.fuel_station_fuel_baseline_products
for all using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_station_meter_baselines_read on public.fuel_station_meter_baselines;
create policy fuel_station_meter_baselines_read on public.fuel_station_meter_baselines
for select using (public.fuel_can_read());
drop policy if exists fuel_station_meter_baselines_write on public.fuel_station_meter_baselines;
create policy fuel_station_meter_baselines_write on public.fuel_station_meter_baselines
for all using (public.fuel_can_write()) with check (public.fuel_can_write());

drop trigger if exists trg_fuel_station_fuel_baselines_updated_at on public.fuel_station_fuel_baselines;
create trigger trg_fuel_station_fuel_baselines_updated_at
before update on public.fuel_station_fuel_baselines
for each row execute function public.touch_updated_at();

create or replace function public.fuel_normalize_product_code(input_code text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text := upper(trim(coalesce(input_code, '')));
begin
  if normalized in ('ADO', 'DIESEL') then return 'DIESEL'; end if;
  if normalized in ('SPU', 'SPECIAL') then return 'SPECIAL'; end if;
  if normalized in ('ULG', 'UNLEADED') then return 'UNLEADED'; end if;
  return normalized;
end;
$$;

create or replace function public.fuel_create_fuel_opening_baseline(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_id_value uuid := nullif(payload->>'station_id', '')::uuid;
  baseline_at_value timestamptz := coalesce(nullif(payload->>'baseline_at', '')::timestamptz, now());
  allow_replace_value boolean := coalesce((payload->>'allow_replace')::boolean, false);
  allow_partial_value boolean := coalesce((payload->>'allow_partial')::boolean, false);
  baseline_id_value uuid;
  has_finalized boolean := false;
  row_product record;
  row_meter record;
  normalized_code text;
  product_id_value uuid;
  tank_id_value uuid;
  pump_id_value uuid;
  present_codes text[] := '{}'::text[];
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_can_write() then raise exception 'Not allowed to write fuel baseline'; end if;
  if station_id_value is null then raise exception 'station_id is required'; end if;
  if not exists(select 1 from public.fuel_stations where id = station_id_value) then raise exception 'Station not found'; end if;

  select exists(select 1 from public.fuel_station_fuel_baselines where station_id = station_id_value and status = 'finalized') into has_finalized;
  if has_finalized and not (public.fuel_is_owner() and allow_replace_value) then
    raise exception 'Station already has finalized baseline';
  end if;

  insert into public.fuel_station_fuel_baselines(station_id, baseline_at, status, notes, created_by)
  values (station_id_value, baseline_at_value, 'draft', nullif(payload->>'notes', ''), actor_id)
  returning id into baseline_id_value;

  for row_product in
    select * from jsonb_to_recordset(coalesce(payload->'products', '[]'::jsonb)) as x(product_code text, opening_liters numeric, tank_label text, notes text)
  loop
    normalized_code := public.fuel_normalize_product_code(row_product.product_code);
    if normalized_code = '' then continue; end if;

    insert into public.fuel_products(code, name, unit, is_fuel, is_active)
    values (normalized_code, initcap(normalized_code), 'liter', true, true)
    on conflict (code) do nothing;

    select id into product_id_value from public.fuel_products where code = normalized_code limit 1;

    if product_id_value is not null then
      insert into public.fuel_station_products(station_id, product_id, is_active)
      values (station_id_value, product_id_value, true)
      on conflict (station_id, product_id) do nothing;
    end if;

    tank_id_value := null;
    if nullif(trim(coalesce(row_product.tank_label, '')), '') is not null then
      insert into public.fuel_tanks(station_id, product_id, product_code_snapshot, tank_label, is_active, created_by)
      values (station_id_value, product_id_value, normalized_code, trim(row_product.tank_label), true, actor_id)
      on conflict (station_id, tank_label)
      do update set product_id = excluded.product_id, product_code_snapshot = excluded.product_code_snapshot, is_active = true, updated_at = now();

      select id into tank_id_value from public.fuel_tanks where station_id = station_id_value and tank_label = trim(row_product.tank_label) limit 1;
    else
      select id into tank_id_value from public.fuel_tanks where station_id = station_id_value and product_code_snapshot = normalized_code and is_active = true order by created_at asc limit 1;
    end if;

    insert into public.fuel_station_fuel_baseline_products(baseline_id, station_id, product_id, product_code_snapshot, opening_liters, tank_id, notes)
    values (baseline_id_value, station_id_value, product_id_value, normalized_code, coalesce(row_product.opening_liters, 0), tank_id_value, nullif(row_product.notes, ''))
    on conflict (baseline_id, product_code_snapshot)
    do update set opening_liters = excluded.opening_liters, tank_id = excluded.tank_id, notes = excluded.notes;

    present_codes := array_append(present_codes, normalized_code);
  end loop;

  if not allow_partial_value then
    if not ('DIESEL' = any(present_codes) and 'SPECIAL' = any(present_codes) and 'UNLEADED' = any(present_codes)) then
      raise exception 'Diesel, Special, and Unleaded opening rows are required';
    end if;
  end if;

  for row_meter in
    select * from jsonb_to_recordset(coalesce(payload->'meters', '[]'::jsonb)) as x(pump_id uuid, pump_label text, product_code text, nozzle_label text, opening_meter_reading numeric, notes text)
  loop
    normalized_code := public.fuel_normalize_product_code(row_meter.product_code);
    if nullif(trim(coalesce(row_meter.pump_label, '')), '') is null then
      raise exception 'pump_label is required for meter baseline rows';
    end if;

    select id into product_id_value from public.fuel_products where code = normalized_code limit 1;
    pump_id_value := row_meter.pump_id;
    if pump_id_value is null then
      select id into pump_id_value from public.fuel_pumps where station_id = station_id_value and pump_label = trim(row_meter.pump_label) and is_active = true limit 1;
    end if;

    insert into public.fuel_station_meter_baselines(baseline_id, station_id, pump_id, pump_label_snapshot, product_id, product_code_snapshot, nozzle_label, opening_meter_reading, notes)
    values (baseline_id_value, station_id_value, pump_id_value, trim(row_meter.pump_label), product_id_value, normalized_code, nullif(row_meter.nozzle_label, ''), coalesce(row_meter.opening_meter_reading, 0), nullif(row_meter.notes, ''));
  end loop;

  return baseline_id_value;
end;
$$;

grant execute on function public.fuel_create_fuel_opening_baseline(jsonb) to authenticated;

create or replace function public.fuel_finalize_fuel_opening_baseline(p_baseline_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  row_baseline record;
  meter_count int;
  product_codes text[];
  row_product record;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can finalize opening baseline'; end if;

  select * into row_baseline from public.fuel_station_fuel_baselines where id = p_baseline_id;
  if row_baseline.id is null then raise exception 'Baseline not found'; end if;
  if row_baseline.status <> 'draft' then raise exception 'Baseline must be draft'; end if;

  select array_agg(product_code_snapshot) into product_codes
  from public.fuel_station_fuel_baseline_products
  where baseline_id = p_baseline_id;

  if not (coalesce(product_codes, '{}'::text[]) @> array['DIESEL','SPECIAL','UNLEADED']) then
    raise exception 'Diesel, Special, and Unleaded product rows are required';
  end if;

  select count(*) into meter_count from public.fuel_station_meter_baselines where baseline_id = p_baseline_id;
  if meter_count <= 0 then raise exception 'At least one meter baseline row is required'; end if;

  if exists(
    select 1 from public.fuel_station_fuel_baselines
    where station_id = row_baseline.station_id
      and status = 'finalized'
      and id <> p_baseline_id
  ) then
    raise exception 'Station already has another finalized baseline';
  end if;

  update public.fuel_station_fuel_baselines
  set status = 'finalized', finalized_by = actor_id, finalized_at = now(), updated_at = now()
  where id = p_baseline_id;

  insert into public.fuel_pump_meter_reading_events(
    station_id,
    pump_id,
    product_id,
    product_code_snapshot,
    reading_date,
    reading_at,
    source,
    opening_meter_reading,
    closing_meter_reading,
    entered_by,
    notes
  )
  select mb.station_id, mb.pump_id, mb.product_id, mb.product_code_snapshot,
    (row_baseline.baseline_at at time zone 'UTC')::date,
    row_baseline.baseline_at,
    'baseline',
    mb.opening_meter_reading,
    mb.opening_meter_reading,
    actor_id,
    'Opening baseline'
  from public.fuel_station_meter_baselines mb
  where mb.baseline_id = p_baseline_id
    and mb.pump_id is not null
    and not exists (
      select 1 from public.fuel_pump_meter_reading_events e
      where e.station_id = mb.station_id
        and e.pump_id = mb.pump_id
        and e.source = 'baseline'
        and e.reading_at = row_baseline.baseline_at
    );

  for row_product in
    select * from public.fuel_station_fuel_baseline_products where baseline_id = p_baseline_id
  loop
    insert into public.fuel_tank_readings(
      station_id,
      tank_id,
      product_id,
      product_code_snapshot,
      reading_date,
      opening_liters,
      received_liters,
      meter_liters_out,
      expected_ending_liters,
      actual_ending_liters,
      variance_liters,
      source,
      created_by,
      notes
    ) values (
      row_baseline.station_id,
      row_product.tank_id,
      row_product.product_id,
      row_product.product_code_snapshot,
      (row_baseline.baseline_at at time zone 'UTC')::date,
      row_product.opening_liters,
      0,
      0,
      row_product.opening_liters,
      row_product.opening_liters,
      0,
      'opening_baseline',
      actor_id,
      'Opening baseline'
    );
  end loop;

  return p_baseline_id;
end;
$$;

grant execute on function public.fuel_finalize_fuel_opening_baseline(uuid) to authenticated;

create or replace function public.fuel_void_fuel_opening_baseline(p_baseline_id uuid, reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  current_status text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can void opening baseline'; end if;
  if nullif(trim(coalesce(reason, '')), '') is null then raise exception 'reason is required'; end if;

  select status into current_status from public.fuel_station_fuel_baselines where id = p_baseline_id;
  if current_status is null then raise exception 'Baseline not found'; end if;
  if current_status not in ('draft', 'finalized') then raise exception 'Only draft or finalized baseline can be voided'; end if;

  update public.fuel_station_fuel_baselines
  set status = 'voided', voided_by = actor_id, voided_at = now(), void_reason = trim(reason), updated_at = now()
  where id = p_baseline_id;

  return p_baseline_id;
end;
$$;

grant execute on function public.fuel_void_fuel_opening_baseline(uuid, text) to authenticated;
