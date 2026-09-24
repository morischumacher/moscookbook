# Mo's Cookbook Development Rules

## Importer & Capture Pipeline Rules
1. **Rule-Based Linked Recipe Fetching**: `fromLinkedRecipe` in `src/lib/captureProcess.ts` must use `RULES_ONLY` when parsing linked URLs from video/post captions. This ensures free JSON-LD extraction without wasting AI tokens or causing transcript replay mismatches in `tests/transcript.test.ts`.
2. **YouTube Subtitle HTML Protection**: `captionText` in `src/lib/youtubeCaptions.ts` must return an empty string `''` if the fetched body is an HTML document (`<!DOCTYPE html>` or `<html>`), preventing 403 or fallback HTML pages from being falsely parsed as video subtitles.
3. **Prisma Type Synchronization**: If Prisma types are out of sync during `npm run verify` / `tsc`, run `npx prisma generate` to rebuild `@prisma/client` types before running typecheck.
