-- Multi-location inventory foundation for AKY Fuel Ops.

create table if not exists public.fuel_inventory_locations (
  id uuid primary key default gen_random_uuid(),
  location_type text not null check (location_type in ('bodega', 'station')),
  code text not null unique,
  name text not null,
  station_id uuid references public.fuel_stations(id),
  address text,
  notes text,
  is_active boolean not null default true,
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuel_inventory_locations_type_station_ck check (
    (location_type = 'station' and station_id is not null)
    or (location_type = 'bodega' and station_id is null)
  )
);

create table if not exists public.fuel_location_lubricant_inventory (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.fuel_inventory_locations(id),
  lubricant_product_id uuid not null references public.fuel_lubricant_products(id),
  quantity_on_hand numeric not null default 0,
  reorder_level numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique(location_id, lubricant_product_id)
);

create table if not exists public.fuel_location_lubricant_movements (
  id uuid primary key default gen_random_uuid(),
  lubricant_product_id uuid not null references public.fuel_lubricant_products(id),
  movement_type text not null check (movement_type in ('purchase', 'transfer', 'sale', 'adjustment', 'return')),
  quantity numeric not null,
  from_location_id uuid references public.fuel_inventory_locations(id),
  to_location_id uuid references public.fuel_inventory_locations(id),
  shift_report_id uuid references public.fuel_shift_reports(id),
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint fuel_location_lubricant_movements_rules_ck check (
    (movement_type = 'purchase' and to_location_id is not null)
    or (movement_type = 'transfer' and from_location_id is not null and to_location_id is not null)
    or (movement_type = 'sale' and from_location_id is not null)
    or (movement_type = 'adjustment' and (from_location_id is not null or to_location_id is not null))
    or (movement_type = 'return')
  ),
  constraint fuel_location_lubricant_movements_qty_ck check (
    (movement_type = 'adjustment' and quantity <> 0)
    or (movement_type <> 'adjustment' and quantity > 0)
  )
);

alter table if exists public.fuel_lubricant_purchase_orders
  add column if not exists bodega_location_id uuid references public.fuel_inventory_locations(id);

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

create table if not exists public.fuel_lubricant_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  bodega_location_id uuid not null references public.fuel_inventory_locations(id),
  supplier_id uuid references public.fuel_suppliers(id),
  order_number text,
  order_date date not null default current_date,
  received_date date,
  status text not null default 'draft' check (status in ('draft','received','cancelled')),
  notes text,
  total_amount numeric not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_lubricant_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.fuel_lubricant_purchase_orders(id) on delete cascade,
  lubricant_product_id uuid references public.fuel_lubricant_products(id),
  product_name_snapshot text not null,
  quantity numeric not null,
  unit_cost numeric not null default 0,
  amount numeric generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now()
);

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
  unique(station_id, tank_label)
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
  liters numeric not null,
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

alter table public.fuel_inventory_locations enable row level security;
alter table public.fuel_location_lubricant_inventory enable row level security;
alter table public.fuel_location_lubricant_movements enable row level security;
alter table public.fuel_tanks enable row level security;
alter table public.fuel_deliveries enable row level security;
alter table public.fuel_tank_readings enable row level security;

revoke all on public.fuel_inventory_locations from anon;
revoke all on public.fuel_location_lubricant_inventory from anon;
revoke all on public.fuel_location_lubricant_movements from anon;
revoke all on public.fuel_tanks from anon;
revoke all on public.fuel_deliveries from anon;
revoke all on public.fuel_tank_readings from anon;

grant select, insert, update, delete on public.fuel_inventory_locations to authenticated;
grant select, insert, update, delete on public.fuel_location_lubricant_inventory to authenticated;
grant select, insert, update, delete on public.fuel_location_lubricant_movements to authenticated;
grant select, insert, update, delete on public.fuel_tanks to authenticated;
grant select, insert, update, delete on public.fuel_deliveries to authenticated;
grant select, insert, update, delete on public.fuel_tank_readings to authenticated;

drop policy if exists fuel_inventory_locations_read on public.fuel_inventory_locations;
create policy fuel_inventory_locations_read on public.fuel_inventory_locations for select using (public.fuel_can_read());
drop policy if exists fuel_inventory_locations_write on public.fuel_inventory_locations;
create policy fuel_inventory_locations_write on public.fuel_inventory_locations for all using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_location_lubricant_inventory_read on public.fuel_location_lubricant_inventory;
create policy fuel_location_lubricant_inventory_read on public.fuel_location_lubricant_inventory for select using (public.fuel_can_read());
drop policy if exists fuel_location_lubricant_inventory_write on public.fuel_location_lubricant_inventory;
create policy fuel_location_lubricant_inventory_write on public.fuel_location_lubricant_inventory for all using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_location_lubricant_movements_read on public.fuel_location_lubricant_movements;
create policy fuel_location_lubricant_movements_read on public.fuel_location_lubricant_movements for select using (public.fuel_can_read());
drop policy if exists fuel_location_lubricant_movements_write on public.fuel_location_lubricant_movements;
create policy fuel_location_lubricant_movements_write on public.fuel_location_lubricant_movements for all using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_tanks_read on public.fuel_tanks;
create policy fuel_tanks_read on public.fuel_tanks for select using (public.fuel_can_read());
drop policy if exists fuel_tanks_write on public.fuel_tanks;
create policy fuel_tanks_write on public.fuel_tanks for all using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_deliveries_read on public.fuel_deliveries;
create policy fuel_deliveries_read on public.fuel_deliveries for select using (public.fuel_can_read());
drop policy if exists fuel_deliveries_write on public.fuel_deliveries;
create policy fuel_deliveries_write on public.fuel_deliveries for all using (public.fuel_can_write()) with check (public.fuel_can_write());

drop policy if exists fuel_tank_readings_read on public.fuel_tank_readings;
create policy fuel_tank_readings_read on public.fuel_tank_readings for select using (public.fuel_can_read());
drop policy if exists fuel_tank_readings_write on public.fuel_tank_readings;
create policy fuel_tank_readings_write on public.fuel_tank_readings for all using (public.fuel_can_write()) with check (public.fuel_can_write());

create or replace function public.fuel_create_bodega(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  code_value text := upper(trim(coalesce(payload->>'code', '')));
  name_value text := trim(coalesce(payload->>'name', ''));
  location_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can create bodega locations'; end if;
  if code_value = '' then raise exception 'code is required'; end if;
  if name_value = '' then raise exception 'name is required'; end if;

  insert into public.fuel_inventory_locations(location_type, code, name, address, notes, created_by)
  values ('bodega', code_value, name_value, nullif(payload->>'address',''), nullif(payload->>'notes',''), actor_id)
  returning id into location_id;

  return location_id;
exception when unique_violation then
  raise exception 'Duplicate bodega code: %', code_value;
end;
$$;

grant execute on function public.fuel_create_bodega(jsonb) to authenticated;

create or replace function public.fuel_create_station(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_id_value uuid;
  station_location_id uuid;
  product_code text;
  product_id_value uuid;
  station_code text := upper(trim(coalesce(payload->>'code', '')));
  station_name text := trim(coalesce(payload->>'name', ''));
  use_defaults boolean := coalesce((payload->>'default_products')::boolean, true);
  create_location boolean := coalesce((payload->>'create_inventory_location')::boolean, true);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can create stations'; end if;
  if station_code = '' then raise exception 'code is required'; end if;
  if station_name = '' then raise exception 'name is required'; end if;

  insert into public.fuel_stations(code, name, address, official_report_header, is_active, created_by)
  values (
    station_code,
    station_name,
    nullif(payload->>'address', ''),
    nullif(payload->>'official_report_header', ''),
    true,
    actor_id
  ) returning id into station_id_value;

  insert into public.fuel_station_profiles(station_id, report_header, tin, business_permit, metadata)
  values (
    station_id_value,
    nullif(payload->>'official_report_header', ''),
    nullif(payload->>'tin', ''),
    nullif(payload->>'business_permit', ''),
    jsonb_build_object('phone', nullif(payload->>'phone', ''))
  );

  if use_defaults then
    for product_code in select * from unnest(array['DIESEL', 'SPECIAL', 'UNLEADED'])
    loop
      insert into public.fuel_products(code, name, unit, is_fuel, is_active)
      values (product_code, initcap(product_code), 'liter', true, true)
      on conflict (code) do nothing;

      select id into product_id_value from public.fuel_products where code = product_code limit 1;
      if product_id_value is not null then
        insert into public.fuel_station_products(station_id, product_id, is_active)
        values (station_id_value, product_id_value, true)
        on conflict (station_id, product_id) do nothing;
      end if;
    end loop;
  end if;

  if create_location then
    insert into public.fuel_inventory_locations(location_type, code, name, station_id, address, notes, created_by)
    values ('station', station_code, station_name, station_id_value, nullif(payload->>'address', ''), nullif(payload->>'notes', ''), actor_id)
    returning id into station_location_id;
  end if;

  return jsonb_build_object('station_id', station_id_value, 'location_id', station_location_id);
end;
$$;

grant execute on function public.fuel_create_station(jsonb) to authenticated;

create or replace function public.fuel_receive_lubricant_purchase(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  bodega_location_value uuid := nullif(payload->>'bodega_location_id', '')::uuid;
  supplier_value uuid := nullif(payload->>'supplier_id', '')::uuid;
  supplier_name text := nullif(trim(payload->>'supplier_name'), '');
  po_id uuid;
  row_item record;
  product_id_value uuid;
  po_total numeric := 0;
  moved_qty numeric;
  unit_cost_value numeric;
  order_date_value date := coalesce(nullif(payload->>'order_date', '')::date, current_date);
  received_date_value date := coalesce(nullif(payload->>'received_date', '')::date, current_date);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_can_write() then raise exception 'Only Owner/Admin can receive purchases'; end if;
  if bodega_location_value is null then raise exception 'bodega_location_id is required'; end if;
  if not exists(select 1 from public.fuel_inventory_locations where id = bodega_location_value and location_type = 'bodega' and is_active = true) then
    raise exception 'bodega_location_id must reference an active bodega';
  end if;

  if supplier_value is null and supplier_name is not null then
    select id into supplier_value from public.fuel_suppliers where lower(name) = lower(supplier_name) limit 1;
    if supplier_value is null then
      insert into public.fuel_suppliers(name, created_by) values (supplier_name, actor_id) returning id into supplier_value;
    end if;
  end if;

  insert into public.fuel_lubricant_purchase_orders(
    bodega_location_id, supplier_id, order_number, order_date, received_date, status, notes, total_amount, created_by
  ) values (
    bodega_location_value, supplier_value, nullif(payload->>'order_number',''), order_date_value, received_date_value, 'received', nullif(payload->>'notes',''), 0, actor_id
  ) returning id into po_id;

  for row_item in select * from jsonb_to_recordset(coalesce(payload->'items','[]'::jsonb))
    as x(lubricant_product_id text, product_name text, sku text, quantity numeric, unit_cost numeric)
  loop
    moved_qty := coalesce(row_item.quantity, 0);
    unit_cost_value := coalesce(row_item.unit_cost, 0);
    if moved_qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;

    product_id_value := nullif(row_item.lubricant_product_id, '')::uuid;
    if product_id_value is null then
      if coalesce(nullif(trim(row_item.product_name), ''), '') = '' then
        raise exception 'product_name is required when lubricant_product_id is missing';
      end if;

      if nullif(trim(row_item.sku), '') is not null then
        insert into public.fuel_lubricant_products(sku, name, default_unit_price, is_active)
        values (trim(row_item.sku), trim(row_item.product_name), unit_cost_value, true)
        on conflict (sku) do update
          set name = excluded.name,
              default_unit_price = excluded.default_unit_price,
              is_active = true
        returning id into product_id_value;
      else
        select id into product_id_value from public.fuel_lubricant_products where lower(name) = lower(trim(row_item.product_name)) limit 1;
        if product_id_value is null then
          insert into public.fuel_lubricant_products(name, default_unit_price, is_active)
          values (trim(row_item.product_name), unit_cost_value, true)
          returning id into product_id_value;
        end if;
      end if;
    end if;

    insert into public.fuel_lubricant_purchase_order_items(purchase_order_id, lubricant_product_id, product_name_snapshot, quantity, unit_cost)
    values (po_id, product_id_value, coalesce(nullif(trim(row_item.product_name),''), 'Unlabeled lubricant'), moved_qty, unit_cost_value);

    insert into public.fuel_location_lubricant_inventory(location_id, lubricant_product_id, quantity_on_hand, reorder_level)
    values (bodega_location_value, product_id_value, moved_qty, 0)
    on conflict (location_id, lubricant_product_id)
    do update set quantity_on_hand = public.fuel_location_lubricant_inventory.quantity_on_hand + excluded.quantity_on_hand,
                  updated_at = now();

    insert into public.fuel_location_lubricant_movements(lubricant_product_id, movement_type, quantity, to_location_id, reference, notes, created_by)
    values (product_id_value, 'purchase', moved_qty, bodega_location_value, nullif(payload->>'order_number',''), nullif(payload->>'notes',''), actor_id);

    po_total := po_total + (moved_qty * unit_cost_value);
  end loop;

  if po_total <= 0 then raise exception 'At least one valid purchase item is required'; end if;

  update public.fuel_lubricant_purchase_orders set total_amount = po_total where id = po_id;
  return po_id;
end;
$$;

grant execute on function public.fuel_receive_lubricant_purchase(jsonb) to authenticated;

create or replace function public.fuel_transfer_lubricants_between_locations(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  from_location_value uuid := nullif(payload->>'from_location_id', '')::uuid;
  to_location_value uuid := nullif(payload->>'to_location_id', '')::uuid;
  from_type text;
  to_type text;
  row_item record;
  movement_id uuid;
  movement_ids uuid[] := '{}';
  qty numeric;
  current_qty numeric;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_can_write() then raise exception 'Only Owner/Admin can transfer lubricants'; end if;
  if from_location_value is null or to_location_value is null then raise exception 'from_location_id and to_location_id are required'; end if;

  select location_type into from_type from public.fuel_inventory_locations where id = from_location_value and is_active = true;
  if from_type is null then raise exception 'from_location_id is not an active location'; end if;
  select location_type into to_type from public.fuel_inventory_locations where id = to_location_value and is_active = true;
  if to_type is null then raise exception 'to_location_id is not an active location'; end if;
  if from_type <> 'bodega' or to_type <> 'station' then raise exception 'Transfers must be bodega -> station'; end if;

  for row_item in select * from jsonb_to_recordset(coalesce(payload->'items','[]'::jsonb)) as x(lubricant_product_id uuid, quantity numeric)
  loop
    qty := coalesce(row_item.quantity, 0);
    if row_item.lubricant_product_id is null then raise exception 'lubricant_product_id is required'; end if;
    if qty <= 0 then raise exception 'Transfer quantity must be greater than zero'; end if;

    insert into public.fuel_location_lubricant_inventory(location_id, lubricant_product_id, quantity_on_hand, reorder_level)
    values (from_location_value, row_item.lubricant_product_id, 0, 0)
    on conflict (location_id, lubricant_product_id) do nothing;

    select quantity_on_hand into current_qty
    from public.fuel_location_lubricant_inventory
    where location_id = from_location_value and lubricant_product_id = row_item.lubricant_product_id
    for update;

    if coalesce(current_qty, 0) < qty then
      raise exception 'Insufficient stock for lubricant_product_id %', row_item.lubricant_product_id;
    end if;

    update public.fuel_location_lubricant_inventory
    set quantity_on_hand = quantity_on_hand - qty,
        updated_at = now()
    where location_id = from_location_value and lubricant_product_id = row_item.lubricant_product_id;

    insert into public.fuel_location_lubricant_inventory(location_id, lubricant_product_id, quantity_on_hand, reorder_level)
    values (to_location_value, row_item.lubricant_product_id, qty, 0)
    on conflict (location_id, lubricant_product_id)
    do update set quantity_on_hand = public.fuel_location_lubricant_inventory.quantity_on_hand + excluded.quantity_on_hand,
                  updated_at = now();

    insert into public.fuel_location_lubricant_movements(
      lubricant_product_id, movement_type, quantity, from_location_id, to_location_id, reference, notes, created_by
    ) values (
      row_item.lubricant_product_id, 'transfer', qty, from_location_value, to_location_value, nullif(payload->>'reference',''), nullif(payload->>'notes',''), actor_id
    ) returning id into movement_id;

    movement_ids := array_append(movement_ids, movement_id);
  end loop;

  return jsonb_build_object('movement_ids', movement_ids);
end;
$$;

grant execute on function public.fuel_transfer_lubricants_between_locations(jsonb) to authenticated;

create or replace function public.fuel_record_fuel_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_value uuid := nullif(payload->>'station_id', '')::uuid;
  tank_value uuid := nullif(payload->>'tank_id', '')::uuid;
  code_value text := public.fuel_normalize_product_code(payload->>'product_code');
  product_value uuid;
  supplier_value uuid := nullif(payload->>'supplier_id', '')::uuid;
  supplier_name text := nullif(trim(payload->>'supplier_name'), '');
  liters_value numeric := coalesce(nullif(payload->>'liters', '')::numeric, 0);
  delivery_date_value date := coalesce(nullif(payload->>'delivery_date', '')::date, current_date);
  delivery_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_can_write() then raise exception 'Only Owner/Admin can record deliveries'; end if;
  if station_value is null then raise exception 'station_id is required'; end if;
  if liters_value <= 0 then raise exception 'liters must be greater than zero'; end if;
  if code_value not in ('DIESEL','SPECIAL','UNLEADED') then raise exception 'Unsupported product_code'; end if;

  insert into public.fuel_products(code, name, unit, is_fuel, is_active)
  values (code_value, initcap(code_value), 'liter', true, true)
  on conflict (code) do nothing;

  select id into product_value from public.fuel_products where code = code_value limit 1;

  if supplier_value is null and supplier_name is not null then
    select id into supplier_value from public.fuel_suppliers where lower(name)=lower(supplier_name) limit 1;
    if supplier_value is null then
      insert into public.fuel_suppliers(name, created_by) values (supplier_name, actor_id) returning id into supplier_value;
    end if;
  end if;

  insert into public.fuel_deliveries(station_id, tank_id, product_id, product_code_snapshot, supplier_id, delivery_date, invoice_number, delivery_reference, liters, unit_cost, notes, created_by)
  values (station_value, tank_value, product_value, code_value, supplier_value, delivery_date_value, nullif(payload->>'invoice_number',''), nullif(payload->>'delivery_reference',''), liters_value, nullif(payload->>'unit_cost','')::numeric, nullif(payload->>'notes',''), actor_id)
  returning id into delivery_id;

  return delivery_id;
end;
$$;

grant execute on function public.fuel_record_fuel_delivery(jsonb) to authenticated;

create or replace function public.fuel_record_tank_reading(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_value uuid := nullif(payload->>'station_id', '')::uuid;
  tank_value uuid := nullif(payload->>'tank_id', '')::uuid;
  code_value text := public.fuel_normalize_product_code(payload->>'product_code');
  reading_date_value date := coalesce(nullif(payload->>'reading_date', '')::date, current_date);
  opening_value numeric := coalesce(nullif(payload->>'opening_liters', '')::numeric, 0);
  actual_ending_value numeric := coalesce(nullif(payload->>'actual_ending_liters', '')::numeric, 0);
  product_value uuid;
  received_value numeric := 0;
  liters_out_value numeric := 0;
  expected_value numeric := 0;
  variance_value numeric := 0;
  reading_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_can_write() then raise exception 'Only Owner/Admin can record tank readings'; end if;
  if station_value is null then raise exception 'station_id is required'; end if;
  if code_value not in ('DIESEL','SPECIAL','UNLEADED') then raise exception 'Unsupported product_code'; end if;

  select id into product_value from public.fuel_products where code = code_value limit 1;

  select coalesce(sum(liters), 0) into received_value
  from public.fuel_deliveries
  where station_id = station_value and product_code_snapshot = code_value and delivery_date = reading_date_value;

  select coalesce(sum(mr.liters_sold), 0) into liters_out_value
  from public.fuel_meter_readings mr
  join public.fuel_shift_reports sr on sr.id = mr.shift_report_id
  where sr.station_id = station_value
    and sr.report_date = reading_date_value
    and public.fuel_normalize_product_code(mr.product_code_snapshot) = code_value;

  expected_value := opening_value + received_value - liters_out_value;
  variance_value := actual_ending_value - expected_value;

  insert into public.fuel_tank_readings(station_id, tank_id, product_id, product_code_snapshot, reading_date, opening_liters, received_liters, meter_liters_out, expected_ending_liters, actual_ending_liters, variance_liters, notes, source, created_by)
  values (station_value, tank_value, product_value, code_value, reading_date_value, opening_value, received_value, liters_out_value, expected_value, actual_ending_value, variance_value, nullif(payload->>'notes',''), 'manual', actor_id)
  returning id into reading_id;

  return reading_id;
end;
$$;

grant execute on function public.fuel_record_tank_reading(jsonb) to authenticated;
