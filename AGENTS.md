# Mo's Cookbook Agent Guidelines (AGENTS.md)

## Core Directive: Systemic Prevention
When diagnosing errors, implementing tickets, or fixing capture issues:
- **Always aim to prevent similar problems in the future across the entire system**, not just fix the single specific instance.
- **Root Cause & Boundary Defense**: Wrap external network calls with resilient headers and fallbacks (`fetchPage`), ensure parsers defensively check input formats before processing (`youtubeCaptions`), and prefer zero-cost rules over paid AI calls (`captureProcess`).
- **Strict Verification**: Always run `npm run verify` (linting, tests, Prisma types, and type-check) before committing code.

For complete rules, see `.agents/rules/cookbook-rules.md`.
