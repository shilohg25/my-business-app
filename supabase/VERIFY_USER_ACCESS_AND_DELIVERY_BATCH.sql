select tablename
from pg_tables
where schemaname = 'public'
  and tablename = 'fuel_user_station_assignments';

select tablename
from pg_tables
where schemaname = 'public'
  and tablename = 'fuel_delivery_batches';

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'fuel_deliveries'
  and column_name = 'delivery_batch_id';

select routine_name, pg_get_function_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and routine_name in (
    'fuel_get_my_station_assignments',
    'fuel_record_fuel_delivery_batch',
    'fuel_owner_assign_user_station',
    'fuel_owner_unassign_user_station'
  )
order by routine_name;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'fuel_user_station_assignments',
    'fuel_delivery_batches'
  );

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in (
    'fuel_user_station_assignments',
    'fuel_delivery_batches'
  );
