select table_name
from information_schema.views
where table_schema = 'public'
  and table_name = 'fuel_latest_meter_handoff_readings';

select tablename
from pg_tables
where schemaname = 'public'
  and tablename = 'fuel_shift_capture_handoffs';

select proname as routine_name, pg_get_function_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'fuel_get_latest_meter_handoff',
    'fuel_confirm_shift_handoff'
  )
order by proname;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'fuel_shift_capture_handoffs';

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name = 'fuel_shift_capture_handoffs';
