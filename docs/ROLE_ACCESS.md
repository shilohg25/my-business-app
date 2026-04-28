# Role Access

## Roles
- **Owner**: full access, including owner-only areas.
- **Co-Owner**: executive/administrative visibility and operational edits, but no owner-only controls.
- **Admin**: operational create/edit/archive and workflow actions; no owner-only controls.
- **User**: limited to approved data-entry and viewing scope.

## Owner-only pages/controls
- Audit log history page.
- User management and critical settings.
- Destructive restore/archive controls reserved by policy.

## Explanation requirements
- **Admin** and **Co-Owner** actions that edit/archive/delete/status-change must include an explanation.

## Access implementation
- Route access and nav visibility are centralized in `src/lib/auth/role-access.ts`.
- Permission checks and explanation policy are centralized in `src/lib/auth/permissions.ts`.
