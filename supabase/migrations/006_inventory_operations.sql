-- AKY Fuel Ops inventory operations standard

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
  supplier_id uuid references public.fuel_suppliers(id),
  order_number text,
  order_date date not null default current_date,
  received_date date,
  status text not null default 'draft' check (status in ('draft', 'received', 'cancelled')),
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
  unique (station_id, tank_label)
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

create or replace function public.fuel_normalize_product_code(input_code text)
returns text
language sql
immutable
as $$
  select case upper(trim(coalesce(input_code, '')))
    when 'ADO' then 'DIESEL'
    when 'DIESEL' then 'DIESEL'
    when 'SPU' then 'SPECIAL'
    when 'SPECIAL' then 'SPECIAL'
    when 'ULG' then 'UNLEADED'
    when 'UNLEADED' then 'UNLEADED'
    else upper(trim(coalesce(input_code, '')))
  end
$$;

create or replace function public.fuel_receive_lubricant_purchase(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
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
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can receive purchases';
  end if;

  if supplier_value is null and supplier_name is not null then
    insert into public.fuel_suppliers(name, created_by)
    values (supplier_name, actor_id)
    returning id into supplier_value;
  end if;

  insert into public.fuel_lubricant_purchase_orders(
    supplier_id,
    order_number,
    order_date,
    received_date,
    status,
    notes,
    total_amount,
    created_by
  ) values (
    supplier_value,
    nullif(payload->>'order_number', ''),
    order_date_value,
    received_date_value,
    'received',
    nullif(payload->>'notes', ''),
    0,
    actor_id
  ) returning id into po_id;

  for row_item in
    select * from jsonb_to_recordset(coalesce(payload->'items', '[]'::jsonb))
      as x(lubricant_product_id text, product_name text, sku text, quantity numeric, unit_cost numeric)
  loop
    moved_qty := coalesce(row_item.quantity, 0);
    unit_cost_value := coalesce(row_item.unit_cost, 0);

    if moved_qty <= 0 then
      raise exception 'Item quantity must be greater than zero';
    end if;

    product_id_value := nullif(row_item.lubricant_product_id, '')::uuid;

    if product_id_value is null then
      if coalesce(nullif(trim(row_item.product_name), ''), '') = '' then
        raise exception 'Item product_name is required when lubricant_product_id is missing';
      end if;

      insert into public.fuel_lubricant_products(sku, name, default_unit_price, is_active)
      values (nullif(trim(row_item.sku), ''), trim(row_item.product_name), unit_cost_value, true)
      on conflict (sku)
      do update set name = excluded.name,
                    default_unit_price = excluded.default_unit_price,
                    is_active = true
      returning id into product_id_value;

      if product_id_value is null then
        select id into product_id_value
        from public.fuel_lubricant_products
        where lower(name) = lower(trim(row_item.product_name))
        limit 1;
      end if;
    end if;

    insert into public.fuel_lubricant_purchase_order_items(
      purchase_order_id,
      lubricant_product_id,
      product_name_snapshot,
      quantity,
      unit_cost
    ) values (
      po_id,
      product_id_value,
      coalesce(nullif(trim(row_item.product_name), ''), 'Unlabeled lubricant'),
      moved_qty,
      unit_cost_value
    );

    insert into public.fuel_warehouse_lubricant_inventory(lubricant_product_id, quantity_on_hand, reorder_level)
    values (product_id_value, moved_qty, 0)
    on conflict (lubricant_product_id)
    do update
      set quantity_on_hand = public.fuel_warehouse_lubricant_inventory.quantity_on_hand + excluded.quantity_on_hand,
          updated_at = now();

    insert into public.fuel_lubricant_stock_movements(
      lubricant_product_id,
      movement_type,
      quantity,
      reference,
      notes,
      created_by
    ) values (
      product_id_value,
      'purchase',
      moved_qty,
      nullif(payload->>'order_number', ''),
      nullif(payload->>'notes', ''),
      actor_id
    );

    po_total := po_total + (moved_qty * unit_cost_value);
  end loop;

  if po_total <= 0 then
    raise exception 'At least one valid purchase item is required';
  end if;

  update public.fuel_lubricant_purchase_orders
  set total_amount = po_total
  where id = po_id;

  return po_id;
end;
$$;

create or replace function public.fuel_transfer_lubricants_to_station(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_value uuid := nullif(payload->>'station_id', '')::uuid;
  row_item record;
  movement_ids uuid[] := '{}';
  movement_id uuid;
  qty numeric;
  on_hand numeric;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can transfer stock';
  end if;
  if station_value is null then
    raise exception 'station_id is required';
  end if;

  if not exists(select 1 from public.fuel_stations where id = station_value) then
    raise exception 'Station not found';
  end if;

  for row_item in
    select * from jsonb_to_recordset(coalesce(payload->'items', '[]'::jsonb))
      as x(lubricant_product_id text, quantity numeric)
  loop
    qty := coalesce(row_item.quantity, 0);
    if qty <= 0 then
      raise exception 'Transfer quantity must be greater than zero';
    end if;

    select quantity_on_hand
      into on_hand
    from public.fuel_warehouse_lubricant_inventory
    where lubricant_product_id = nullif(row_item.lubricant_product_id, '')::uuid
    for update;

    if coalesce(on_hand, 0) < qty then
      raise exception 'Insufficient Bodega quantity for product %', row_item.lubricant_product_id;
    end if;

    update public.fuel_warehouse_lubricant_inventory
    set quantity_on_hand = quantity_on_hand - qty,
        updated_at = now()
    where lubricant_product_id = nullif(row_item.lubricant_product_id, '')::uuid;

    insert into public.fuel_station_lubricant_inventory(station_id, lubricant_product_id, quantity_on_hand, reorder_level)
    values (station_value, nullif(row_item.lubricant_product_id, '')::uuid, qty, 0)
    on conflict (station_id, lubricant_product_id)
    do update
      set quantity_on_hand = public.fuel_station_lubricant_inventory.quantity_on_hand + excluded.quantity_on_hand,
          updated_at = now();

    insert into public.fuel_lubricant_stock_movements(
      lubricant_product_id,
      movement_type,
      quantity,
      from_station_id,
      to_station_id,
      reference,
      notes,
      created_by
    ) values (
      nullif(row_item.lubricant_product_id, '')::uuid,
      'transfer_out',
      qty,
      null,
      station_value,
      nullif(payload->>'reference', ''),
      nullif(payload->>'notes', ''),
      actor_id
    ) returning id into movement_id;

    movement_ids := array_append(movement_ids, movement_id);
  end loop;

  if cardinality(movement_ids) = 0 then
    raise exception 'At least one transfer item is required';
  end if;

  return jsonb_build_object('movement_ids', movement_ids);
end;
$$;

create or replace function public.fuel_adjust_station_lubricant_inventory(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_value uuid := nullif(payload->>'station_id', '')::uuid;
  product_value uuid := nullif(payload->>'lubricant_product_id', '')::uuid;
  qty_delta numeric := coalesce(nullif(payload->>'quantity_delta', '')::numeric, 0);
  reason_value text := nullif(trim(payload->>'reason'), '');
  allow_negative boolean := coalesce((payload->>'allow_negative')::boolean, false);
  next_qty numeric;
  movement_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can adjust stock';
  end if;
  if reason_value is null then
    raise exception 'reason is required';
  end if;

  insert into public.fuel_station_lubricant_inventory(station_id, lubricant_product_id, quantity_on_hand, reorder_level)
  values (station_value, product_value, qty_delta, 0)
  on conflict (station_id, lubricant_product_id)
  do update
    set quantity_on_hand = public.fuel_station_lubricant_inventory.quantity_on_hand + excluded.quantity_on_hand,
        updated_at = now()
  returning quantity_on_hand into next_qty;

  if next_qty < 0 and not (allow_negative and public.fuel_is_owner()) then
    raise exception 'Adjustment would produce negative inventory';
  end if;

  insert into public.fuel_lubricant_stock_movements(
    lubricant_product_id,
    movement_type,
    quantity,
    to_station_id,
    reference,
    notes,
    created_by
  ) values (
    product_value,
    'adjustment',
    qty_delta,
    station_value,
    nullif(payload->>'reference', ''),
    reason_value,
    actor_id
  ) returning id into movement_id;

  return movement_id;
end;
$$;

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
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can record deliveries';
  end if;
  if liters_value <= 0 then
    raise exception 'liters must be greater than zero';
  end if;

  select id into product_value from public.fuel_products where code = code_value limit 1;

  if supplier_value is null and supplier_name is not null then
    insert into public.fuel_suppliers(name, created_by)
    values (supplier_name, actor_id)
    returning id into supplier_value;
  end if;

  insert into public.fuel_deliveries(
    station_id,
    tank_id,
    product_id,
    product_code_snapshot,
    supplier_id,
    delivery_date,
    invoice_number,
    delivery_reference,
    liters,
    unit_cost,
    notes,
    created_by
  ) values (
    station_value,
    tank_value,
    product_value,
    code_value,
    supplier_value,
    delivery_date_value,
    nullif(payload->>'invoice_number', ''),
    nullif(payload->>'delivery_reference', ''),
    liters_value,
    nullif(payload->>'unit_cost', '')::numeric,
    nullif(payload->>'notes', ''),
    actor_id
  ) returning id into delivery_id;

  if tank_value is not null then
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
      notes,
      source,
      created_by
    ) values (
      station_value,
      tank_value,
      product_value,
      code_value,
      delivery_date_value,
      null,
      liters_value,
      0,
      null,
      null,
      null,
      'Auto-created from delivery',
      'delivery',
      actor_id
    );
  end if;

  return delivery_id;
end;
$$;

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
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can record tank readings';
  end if;

  select id into product_value from public.fuel_products where code = code_value limit 1;

  select coalesce(sum(liters), 0)
    into received_value
  from public.fuel_deliveries
  where station_id = station_value
    and product_code_snapshot = code_value
    and delivery_date = reading_date_value;

  select coalesce(sum(mr.liters_sold), 0)
    into liters_out_value
  from public.fuel_meter_readings mr
  join public.fuel_shift_reports sr on sr.id = mr.shift_report_id
  where sr.station_id = station_value
    and sr.report_date = reading_date_value
    and public.fuel_normalize_product_code(mr.product_code_snapshot) = code_value;

  expected_value := opening_value + received_value - liters_out_value;
  variance_value := actual_ending_value - expected_value;

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
    notes,
    source,
    created_by
  ) values (
    station_value,
    tank_value,
    product_value,
    code_value,
    reading_date_value,
    opening_value,
    received_value,
    liters_out_value,
    expected_value,
    actual_ending_value,
    variance_value,
    nullif(payload->>'notes', ''),
    'manual',
    actor_id
  ) returning id into reading_id;

  return reading_id;
end;
$$;

create or replace function public.fuel_create_station(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_id_value uuid;
  product_code text;
  product_id_value uuid;
  shift_item record;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can create stations';
  end if;

  insert into public.fuel_stations(
    code,
    name,
    address,
    official_report_header,
    is_active,
    created_by
  ) values (
    upper(trim(payload->>'code')),
    trim(payload->>'name'),
    nullif(payload->>'address', ''),
    nullif(payload->>'official_report_header', ''),
    coalesce((payload->>'is_active')::boolean, true),
    actor_id
  ) returning id into station_id_value;

  insert into public.fuel_station_profiles(
    station_id,
    report_header,
    tin,
    business_permit,
    metadata
  ) values (
    station_id_value,
    nullif(payload->>'official_report_header', ''),
    nullif(payload->>'tin', ''),
    nullif(payload->>'business_permit', ''),
    jsonb_build_object('phone', nullif(payload->>'phone', ''))
  );

  if coalesce((payload->>'add_default_products')::boolean, true) then
    for product_code in select * from unnest(array['DIESEL','SPECIAL','UNLEADED'])
    loop
      select id into product_id_value from public.fuel_products where code = product_code limit 1;
      if product_id_value is not null then
        insert into public.fuel_station_products(station_id, product_id, is_active)
        values (station_id_value, product_id_value, true)
        on conflict (station_id, product_id) do nothing;
      end if;
    end loop;
  end if;

  for shift_item in
    select * from jsonb_to_recordset(coalesce(payload->'shift_templates', '[]'::jsonb))
      as x(name text, start_time time, end_time time, display_order int)
  loop
    if coalesce(nullif(trim(shift_item.name), ''), '') <> '' then
      insert into public.fuel_shift_templates(station_id, name, start_time, end_time, display_order)
      values (station_id_value, trim(shift_item.name), shift_item.start_time, shift_item.end_time, coalesce(shift_item.display_order, 0));
    end if;
  end loop;

  return station_id_value;
end;
$$;

-- updated_at triggers for new mutable tables
drop trigger if exists trg_fuel_suppliers_updated_at on public.fuel_suppliers;
create trigger trg_fuel_suppliers_updated_at
before update on public.fuel_suppliers
for each row execute function public.touch_updated_at();

drop trigger if exists trg_fuel_lubricant_purchase_orders_updated_at on public.fuel_lubricant_purchase_orders;
create trigger trg_fuel_lubricant_purchase_orders_updated_at
before update on public.fuel_lubricant_purchase_orders
for each row execute function public.touch_updated_at();

drop trigger if exists trg_fuel_tanks_updated_at on public.fuel_tanks;
create trigger trg_fuel_tanks_updated_at
before update on public.fuel_tanks
for each row execute function public.touch_updated_at();

alter table public.fuel_suppliers enable row level security;
alter table public.fuel_lubricant_purchase_orders enable row level security;
alter table public.fuel_lubricant_purchase_order_items enable row level security;
alter table public.fuel_tanks enable row level security;
alter table public.fuel_deliveries enable row level security;
alter table public.fuel_tank_readings enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'fuel_suppliers',
    'fuel_lubricant_purchase_orders',
    'fuel_lubricant_purchase_order_items',
    'fuel_tanks',
    'fuel_deliveries',
    'fuel_tank_readings'
  ]
  loop
    execute format('drop policy if exists fuel_read on public.%I', table_name);
    execute format('create policy fuel_read on public.%I for select using (public.fuel_can_read())', table_name);

    execute format('drop policy if exists fuel_insert on public.%I', table_name);
    execute format('create policy fuel_insert on public.%I for insert with check (public.fuel_can_write())', table_name);

    execute format('drop policy if exists fuel_update on public.%I', table_name);
    execute format('create policy fuel_update on public.%I for update using (public.fuel_can_write()) with check (public.fuel_can_write())', table_name);

    execute format('grant select, insert, update on public.%I to authenticated', table_name);
  end loop;
end $$;

grant execute on function public.fuel_receive_lubricant_purchase(jsonb) to authenticated;
grant execute on function public.fuel_transfer_lubricants_to_station(jsonb) to authenticated;
grant execute on function public.fuel_adjust_station_lubricant_inventory(jsonb) to authenticated;
grant execute on function public.fuel_record_fuel_delivery(jsonb) to authenticated;
grant execute on function public.fuel_record_tank_reading(jsonb) to authenticated;
grant execute on function public.fuel_create_station(jsonb) to authenticated;
