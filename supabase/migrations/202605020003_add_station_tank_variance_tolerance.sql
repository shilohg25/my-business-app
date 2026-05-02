alter table public.station_tanks
add column if not exists variance_tolerance_liters numeric(14,4);
