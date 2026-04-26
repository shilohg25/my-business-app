-- 1) Required tables
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'fuel_station_fuel_baselines',
    'fuel_station_fuel_baseline_products',
    'fuel_station_meter_baselines',
    'fuel_tanks',
    'fuel_deliveries',
    'fuel_tank_readings'
  )
order by table_name;

-- 2) Required RPCs
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'fuel_get_current_profile',
    'fuel_create_fuel_opening_baseline',
    'fuel_finalize_fuel_opening_baseline',
    'fuel_void_fuel_opening_baseline',
    'fuel_create_bodega',
    'fuel_create_station',
    'fuel_owner_list_users',
    'fuel_owner_upsert_profile_by_email',
    'fuel_owner_update_user_role',
    'fuel_owner_deactivate_user'
  )
order by routine_name;

-- 3) RLS enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'fuel_station_fuel_baselines',
    'fuel_station_fuel_baseline_products',
    'fuel_station_meter_baselines',
    'fuel_tanks',
    'fuel_deliveries',
    'fuel_tank_readings',
    'fuel_suppliers'
  )
order by tablename;

-- 4) anon grants should be zero
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in (
    'fuel_station_fuel_baselines',
    'fuel_station_fuel_baseline_products',
    'fuel_station_meter_baselines',
    'fuel_tanks',
    'fuel_deliveries',
    'fuel_tank_readings',
    'fuel_suppliers'
  );

-- 5) current user profile
select * from public.fuel_get_current_profile();
