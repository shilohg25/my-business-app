# Mobile Shift Report Payload

The canonical payload for `fuel_submit_mobile_shift_report(payload jsonb)` is
snake_case. A sample request body lives at
`docs/mobile-shift-report-snake-case-payload.json`.

The meter evidence bucket is `fuel-meter-evidence` and remains private. Closing
photo paths should use:

```text
stationId/reportDate/shiftLabel/pumpId/closing.jpg
```

For older mobile builds, the RPC also accepts camelCase aliases such as
`stationId`, `reportDate`, `shiftLabel`, `meterReadings`, `pumpId`,
`openingReading`, and `closingPhotoPath`. New mobile code should send the
snake_case shape.

After applying the migration in Supabase SQL editor, refresh PostgREST:

```sql
notify pgrst, 'reload schema';
```
