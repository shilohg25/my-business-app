# Mobile Field Capture Publish Plan

## Draft to final table mapping

Future publish RPC (`public.fuel_publish_shift_capture_session`) should map data as follows:

- `fuel_shift_capture_sessions` -> `fuel_shift_reports`
- `draft_payload.meter_readings` -> `fuel_meter_readings`
- `draft_payload.cash_count` -> `fuel_cash_counts`
- `draft_payload.expenses` -> `fuel_expenses`
- `draft_payload.credit_receipts` -> `fuel_credit_receipts`
- `draft_payload.lubricant_sales` -> `fuel_lubricant_sales`
- `draft_payload.fuel_deliveries` -> `fuel_deliveries`
- `fuel_shift_capture_photos` remains as evidence linked to `capture_session_id`

## RPC requirements

1. Use a single database transaction for publish operations.
2. Be idempotent (repeat call on same session must not create duplicate final rows).
3. Prevent double publish by validating status and `published_shift_report_id`.
4. Validate station, status, and actor permissions before writes.
5. Require `ready_for_review` status before publish.
6. Restrict initial publish permission to Owner/Admin flow.
7. Write audit trail events into `fuel_shift_capture_events` and final report audit tables.
8. Store `published_shift_report_id` back on the session row.
9. Set session status to `published` only after all inserts succeed.
10. Never map OCR values unless `confirmed_value` exists and is explicitly selected.
