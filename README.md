# AKY Fuel Ops (Web-first Executive App)

Business operations app built with Next.js App Router + Supabase.

## Delivery priority
1. Backend/database foundation first.
2. Web admin/executive dashboard second.
3. Mobile data-entry app later (same backend).

## Run locally
```bash
cp .env.example .env.local
npm install
npm run dev
```

## Validation/build checks
```bash
npm run typecheck
npm run build
npm test
```

## Supabase setup
1. Follow `SUPABASE_SETUP.md`.
2. Apply SQL from `supabase/RUN_THIS_IN_SUPABASE.sql`.
3. Apply latest migrations in `supabase/migrations`.

## Security and governance highlights
- Centralized role and route access policy in `src/lib/auth`.
- Audit logging for important state changes.
- Admin/Co-Owner edit/archive/status changes require explanation.
- Archive/soft-delete patterns are preferred for business records.

## Project structure
- `src/app` routes/pages
- `src/components` feature UI
- `src/lib/data` Supabase access
- `src/lib/domain` calculations/rules
- `src/lib/analytics` dashboard/report analytics
- `src/lib/validation` Zod schemas
- `src/lib/config` app config/date windows
- `src/types` shared types

## Additional docs
- `docs/ARCHITECTURE.md`
- `docs/PRIORITY_ROADMAP.md`
- `docs/ROLE_ACCESS.md`
- `docs/MOBILE_APP_LATER.md`
