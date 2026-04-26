-- 1) Verify RPC exists.
select proname as routine_name, pg_get_function_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname = 'fuel_publish_shift_capture_session';

-- 2) Verify mobile source enum exists.
select enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'fuel_entry_source'
order by enumlabel;

-- Expected includes: mobile_submission

-- 3) Verify sessions can reference published reports.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'fuel_shift_capture_sessions'
  and column_name = 'published_shift_report_id';
