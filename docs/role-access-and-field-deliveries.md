# Role access and field delivery workflow

## User role visible tabs
User (cashier/field staff) sees only:
- Field Shift Capture
- Daily Shift Reports

Other tabs are hidden and direct URL access is blocked by the app route guard.

## Why Fuel Inventory is blocked for User
Fuel Inventory includes management and reconciliation features intended for Owner/Admin workflows. User role has a limited delivery entry workflow to avoid exposing full inventory controls and approval actions.

## Why Record Fuel Delivery is available in Field Shift Capture
Cashiers receive fuel invoices during shift operations. A dedicated **Fuel Delivery Received** section is embedded in Field Shift Capture so delivery is captured at source while keeping inventory management pages restricted.

## Station assignment model
`fuel_user_station_assignments` maps users to active stations.
- Owner/Admin can view all assignments.
- User can read only own assignments.
- Owner-only helper RPCs are provided for assign/unassign operations.

`fuel_get_my_station_assignments()` returns:
- all active stations for Owner/Admin
- active assigned stations for User

## Multi-product invoice model
A single invoice is represented by:
- Header row in `fuel_delivery_batches`
- One or more product rows in `fuel_deliveries` linked via `delivery_batch_id`

Supported products:
- DIESEL
- SPECIAL
- UNLEADED

## Security / RLS / RPC notes
- Frontend uses anon key only; no service role key.
- Delivery writes go through `fuel_record_fuel_delivery_batch(payload jsonb)` RPC.
- RPC enforces auth, station checks, role checks, and assignment checks.
- Batch insert is transactional inside one function execution.
- RLS enabled on assignment and batch tables, anon grants revoked.
