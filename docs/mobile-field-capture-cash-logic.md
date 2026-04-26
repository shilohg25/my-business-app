# Mobile Field Capture Cash Logic

## Price lookup rules
- Prices are fetched from `fuel_prices` joined to `fuel_products` for the active station.
- Lookup picks latest `effective_at` at or before report date end-of-day.
- Product codes are normalized to canonical `DIESEL`, `SPECIAL`, and `UNLEADED` (`REGULAR` maps to `UNLEADED`).
- Missing product prices return `null` and produce warnings; no price is guessed.

## Manual draft price fallback
- Field Capture draft includes `draft_payload.prices`.
- UI prefills from station master prices if available.
- Cashier/Admin can edit prices in the draft only.
- This flow does **not** write to master `fuel_prices`.

## Expected cash formula
`fuelCashSales + lubricantSales - creditAmount - expenses = expectedCashRemittance`

## Discrepancy formula
`actualCashCount - expectedCashRemittance = discrepancyAmount`

- Positive discrepancy: **Cash overage**
- Negative discrepancy: **Cash shortage**
- Zero discrepancy: **Balanced**

## Why credit reduces expected cash but not physical fuel out
Credit sales still consume inventory/meter liters, so fuel sales analytics still includes those liters out. However, credit receipts are not cash collected at shift close, so they reduce expected cash remittance.

## Why missing price produces a warning
A missing price means the app cannot safely compute product fuel cash sales. The summary sets that product sales to `0` and emits an explicit warning so users can fix prices before review/publish.

## OCR status
OCR remains informational only. Captured photos are evidence, but OCR values are not automatically trusted as financial truth and are not auto-posted.
