# Architecture (Web-first Foundation)

## Product priority
1. **Backend/database foundation first** (Supabase schema, RLS, RPC, audit integrity).
2. **Web app/admin dashboard second** (executive control center).
3. **Mobile app later** (fast data entry only, same backend).

## Layered structure
- `src/app`: Next.js App Router pages and layouts only.
- `src/components`: UI and feature components.
- `src/lib/data`: Supabase data access.
- `src/lib/domain`: business rules/calculations.
- `src/lib/auth`: role access and permission policy.
- `src/lib/analytics`: dashboard/report aggregates.
- `src/lib/validation`: reusable Zod schemas.
- `src/lib/config`: app-level config and date windows.
- `src/types`: shared app types.

## Data flow
1. Route/component loads with current profile role.
2. Role access checks are centralized in `lib/auth`.
3. UI calls `lib/data/*` functions (no raw query spread in page files).
4. Domain calculations run in `lib/domain` and analytics in `lib/analytics`.
5. Mutations write audit records (including explanation requirements for Admin/Co-Owner edits/archive/status changes).

## Maintainability rules
- Keep business logic out of route files.
- Keep Supabase table access in data modules.
- Reuse Zod schemas from `lib/validation` across web and future mobile.
- Use soft-delete/archive, not hard delete, for business records.
