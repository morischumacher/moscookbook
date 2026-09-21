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

They are still someone else's content, so this folder is gitignored apart from
this README. Collect your own; the point is that they are pages *you* would
really import.
