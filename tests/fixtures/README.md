# Import fixtures

Real pages, reduced to the parts the importer actually reads, collected with:

```
npm run fixtures -- https://www.chefkoch.de/rezepte/… https://youtu.be/…
```

The hand-written cases in `tests/importVariants.test.ts` cover the shapes
schema.org *allows*. These cover the shapes particular sites actually *emit*,
which is a different and less tidy set — that is where the surprises live.

Each file keeps only the JSON-LD blocks, the `og:` meta tags, the `<title>` and,
for YouTube, the player's `videoDetails`. No scripts, no styling, no cookie
banner. A few kilobytes instead of a megabyte, and readable in a diff.

**They are picked up on their own.** `tests/fixtures.test.ts` reads every
`.html` in here and drives it through the real import — no registration step,
no list to keep up to date. Drop a file in and it is covered from the next
`npm test`.

Nothing in that suite knows what any particular page contains, which is the
only way it could work: what it asserts is the set of things that must be true
whatever the page turned out to be. A draft came back; it has a title, and the
title is not the URL; there are ingredients or a method; no cookie banner or
subscribe plea survived into the method; no "ingredient" is a whole paragraph;
the source URL is kept. A fixture that fails one of those has found a real bug,
because none of them is a statement about a site.

An empty folder says so and passes. This suite must not be the reason the build
is red on a machine that has no fixtures.

They are still someone else's content, so this folder is gitignored apart from
this README. Collect your own; the point is that they are pages *you* would
really import.
