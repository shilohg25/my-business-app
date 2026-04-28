# Mobile App Later Rules

Mobile data entry must:
- Load assigned station.
- Load active pumps for that station.
- Show pump and product as read-only.
- Show opening meter reading as read-only.
- Let cashier enter closing meter reading only.
- Auto-calculate liters out.
- Submit reading to `fuel_record_pump_meter_readings`.
- The closing meter reading becomes the next opening meter reading for the next cashier.
