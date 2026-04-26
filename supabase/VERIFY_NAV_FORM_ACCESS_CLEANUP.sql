-- Verify required RPCs exist
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'fuel_generate_code',
    'fuel_create_station',
    'fuel_create_bodega',
    'fuel_get_current_profile'
  )
order by proname;

-- Verify current profile
select * from public.fuel_get_current_profile();

-- Verify code helper
select public.fuel_generate_code('Main Bodega') as generated_code;
