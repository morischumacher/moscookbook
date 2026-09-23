# Prompt: work through the Mo's Cookbook work list

Copy everything below the line into any coding assistant (Claude Code, Codex,
Cursor, Copilot, …) that has this repository checked out. It is written to
work without any other context.

---

You are working on **Mo's Cookbook** (this repository): a private family
cookbook built with Next.js 16 (App Router), next-intl (German and English),
Prisma 5 and Postgres, deployed on Vercel.

The site's admin publishes things that need fixing to a **public work list**.
Your job is to fetch that list, fix what you can, and open a pull request.

## 1. Fetch the work list

```sh
curl -s https://www.moscookbook.com/api/work
```

If you cannot reach the address (sandboxed network, proxy, 403), stop and ask
the person to either allow `www.moscookbook.com` in your network settings or
paste the JSON from that address into the chat. Do not guess the contents.

The answer looks like this:

```json
{
  "about": "…",
  "open": [
    { "id": 12, "kind": "capture", "note": "Zutaten fehlen", "sharedAt": "…", "closedAt": null, "data": { … } }
  ],
  "recentlyClosed": [ … ]
}
```

- Work only on `open`. `recentlyClosed` shows what was already done in the
  last 30 days, so you do not redo it.
- `note` is the admin's own words about what is wrong. It is the most
  important field. Read it first.
- Everything was anonymized when it was shared: `[Person]`, `[E-Mail]` and
  `[token]` are placeholders. Never try to recover what they replaced.

## 2. The three kinds of item

### `capture`: an import into the inbox that did not read well
A link or text shared from a phone (Instagram, YouTube, TikTok, a recipe
site, a note) that should have become a recipe draft.

`data` holds: `source`, `sourceUrl`, `status` (`ready` / `needsWork` /
`failed`), `reason` (a code like `reason:pagePartial`; see
`src/lib/captureReasons.ts`), `readBy` (`rules`, `profile`, `rules+ai`, …),
`sharedText`, `hadScreenshot`, and the `draft` that came out (title,
ingredient lines, instructions).

Where the code is:
- `src/lib/captureProcess.ts`: the pipeline, one path per source
  (`processYoutube`, `processSocial`, `processWebPage`, `processImage`).
- `src/lib/recipeFromHtml.ts`, `src/lib/recipeParser.ts`: the rule-based
  readers (JSON-LD, headings, plain text).
- `src/lib/youtube.ts`, `src/lib/youtubeCaptions.ts`, `src/lib/instagram.ts`,
  `src/lib/recipeLinks.ts`, `src/lib/socialHints.ts`: the per-platform
  readers.
- `src/lib/draftQuality.ts`: how a draft is scored (`ready` or not).

How to work on one:
1. Fetch `sourceUrl` yourself if your network allows it, and save the HTML.
2. Write a **failing test first** that replays it without the network: use
   `tests/stubFetch.ts` like `tests/captureProcess.test.ts` and
   `tests/socialImport.test.ts` do. Keep only the parts of the page the reader
   needs; never commit a whole multi-megabyte page.
3. Fix the reader, prefer **rules over AI**: the rules are free, the AI costs
   the owner money. An AI call is the last resort, never the fix.
4. If the recipe genuinely is not on the page (it is in a bio, a comment, a
   DM, or only spoken in a video), the right fix is a clear reason code and
   message, not a guess. Messages live in `messages/de.json` and
   `messages/en.json` under `Inbox.reason`.

### `error`: an error the application recorded
`data` holds `source` (`server` / `client`), `message`, `stack`, `path`,
`count`, `firstSeenAt`, `lastSeenAt`. Find the cause from the stack and
path, write a test that reproduces it where you can, and fix the cause, not
the symptom. A `count` of 1 from long ago may already be fixed. Check before
you change anything.

### `ticket`: something a person reported
`data` holds `kind`, `body` (their words, anonymized), `path` (the page they
were on) and `writtenAt`. Tickets are often in German. Treat them as bug
reports or feature wishes, but keep changes small: if a ticket asks for
something large or unclear, do not build it. Describe it in the pull request
as an open question.

## 3. Rules for your changes

- **Run `npm run verify` before every commit.** It runs every check the
  project has (messages, design, backup coverage, Prisma, lint, tests,
  typecheck). It must pass; never skip or disable a check or a test to make
  it pass.
- **New tests must be registered** in `tests/run.ts` (`npm run check:tests`
  enforces this).
- **Every user-facing text goes into both** `messages/de.json` and
  `messages/en.json`. German is the main language of the site.
- **A new database table** needs a hand-written migration in
  `prisma/migrations/<next number>_<name>/migration.sql`, and an entry in
  `scripts/check-backup.mjs` (either in the backups, or listed as
  deliberately not backed up, with the reason).
- If you change routes or pages, run `npm run map` to regenerate the
  interaction map.
- Match the surrounding code: its comment style (comments explain *why*),
  naming and patterns (`route()` wrapper in `src/lib/route.ts` for API
  routes, the buttons from `src/lib/ui.ts`).
- Never put personal data, secrets, tokens or production URLs with keys
  into code, tests, commits or the pull request.

## 4. Deliver

1. Work on a new branch.
2. One commit per item or per related group, with a message that says what
   was wrong and why the fix is right. Reference each item as
   **`work #<id>`** (e.g. `Fix: Chefkoch ingredient groups lost (work #12)`).
3. Open **one pull request** for the batch. In its description, list every
   open item with one line each:
   - **fixed**: what changed, and the test that proves it;
   - **not fixed**: why (not reproducible, needs a decision, needs data you
     do not have, is actually fine), and what the owner should decide.
4. Do not merge. The owner reviews, merges, and closes the items on the work
   list (Verwaltung → Meldungen → Arbeitsliste).
