# Mobile Field Capture Draft Foundation

## Draft session model
This phase introduces three draft-only tables:
- `fuel_shift_capture_sessions` for in-progress shift capture.
- `fuel_shift_capture_photos` as future-proof metadata records for evidence uploads.
- `fuel_shift_capture_events` for immutable workflow audit events.

## Why drafts are separate from final shift reports
Draft entries are intentionally isolated from `fuel_shift_reports` to prevent unstable cashier-capture data from being treated as final. A shift can be edited, reviewed, and validated before any publish step exists.

## Future photo storage plan
Photo fields (`storage_path`, MIME type, size, OCR metadata) are included now, but actual file upload will only be enabled after storage bucket policies are fully locked down under RLS-compatible access rules.

## Future OCR plan
OCR lifecycle state is modeled via `ocr_status`, `ocr_result`, `ocr_confidence`, `confirmed_value`, `confirmed_by`, and `confirmed_at`. OCR output will be suggestion-only until cashier confirmation exists in the UI.

## Future publish RPC plan
A publish RPC is stubbed to raise: `Publishing mobile shift capture is not enabled yet.`
That keeps release behavior explicit and blocks accidental conversion of drafts into final reports.

## Security model
- Signed-in identity is mandatory for all draft operations.
- Mutations happen through guarded RPCs, not through service-role frontend writes.
- Draft ownership is respected for normal users; Owner/Admin can intervene for oversight.
- Published and voided lifecycle states are protected from normal user edits.

## RLS expectations
RLS is enabled for all new draft tables. Policies enforce:
- read access via `fuel_can_read()`.
- insert/update constraints scoped to authenticated users and session ownership.
- event table allows insert-only logging (no user delete/update flow).

## Frontend constraint
No service-role key is used in frontend code; only authenticated browser client calls are used.

## OCR confirmation rule
OCR values must never be silently saved. Cashier confirmation is required before any OCR-derived value is treated as confirmed data.
