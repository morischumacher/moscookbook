# mo'scookbook

A personal recipe site: public recipe pages with ratings, favourites and view
counts, plus an admin area for writing and editing recipes. Built with Next.js
(App Router), Prisma on Vercel Postgres, Vercel Blob for images, iron-session
for authentication and next-intl for English/German.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npx prisma migrate dev       # set up the database schema
npm run dev
```

The site runs at http://localhost:3000 and redirects to `/en` or `/de`.

### Environment variables

See [`.env.example`](.env.example) for the full list. The one that matters most:

| Variable | Required | Notes |
| --- | --- | --- |
| `SECRET_COOKIE_PASSWORD` | **yes** | Encrypts the session cookie. Minimum 32 characters. In production the app throws on startup if it is missing — without it, anyone could forge an admin session. Generate with `openssl rand -base64 32`. |
| `POSTGRES_PRISMA_URL` | yes | Pooled connection, set automatically by Vercel Postgres. |
| `POSTGRES_URL_NON_POOLING` | yes | Direct connection, used for migrations. |
| `BLOB_READ_WRITE_TOKEN` | yes | Set automatically by Vercel Blob. |

### Creating the first admin

Users who register are always ordinary users. To create or promote an admin:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' ADMIN_NAME='Mo' \
  npm run create-admin
```

Afterwards, further admins can be promoted from the Users page in the admin area.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run create-admin` | Create or promote an admin user (see above) |

## Project layout

```
src/app/[locale]/        Pages: home, recipe detail, login, register, admin
src/app/api/             Route handlers: auth, recipes, users, upload
src/components/          Shared UI (navbar, recipe card, rating, favourite…)
src/lib/                 Session, auth guards, rate limiting, recipe helpers
prisma/                  Schema, migrations and seed
messages/                Translations (en, de)
```

## Security notes

- Every API route that reads or writes data checks the session first; admin-only
  routes go through `requireAdmin()` in `src/lib/auth.ts`.
- `/api/upload` is admin-only and validates file type and size before writing to
  Blob storage.
- The admin area is guarded twice: in `middleware.ts` and again server-side in
  `src/app/[locale]/admin/layout.tsx`.
- Login and registration are rate limited per IP.
