# Mobile Browser Field App Plan (Option 1)

## Decision
AKY Fuel Ops will ship a **mobile-browser compatible web app first** and evolve it toward PWA installability.
A separate native app is deferred until mobile browser usage proves insufficient.

## Cashier workflow (field)
1. Cashier signs in on phone browser.
2. Cashier selects station.
3. Cashier selects shift (5am–1pm, 1pm–9pm, 9pm–5am, or Custom).
4. Cashier records opening and closing meter readings.
5. Cashier records cash count.
6. Cashier records receipt and expense details.
7. Cashier records delivery details if fuel is received during shift.
8. Cashier reviews discrepancy summary.
9. Cashier submits end-of-shift report when secure publish is enabled.

## Owner/admin review workflow
1. Submitted field shifts appear in Daily Shift Reports.
2. Owner/admin reviews discrepancy, expenses, and inventory impact.
3. Owner/admin continues approval and reporting workflows in desktop web app.

## OCR confirmation policy
OCR must never auto-publish numeric values without cashier confirmation.
Reason: meter digits, invoice numbers, and currency amounts are high-risk fields and require explicit human validation before persistence.

## Inventory impact policy
Shift meter readings should affect **expected fuel inventory only** until reconciled against actual measured inventory.
This keeps discrepancy analysis transparent and avoids silent inventory overrides.

## Future implementation plan
- Add authenticated Supabase Storage uploads for meter/receipt evidence.
- Add OCR extraction pipeline with cashier-confirm step before save.
- Add secure submit RPC for final shift publish.
- Add explicit draft workflow backed by Supabase tables (not sensitive local browser storage).

## Security notes
- Authenticated users only.
- RLS required on all field-capture related tables.
- No service-role keys in frontend code.
- Photo evidence must be tied to station, shift, and submitting user.
