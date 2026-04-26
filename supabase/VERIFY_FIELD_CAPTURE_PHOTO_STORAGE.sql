-- 1) Verify bucket
select id, name, public
from storage.buckets
where id = 'field-capture-photos';

-- Expected: public = false

-- 2) Verify RPCs
select p.proname as routine_name, pg_get_function_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'fuel_create_shift_capture_photo_record',
    'fuel_attach_shift_capture_photo_storage_path'
  )
order by p.proname;

-- 3) Verify photo table exists
select tablename
from pg_tables
where schemaname = 'public'
  and tablename = 'fuel_shift_capture_photos';

-- 4) Verify anon grants
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name = 'fuel_shift_capture_photos';

-- Expected: 0 rows
