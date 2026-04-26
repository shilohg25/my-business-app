-- 1) Verify tables exist
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'fuel_shift_capture_sessions',
    'fuel_shift_capture_photos',
    'fuel_shift_capture_events'
  )
order by tablename;

-- 2) Verify RPCs exist
select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'fuel_start_shift_capture_session',
    'fuel_update_shift_capture_draft',
    'fuel_mark_shift_capture_ready',
    'fuel_void_shift_capture_session'
  )
order by proname;

-- 3) Verify RLS enabled
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'fuel_shift_capture_sessions',
    'fuel_shift_capture_photos',
    'fuel_shift_capture_events'
  )
order by c.relname;

-- 4) Verify anon grants return zero rows
select table_schema, table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'fuel_shift_capture_sessions',
    'fuel_shift_capture_photos',
    'fuel_shift_capture_events'
  )
  and grantee = 'anon';
