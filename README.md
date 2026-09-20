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
| `NEXT_PUBLIC_SITE_URL` | recommended | Base URL for canonical links and OpenGraph images. Without it a hard-coded default is used, and shared links may preview with the wrong domain. |
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

## The home page

A masthead, one search field, and the filters as chips rather than four select
boxes. The chips are built from the data: every category and cuisine that
actually occurs, with its count, busiest first. The old bar offered a fixed
list, so it showed categories nobody had used and hid hand-typed ones — a
filter could lead to an empty page.

On a phone the category chips scroll sideways in one line instead of stacking
four dropdowns down the screen.

## Reading a recipe

The recipe page is built for someone standing at the stove:

- **Portionsrechner** — when a recipe has a serving count, the amounts scale with
  it. Quantities are stored as the author typed them, so scaling works on the
  string: `200 g` → `400 g`, `1/2 TL` → `1 TL`, `2-3 EL` → `4-6 EL`. Anything the
  parser cannot read is left untouched rather than shown as a wrong number.
- **Kochmodus** — larger type, and the screen is kept awake via the Screen Wake
  Lock API where the browser supports it (silently skipped where it does not).
- **Abhaken** — ingredients and steps can be ticked off while cooking.
- **Drucken** — a print stylesheet drops the navigation and chrome.
- **Link-Vorschauen** — each recipe page generates its own metadata and
  OpenGraph image, so a shared link shows the dish rather than the site name.

## Languages

The site runs in English and German at `/en` and `/de`. All user-facing text
lives in `messages/en.json` and `messages/de.json` — nothing is hard-coded in a
component any more, including the admin area.

Category and cuisine names are stored on the recipe as typed and only
translated when they match a known value, so a hand-written "Großmutters
Sonntagsbraten" category survives a language switch untouched.

`npm run check:messages` guards the catalogues: it fails when a key used in the
source is missing from a catalogue, when the two catalogues drift apart, when a
message loses an ICU placeholder in translation, or when a value is empty.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run create-admin` | Create or promote an admin user (see above) |
| `npm run db:push` | Apply the Prisma schema to the database |
| `npm run check:messages` | Verify the translation catalogues |
| `npm test` | Run the logic check suites |

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: translations,
lint, tests, types, build — cheapest first, so an obvious mistake fails in
seconds. The build step uses placeholder environment variables; nothing in it
reaches a database.

`npm run lint` is set to `--max-warnings 0`. If that ever gets in the way
during a quick edit, drop the flag in `package.json` rather than leaving
warnings to pile up.

Pushing this workflow file needs a token with the **Workflows: Read and write**
permission (fine-grained) or the `workflow` scope (classic). Without it GitHub
rejects the push with "refusing to allow a Personal Access Token to create or
update workflow".

## Testing

`npm test` runs `tests/run.ts` through ts-node — a few hundred lines of plain
assertions over the pure logic, with no test runner to configure. It covers
what is easy to get subtly wrong and expensive to get wrong in production:

- **`amount.test.ts`** — scaling ingredient amounts, including the cases that
  must be left alone ("etwas", "nach Geschmack") and a round trip that scales
  up and back down to the original string
- **`recipeParser.test.ts`** — turning pasted text into fields, German and
  English, with and without headings
- **`recipeFromHtml.test.ts`** — schema.org extraction across the shapes real
  sites use, plus the URL safety check
- **`recipeSchema.test.ts`** — payload validation, including rejecting
  `javascript:` image URLs

UI behaviour is not covered.

## Project layout

```
src/app/[locale]/        Pages: home, recipe detail, login, register, admin
src/app/api/             Route handlers: auth, recipes, users, upload
src/components/          Shared UI (navbar, recipe card, rating, favourite…)
src/lib/                 Session, auth guards, rate limiting, recipe helpers
prisma/                  Schema, migrations and seed
messages/                Translations (en, de)
scripts/                 Admin bootstrap, translation check
tests/                   Logic check suites (npm test)
```

## Known issues

- `prisma/migrations` still holds the original SQLite migration and a
  `migration_lock.toml` that says `provider = "sqlite"`, while the schema has
  long since moved to PostgreSQL. `prisma migrate` would fail against the real
  database; schema changes are applied with `npm run db:push` instead. The
  folder should either be rebuilt as a PostgreSQL baseline or removed.

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
