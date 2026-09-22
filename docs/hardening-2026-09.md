# Code, security and test pass — September 2026

No new features. One pass over the code, the architecture, the security and
the way failures reach a person, plus the [interaction map](./interaction-map.md).
Eleven commits on `improve/gallery`, `4a4c461..f6b1ea1`, 134 files. Every
guard was sabotaged on purpose to confirm its test goes red before the
commit was made; where a probe disproved a claim, the commit message says so
(`f3f721b`, `atPath`).

State at the end: `npm run verify` green — twelve guard scripts, lint, 1670
checks, `tsc`. Migrations `0025`/`0026` were already applied to Neon before
this pass; nothing here adds a migration.

## Security

| Commit | What was open | What closed it |
|---|---|---|
| `564176d` | The URL import called `fetch()` itself with `redirect: 'follow'`: a page answering `302 → http://169.254.169.254/…` returned the cloud metadata service. `isSafePublicUrl` had its own, older range table. The URL parser turns `[::ffff:127.0.0.1]` into hex and `0x7f000001`/`127.1` into `127.0.0.1`, which the tables did not know. | Every outbound fetch goes through `fetchPage`/`safeFetch`. One range table in `privateAddress.ts`, hex-mapped IPv6 included; literals are checked, not waved through. |
| `f3f721b` | Twenty routes parsed `[id]` by hand; `parseInt('12abc')` favourited recipe 12. Tickets PATCH read its body by cast. `CRON_SECRET` compared with `===`. | `positiveIntId()` is the one reader. A zod schema. `timingSafeEqual`. `atPath` refuses `__proto__`/`constructor`/`prototype` as stated intent (the typeof walk already stopped it; the probe proved that and the message says it). |
| `4b1dedc` | The proxy never ran on `/api`: a route without `requireAdmin` was open by default. Nothing refused a cross-site form POST (`SameSite=Lax` + `enctype="text/plain"` delivers JSON). `session.user.admin` was sealed into the cookie for 14 days — a demoted or deleted admin kept the API. Not one security header. | `/api` goes through the proxy before locales; session required unless the path is named open. `Sec-Fetch-Site: cross-site` and a mismatched `Origin` are refused on writes. `requireAdmin`/`requireUser` and the admin layout ask the database, once per request, fail closed. Referrer-Policy, frame-ancestors, nosniff, Permissions-Policy, HSTS, a four-directive CSP. Error log redacts `token=`/`invite=`/`code=` everywhere. |
| `2b6628f` | Uploads admitted by declared type or extension; `photo.jpg` containing HTML was stored as `image/jpeg`. HEIC conversion copied three times with `@ts-expect-error`. | `imageTypeOf()` reads the signature (JPEG/PNG/GIF/WebP/AVIF/HEIC); admission, stored type and extension follow the bytes. One `normaliseUpload`, a declaration file, zero `@ts-expect-error`. |
| `4a5f431` | Five money routes counted their limit in memory (resets per cold start, multiplies per instance). Login limited per address only — a rotating pool had unlimited tries at one account. bcrypt cost 10. Archive import showed Prisma's error text (model, field, constraint, potentially a connection string). | Database-backed limiter on all five. A second bucket per lowercased e-mail, 20/15 min, counted for existing and non-existing addresses alike. Cost 12; old hashes keep verifying. `describeWriteFailure()` gives a sentence, the log gets the rest; site learner scrubs provider errors. |
| `f6b1ea1` | `pathAccess()` returned `'recipe'` and the proxy did not know it: every anonymous visitor to a public recipe went to `/login` since `c3da84d`. | `proxyStepsAside()` is the one list; test pins `'recipe'` in it. |

**Deferred, on purpose** (each is documented at its site):
- CSP `script-src` — needs a nonce threaded through the proxy and a browser to verify.
- Register returns 409 for a taken address (enumeration). Invite-only; the invitation already proves membership.
- `isEmailVerified` is true for a missing user — it feeds a banner, not a gate; verification gates nothing here.
- The shared rate limiter fails open on a database outage — a broken limit must not become a lockout.
- `safeFetch` resolves the name but cannot pin the connection to the checked address (DNS race).

## Errors and tests are reported, not logged (`907db09`)

- `failed(label, error)` replaces 62 `console.error` sites in 39 routes: the log keeps the stack, the error table gets the row, the admin nav shows the unresolved count.
- `GlobalErrorReporter` hooks `window.error` and `unhandledrejection` — click handlers, timers, failed chunks — deduplicated, twelve per page load.
- The weekly backup records its last run and result; the dashboard shows the date; a failure counts in the nav. Before, a backup failing for a month looked like one that ran.
- Test runner: each suite in its own try/catch, failures to stderr, `equal()` prints expected, `::error` annotations in GitHub Actions, `globalThis.fetch` and `process.env` restored around every suite so one throw is one failure and not a cascade.
- `check:tests` refuses an unregistered test file; `check:prisma` and `check:tests` are in CI; `npm run verify` runs CI's order locally; README badge.

## Architecture (`7a85312`, `daab877`, `044c9d9`, `e0d609f`)

- **One of each:** entity decoder, `<meta>` reader and JSON-LD reader (`htmlMeta.ts` — the seventeen-name decoder threw `RangeError` on `&#1114112;` and took the import down), Prisma optional-table guard (`prismaTable.ts`), token mechanics (`tokens.ts`), zod formatter that names the field (`zodMessage.ts`).
- **`captureProcess.ts` 949 → 493 lines**, split along its own banner comments: `captureDraft`, `captureAi`, `captionDraft`, `captureTypes`. None import Prisma (the test runner's constraint).
- **`aiProviders.ts`** holds the provider vocabulary; the key store no longer imports three HTTP clients to learn what a provider is.
- Seven dead exports deleted, ten narrowed to module scope, eleven German API strings translated, `isUsable` wired in where its comment promised.

Deferred: a shared client `postJson`/error line (the seven silent buttons in the interaction map are its use case).

## Interaction map (`f6b1ea1`)

`npm run map` writes `docs/interaction-map.generated.md`; `npm run check:map`
fails CI when stale. The analysis and the eight ordered recommendations are
in [interaction-map.md](./interaction-map.md).

## Outside the code, still open

- Revoke the old GitHub tokens; rotate anything pasted into a chat.
- Set `CRON_SECRET` in Vercel (the backup route refuses without it).
- `npm run reindex` reported "1 of 1 recipes" on production — confirm that is the real count.
