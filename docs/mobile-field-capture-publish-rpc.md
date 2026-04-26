# Mobile Field Capture Publish RPC

## Flow
1. Owner/Admin reviews a `fuel_shift_capture_sessions` draft in `ready_for_review` status.
2. Client calls `public.fuel_publish_shift_capture_session(capture_session_id uuid)`.
3. RPC validates actor + role using `auth.uid()` and `fuel_can_write()`.
4. Session row is locked (`FOR UPDATE`) to guarantee single-writer behavior.
5. Draft payload is validated and transformed into final report rows.
6. Final report + child rows are inserted in one transaction.
7. Session is marked `published`, linked to report id, and an event row is added.

## Draft -> Final mapping
- `fuel_shift_capture_sessions` -> `fuel_shift_reports`
- `draft_payload.meter_readings` -> `fuel_meter_readings`
- `draft_payload.cash_count` -> `fuel_cash_counts`
- `draft_payload.expenses` -> `fuel_expenses`
- `draft_payload.credit_receipts` -> `fuel_credit_receipts`
- `draft_payload.lubricant_sales` -> `fuel_lubricant_sales`
- `draft_payload.fuel_deliveries` -> `fuel_deliveries` (when table exists)
- publish event -> `fuel_shift_capture_events`
- optional audit trail -> `audit_logs`

## Transactional behavior
The publish RPC runs as a single PL/pgSQL function transaction. Any exception aborts all writes, preventing partial publication.

## Idempotency
- If session is already `published` with `published_shift_report_id`, RPC returns that report id and does not insert duplicates.
- Only `ready_for_review` (or already published idempotent) sessions are accepted.

## OCR policy
OCR values are not auto-trusted or auto-applied here. Publish only reads reviewed draft payload values and preserves explicit operator-confirmed data.

## Access control
Only Owner/Admin-capable users (via `fuel_can_write()`) can publish final reports.

## Known limitations
- Fuel cash sales are not inferred when fuel prices are unavailable; totals include a warning.
- Lubricant inventory deduction is not auto-posted here and may require a separate posting workflow.
