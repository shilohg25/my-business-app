# Priority Roadmap

## Phase 1 — Backend foundation (current)
- Harden Supabase schema with indexes for common executive filters.
- Preserve existing tables and add non-breaking migrations.
- Keep audit log records rich: actor, role, action, entity, snapshots, explanation, timestamp.

## Phase 2 — Web app/admin dashboard (current)
- Keep Next.js App Router product as the primary operational interface.
- Refactor role access to centralized policy functions.
- Keep dashboard modules maintainable and fast with reusable metric sections.

## Phase 3 — Mobile app support (later)
- Build mobile data-entry UI only after web/admin flow stability.
- Reuse same Supabase tables/RPC and validation schemas.
- Do not duplicate business logic in mobile.
