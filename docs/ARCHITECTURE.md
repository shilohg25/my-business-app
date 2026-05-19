# Architecture

## Modules

- Auth and role-aware access
- Stations
- Shift templates
- Shift reports
- Fuel products and prices
- Pump assignments
- Credit receipts
- Expenses
- Cash count
- Lubricants
- Bodega inventory
- Excel import
- Reports/exports
- Audit logs
- Settings/report headers

## Route map

- `/login`
- `/dashboard`
- `/stations`
- `/stations/[id]`
- `/shifts`
- `/shift-reports`
- `/shift-reports/new`
- `/shift-reports/[id]`
- `/imports`
- `/reports`
- `/inventory/lubricants`
- `/inventory/bodega`
- `/audit-logs`
- `/settings`

## Data flow

1. User opens a draft shift report.
2. UI records meter readings, credit receipts, expenses, cash count, and lubricant sales.
3. Client calculation engine gives immediate feedback.
4. Server action validates with Zod.
5. Server recomputes totals with same domain engine.
6. Normalized rows are persisted.
7. Audit log is written.
8. Report can be printed/exported.
9. Future mobile submissions can insert the same shape with `source = mobile_submission`.

## Recommended tweak

Operational tables use `fuel_` prefix instead of generic names. This avoids collisions in a shared Supabase project that already has customer, invoice, payment, profile, and audit tables.
