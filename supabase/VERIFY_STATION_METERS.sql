-- Verification queries for AKY Boracay station meters.

with target_station as (
  select s.id, s.name, s.code
  from public.fuel_stations s
  where (
    lower(s.name) = lower('AKY Boracay Station')
    or lower(s.name) = lower('AKY Boracay')
    or lower(s.code) = lower('AKY_BORACAY')
    or lower(s.code) = lower('AKY-BORACAY')
    or lower(s.code) = lower('BORACAY')
  )
  order by s.created_at asc
  limit 1
)
select ts.name as station_name, ts.code as station_code, m.*
from target_station ts
left join public.fuel_station_meters m on m.station_id = ts.id
order by m.product_type, m.display_order, m.meter_label;

with target_station as (
  select s.id
  from public.fuel_stations s
  where (
    lower(s.name) = lower('AKY Boracay Station')
    or lower(s.name) = lower('AKY Boracay')
    or lower(s.code) = lower('AKY_BORACAY')
    or lower(s.code) = lower('AKY-BORACAY')
    or lower(s.code) = lower('BORACAY')
  )
  order by s.created_at asc
  limit 1
)
select m.product_type, count(*) as meter_count
from public.fuel_station_meters m
join target_station ts on ts.id = m.station_id
group by m.product_type
order by m.product_type;

with target_station as (
  select s.id
  from public.fuel_stations s
  where (
    lower(s.name) = lower('AKY Boracay Station')
    or lower(s.name) = lower('AKY Boracay')
    or lower(s.code) = lower('AKY_BORACAY')
    or lower(s.code) = lower('AKY-BORACAY')
    or lower(s.code) = lower('BORACAY')
  )
  order by s.created_at asc
  limit 1
)
select count(*) as active_meter_count
from public.fuel_station_meters m
join target_station ts on ts.id = m.station_id
where m.is_active = true;

with target_station as (
  select s.id
  from public.fuel_stations s
  where (
    lower(s.name) = lower('AKY Boracay Station')
    or lower(s.name) = lower('AKY Boracay')
    or lower(s.code) = lower('AKY_BORACAY')
    or lower(s.code) = lower('AKY-BORACAY')
    or lower(s.code) = lower('BORACAY')
  )
  order by s.created_at asc
  limit 1
)
select *
from public.fuel_get_station_meters((select id from target_station));
