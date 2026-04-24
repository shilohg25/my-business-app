insert into public.fuel_products (code, name, unit, is_fuel)
values
  ('DIESEL', 'Diesel', 'liter', true),
  ('SPECIAL', 'Special', 'liter', true),
  ('UNLEADED', 'Unleaded', 'liter', true)
on conflict (code) do update set name = excluded.name, unit = excluded.unit, is_fuel = excluded.is_fuel;

insert into public.fuel_stations (code, name, official_report_header)
values ('AKY-MAIN', 'AKY Main Station', 'AKY Fuel Station Shift Report')
on conflict (code) do nothing;

insert into public.fuel_station_products (station_id, product_id)
select s.id, p.id
from public.fuel_stations s
cross join public.fuel_products p
where s.code = 'AKY-MAIN'
on conflict (station_id, product_id) do nothing;

insert into public.fuel_shift_templates (station_id, name, start_time, end_time, display_order)
select id, '1-9pm', '13:00', '21:00', 1
from public.fuel_stations
where code = 'AKY-MAIN'
on conflict do nothing;

insert into public.fuel_pumps (station_id, pump_label, display_order)
select s.id, pump_label, display_order
from public.fuel_stations s
cross join (values ('A', 1), ('B', 2), ('A2', 3), ('B2', 4)) as p(pump_label, display_order)
where s.code = 'AKY-MAIN'
on conflict (station_id, pump_label) do nothing;

insert into public.fuel_lubricant_products (sku, name, unit, default_unit_price)
values
  ('AX7', 'AX7', 'piece', 390)
on conflict (sku) do update set name = excluded.name, default_unit_price = excluded.default_unit_price;
