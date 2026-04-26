# Mobile Capture Data Model (Design Draft)

> Design only for future implementation. No schema migration is added in this PR.

Excel import UI is retired, but historical data stays available for audit. Future mobile capture should publish into existing reporting tables through secure server-side validation.

## 1) `fuel_shift_capture_sessions`
Purpose: draft workflow state before final publish.

Suggested fields:
- `id`
- `station_id`
- `shift_template_id`
- `opened_by`
- `opening_confirmed_by`
- `closing_confirmed_by`
- `status` (`draft` | `ready_for_review` | `published` | `voided`)
- `previous_session_id`
- `draft_payload jsonb`
- `published_shift_report_id`
- `created_at`
- `updated_at`

Notes:
- Tracks one active capture lifecycle.
- Holds validated draft details before final write to `fuel_shift_reports`.

## 2) `fuel_shift_capture_photos`
Purpose: photo evidence + OCR lifecycle.

Suggested fields:
- `id`
- `capture_session_id`
- `photo_type` (`meter_reading` | `credit_receipt` | `expense_receipt` | `fuel_delivery_receipt` | `cash_count_evidence`)
- `storage_path`
- `ocr_status`
- `ocr_result jsonb`
- `confidence numeric`
- `confirmed_value jsonb`
- `confirmed_by`
- `confirmed_at`

Notes:
- Storage path should point to protected authenticated buckets/folders.
- OCR output is advisory until user confirms.

## 3) `fuel_shift_capture_fuel_deliveries`
Purpose: delivery events captured during shift.

Suggested fields:
- `id`
- `capture_session_id`
- `station_id`
- `product_code_snapshot`
- `liters_received`
- `delivery_reference`
- `receipt_photo_id`
- `before_reading`
- `after_reading`
- `validation_status`
- `notes`

Notes:
- Keep product snapshot aligned with canonical codes (`DIESEL`, `SPECIAL`, `UNLEADED`).
- Treat regular fuel labels as `UNLEADED` unless a new product model is intentionally introduced.

## 4) Publish RPC: `fuel_publish_mobile_shift_submission(capture_session_id uuid)`
Behavior expectations:
- Verifies authenticated user.
- Validates station/shift/session status.
- Validates confirmed meter readings.
- Validates cash count completeness.
- Validates fuel delivery math.
- Creates final `fuel_shift_reports` row with `source = mobile_submission`.
- Inserts meter readings, credit receipts, expenses, cash counts, lubricant sales.
- Inserts fuel deliveries when present.
- Links photos/evidence.
- Writes audit logs.
- Prevents double publish.

## Security notes
- Do not expose service role keys in frontend.
- Do not bypass RLS for mobile capture actions.
- Use authenticated storage policies and server-side OCR/publish execution.
