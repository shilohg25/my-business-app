-- Seed station meter setup for AKY Boracay without hardcoding UUIDs.
-- Safe to re-run; rows are upserted by station/product/label.

with target_station as (
  select s.id
  from public.fuel_stations s
  where s.is_active = true
    and (
      lower(s.name) = lower('AKY Boracay Station')
      or lower(s.name) = lower('AKY Boracay')
      or lower(s.code) = lower('AKY_BORACAY')
      or lower(s.code) = lower('AKY-BORACAY')
      or lower(s.code) = lower('BORACAY')
    )
  order by s.created_at asc
  limit 1
), meter_rows as (
  select * from (
    values
      ('DIESEL'::text, 'D1'::text, 10::integer),
      ('DIESEL'::text, 'D2'::text, 20::integer),
      ('SPECIAL'::text, 'S1'::text, 30::integer),
      ('SPECIAL'::text, 'S2'::text, 40::integer),
      ('SPECIAL'::text, 'S3'::text, 50::integer),
      ('SPECIAL'::text, 'S4'::text, 60::integer),
      ('UNLEADED'::text, 'U1'::text, 70::integer),
      ('UNLEADED'::text, 'U2'::text, 80::integer)
  ) as x(product_type, meter_label, display_order)
)
insert into public.fuel_station_meters (station_id, product_type, meter_label, display_order, is_active)
select ts.id, mr.product_type, mr.meter_label, mr.display_order, true
from target_station ts
cross join meter_rows mr
on conflict (station_id, product_type, lower(trim(meter_label))) where is_active = true
  do update set
    display_order = excluded.display_order,
    is_active = true,
    updated_at = now();

-- Optional quick check.
select s.name as station_name, s.code as station_code, m.product_type, m.meter_label, m.display_order, m.is_active
from public.fuel_station_meters m
join public.fuel_stations s on s.id = m.station_id
where (
  lower(s.name) = lower('AKY Boracay Station')
  or lower(s.name) = lower('AKY Boracay')
  or lower(s.code) = lower('AKY_BORACAY')
  or lower(s.code) = lower('AKY-BORACAY')
  or lower(s.code) = lower('BORACAY')
)
order by m.product_type, m.display_order, m.meter_label;
