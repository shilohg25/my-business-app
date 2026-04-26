-- Core operations access controls, owner-only management RPCs, and opening baseline hardening.

alter table if exists public.profiles add column if not exists username text;
alter table if exists public.profiles add column if not exists role text;
alter table if exists public.profiles add column if not exists is_active boolean not null default true;
alter table if exists public.profiles add column if not exists must_change_password boolean not null default false;
alter table if exists public.profiles add column if not exists updated_at timestamptz not null default now();

create or replace function public.fuel_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where auth.uid() is not null
    and p.id = auth.uid()
    and p.is_active = true
  limit 1
$$;

create or replace function public.fuel_can_read()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and coalesce(public.fuel_current_role(), '') in ('Owner', 'Co-Owner', 'Admin', 'User')
$$;

create or replace function public.fuel_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and coalesce(public.fuel_current_role(), '') in ('Owner', 'Admin')
$$;

create or replace function public.fuel_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Owner'
        and p.is_active = true
    )
$$;

create or replace function public.fuel_get_current_profile()
returns table (
  id uuid,
  email text,
  username text,
  role text,
  is_active boolean,
  must_change_password boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, au.email::text, p.username, p.role, p.is_active, coalesce(p.must_change_password, false)
  from public.profiles p
  left join auth.users au on au.id = p.id
  where auth.uid() is not null
    and p.id = auth.uid()
    and p.is_active = true
  limit 1
$$;

create table if not exists public.fuel_tanks (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id),
  product_id uuid references public.fuel_products(id),
  product_code_snapshot text not null,
  tank_label text not null,
  capacity_liters numeric,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, tank_label)
);

create table if not exists public.fuel_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_deliveries (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id),
  tank_id uuid references public.fuel_tanks(id),
  product_id uuid references public.fuel_products(id),
  product_code_snapshot text not null,
  supplier_id uuid references public.fuel_suppliers(id),
  delivery_date date not null default current_date,
  invoice_number text,
  delivery_reference text,
  liters numeric not null check (liters > 0),
  unit_cost numeric,
  total_cost numeric generated always as (liters * coalesce(unit_cost, 0)) stored,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_tank_readings (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id),
  tank_id uuid references public.fuel_tanks(id),
  product_id uuid references public.fuel_products(id),
  product_code_snapshot text not null,
  reading_date date not null default current_date,
  opening_liters numeric,
  received_liters numeric not null default 0,
  meter_liters_out numeric not null default 0,
  expected_ending_liters numeric,
  actual_ending_liters numeric,
  variance_liters numeric,
  notes text,
  source text not null default 'manual',
  shift_report_id uuid references public.fuel_shift_reports(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_station_fuel_baselines (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
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
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  product_id uuid references public.fuel_products(id) on delete set null,
  product_code_snapshot text not null,
  opening_liters numeric(14,3) not null default 0,
  tank_id uuid references public.fuel_tanks(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (baseline_id, product_code_snapshot)
);

create table if not exists public.fuel_station_meter_baselines (
  id uuid primary key default gen_random_uuid(),
  baseline_id uuid not null references public.fuel_station_fuel_baselines(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  pump_id uuid references public.fuel_pumps(id) on delete set null,
  pump_label_snapshot text not null,
  product_id uuid references public.fuel_products(id) on delete set null,
  product_code_snapshot text not null,
  nozzle_label text,
  opening_meter_reading numeric(14,3) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_fuel_station_meter_baselines_unique_row
on public.fuel_station_meter_baselines(baseline_id, pump_label_snapshot, product_code_snapshot, coalesce(nozzle_label, ''));

create or replace function public.fuel_normalize_product_code(raw_code text)
returns text
language sql
immutable
as $$
  select case upper(trim(coalesce(raw_code, '')))
    when 'ADO' then 'DIESEL'
    when 'DIESEL' then 'DIESEL'
    when 'SPU' then 'SPECIAL'
    when 'SPECIAL' then 'SPECIAL'
    when 'ULG' then 'UNLEADED'
    when 'UNLEADED' then 'UNLEADED'
    when 'REGULAR' then 'UNLEADED'
    when '' then 'OTHER'
    else upper(trim(raw_code))
  end
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
  row_product record;
  row_meter record;
  normalized_code text;
  product_id_value uuid;
  tank_id_value uuid;
  present_codes text[] := '{}'::text[];
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_can_write() then raise exception 'Not allowed to create baseline'; end if;
  if station_id_value is null then raise exception 'station_id is required'; end if;
  if not exists (select 1 from public.fuel_stations where id = station_id_value) then raise exception 'Station not found'; end if;

  if exists(select 1 from public.fuel_station_fuel_baselines where station_id = station_id_value and status = 'finalized')
     and not (public.fuel_is_owner() and allow_replace_value) then
    raise exception 'Station already has finalized baseline';
  end if;

  insert into public.fuel_station_fuel_baselines(station_id, baseline_at, status, notes, created_by)
  values (station_id_value, baseline_at_value, 'draft', nullif(payload->>'notes', ''), actor_id)
  returning id into baseline_id_value;

  for row_product in
    select * from jsonb_to_recordset(coalesce(payload->'products','[]'::jsonb)) as x(product_code text, opening_liters numeric, tank_label text, notes text)
  loop
    normalized_code := public.fuel_normalize_product_code(row_product.product_code);
    insert into public.fuel_products(code, name, unit, is_fuel, is_active)
    values (normalized_code, initcap(normalized_code), 'liter', true, true)
    on conflict (code) do nothing;

    select id into product_id_value from public.fuel_products where code = normalized_code limit 1;

    if product_id_value is not null then
      insert into public.fuel_station_products(station_id, product_id, is_active)
      values (station_id_value, product_id_value, true)
      on conflict (station_id, product_id) do nothing;
    end if;

    if nullif(trim(coalesce(row_product.tank_label, '')), '') is not null then
      insert into public.fuel_tanks(station_id, product_id, product_code_snapshot, tank_label, is_active, created_by)
      values (station_id_value, product_id_value, normalized_code, trim(row_product.tank_label), true, actor_id)
      on conflict (station_id, tank_label)
      do update set product_id = excluded.product_id, product_code_snapshot = excluded.product_code_snapshot, is_active = true, updated_at = now();

      select id into tank_id_value from public.fuel_tanks where station_id = station_id_value and tank_label = trim(row_product.tank_label) limit 1;
    else
      select id into tank_id_value from public.fuel_tanks where station_id = station_id_value and product_code_snapshot = normalized_code and is_active = true order by created_at asc limit 1;
      if tank_id_value is null then
        insert into public.fuel_tanks(station_id, product_id, product_code_snapshot, tank_label, is_active, created_by)
        values (station_id_value, product_id_value, normalized_code, normalized_code || ' Tank', true, actor_id)
        on conflict (station_id, tank_label) do update set updated_at = now()
        returning id into tank_id_value;
      end if;
    end if;

    insert into public.fuel_station_fuel_baseline_products(baseline_id, station_id, product_id, product_code_snapshot, opening_liters, tank_id, notes)
    values (baseline_id_value, station_id_value, product_id_value, normalized_code, coalesce(row_product.opening_liters, 0), tank_id_value, nullif(row_product.notes, ''))
    on conflict (baseline_id, product_code_snapshot)
    do update set opening_liters = excluded.opening_liters, tank_id = excluded.tank_id, notes = excluded.notes;

    present_codes := array_append(present_codes, normalized_code);
  end loop;

  if not allow_partial_value and not (coalesce(present_codes,'{}'::text[]) @> array['DIESEL','SPECIAL','UNLEADED']) then
    raise exception 'Diesel, Special, and Unleaded opening rows are required';
  end if;

  for row_meter in
    select * from jsonb_to_recordset(coalesce(payload->'meters','[]'::jsonb)) as x(pump_id uuid, pump_label text, product_code text, nozzle_label text, opening_meter_reading numeric, notes text)
  loop
    normalized_code := public.fuel_normalize_product_code(row_meter.product_code);
    if nullif(trim(coalesce(row_meter.pump_label,'')), '') is null then raise exception 'pump_label is required for meter baseline rows'; end if;
    select id into product_id_value from public.fuel_products where code = normalized_code limit 1;

    insert into public.fuel_station_meter_baselines(baseline_id, station_id, pump_id, pump_label_snapshot, product_id, product_code_snapshot, nozzle_label, opening_meter_reading, notes)
    values (baseline_id_value, station_id_value, row_meter.pump_id, trim(row_meter.pump_label), product_id_value, normalized_code, nullif(row_meter.nozzle_label, ''), coalesce(row_meter.opening_meter_reading, 0), nullif(row_meter.notes, ''));
  end loop;

  return baseline_id_value;
end;
$$;

create or replace function public.fuel_finalize_fuel_opening_baseline(baseline_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  row_baseline record;
  product_codes text[];
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can finalize opening baseline'; end if;

  select * into row_baseline from public.fuel_station_fuel_baselines where id = baseline_id;
  if row_baseline.id is null then raise exception 'Baseline not found'; end if;
  if row_baseline.status <> 'draft' then raise exception 'Baseline must be draft'; end if;

  if exists(select 1 from public.fuel_station_fuel_baselines where station_id = row_baseline.station_id and status = 'finalized' and id <> baseline_id) then
    raise exception 'Station already has another finalized baseline';
  end if;

  select array_agg(product_code_snapshot) into product_codes from public.fuel_station_fuel_baseline_products where baseline_id = baseline_id;
  if not (coalesce(product_codes, '{}'::text[]) @> array['DIESEL','SPECIAL','UNLEADED']) then raise exception 'Diesel, Special, and Unleaded product rows are required'; end if;
  if not exists(select 1 from public.fuel_station_meter_baselines where baseline_id = baseline_id) then raise exception 'At least one meter baseline row is required'; end if;

  update public.fuel_station_fuel_baselines
  set status = 'finalized', finalized_by = actor_id, finalized_at = now(), updated_at = now()
  where id = baseline_id;

  insert into public.fuel_tank_readings(
    station_id, tank_id, product_id, product_code_snapshot, reading_date,
    opening_liters, received_liters, meter_liters_out, expected_ending_liters,
    actual_ending_liters, variance_liters, source, created_by
  )
  select row_baseline.station_id, p.tank_id, p.product_id, p.product_code_snapshot, (row_baseline.baseline_at at time zone 'UTC')::date,
         p.opening_liters, 0, 0, p.opening_liters, p.opening_liters, 0, 'opening_baseline', actor_id
  from public.fuel_station_fuel_baseline_products p
  where p.baseline_id = baseline_id;

  return baseline_id;
end;
$$;

create or replace function public.fuel_void_fuel_opening_baseline(baseline_id uuid, reason text)
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

  select status into current_status from public.fuel_station_fuel_baselines where id = baseline_id;
  if current_status is null then raise exception 'Baseline not found'; end if;
  if current_status not in ('draft', 'finalized') then raise exception 'Only draft or finalized baseline can be voided'; end if;

  update public.fuel_station_fuel_baselines
  set status = 'voided', voided_by = actor_id, voided_at = now(), void_reason = trim(reason), updated_at = now()
  where id = baseline_id;

  return baseline_id;
end;
$$;

create or replace function public.fuel_create_bodega(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  code_value text := nullif(trim(payload->>'code'), '');
  name_value text := nullif(trim(payload->>'name'), '');
  bodega_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can create bodega'; end if;
  if code_value is null then raise exception 'code is required'; end if;
  if name_value is null then raise exception 'name is required'; end if;

  insert into public.fuel_inventory_locations(code, name, address, notes, location_type, is_active, created_by)
  values (upper(code_value), name_value, nullif(trim(payload->>'address'), ''), nullif(trim(payload->>'notes'), ''), 'bodega', true, actor_id)
  returning id into bodega_id;

  return bodega_id;
end;
$$;

create or replace function public.fuel_create_station(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  code_value text := nullif(trim(payload->>'code'), '');
  name_value text := nullif(trim(payload->>'name'), '');
  station_id_value uuid;
  location_id_value uuid;
  default_products boolean := coalesce((payload->>'default_products')::boolean, true);
  create_inventory_location boolean := coalesce((payload->>'create_inventory_location')::boolean, true);
  code_item text;
  product_id_value uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can create station'; end if;
  if code_value is null then raise exception 'code is required'; end if;
  if name_value is null then raise exception 'name is required'; end if;

  insert into public.fuel_stations(code, name, address, official_report_header, is_active, created_by)
  values (upper(code_value), name_value, nullif(trim(payload->>'address'), ''), nullif(trim(payload->>'official_report_header'), ''), true, actor_id)
  returning id into station_id_value;

  insert into public.fuel_station_profiles(station_id, tin, business_permit, report_header)
  values (station_id_value, nullif(trim(payload->>'tin'), ''), nullif(trim(payload->>'business_permit'), ''), nullif(trim(payload->>'official_report_header'), ''));

  if default_products then
    foreach code_item in array array['DIESEL','SPECIAL','UNLEADED']
    loop
      insert into public.fuel_products(code, name, unit, is_fuel, is_active)
      values (code_item, initcap(code_item), 'liter', true, true)
      on conflict (code) do update set is_fuel = true, is_active = true;

      select id into product_id_value from public.fuel_products where code = code_item limit 1;

      insert into public.fuel_station_products(station_id, product_id, is_active)
      values (station_id_value, product_id_value, true)
      on conflict (station_id, product_id) do update set is_active = true;

      insert into public.fuel_tanks(station_id, product_id, product_code_snapshot, tank_label, is_active, created_by)
      values (station_id_value, product_id_value, code_item, code_item || ' Tank', true, actor_id)
      on conflict (station_id, tank_label)
      do update set product_id = excluded.product_id, product_code_snapshot = excluded.product_code_snapshot, is_active = true, updated_at = now();
    end loop;
  end if;

  if create_inventory_location then
    insert into public.fuel_inventory_locations(station_id, code, name, address, location_type, is_active, created_by)
    values (station_id_value, upper(code_value), name_value, nullif(trim(payload->>'address'), ''), 'station', true, actor_id)
    returning id into location_id_value;
  end if;

  return jsonb_build_object('station_id', station_id_value, 'location_id', location_id_value);
end;
$$;

create or replace function public.fuel_owner_list_users()
returns table (
  id uuid,
  email text,
  username text,
  role text,
  is_active boolean,
  must_change_password boolean,
  created_at timestamptz,
  updated_at timestamptz,
  auth_created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can list users'; end if;

  return query
  select au.id, au.email::text, p.username, p.role, coalesce(p.is_active, false), coalesce(p.must_change_password, false),
         p.created_at, p.updated_at, au.created_at, au.last_sign_in_at
  from auth.users au
  left join public.profiles p on p.id = au.id
  order by lower(au.email::text);
end;
$$;

create or replace function public.fuel_owner_upsert_profile_by_email(
  user_email text,
  user_role text,
  user_is_active boolean default true,
  user_must_change_password boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_id uuid;
  normalized_email text := lower(trim(coalesce(user_email, '')));
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can update users'; end if;
  if user_role not in ('Owner', 'Co-Owner', 'Admin', 'User') then raise exception 'Invalid role'; end if;

  select id into target_id from auth.users where lower(email::text) = normalized_email limit 1;
  if target_id is null then
    raise exception 'Auth user does not exist. Create the user in Supabase Authentication first.';
  end if;
  if target_id = actor_id and not user_is_active then raise exception 'Owner cannot deactivate own profile'; end if;

  insert into public.profiles(id, email, username, role, is_active, must_change_password, updated_at)
  values (target_id, normalized_email, split_part(normalized_email, '@', 1), user_role, user_is_active, user_must_change_password, now())
  on conflict (id)
  do update set email = excluded.email,
                role = excluded.role,
                is_active = excluded.is_active,
                must_change_password = excluded.must_change_password,
                updated_at = now();

  return target_id;
end;
$$;

create or replace function public.fuel_owner_update_user_role(
  target_user_id uuid,
  user_role text,
  user_is_active boolean,
  user_must_change_password boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can update users'; end if;
  if user_role not in ('Owner', 'Co-Owner', 'Admin', 'User') then raise exception 'Invalid role'; end if;
  if target_user_id = auth.uid() and not user_is_active then raise exception 'Owner cannot deactivate own profile'; end if;

  update public.profiles
  set role = user_role,
      is_active = user_is_active,
      must_change_password = user_must_change_password,
      updated_at = now()
  where id = target_user_id;

  return target_user_id;
end;
$$;

create or replace function public.fuel_owner_deactivate_user(target_user_id uuid, reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can deactivate users'; end if;
  if nullif(trim(coalesce(reason, '')), '') is null then raise exception 'reason is required'; end if;
  if target_user_id = auth.uid() then raise exception 'Owner cannot deactivate own profile'; end if;

  update public.profiles
  set is_active = false,
      updated_at = now()
  where id = target_user_id;

  return target_user_id;
end;
$$;

-- RLS / policies / grants.
alter table public.fuel_station_fuel_baselines enable row level security;
alter table public.fuel_station_fuel_baseline_products enable row level security;
alter table public.fuel_station_meter_baselines enable row level security;
alter table public.fuel_tanks enable row level security;
alter table public.fuel_deliveries enable row level security;
alter table public.fuel_tank_readings enable row level security;
alter table public.fuel_suppliers enable row level security;

drop policy if exists fuel_station_fuel_baselines_read on public.fuel_station_fuel_baselines;
create policy fuel_station_fuel_baselines_read on public.fuel_station_fuel_baselines for select using (public.fuel_can_read());
drop policy if exists fuel_station_fuel_baselines_insert on public.fuel_station_fuel_baselines;
create policy fuel_station_fuel_baselines_insert on public.fuel_station_fuel_baselines for insert with check (public.fuel_can_write());
drop policy if exists fuel_station_fuel_baselines_update on public.fuel_station_fuel_baselines;
create policy fuel_station_fuel_baselines_update on public.fuel_station_fuel_baselines for update using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_station_fuel_baseline_products_read on public.fuel_station_fuel_baseline_products;
create policy fuel_station_fuel_baseline_products_read on public.fuel_station_fuel_baseline_products for select using (public.fuel_can_read());
drop policy if exists fuel_station_fuel_baseline_products_insert on public.fuel_station_fuel_baseline_products;
create policy fuel_station_fuel_baseline_products_insert on public.fuel_station_fuel_baseline_products for insert with check (public.fuel_can_write());
drop policy if exists fuel_station_fuel_baseline_products_update on public.fuel_station_fuel_baseline_products;
create policy fuel_station_fuel_baseline_products_update on public.fuel_station_fuel_baseline_products for update using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_station_meter_baselines_read on public.fuel_station_meter_baselines;
create policy fuel_station_meter_baselines_read on public.fuel_station_meter_baselines for select using (public.fuel_can_read());
drop policy if exists fuel_station_meter_baselines_insert on public.fuel_station_meter_baselines;
create policy fuel_station_meter_baselines_insert on public.fuel_station_meter_baselines for insert with check (public.fuel_can_write());
drop policy if exists fuel_station_meter_baselines_update on public.fuel_station_meter_baselines;
create policy fuel_station_meter_baselines_update on public.fuel_station_meter_baselines for update using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_tanks_read on public.fuel_tanks;
create policy fuel_tanks_read on public.fuel_tanks for select using (public.fuel_can_read());
drop policy if exists fuel_tanks_insert on public.fuel_tanks;
create policy fuel_tanks_insert on public.fuel_tanks for insert with check (public.fuel_can_write());
drop policy if exists fuel_tanks_update on public.fuel_tanks;
create policy fuel_tanks_update on public.fuel_tanks for update using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_deliveries_read on public.fuel_deliveries;
create policy fuel_deliveries_read on public.fuel_deliveries for select using (public.fuel_can_read());
drop policy if exists fuel_deliveries_insert on public.fuel_deliveries;
create policy fuel_deliveries_insert on public.fuel_deliveries for insert with check (public.fuel_can_write());
drop policy if exists fuel_deliveries_update on public.fuel_deliveries;
create policy fuel_deliveries_update on public.fuel_deliveries for update using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_tank_readings_read on public.fuel_tank_readings;
create policy fuel_tank_readings_read on public.fuel_tank_readings for select using (public.fuel_can_read());
drop policy if exists fuel_tank_readings_insert on public.fuel_tank_readings;
create policy fuel_tank_readings_insert on public.fuel_tank_readings for insert with check (public.fuel_can_write());
drop policy if exists fuel_tank_readings_update on public.fuel_tank_readings;
create policy fuel_tank_readings_update on public.fuel_tank_readings for update using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_suppliers_read on public.fuel_suppliers;
create policy fuel_suppliers_read on public.fuel_suppliers for select using (public.fuel_can_read());
drop policy if exists fuel_suppliers_insert on public.fuel_suppliers;
create policy fuel_suppliers_insert on public.fuel_suppliers for insert with check (public.fuel_can_write());
drop policy if exists fuel_suppliers_update on public.fuel_suppliers;
create policy fuel_suppliers_update on public.fuel_suppliers for update using (public.fuel_can_write()) with check (public.fuel_can_write());

revoke all on public.fuel_station_fuel_baselines from anon;
revoke all on public.fuel_station_fuel_baseline_products from anon;
revoke all on public.fuel_station_meter_baselines from anon;
revoke all on public.fuel_tanks from anon;
revoke all on public.fuel_deliveries from anon;
revoke all on public.fuel_tank_readings from anon;
revoke all on public.fuel_suppliers from anon;

grant select, insert, update on public.fuel_station_fuel_baselines to authenticated;
grant select, insert, update on public.fuel_station_fuel_baseline_products to authenticated;
grant select, insert, update on public.fuel_station_meter_baselines to authenticated;
grant select, insert, update on public.fuel_tanks to authenticated;
grant select, insert, update on public.fuel_deliveries to authenticated;
grant select, insert, update on public.fuel_tank_readings to authenticated;
grant select, insert, update on public.fuel_suppliers to authenticated;

grant execute on function public.fuel_get_current_profile() to authenticated;
grant execute on function public.fuel_create_fuel_opening_baseline(jsonb) to authenticated;
grant execute on function public.fuel_finalize_fuel_opening_baseline(uuid) to authenticated;
grant execute on function public.fuel_void_fuel_opening_baseline(uuid, text) to authenticated;
grant execute on function public.fuel_create_bodega(jsonb) to authenticated;
grant execute on function public.fuel_create_station(jsonb) to authenticated;
grant execute on function public.fuel_owner_list_users() to authenticated;
grant execute on function public.fuel_owner_upsert_profile_by_email(text, text, boolean, boolean) to authenticated;
grant execute on function public.fuel_owner_update_user_role(uuid, text, boolean, boolean) to authenticated;
grant execute on function public.fuel_owner_deactivate_user(uuid, text) to authenticated;

notify pgrst, 'reload schema';
