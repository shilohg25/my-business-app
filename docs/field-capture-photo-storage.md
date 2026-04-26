# Field Capture Photo Storage Foundation

## Private bucket design

- Bucket name: `field-capture-photos`.
- Access model: private (`public = false`), authenticated users only through policy checks.
- Current upload constraints: JPEG, PNG, and WEBP; max file size 10MB.

## Storage path convention

All objects follow:

`field-capture-photos/{station_id}/{capture_session_id}/{photo_type}/{photo_id}-{safe_filename}`

- `station_id` and `capture_session_id` come from the draft session.
- `photo_id` comes from the database row created before file upload.
- `safe_filename` is sanitized and not used for authorization.

## Upload flow

1. Frontend calls `fuel_create_shift_capture_photo_record(payload)` to create metadata.
2. Frontend builds the object path from returned `photo_id`, `station_id`, and `capture_session_id`.
3. Frontend uploads file into Supabase Storage bucket `field-capture-photos`.
4. Frontend calls `fuel_attach_shift_capture_photo_storage_path(photo_id, storage_path)`.
5. Session photo list is queried from `fuel_shift_capture_photos`.

This flow avoids trusting user-supplied names and keeps authorization tied to session ownership/role checks.

## Why OCR is disabled now

- OCR status remains `not_started`.
- No OCR extraction, parsing, or report autofill is performed in this patch.
- The UI explicitly informs users OCR is not enabled yet.

## Why cashier confirmation is required later

Even when OCR is introduced in a future phase, OCR output must not directly change operational records. A cashier confirmation step is required so reviewed values (not raw OCR guesses) become authoritative.

## RLS/security summary

- Storage insert/update is allowed only for authenticated users with access to a **draft** capture session tied to path session id.
- Storage read requires `fuel_can_read()` and a valid related capture session.
- No anonymous access and no broad public bucket access.
- Photo metadata creation/attachment RPCs require authentication and enforce draft/session ownership or `fuel_can_write()`.
- Audit events are written for `photo_record_created` and `photo_attached`.

## Future signed URL / preview plan

- Keep bucket private.
- Add a small helper to create short-lived signed URLs only for authenticated users with valid read access.
- Continue rendering metadata-only fallback for clients where preview should remain disabled.

## Future OCR Edge Function plan

- Queue `not_started` photos into an OCR processing workflow after explicit enablement.
- Process OCR server-side (Edge Function) with strict auth checks.
- Persist OCR output separately and require cashier confirmation before any value affects shift reports.
