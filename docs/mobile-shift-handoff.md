# Mobile Shift Handoff

## Workflow

1. Cashier A starts a field capture draft.
2. Cashier A records opening + closing meter readings.
3. Cashier A marks the draft as `ready_for_review`.
4. Cashier B starts the next draft session at the same station.
5. The app fetches latest closing readings from:
   - ready-for-review capture sessions,
   - published capture sessions,
   - final submitted/reviewed/approved shift reports.
6. The app suggests those values as opening readings.
7. Cashier B must confirm or correct each opening reading.
8. Confirmation is logged to `fuel_shift_capture_handoffs` for audit.

## Business rule

Closing meter readings can be suggested to the next shift, but **they are never silently accepted**. The next cashier must confirm handoff rows before they are considered confirmed opening readings for the draft.

## Meter identity matching

Rows are matched with this priority:

1. `pump_id` (if present)
2. `pump_label`
3. normalized product code
4. `nozzle_label` (if present)

Product code normalization:

- `ADO` / `DIESEL` -> `DIESEL`
- `SPU` / `SPECIAL` -> `SPECIAL`
- `ULG` / `UNLEADED` / `REGULAR` -> `UNLEADED`

## Audit model

Each confirmation row stores:

- session and station references,
- source session/report references,
- pump/product/nozzle snapshot,
- suggested and confirmed opening readings,
- generated variance,
- confirmer + timestamp,
- optional notes.

Rows are immutable in current workflow: corrections should be appended as new events/rows for traceability.

## Why ready-for-review is included

The next shift often starts before owner/admin publishes a draft into final `fuel_shift_reports`. Using `ready_for_review` in handoff lookup prevents operational delays and still keeps all values confirmation-gated.

## Publish behavior

`fuel_publish_shift_capture_session` publishes from `draft_payload.meter_readings`. If handoff has been confirmed, those opening readings are already merged into the draft payload before publish.

## OCR future support

Photo/OCR support remains evidence-only for now. Meter handoff still requires cashier confirmation and does not trust OCR output automatically.
