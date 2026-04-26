-- User station assignments and multi-product delivery batches.

create table if not exists public.fuel_user_station_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  is_active boolean not null default true,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  notes text,
  unique(user_id, station_id)
);

alter table public.fuel_user_station_assignments enable row level security;
revoke all on table public.fuel_user_station_assignments from anon;
grant select, insert, update on table public.fuel_user_station_assignments to authenticated;

drop policy if exists fuel_user_station_assignments_select on public.fuel_user_station_assignments;
create policy fuel_user_station_assignments_select on public.fuel_user_station_assignments
for select using (
  public.fuel_can_read()
  and (
    public.fuel_can_write()
    or user_id = auth.uid()
  )
);

drop policy if exists fuel_user_station_assignments_insert on public.fuel_user_station_assignments;
create policy fuel_user_station_assignments_insert on public.fuel_user_station_assignments
for insert with check (
  public.fuel_is_owner() or public.fuel_can_write()
);

drop policy if exists fuel_user_station_assignments_update on public.fuel_user_station_assignments;
create policy fuel_user_station_assignments_update on public.fuel_user_station_assignments
for update using (
  public.fuel_is_owner() or public.fuel_can_write()
)
with check (
  public.fuel_is_owner() or public.fuel_can_write()
);

create table if not exists public.fuel_delivery_batches (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id),
  supplier_id uuid references public.fuel_suppliers(id),
  supplier_name_snapshot text,
  delivery_date date not null default current_date,
  invoice_number text,
  delivery_reference text,
  notes text,
  source text not null default 'field_capture',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.fuel_deliveries add column if not exists delivery_batch_id uuid references public.fuel_delivery_batches(id) on delete set null;

alter table public.fuel_delivery_batches enable row level security;
revoke all on table public.fuel_delivery_batches from anon;
grant select, insert, update on table public.fuel_delivery_batches to authenticated;

drop policy if exists fuel_delivery_batches_read on public.fuel_delivery_batches;
create policy fuel_delivery_batches_read on public.fuel_delivery_batches
for select using (public.fuel_can_read());

drop policy if exists fuel_delivery_batches_insert on public.fuel_delivery_batches;
create policy fuel_delivery_batches_insert on public.fuel_delivery_batches
for insert with check (public.fuel_can_read());

drop policy if exists fuel_delivery_batches_update on public.fuel_delivery_batches;
create policy fuel_delivery_batches_update on public.fuel_delivery_batches
for update using (public.fuel_can_write()) with check (public.fuel_can_write());

create or replace function public.fuel_get_my_station_assignments()
returns table (station_id uuid, station_name text, station_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  role_value text := public.fuel_current_role();
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  if role_value in ('Owner', 'Admin') then
    return query
    select s.id, s.name, s.code
    from public.fuel_stations s
    where s.is_active = true
    order by s.name;
    return;
  end if;

  return query
  select s.id, s.name, s.code
  from public.fuel_user_station_assignments a
  join public.fuel_stations s on s.id = a.station_id
  where a.user_id = actor_id
    and a.is_active = true
    and s.is_active = true
  order by s.name;
end;
$$;

grant execute on function public.fuel_get_my_station_assignments() to authenticated;

create or replace function public.fuel_owner_assign_user_station(target_user_id uuid, station_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare assignment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can assign stations'; end if;
  if target_user_id is null or station_id is null then raise exception 'target_user_id and station_id are required'; end if;

  insert into public.fuel_user_station_assignments(user_id, station_id, is_active, assigned_by, assigned_at)
  values (target_user_id, station_id, true, auth.uid(), now())
  on conflict (user_id, station_id)
  do update set is_active = true, assigned_by = auth.uid(), assigned_at = now()
  returning id into assignment_id;

  return assignment_id;
end;
$$;

grant execute on function public.fuel_owner_assign_user_station(uuid, uuid) to authenticated;

create or replace function public.fuel_owner_unassign_user_station(target_user_id uuid, station_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare assignment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can unassign stations'; end if;

  update public.fuel_user_station_assignments
  set is_active = false, assigned_by = auth.uid(), assigned_at = now()
  where user_id = target_user_id and station_id = fuel_owner_unassign_user_station.station_id
  returning id into assignment_id;

  return assignment_id;
end;
$$;

grant execute on function public.fuel_owner_unassign_user_station(uuid, uuid) to authenticated;

create or replace function public.fuel_record_fuel_delivery_batch(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  role_value text := public.fuel_current_role();
  station_value uuid := nullif(payload->>'station_id', '')::uuid;
  delivery_date_value date := coalesce(nullif(payload->>'delivery_date', '')::date, current_date);
  supplier_name text := nullif(trim(payload->>'supplier_name'), '');
  supplier_value uuid;
  batch_id uuid;
  item jsonb;
  normalized_code text;
  liters_value numeric;
  unit_cost_value numeric;
  tank_value uuid;
  product_value uuid;
  assignment_count int := 0;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if station_value is null then raise exception 'station_id is required'; end if;
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') = 0 then
    raise exception 'items must include at least one row';
  end if;

  if not exists (select 1 from public.fuel_stations s where s.id = station_value and s.is_active = true) then
    raise exception 'Station not found or inactive';
  end if;

  if role_value = 'User' then
    select count(*) into assignment_count from public.fuel_user_station_assignments a where a.user_id = actor_id and a.is_active = true;
    if assignment_count > 0 and not exists (
      select 1 from public.fuel_user_station_assignments a where a.user_id = actor_id and a.station_id = station_value and a.is_active = true
    ) then
      raise exception 'User is not assigned to this station';
    end if;
    if assignment_count = 0 and not public.fuel_can_read() then
      raise exception 'Not allowed to record delivery';
    end if;
  elsif role_value not in ('Owner', 'Admin') then
    raise exception 'Not allowed to record delivery';
  end if;

  if supplier_name is not null then
    select id into supplier_value from public.fuel_suppliers where lower(name) = lower(supplier_name) limit 1;
    if supplier_value is null then
      insert into public.fuel_suppliers(name, created_by) values (supplier_name, actor_id) returning id into supplier_value;
    end if;
  end if;

  insert into public.fuel_delivery_batches(station_id, supplier_id, supplier_name_snapshot, delivery_date, invoice_number, delivery_reference, notes, source, created_by)
  values (
    station_value,
    supplier_value,
    supplier_name,
    delivery_date_value,
    nullif(payload->>'invoice_number', ''),
    nullif(payload->>'delivery_reference', ''),
    nullif(payload->>'notes', ''),
    coalesce(nullif(payload->>'source', ''), 'field_capture'),
    actor_id
  ) returning id into batch_id;

  for item in select value from jsonb_array_elements(payload->'items')
  loop
    normalized_code := public.fuel_normalize_product_code(item->>'product_code');
    liters_value := coalesce(nullif(item->>'liters', '')::numeric, 0);
    unit_cost_value := nullif(item->>'unit_cost', '')::numeric;
    tank_value := nullif(item->>'tank_id', '')::uuid;

    if normalized_code not in ('DIESEL', 'SPECIAL', 'UNLEADED') then
      raise exception 'Unsupported product_code';
    end if;
    if liters_value <= 0 then
      raise exception 'liters must be greater than zero';
    end if;

    insert into public.fuel_products(code, name, unit, is_fuel, is_active)
    values (normalized_code, initcap(normalized_code), 'liter', true, true)
    on conflict (code) do nothing;

    select id into product_value from public.fuel_products where code = normalized_code limit 1;

    if tank_value is null then
      select t.id into tank_value
      from public.fuel_tanks t
      where t.station_id = station_value and public.fuel_normalize_product_code(t.product_code_snapshot) = normalized_code and t.is_active = true
      order by t.created_at asc
      limit 1;

      if tank_value is null then
        insert into public.fuel_tanks(station_id, product_id, product_code_snapshot, tank_label, is_active, created_by)
        values (station_value, product_value, normalized_code, normalized_code || ' DEFAULT', true, actor_id)
        returning id into tank_value;
      end if;
    end if;

    insert into public.fuel_deliveries(station_id, tank_id, product_id, product_code_snapshot, supplier_id, delivery_date, invoice_number, delivery_reference, liters, unit_cost, notes, created_by, delivery_batch_id)
    values (
      station_value,
      tank_value,
      product_value,
      normalized_code,
      supplier_value,
      delivery_date_value,
      nullif(payload->>'invoice_number', ''),
      nullif(payload->>'delivery_reference', ''),
      liters_value,
      unit_cost_value,
      nullif(item->>'notes', ''),
      actor_id,
      batch_id
    );
  end loop;

  return batch_id;
end;
$$;

grant execute on function public.fuel_record_fuel_delivery_batch(jsonb) to authenticated;
