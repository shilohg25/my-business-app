-- Harden inventory/security posture after inventory operations refactor.

create or replace function public.fuel_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'Guest'
    else coalesce((select role from public.profiles where id = auth.uid()), 'User')
  end
$$;

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
    else 'OTHER'
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
    select id into supplier_value
    from public.fuel_suppliers
    where lower(name) = lower(supplier_name)
    limit 1;

    if supplier_value is null then
      insert into public.fuel_suppliers(name, created_by)
      values (supplier_name, actor_id)
      returning id into supplier_value;
    end if;
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
  if station_value is null then
    raise exception 'station_id is required';
  end if;
  if product_value is null then
    raise exception 'lubricant_product_id is required';
  end if;
  if qty_delta = 0 then
    raise exception 'quantity_delta cannot be zero';
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
  if station_value is null then
    raise exception 'station_id is required';
  end if;
  if not exists(select 1 from public.fuel_stations where id = station_value) then
    raise exception 'Station not found';
  end if;
  if liters_value <= 0 then
    raise exception 'liters must be greater than zero';
  end if;
  if code_value = 'OTHER' then
    raise exception 'product_code must be one of ADO/DIESEL, SPU/SPECIAL, ULG/UNLEADED';
  end if;

  select id into product_value from public.fuel_products where code = code_value limit 1;
  if product_value is null then
    raise exception 'Product % is not configured in fuel_products', code_value;
  end if;

  if supplier_value is null and supplier_name is not null then
    select id into supplier_value
    from public.fuel_suppliers
    where lower(name) = lower(supplier_name)
    limit 1;

    if supplier_value is null then
      insert into public.fuel_suppliers(name, created_by)
      values (supplier_name, actor_id)
      returning id into supplier_value;
    end if;
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
  if station_value is null then
    raise exception 'station_id is required';
  end if;
  if not exists(select 1 from public.fuel_stations where id = station_value) then
    raise exception 'Station not found';
  end if;
  if code_value = 'OTHER' then
    raise exception 'product_code must be one of ADO/DIESEL, SPU/SPECIAL, ULG/UNLEADED';
  end if;

  select id into product_value from public.fuel_products where code = code_value limit 1;
  if product_value is null then
    raise exception 'Product % is not configured in fuel_products', code_value;
  end if;

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
  station_code text := upper(trim(coalesce(payload->>'code', '')));
  station_name text := trim(coalesce(payload->>'name', ''));
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can create stations';
  end if;
  if station_code = '' then
    raise exception 'code is required';
  end if;
  if station_name = '' then
    raise exception 'name is required';
  end if;

  insert into public.fuel_stations(
    code,
    name,
    address,
    official_report_header,
    is_active,
    created_by
  ) values (
    station_code,
    station_name,
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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'fuel_stations',
    'fuel_station_profiles',
    'fuel_shift_templates',
    'fuel_products',
    'fuel_station_products',
    'fuel_prices',
    'fuel_pumps',
    'fuel_pump_product_assignments',
    'fuel_shift_reports',
    'fuel_meter_readings',
    'fuel_credit_receipts',
    'fuel_expenses',
    'fuel_cash_counts',
    'fuel_lubricant_products',
    'fuel_lubricant_sales',
    'fuel_station_lubricant_inventory',
    'fuel_warehouse_lubricant_inventory',
    'fuel_lubricant_stock_movements',
    'fuel_import_batches',
    'fuel_report_exports',
    'fuel_suppliers',
    'fuel_lubricant_purchase_orders',
    'fuel_lubricant_purchase_order_items',
    'fuel_tanks',
    'fuel_deliveries',
    'fuel_tank_readings'
  ]
  loop
    execute format('revoke all on public.%I from anon', table_name);
  end loop;
end $$;
