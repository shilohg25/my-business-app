# AKY Fuel Ops

Next.js App Router frontend for fuel station shift/remittance reporting.

## Current implementation

- GitHub Pages static export support.
- Supabase Auth browser login.
- Supabase-backed dashboard counts.
- Station list from `fuel_stations`.
- Manual shift report entry.
- Excel OSR import preview in the browser.
- Commit report through PostgreSQL RPC.
- Audit log list.
- Normalized Supabase migrations.
- PDF/Excel/CSV report export seams.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase setup

Read `SUPABASE_SETUP.md` first. The SQL to paste into Supabase is at:

```txt
supabase/RUN_THIS_IN_SUPABASE.sql
```

## GitHub Pages

The workflow is in:

```txt
.github/workflows/pages.yml
```

Set GitHub repository secrets:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Then set Pages source to **GitHub Actions**.
