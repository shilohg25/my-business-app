# Mobile Shift Capture Roadmap

## Purpose
Excel import is retired from the active UI. Historical import data remains in place for audit and traceability. Future shift capture should move to a mobile/PWA workflow that supports photo-assisted cashier submission.

## Workflow direction
1. Authenticated cashier opens assigned station + shift capture session.
2. Cashier captures closing meter photos, reviews OCR output, and confirms/corrects readings.
3. Confirmed closing readings become the next shift opening readings.
4. Cashier enters closing cash counts (denominations + loose coins).
5. Cashier captures credit/invoice receipts, then confirms OCR with product, liters, company, and amount.
6. Cashier records expenses with optional receipt photos.
7. Cashier records fuel deliveries (product, liters, delivery reference, optional before/after readings).
8. App calculates totals + discrepancy and shows final review before submit.
9. Owner/Admin reviews published report in the web app.

## Data and publish rules
- Canonical final report remains `fuel_shift_reports`.
- Mobile drafts must not directly create final reports until confirmed/published.
- Final publish should call a secure RPC (planned: `fuel_publish_mobile_shift_submission(capture_session_id uuid)`).
- Every publish must create audit trail entries.
- Closing reading handoff to next opening reading is required.

## Photo + OCR security rules
- Photos should be stored in Supabase Storage protected paths tied to authenticated users/stations.
- Frontend must not use service role keys.
- OCR should run server-side (backend service or Supabase Edge Function), not in privileged frontend code.
- OCR confidence for receipts must be shown and cashier-confirmed before publish.
- Delivery receipt OCR must be cashier-verified before publish.

## Authorization guardrails
- Users must be authenticated.
- Cashier can submit only their own capture session unless role permissions allow broader access.
- Owner/Admin review remains in the web app.
