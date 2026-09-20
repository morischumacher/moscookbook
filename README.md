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
| `ANTHROPIC_API_KEY` | no | Enables the optional AI import (photo of a cookbook page, AI parsing of pasted text). Everything else works without it. |
| `ANTHROPIC_MODEL` | no | Overrides the model used for AI import. Defaults to `claude-sonnet-5`. |

### Creating the first admin

Users who register are always ordinary users. To create or promote an admin:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' ADMIN_NAME='Mo' \
  npm run create-admin
```

Afterwards, further admins can be promoted from the Users page in the admin area.

## Adding a recipe

The admin form has three fast paths, in order of how often they help:

1. **Paste text** — drop a whole recipe into the box and it is split into title,
   ingredients (quantity and unit separated from the ingredient) and numbered
   steps. Runs entirely in the browser: no API, no key, no cost. Understands
   German and English, `Zutaten`/`Zubereitung` headings, bullet lists, fractions
   (`½`, `1/2`), ranges (`2-3 EL`) and unit-less lines like `Salz`.
2. **Import a link** — paste a URL and the schema.org recipe data that most food
   sites embed is read out, including the picture, which is copied into our own
   Blob store so it keeps working if the source disappears. Also rule-based.
3. **Photo** — only shown when `ANTHROPIC_API_KEY` is set: photograph a cookbook
   page or a handwritten note and it is turned into a filled-in form.

Everything imported lands in the normal form for review before saving — nothing
is written to the database without a look. The form also keeps an autosaved
draft in the browser, generates the URL slug from the title, takes drag & drop,
clipboard paste and the phone camera for images, and shrinks photos before
upload.

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
- The URL importer refuses loopback and private address ranges, so it cannot be
  pointed at internal services.
- Recipe image URLs are restricted to `http(s)`.
