create or replace function public.fuel_generate_code(raw_name text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(
        upper(regexp_replace(trim(coalesce(raw_name, '')), '[^a-zA-Z0-9]+', '_', 'g')),
        '^_+|_+$',
        '',
        'g'
      ),
      ''
    ),
    'ITEM'
  );
$$;

create or replace function public.fuel_create_bodega(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  name_value text := nullif(trim(payload->>'name'), '');
  requested_code text := nullif(trim(payload->>'code'), '');
  code_value text;
  bodega_id uuid;
  suffix text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can create bodega'; end if;
  if name_value is null then raise exception 'name is required'; end if;

  code_value := coalesce(public.fuel_generate_code(requested_code), public.fuel_generate_code(name_value));
  if code_value = 'ITEM' then
    code_value := public.fuel_generate_code(name_value);
  end if;

  while exists (select 1 from public.fuel_inventory_locations where code = code_value) loop
    suffix := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    code_value := public.fuel_generate_code(name_value) || '_' || suffix;
  end loop;

  insert into public.fuel_inventory_locations(code, name, address, notes, location_type, is_active, created_by)
  values (code_value, name_value, nullif(trim(payload->>'address'), ''), nullif(trim(payload->>'notes'), ''), 'bodega', true, actor_id)
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
  name_value text := nullif(trim(payload->>'name'), '');
  requested_code text := nullif(trim(payload->>'code'), '');
  code_value text;
  station_id_value uuid;
  location_id_value uuid;
  default_products boolean := coalesce((payload->>'default_products')::boolean, true);
  create_inventory_location boolean := coalesce((payload->>'create_inventory_location')::boolean, true);
  code_item text;
  product_id_value uuid;
  suffix text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_owner() then raise exception 'Only Owner can create station'; end if;
  if name_value is null then raise exception 'name is required'; end if;

  code_value := coalesce(public.fuel_generate_code(requested_code), public.fuel_generate_code(name_value));
  if code_value = 'ITEM' then
    code_value := public.fuel_generate_code(name_value);
  end if;

  while exists (select 1 from public.fuel_stations where code = code_value) loop
    suffix := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    code_value := public.fuel_generate_code(name_value) || '_' || suffix;
  end loop;

  insert into public.fuel_stations(code, name, address, phone, official_report_header, is_active, created_by)
  values (
    code_value,
    name_value,
    nullif(trim(payload->>'address'), ''),
    nullif(trim(payload->>'phone'), ''),
    nullif(trim(payload->>'official_report_header'), ''),
    true,
    actor_id
  )
  returning id into station_id_value;

  insert into public.fuel_station_profiles(station_id, tin, business_permit, report_header)
  values (
    station_id_value,
    nullif(trim(payload->>'tin'), ''),
    nullif(trim(payload->>'business_permit'), ''),
    nullif(trim(payload->>'official_report_header'), '')
  );

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
    values (station_id_value, code_value, name_value, nullif(trim(payload->>'address'), ''), 'station', true, actor_id)
    returning id into location_id_value;
  end if;

  return jsonb_build_object('station_id', station_id_value, 'location_id', location_id_value);
end;
$$;

grant execute on function public.fuel_generate_code(text) to authenticated;
