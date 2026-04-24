# My Business App

This repository has been restructured into a runnable **Next.js App Router** project.

## What's included

- `src/app` application routes and global layout.
- `src/components` for UI and dashboard layout components.
- `src/lib` for utility helpers and domain logic (`types`, `calculations`, `validation`).
- `public/logo.png` static brand asset used in the sidebar.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- Home route redirects to `/dashboard`.
- The dashboard is scaffolded and ready for integrating Supabase data and full operational modules.
