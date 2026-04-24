# Supabase setup for AKY Fuel Ops

This app is a static GitHub Pages frontend. Supabase is the backend. Critical create/import validation is handled by PostgreSQL RPC functions in `supabase/migrations/004_fuel_ops_rpc.sql`.

## 1. Run the SQL schema

Open your Supabase project.

1. Go to **Supabase Dashboard**.
2. Open your project.
3. In the left sidebar, click **SQL Editor**.
4. Click **New query**.
5. Paste the full contents of `supabase/RUN_THIS_IN_SUPABASE.sql`.
6. Click **Run**.

The SQL creates:

- fuel station tables
- shift report tables
- pump and product tables
- credit receipt, expense, cash count, and lubricant tables
- import batch and export tracking tables
- RLS policies
- audit triggers using the existing `audit_logs` table
- `fuel_calculate_shift_report(payload jsonb)`
- `fuel_commit_shift_report(payload jsonb, import_context jsonb)`

## 2. Make sure your user profile role is set

The app uses your existing `profiles` table. Your signed-in user must have role `Owner` or `Admin` to create reports.

In **SQL Editor**, run this check:

```sql
select id, username, role, is_active
from public.profiles
order by created_at desc;
```

To make one user the owner, replace the email with your login email and run:

```sql
update public.profiles p
set role = 'Owner', is_active = true
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('YOUR_EMAIL_HERE');
```

## 3. Get your Supabase URL and anon/publishable key

In Supabase:

1. Go to **Project Settings**.
2. Click **API** or **API Keys**.
3. Copy **Project URL**.
4. Copy either the **anon public** key or a **publishable** key.

Do not use the service-role key in this GitHub Pages frontend.

## 4. Add GitHub secrets for deployment

In GitHub:

1. Open `shilohg25/my-business-app`.
2. Go to **Settings**.
3. Go to **Secrets and variables**.
4. Click **Actions**.
5. Click **New repository secret**.
6. Add these two secrets:

```txt
NEXT_PUBLIC_SUPABASE_URL
```

Value:

```txt
https://YOUR_PROJECT_REF.supabase.co
```

Then add:

```txt
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Value:

```txt
YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

## 5. Enable GitHub Pages via Actions

In GitHub:

1. Go to **Settings**.
2. Click **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Save.
5. Go to **Actions**.
6. Run **Deploy Next.js app to GitHub Pages**.

The app URL is:

```txt
https://shilohg25.github.io/my-business-app/
```

## 6. Local development

Create `.env.local` in the project root:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Then run:

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```
