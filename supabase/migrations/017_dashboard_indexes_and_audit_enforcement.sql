-- Web-first foundation hardening
-- Adds common dashboard/reporting indexes and enforces explanation for elevated edits/archives.

create index if not exists idx_fuel_shift_reports_report_date on public.fuel_shift_reports(report_date);
create index if not exists idx_fuel_shift_reports_station_date on public.fuel_shift_reports(station_id, report_date);
create index if not exists idx_fuel_shift_reports_status on public.fuel_shift_reports(status);
create index if not exists idx_fuel_shift_reports_created_by on public.fuel_shift_reports(created_by);
create index if not exists idx_fuel_shift_reports_created_at on public.fuel_shift_reports(created_at desc);

create index if not exists idx_fuel_expenses_shift_created_at on public.fuel_expenses(shift_report_id, created_at desc);

create index if not exists idx_audit_logs_entity_created_at on public.audit_logs(entity_type, created_at desc);
create index if not exists idx_audit_logs_actor_created_at on public.audit_logs(actor_id, created_at desc);

-- Require explanation when actor role is Admin or Co-Owner and action mutates business records.
create or replace function public.fuel_validate_audit_explanation()
returns trigger
language plpgsql
as $$
begin
  if new.actor_role in ('Admin', 'Co-Owner')
     and new.action_type in ('edit', 'archive', 'delete', 'status_change')
     and coalesce(length(trim(new.explanation)), 0) < 5 then
    raise exception 'Explanation is required for Admin/Co-Owner edit/archive/delete/status change actions';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fuel_validate_audit_explanation on public.audit_logs;
create trigger trg_fuel_validate_audit_explanation
before insert on public.audit_logs
for each row
execute function public.fuel_validate_audit_explanation();
