# Mo's Cookbook Development Rules & AI Guidelines

## 0. Core Engineering Principle: Prevent Systemic Issues
- **Prevent Future Issues, Don't Just Patch Symptoms**: When working on any task, error, or feature, the primary goal is always to address the underlying root cause and implement guards that prevent similar problems across the entire application in the future—never just patch the single specific instance.
- **Defensive Boundary Validation**: Always validate response formats and edge cases at system boundaries (e.g. check for HTML error documents in XML/JSON parsers, guard user-agent headers, handle HTTP 403 WAF blocks gracefully).
- **Build Invariants**: Always run full verification (`npm run verify`, which includes linting, tests, Prisma generation, and typechecking) before committing, ensuring no broken syntax or invalid exports reach production.

## 1. Importer & Capture Pipeline Rules
1. **Rule-Based Linked Recipe Fetching**: `fromLinkedRecipe` in `src/lib/captureProcess.ts` must use `RULES_ONLY` when parsing linked URLs from video/post captions. This ensures free JSON-LD extraction without wasting AI tokens or causing transcript replay mismatches in `tests/transcript.test.ts`.
2. **YouTube Subtitle HTML Protection**: `captionText` in `src/lib/youtubeCaptions.ts` must return an empty string `''` if the fetched body is an HTML document (`<!DOCTYPE html>` or `<html>`), preventing 403 or fallback HTML pages from being falsely parsed as video subtitles.
3. **HTTP 403 & WAF Resilience**: `fetchPage` in `src/lib/fetchPage.ts` uses modern Chrome browser headers and supports automatic fallback via reader proxies (`r.jina.ai` or `SCRAPING_PROXY_URL`) when target sites block direct server requests with 403/503 WAF anti-bot pages.
4. **Prisma Type Synchronization**: If Prisma types are out of sync during `npm run verify` / `tsc`, run `npx prisma generate` to rebuild `@prisma/client` types before running typecheck.
