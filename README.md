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

The page used to open with the site's name in 48px, forty pixels under a
navigation bar that already said the same words. That was the whole first
screen of a phone spent on the name of the site the person was already looking
at. The heading is now what the page is *about*, and the recipes start where
the second "mo'scookbook" used to be — about 130px higher.

In a card, the category and cuisine used to be a line of uppercase with wide
tracking, which made the least important thing in the card the loudest after
the title. They are context, so they now read as context, directly under the
title where they say what the dish is.

They stayed on a line of their own, though, and the reason is worth recording:
folded in beside the rating they had about a hundred pixels on a phone, which
is enough to truncate "Hauptgericht" into "Hauptgeric…". A saved row is not
worth a clipped word. (The two-row split was originally there for a different
reason — oysters and words strung together with bullets wrapped, leaving a
dangling bullet. That cannot happen now: the rating never shrinks.)

The thumbnail went from 96px in an outlined box to 112px, rounded, with no
outline. A small square in a frame reads as an icon standing in for a
photograph; this reads as the photograph. The tint is only what shows through
when a recipe has no picture yet.


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
| A screenshot or a photograph | stored first, then read by the AI import when a key is configured; kept with a clear note when it is not |

A video whose recipe is only spoken comes back as *needs a minute* with its
title and thumbnail, rather than as a confidently wrong recipe.

### Screenshots

A screenshot is how most people actually save a recipe on a phone. It is one
button, it works on an app that refuses to be read any other way, and it is
what somebody standing in a kitchen with a cookbook does.

It arrives as base64 in the same JSON body as everything else — not multipart,
because an iOS Shortcut has a "Base64 Encode" block and cannot build a
multipart request at all. A third more bytes on the wire, which for one
screenshot is nothing.

The picture is **stored before anything is read out of it**. A screenshot taken
in a kitchen is the only copy of that moment, and losing it to a parser having
a bad day would be the one unforgivable failure in this pipeline. It is also
read back out of our own store rather than kept from the request, so that the
retry button in the inbox takes exactly the same path as the first attempt.

This is the only place the AI import is reached from the capture pipeline, and
it is the honest exception to *nothing here needs an API key*: a screenshot is
pixels, and there is no rule that reads pixels. Without a key the capture still
lands, with the picture attached and a note saying what it needs. **Nothing is
ever refused for want of a key.**

A picture is carried whatever else was sent, so it is never the thing that got
lost, and the order is deliberate: a link is tried first, because a page can be
read; then the text, because reading words is exact and reading a picture of
words is a guess; the picture last. But if the first two come to nothing and a
screenshot is there, it gets one more attempt — which is exactly the Instagram
case, where the link is a login wall and the caption is "so gut 😍".

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

A second Shortcut, accepting **images**, sends a screenshot: *Base64 Encode* the
input, then post

```json
{ "image": { "base64": "<the encoded image>", "mediaType": "image/png" } }
```

to the same endpoint with the same key. `text` and `note` may travel alongside
it. Set it as the Photos share sheet action and a screenshot goes into the
inbox in two taps.

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

## The channels, tested end to end

`tests/channels.test.ts` drives every way a recipe gets in, from the JSON body
a real device posts to the draft that lands in the inbox: the share sheet on a
YouTube video, an Instagram caption whose page cannot be read, TikTok, an
ordinary recipe page, a typed note, a forwarded e-mail, an e-mail carrying only
a link, and a photograph. Nothing in between is stubbed except the network.

That boundary is the point. The parsers each have their own tests; what this
file covers is the joining, which is where the interesting bugs live. Its first
run found two:

- a YouTube recipe whose last step was `#suppe #linsen`, because the hashtag
  line every cooking video ends with survived into the method;
- every forwarded e-mail named after the covering note above the forward —
  "Schau mal, das ist das Rezept von Tante Elfi." — because the separator was
  dropped but what came before it was kept.

It also covers the text that real messages are made of: Windows line endings
from Outlook, and the non-breaking space between number and unit that copying
from any recipe site produces and that is invisible in every editor.

The logic between "the body is valid" and "write a row" lives in
`src/lib/captureInput.ts` rather than inside the route, so it can be driven
without a request, a session and a database.

The fixtures are written by hand from the shape of the real thing, because the
container these tests run in cannot reach the internet. The YouTube watch page
and the Instagram case are the two worth replacing with real captures —
`npm run fixtures -- <url>` reduces a real page to the parts that matter.

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

## Accounts and e-mail

Registration is by invitation. What has been added is the pair of things that
make an address worth having: **password reset** and **address confirmation**.

Both use the same mechanism, because they have identical security needs: a
long random string mailed to an address, stored only as a hash, usable once,
expiring on its own. `src/lib/authTokens.ts` holds it, and `tokenState()` is
the single place that decides whether a token may be redeemed — one function
rather than a condition at each call site, because "expired" and "already
used" are exactly the checks that get forgotten in the second place they are
needed.

Only the hash is stored. For the minutes it lives, a reset token is as good as
the password, and it would be strange to hash passwords and then keep a live
skeleton key in the next table.

The two differ only in how long they last. A reset link is a live key to an
account, so it lasts an hour; a confirmation link grants nothing, so it can
afford to be patient with someone who reads mail on Sunday, and lasts a week.

A few decisions worth knowing:

- **`/api/auth/forgot` always answers the same way**, whether or not the
  address belongs to an account — even for an address that is malformed.
  Anything else turns it into a way of asking "is this person a member of this
  cookbook", and for an invite-only site that is a question worth not
  answering. It is limited per IP *and* per address: the first stops someone
  walking a list, the second stops this cookbook being used to fill a
  stranger's inbox.
- **Asking again invalidates the previous link.** Three taps on "forgot my
  password" should not leave three live keys sitting in a mailbox. Old ones are
  marked used rather than deleted, so a second tap on an old link says "this
  link has expired" instead of "unknown link".
- **Redeeming is a single conditional `UPDATE`**, not a read followed by a
  write. Mail clients and link scanners follow URLs in messages, and two
  requests must not both come away holding a valid token.
- **A completed reset confirms the address too**, and sweeps every other
  outstanding token for that account. Following a link sent to the address is
  proof the address works; asking for that proof again in a separate mail would
  be ceremony.
- **An unconfirmed address is not locked out.** Somebody already vouched for
  this person; locking them out because a mail went to spam would punish them
  for something that is not theirs to fix. There is a banner, and what
  confirming buys is the ability to reset their own password later.

Sending goes through `src/lib/mailer.ts` — Gmail SMTP with an app password,
which is two minutes of setup on an account that already exists and costs
nothing. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (see `.env.example`; the app
password is created at <https://myaccount.google.com/apppasswords> and is *not*
the account password). Without them the cookbook works exactly as before and
`sendMail` reports `notConfigured` rather than throwing — a cookbook whose
password reset is not set up should still serve recipes.

The messages are plain functions in `src/lib/authMail.ts`, returning subject,
text and HTML, so the things that actually go wrong with transactional mail — a
link that is not in the body, a German message signed in English, an expiry the
text contradicts — are all testable without a mail server. Plain text is the
real message and HTML the decoration; a reset link that only exists inside a
styled table is a reset link some people cannot use.

## The blog

One model, `Post`, for two things that turned out to be the same thing written
on different days.

An entry with no recipe is an ordinary post. An entry with a recipe attached is
a dated note on that recipe's page — "made it again with half the sugar,
better" — and also appears on the blog page like any other entry. The
difference between them is one nullable column, and keeping them apart would
have meant two tables, two editors and two lists for it.

**Writing never requires a recipe.** The dropdown opens on "no recipe", which is
the default, and nothing about an entry changes when it has one except where
else it shows up. **Writing never requires the AI import either** — there is no
AI anywhere in this part of the application. This is the one place where the
words are supposed to be the author's, and a machine offering to write them
would be answering a question nobody asked.

Markdown, rendered with the same library the recipe method uses. No editor
toolbar, no blocks, no rich text: the thing being written is a few paragraphs
about a cake, and every format beyond Markdown is a format that has to be
migrated later. The prose styles are seven rules in `globals.css`, written out
rather than pulled in with a typography plugin — a plugin would bring a colour
palette of its own, which `check:design` exists to keep out.

Drafts and publishing are two buttons rather than a checkbox, so neither can
happen by accident, and Enter in a field means "save what I have", never
"publish". The publication date is set once when an entry is first published
and then left alone: editing something from last year must not move it back to
the top of the list as if it were new. `updatedAt` already records the other
thing.

A draft is visible to an admin and to nobody else — `notFound()` rather than a
403, because somebody without rights has no business knowing an unfinished
entry exists at that address. Entries share exactly like recipes, at
`/de/p/<token>`, and a token stops working if the entry goes back to being a
draft: unpublishing has to mean unpublished, or "draft" is only a label.

Notes under a recipe are shown oldest first, unlike the blog index. A cooking
log is read as a sequence — what changed, and then what changed after that. They
appear on the private page only: a note is a kitchen diary, and whoever was sent
a share link did not ask for it.

Deleting a recipe, or an account, does not delete anything written. Both foreign
keys are `ON DELETE SET NULL`; a note whose recipe is gone becomes an entry of
its own. Verified against a real Postgres rather than assumed.

Not yet: entries are not in the search index. `searchFields()` and the
`searchVector` column are recipe-shaped, and giving posts their own would be a
second migration for something worth doing once there is enough written to need
it.

## Who can see what

The cookbook is private. Every page needs an account except five: the two
sign-in pages, the three that arrive as a link in an e-mail, and the share
links. The rule is written the safe way round in `src/lib/accessRules.ts` — a
localised page needs an account *unless* it is named as open — so a page added
next month is private until somebody decides otherwise, rather than public
until somebody notices. `proxy.ts` does nothing but ask that function and act
on the answer, and `tests/access.test.ts` is the only place the rule is
actually checked, because this is the one piece of the application where a
mistyped character breaks nothing visibly: it just quietly publishes a private
cookbook.

A single recipe can be let out through a **public link**: `/de/r/<token>`,
where the token is 128 bits of randomness stored in `Recipe.shareToken`.
Unguessable rather than a `public: true` flag, because the two answer different
questions. A flag makes a recipe visible to everyone at its normal address for
as long as it is set; a token makes one link that can be handed to one person,
and withdrawing it is setting the column back to null — the recipe never
changes its own name, and people who have an account never notice anything.

The control sits on the recipe page for admins, under *Visibility*. It is
deliberately not a switch: a switch invites a tap to see what it does, and what
it does is put a recipe on the open internet. Two differently worded buttons,
the state written out in words above them, and withdrawing asks first, because
it breaks a link somebody may already have sent to their mother.

The shared page offers nothing that needs an account — no favourite, no rating,
no view counter — rather than offering it and then refusing. It is `noindex`:
the link is secret, and a page in Google's index is not. Preview cards still
work, because WhatsApp, Signal and iMessage fetch the page when a link is
pasted; they do not consult an index. `src/app/robots.ts` disallows everything
for the same reason.

The export does not carry share tokens, so restoring a backup does not
silently republish anything — recipes come back private and are shared again
deliberately.

Recipes existing before this change were **not** made public by the migration.
That is the safe direction: a recipe that should be shared can be shared again
in one click, while a recipe wrongly left public cannot be un-read.

## Sharing a recipe

The share button opens the phone's own share sheet through `navigator.share`,
which is the thing people already know how to use. Where that does not exist —
most desktop browsers — the link goes to the clipboard, and if even that is
refused the URL appears on screen to be copied by hand. Three rungs, because a
button that silently does nothing is worse than no button.

Cancelling the share sheet is not treated as a failure. It rejects with
`AbortError`, and falling back to the clipboard there would be rude.

Only the title and the link are handed over, never a `text` field — see
`src/lib/sharePayload.ts`. The Web Share API accepts all three, but what a
receiving app does with them is up to that app, and nothing in the
specification says a target has to keep them all: Telegram took `text` and
dropped `url`, so a shared recipe arrived as a paragraph of its own description
with no link anywhere in it. The description is not lost — it turns up in the
link preview, which is where a description belongs.

What it hands over is the public link when the recipe has one, so that it
reaches somebody without an account. Otherwise it is the address of the page
itself — fine between two people who both have an account, and for anyone else
the login form now carries them on to the recipe once they are in, through the
`?next=` that `proxy.ts` attaches. `destinationFrom()` in
`src/lib/loginDestination.ts` refuses anything that is not a path of our own,
because a login form that forwards wherever it is told is an open redirect.

What the person on the other end sees comes from the page's OpenGraph data. A
recipe with a photograph shows the photograph; one without used to show a bare
link, which reads like spam, and now falls back to a branded card.

The shared page also carries **schema.org/Recipe** markup — the same markup
this application reads out of other people's pages when importing. It is only
emitted there: the private page is behind a login, so nothing is there to read
it, and publishing a machine-readable copy of a recipe that is supposed to need
an account would be an odd thing to do. The markup makes a shared recipe
legible to anyone else's importer, and it means the
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

`0008_posts` adds the `Post` table, with both foreign keys `ON DELETE SET NULL`
so that deleting a recipe or an account never deletes something somebody wrote.

`0007_auth_and_visibility` is the one to read before deploying: it adds the
token table and `User.emailVerifiedAt` (backfilled to now, because accounts
that already existed were created by somebody who was standing there), and it
adds `Recipe.shareToken` **without** backfilling it — which is what turns every
existing recipe private.

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
- Login, registration, password reset and address confirmation are all rate
  limited; `forgot` is limited per address as well as per IP.
- Reset and confirmation tokens are stored only as SHA-256 hashes, are single
  use, expire on their own, and are compared in constant time. A token of one
  purpose is refused at the other's endpoint.
- The login form only ever redirects to a path of its own site, so `?next=`
  cannot be used to build a phishing link that starts on this domain.
- Everything except the sign-in pages, the mailed links and the share links
  needs an account; the rule lives in `src/lib/accessRules.ts` and is tested.
- Share tokens are 128 bits, unique, and revoked by setting the column to null.
- A share token on an entry that has gone back to draft stops resolving.
- The URL importer refuses loopback and private address ranges, so it cannot be
  pointed at internal services.
- Recipe image URLs are restricted to `http(s)`.
