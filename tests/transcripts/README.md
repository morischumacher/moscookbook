# Recorded imports

One real import, written down and replayable:

```
npm run diagnose -- --record https://www.chefkoch.de/rezepte/…
```

Each recording is two files:

- `<slug>.json` — every provider request and answer, plus what the pipeline
  produced from them
- `<slug>.page.html` — the page as the site served it, with scripts and styles
  removed except the JSON-LD and the YouTube player data

`tests/transcript.test.ts` picks them up on its own. No registration step.

## Why this exists

The hand-written cases assert that the code handles shapes somebody imagined.
That is the class of test which passed a hundred times while every screenshot
capture from a real phone was being rejected with "Nothing usable was sent" —
because all of them handed the pipeline the shape the *classifier* takes and
none handed it the shape an iOS Shortcut *posts*.

The fixtures in `tests/fixtures/` fix half of that: real markup, real sites.
They stop at the rules, because the other half is a paid network call to a
company whose answers differ between asking twice.

A transcript covers the whole chain — fetch, rules, scoring, the decision to
ask, the request that was sent, the answer, the merge — against traffic that
actually occurred, for nothing and without a key.

## What is asserted

Not that the draft is correct. Nobody can write that down for a page they have
not read, and a test encoding one site's current recipe fails when the site
edits a paragraph.

That the pipeline **still does what it did**: the same status, read by the same
means, a draft of about the same size, and — the part this was built for — a
request to the model that is still the same request. Sizes are compared with a
tenth of tolerance, because a merge may legitimately shift by a word.

## What it cannot check

Whether the model would answer that way again. It would not. So the recorded
answer is replayed, which makes this a test of our code and not of theirs.
That is the right boundary: their behaviour is not ours to regress.

## `_harness-selftest`

One recording in here is not real: a small invented food blog with no
structured data, and an invented Gemini answer. It is committed on purpose, so
that the replay machinery itself is covered on a machine that has collected
nothing — a harness nobody exercises is a harness that quietly stops working,
and this one would fail silently by finding no files and passing.

It is also a worked example of the case the AI exists for: rules get a title
and nothing else (`poor`: no ingredients, no method), the model is asked, and
the merged draft comes out `ready` with eight ingredients.

The underscore keeps it first in the directory and marks it as not-a-recording.
Delete it if it ever gets in the way; everything else here is yours.

## Secrets

None are recorded. Headers are never captured — which is where all three
providers put their key — and everything written is passed through a scrubber
that replaces anything key-shaped first. Check a recording before committing
it anyway; it is somebody else's page and your own traffic.
