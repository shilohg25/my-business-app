# Mobile App Later (Execution Notes)

- The mobile app should focus on **fast field data entry** only.
- Mobile must use the **same Supabase backend** (tables, RLS, and RPC functions).
- Mobile must **not** own separate calculation/approval/audit business rules.
- Web app remains the executive/admin control center for approvals, reporting, settings, and audits.

## Recommended boundary
- Mobile: capture meter readings, expenses, receipts, and shift submission drafts.
- Web: user/role management, audit log review, analytics, exception handling, exports.
