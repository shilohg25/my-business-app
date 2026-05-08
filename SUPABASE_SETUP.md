# Supabase setup for AKY Fuel Ops

This app now runs as a dynamic Next.js application (local/Codespaces/Vercel) with Supabase as backend.

## 1. Run the SQL schema

Open your Supabase project.

1. Go to **Supabase Dashboard**.
2. Open your project.
3. In the left sidebar, click **SQL Editor**.
4. Click **New query**.
5. Paste the full contents of `supabase/RUN_THIS_IN_SUPABASE.sql`.
6. Click **Run**.

Then apply the latest files in `supabase/migrations` (including tank calibration migrations/RPC).

## 2. Ensure your profile role is set

The app uses `public.profiles`. Owner-only operations require `role = 'Owner'` and `is_active = true`.

```sql
select id, username, role, is_active
from public.profiles
order by created_at desc;
```

To make one user the owner (replace email):

```sql
update public.profiles p
set role = 'Owner', is_active = true
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('YOUR_EMAIL_HERE');
```

## 3. Environment variables

Create `.env.local` from `.env.example` and set:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Important:
- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Never prefix service role key with `NEXT_PUBLIC_`.
- Never import server admin clients into client components.

## 4. Dynamic Next.js development in Codespaces

1. Open repo in GitHub Codespaces.
2. Create `.env.local` from `.env.example`.
3. Set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Run:
   - `npm install`
   - `npm run dev:codespace`
5. Open forwarded port `3000`.
6. Visit `/inventory/fuel/`.
7. Apply Supabase migrations separately in SQL Editor or Supabase CLI.

## 5. Vercel deployment

1. Import `shilohg25/my-business-app` into Vercel.
2. Add env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Build command: `npm run build`
4. Framework: `Next.js`
5. Production URL is no longer `/my-business-app`.

## 6. GitHub Pages note

GitHub Pages static hosting is no longer recommended for production after this dynamic conversion.
