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
| `NEXT_PUBLIC_SITE_URL` | optional | Base URL for canonical links and OpenGraph images. On Vercel this is derived from `VERCEL_PROJECT_PRODUCTION_URL`, so it is only needed once you have a custom domain. |
| `ANTHROPIC_API_KEY` | no | Enables the optional AI import (photo of a cookbook page, AI parsing of pasted text). Everything else works without it. |
| `ANTHROPIC_MODEL` | no | Overrides the model used for AI import. Defaults to `claude-sonnet-5`. |

### Registration is by invitation

There is no open sign-up. An admin creates a single-use link under
**Admin → Invitations**, sends it, and it stops working once somebody signs up
with it or after 14 days. A used invitation is kept as a record of who joined;
revoking one makes the link dead immediately.

The claim is atomic: two people opening the same link at the same moment do not
both get an account, because the invitation is marked used in the same
statement that checks it is still open. If anything then fails — a duplicate
e-mail, a database error — the invitation is released rather than burned.

Codes are stored as written rather than hashed, so an admin can copy a link
again later. They are 128 bits of randomness, single use, and expire; a
database leak already exposes password hashes, so this is not the weak link.

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

Twenty-four recipes per page, with older ones behind a next link that keeps the
active filters. "Best rated" paginates too: Prisma cannot order by an average
across a relation, so the page fetches the matching ids, ranks them against one
aggregate query, and then reads only the recipes it is about to show — rather
than loading the whole collection into memory to sort it, which is what it did
before.

The admin dashboard is capped at the hundred most recent recipes; it is for
editing, not browsing.


A masthead, one search field, and the filters as chips rather than four select
boxes. The chips are built from the data: every category and cuisine that
actually occurs, with its count, busiest first. The old bar offered a fixed
list, so it showed categories nobody had used and hid hand-typed ones — a
filter could lead to an empty page.

On a phone the category chips scroll sideways in one line instead of stacking
four dropdowns down the screen.

## The inbox

Adding a recipe used to mean a laptop, a form and ten minutes, which no evening
survives. So collecting, parsing and deciding are now three separate things:

1. **Collecting** has to be instant — one tap in a share sheet while standing in
   a shop. A capture is written to the database raw, before anything is parsed.
2. **Parsing** runs straight afterwards and is allowed to fail. A capture that
   could not be read keeps everything that was sent and can be retried later,
   against a better parser.
3. **Deciding** waits for a free evening. `/admin/inbox` shows one row per
   capture with one decision each: take it, finish it, read it again, bin it.

### What can be read

| Shared | What happens |
| --- | --- |
| A recipe site | schema.org/Recipe data, as the manual link import already did |
| A YouTube link | the video description, which is where "full recipe below" points; chapter markers, subscribe pleas and bare links are stripped first |
| An Instagram or TikTok link | those sites refuse to be read, so the **caption** that came with the share is parsed instead — which is why the shared text is kept even when a link is present |
| Plain text | the same rule-based parser as paste-and-parse |
| An e-mail | subject and body, with forwarding headers, quotes and signatures stripped |
| A photograph | kept, and marked as needing the AI import or a minute of typing |

Nothing here needs an API key. A video whose recipe is only spoken comes back
as *needs a minute* with its title and thumbnail, rather than as a confidently
wrong recipe.

### By e-mail

The channel that works from every device and every app without installing
anything, and the one a friend can use without being told to install anything.

Gmail cannot call a webhook, and inbound-mail services want a domain in the mail
path, so the bridge is a Google Apps Script: `scripts/gmail-to-inbox.gs`, living
in the same account as the mailbox, run by a timer every fifteen minutes. It
sends only unread mail carrying a Gmail label, and marks a message read once the
cookbook has accepted it — so a failed send is retried on the next run rather
than lost, and nothing is ever sent twice. A Gmail filter decides what gets the
label; a script that swallowed the whole inbox would put every newsletter into
the cookbook.

What arrives by mail is a mess — forwarding headers, quoted replies,
signatures, "Gesendet von meinem iPhone", and a subject that has been through
three clients. `src/lib/email.ts` cleans it, one-sidedly: it cuts only at
markers that cannot be part of a recipe. A forwarded header block is removed but
what follows it is kept, because in a forward the recipe comes *after* the
header. Quoted lines are unquoted rather than dropped, because a recipe replied
to arrives entirely quoted.

The subject becomes the capture's label, never the start of the body: the recipe
parser names a dish after the first line it is given, and "Fwd: schau mal" is
not a dish.

### Duplicates

The inbox says when something looks like it is already in the cookbook. The same
link that already became a recipe is certain; a matching title is a suspicion.

It is only ever a hint next to the capture, never a refusal — a false warning
costs a second of reading, a wrongly blocked recipe is a recipe lost. And it
warns only when two titles say the *same* thing: "Apfelkuchen" does not flag
"Apfelkuchen mit Streuseln und Vanillesauce", because that is a different cake
and a warning there teaches you to ignore warnings.

### Setting it up on an iPhone

iOS cannot add a web page to the share sheet — Web Share Target is an Android
feature — so a Shortcut does the job instead. `/admin/devices` creates a key and
walks through the five steps; the key is shown once and stored only as a hash.

The Shortcut needs exactly one field: whatever was shared goes out as `text`,
and the link is dug out of it on this side. That way a post carrying both a
caption and a link keeps both.

One key per device, so a lost phone costs one revoke. `lastUsedAt` on a revoked
key is how you find out whether it was still being used afterwards.

## Search

The search box looks at titles, descriptions, ingredient names and the method,
through Postgres full text search with the `german` configuration. Titles are
weighted above everything else, so a recipe *called* Zwiebelsuppe comes before
one that merely lists an onion, and the results are ordered by relevance unless
you pick a different sort yourself.

German needs two things the database does not provide, both measured rather
than assumed — `npm run verify:search` is the measurement:

| Typed | Recipe says | Works because |
| --- | --- | --- |
| `Kase` | Käse | Postgres' German stemmer folds umlauts itself (`'kas'`) |
| `Kaese` | Käse | the indexed text carries an ae spelling alongside the original |
| `Zwiebel` | Zwiebeln | each word is searched as a prefix |
| `Zwiebeln` | Zwiebel | the query also offers a de-pluralised alternative |
| `Eis` | — | **not** reduced to `Ei`: a stem must keep four letters, or ice cream starts suggesting eggs |

The indexed text lives in `Recipe.searchTitle` and `Recipe.searchBody`, written
by `searchFields()` in `src/lib/searchText.ts` — one function, used by every
writer, with `npm run check:search` failing the build if a new one forgets. The
`searchVector` column is derived from those two by Postgres, so it cannot fall
out of step, and a GIN index makes the lookup cheap.

After deploying the search migration, run `npm run reindex` once. The migration
backfills the columns with the recipes' own wording, so search works
immediately; the reindex is what adds the ae spellings.

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

## Backup and restore

The cookbook exists in one hosting account. Everything else on this list is an
annoyance if it goes wrong; this is the only part that cannot be redone.

**From the browser** — Admin → Backup downloads every recipe as one JSON file.
Fast, always works, and the file stays readable without this application. It
references the images by URL, so it is a full restore only while the Blob store
is alive.

**From your machine** — `npm run backup` writes a folder containing the same
archive *and the image files themselves*:

```bash
npm run backup                              # -> backup/2026-09-20/
npm run backup -- --out ~/Dropbox/cookbook  # somewhere that syncs
```

It talks to the database directly, so there is no serverless time limit and no
upload size to worry about. One unreachable image is reported and skipped
rather than costing you the whole backup.

**Restoring** — the browser accepts an archive file; `npm run restore --
backup/2026-09-20` additionally re-uploads the image files, which is the case a
backup exists for:

```bash
npm run restore -- backup/2026-09-20            # keeps what is already there
npm run restore -- backup/2026-09-20 --replace  # overwrites matching slugs
```

Recipes that already exist are skipped unless `--replace` is given: a restore
that silently overwrites the version you have been editing is a second
disaster, not a recovery. Views, ratings and favourites are not imported —
they belong to an installation, not to a recipe.

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
| `npm run check:search` | Verify every recipe writer maintains the search columns |
| `npm run check:contrast` | Verify the colour tokens meet WCAG AA, in both themes |
| `npm run check:design` | Refuse colours that bypass the design tokens |
| `npm run fixtures` | Collect real pages to test the import against |
| `npm run reindex` | Rebuild the search columns for every recipe |
| `npm run verify:search` | Check the German search against a real Postgres |
| `npm test` | Run the logic check suites |
| `npm run backup` | Write an offline copy, images included |
| `npm run restore` | Put a backup folder back |

## Shopping list

Add recipes from their pages, then `/shopping-list` merges their ingredients
into one list you can tick off and print.

Two lines are merged only when the name **and** the unit match. `200 g` and
`300 g` of flour become `500 g`; `2 Zwiebeln` and `100 g Zwiebeln` stay apart,
because adding them would produce a number that means nothing. Lines without a
quantity are listed once, never as "2 Salz".

Names are matched exactly, apart from case and spacing. An earlier version
stripped German plural endings so `Zwiebeln` and `Zwiebel` would merge — but
that also turns `Eis` into `Ei`, and a list that quietly adds ice cream to eggs
is worse than one that lists onions twice. Being slightly redundant is the safe
failure, and the tests pin that decision down.

The selection lives in `localStorage` and is mirrored into the URL, so a list
can be sent to whoever is going to the shop.

## On a phone

This is mostly a phone app: recipes get read standing at the counter and
written with one hand. The rules the code follows:

- **Never block zoom.** The viewport sets no `maximum-scale` and no
  `user-scalable=no`.
- **Fields are at least 16px on small screens.** Below that iOS Safari zooms
  the page in on focus and does not zoom back out. A global rule enforces it
  regardless of the utility class a field carries.
- **Touch targets are 40px or more.** Chips, the ingredient row controls and
  the rating stars (which get extra padding on coarse pointers without looking
  any different).
- **No sideways scrolling.** Filters are chips that scroll in their own row,
  and the admin views are lists, not tables.
- **Nothing is loaded that a reader will not see.** The monospace font is used
  only by the admin form, so it is not preloaded.
- `env(safe-area-inset-bottom)` keeps the last row clear of the home indicator.

## Ingredients

Ingredients are rows in their own table, not a JSON string on the recipe. Each
row keeps both the author's wording and the parts a program can use:

| Column | Example for `2-3 EL Olivenöl` |
| --- | --- |
| `raw` | `2-3 EL` — exactly what was typed |
| `quantity` / `quantityMax` | `2` / `3` |
| `unit` | `EL` |
| `name` | `Olivenöl` |

`raw` is what you see at normal serving size, so a line the parser reads
differently than intended still reads back exactly as written. The numbers are
used when the amounts are scaled, which is why `1/2 TL` at triple servings now
gives `1 1/2 TL` rather than a manipulated string.

Rows are replaced wholesale on save rather than diffed: the list is short,
order matters, and a rewrite keeps positions contiguous.

The search box on the home page matches ingredient names as well as titles and
descriptions, which is the question people actually have: what can I cook with
the aubergine in the fridge.

## Look and feel

One visual language across the whole app: the warm paper background, extrabold
headings, serif body copy and hairline rules of the public pages also carry the
admin area, login and registration.

Colours are named by role, never by shade. The palette lives in `globals.css`
and is mapped to Tailwind in `tailwind.config.ts`:

| Class | Role |
| --- | --- |
| `bg-page` | page background |
| `text-ink` | body text and headings |
| `text-muted` | secondary — meta lines, hints, captions |
| `text-faint` | tertiary — eyebrows, counts, placeholder icons |
| `border-line` | hairline rules and input borders |
| `bg-surface` | subtle fills — thumbnails, panels |
| `text-danger`, `bg-danger-surface`, `border-danger-line` | destructive actions and alerts |

This is what makes dark mode work: the components carry no `dark:` variant for
colour at all, only the variables change. Before this there were 52 separate
uses of `text-gray-500`, plus hard-coded hexes and `dark:` pairs that had
already drifted apart in places.

The admin tables became lists. A table of four columns on a 375px screen scrolls
sideways and is miserable to use on the phone you are actually holding when you
want to fix a typo in a recipe.

## Testing the import

Two layers, because they answer different questions.

`tests/importVariants.test.ts` covers the shapes schema.org *allows*: a yield
that is `4`, `"4 Portionen"`, `"Für 4 Personen"` or `["4 servings", "4"]`; a
method that is one HTML blob, an array of `HowToStep`, or nested
`HowToSection`s; an image that is a string, an array, an `ImageObject`, or an
`ImageObject` inside an array; a recipe buried in a `@graph` next to two other
blocks, one of which is malformed.

Writing those found two real bugs on the first run. A step that already read
`"1. Rühren."` came out as `"1. 1. Rühren."`, and a `recipeIngredient` given as
a single string — which the specification permits — imported a recipe with no
ingredients at all.

`npm run fixtures` covers the shapes particular sites actually *emit*, which is
a different and much less tidy set. It fetches pages you would really import and
keeps only the parts the extractor reads, so a fixture is a few kilobytes and
readable in a diff. See `tests/fixtures/README.md`.

## Sharing a recipe

The share button opens the phone's own share sheet through `navigator.share`,
which is the thing people already know how to use. Where that does not exist —
most desktop browsers — the link goes to the clipboard, and if even that is
refused the URL appears on screen to be copied by hand. Three rungs, because a
button that silently does nothing is worse than no button.

Cancelling the share sheet is not treated as a failure. It rejects with
`AbortError`, and falling back to the clipboard there would be rude.

What the person on the other end sees comes from the page's OpenGraph data. A
recipe with a photograph shows the photograph; one without used to show a bare
link, which reads like spam, and now falls back to a branded card.

Every recipe page also carries **schema.org/Recipe** markup — the same markup
this application reads out of other people's pages when importing. That makes
the recipes legible to Google and to anyone else's importer, and it means the
cookbook can import from itself, which is exactly what the round-trip test
does: build the markup, feed it to our own extractor, and check that nothing
was lost. That test earned its keep on the first run by catching
`recipeIngredient` being emitted as objects rather than strings — markup no
importer could have read.

The JSON is escaped before it goes into the `<script>` block. Recipe titles can
come from the capture inbox, which means from whatever page a stranger wrote,
so a title containing `</script>` is not hypothetical.

## Errors

`/admin/errors` lists what has been failing: one row per problem with a count,
not one row per occurrence. Client errors are reported by the error boundaries,
server errors through `reportServerError`, and both are grouped by a
fingerprint that ignores the parts of a message which vary — so "Recipe 7 not
found" and "Recipe 1284 not found" are one entry.

Deliberately not Sentry. Sentry is better: it symbolicates stacks and can send
an e-mail when something new appears. But it is a third party, an account and a
bill, and the rule here has been that nothing essential depends on a
subscription. Everything in `src/lib/errorReport.ts` would be thrown away
rather than migrated if that changes, which is the right shape for a decision
that might be reversed.

The query string is stripped from the reported path before it is stored. An
error report is not a place to start collecting what people searched for.

## Pictures

A recipe can hold several. The first one is the cover and the one that goes
into a shared link's preview; the rest appear as thumbnails under it, and all
of them are printed. Order is stored rather than inferred — read by id, a
gallery reshuffles itself the moment one picture is replaced.

## The oyster

The mark in the logo is what a recipe is rated in, so it is one shape in one
place: `src/components/brand/Oyster.tsx`, drawn, taking its colour from
`currentColor`.

It used to be a 482 KB photograph drawn at 24 pixels and tinted with

```css
filter: invert(53%) sepia(85%) saturate(3029%) hue-rotate(346deg) …
```

which made a muddy blur out of a photographic shell, could not follow dark
mode, and printed as a grey smudge — and, worst of it, an empty shell and a
full one looked almost the same, so you could not read a rating at a glance.
Drawn, it is about a kilobyte, scales, prints, and has two growth rings rather
than four because four turn to mush at the size it is actually used.

The wordmark is still `public/logo.png`, deliberately: redrawing it is a
decision about the brand, not a technical one. It goes through
`src/components/brand/Logo.tsx` so the navigation and the printed masthead use
the same mark — the print stylesheet hides `nav`, and a printed recipe used to
come out unbranded.

## Colour and contrast

Colours are tokens in `globals.css`, one set per theme, and `npm run
check:contrast` measures every one of them against the page background in both.

That check was not written for its own sake. `--color-faint` was `#9CA3AF`,
which is **2.41:1** on the page — below even the 3:1 asked of a graphic, while
carrying every uppercase label on the site. It is 4.59:1 now, `--color-muted`
moved with it to keep the hierarchy, and dark mode needed its own fix.

There are two line tokens, and the difference matters. `--color-border` is the
hairline between rows: decorative, almost invisible, and exempt from the check.
`--color-control` is the outline of something you operate — a chip, a select, a
field — which WCAG asks to be 3:1, and which was previously drawn with the
hairline. That is why the filter row read as one black pill and a few loose
words rather than as a row of buttons.

Underneath that was a better bug still: `globals.css` reset every button with
`border: none`. The shorthand also sets `border-style`, and Tailwind's `border`
utility only sets the width — so **no outlined button in the application could
ever draw its outline**. It was found by building a static preview of these
pages and looking at the result, which is a habit worth keeping.

The brand orange has two tokens on purpose. `--color-accent` (#ff4a0e, the
logo's orange) is 3.2:1 on the page: enough for a shape, not for words. Text
and links use `--color-accent-text`, which is darker in light mode and the
brand orange in dark mode, where it already passes.

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

`npm test` runs `tests/run.ts` through ts-node in transpile-only mode — types
are already checked by `npm run typecheck`, and checking them twice would drag
the generated Prisma client into every test run for no benefit. It is — a few hundred lines of plain
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

## Migrations

`prisma/migrations/0_init` is a PostgreSQL baseline matching the current
schema. It replaces the original SQLite migration, which had been left behind
when the project moved to PostgreSQL and made `prisma migrate` unusable
against the real database.

**On the existing database**, mark the baseline as already applied once, then
migrate normally from there:

```bash
npx prisma migrate resolve --applied 0_init
npx prisma migrate deploy
```

**On a fresh database**, `npx prisma migrate deploy` is enough.

The baseline SQL was written by hand, so confirm it matches the schema exactly
before relying on it — this prints nothing if they agree:

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$POSTGRES_URL_NON_POOLING" \
  --exit-code
```

## Security notes

- Every API route that reads or writes data checks the session first; admin-only
  routes go through `requireAdmin()` in `src/lib/auth.ts`.
- `/api/upload` is admin-only and validates file type and size before writing to
  Blob storage.
- The admin area is guarded twice: in `proxy.ts` and again server-side in
  `src/app/[locale]/admin/layout.tsx`.
- Login and registration are rate limited per IP.
- The URL importer refuses loopback and private address ranges, so it cannot be
  pointed at internal services.
- Recipe image URLs are restricted to `http(s)`.
