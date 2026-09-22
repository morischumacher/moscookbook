# Interaction map

Two files describe how the screens, buttons and endpoints of this app hang
together:

- **[interaction-map.generated.md](./interaction-map.generated.md)** is read
  from the source by `scripts/interaction-map.ts`. It lists every screen with
  its access rule, what the proxy does for it, which endpoints it calls and
  where it links; every endpoint with its gate and who calls it; and draws the
  navigation and the call graph as Mermaid. `npm run map` rewrites it,
  `npm run check:map` fails CI when it is stale, so it cannot drift from the
  code.
- **This file** is the analysis: what the generated map shows, what is wrong
  with it, and what to do about it. It was written by hand from the map of
  2026-09-22 (34 screens, 72 endpoints) and is dated; when a recommendation
  below is done, strike it here.

The point of having both is that the generated one is always right and the
hand-written one is always readable. Reading the source for the map is what
found the first bug below.

## How to read the generated map

**Screens.** One row per `page.tsx` under `src/app`. *Access* is what
`pathAccess()` in `src/lib/accessRules.ts` says (`open`, `account`, `admin`,
`recipe`, `unmatched`); *Proxy* is what `src/proxy.ts` therefore does before
the page runs. *Calls* are every `fetch()` reachable from the page through the
components it imports — including relative imports (`./MobileNavbar`), which
is how the header's links are found. A method of `*` means the code builds the
method from a variable (`method: editing ? 'PUT' : 'POST'`), and the map does
not guess.

**Endpoints.** One row per `route.ts` under `src/app/api`, one line per
exported method. *Gate* is what the handler checks (`requireAdmin`,
`requireUser`, a capture token, the cron secret, nothing). *Called from* is the
reverse index of the screens table. *(nothing in the UI)* is an endpoint no
screen calls — either meant for a machine or an orphan.

**Always present.** The header, footer and admin navigation come from layouts,
not pages, so they are listed once rather than drawn as forty edges.

**Navigation / Who calls what.** The same data as Mermaid, screens grouped by
access. GitHub renders them; so does VS Code with the Mermaid extension.

**What the map cannot see.** It is static. A link that is *rendered
conditionally* (the account link only in the mobile menu, `CollectionGrid`
with `linkTo={null}` on `/c/[token]`) is still an edge on the map. A URL built
from pieces at runtime is listed under "could not match" rather than guessed.
Anything below that depends on runtime conditions was checked by reading the
component, not by trusting the map.

## What the map found

### 1. Public recipes needed an account (fixed in this commit)

`pathAccess('/de/recipe/x')` returns `'recipe'`, documented as "the proxy
steps aside and the page decides" — the page checks `isPublic`, serves the
JSON-LD for search engines, and redirects to login only when the recipe is
private. `src/proxy.ts` short-circuited on `'unmatched'` and `'open'` only, so
`'recipe'` fell through to the session check and every anonymous visitor was
sent to `/login`. The page's public branch, the `mode: 'shared'` rendering and
the structured data on that route were unreachable since commit c3da84d.

Fix: `proxyStepsAside(access)` in `accessRules.ts` is now the single list of
which access values bypass the proxy (`unmatched`, `open`, `recipe`), the proxy
calls it, and `tests/access.test.ts` asserts that `'recipe'` is in it. The
rule and the proxy can no longer disagree silently.

### 2. Screens nobody can reach

| Screen | Why | Recommendation |
|---|---|---|
| `/[locale]/account` | The only link is the greeting row inside the **mobile** menu (`md:hidden`). On a desktop viewport there is no way to reach it. | Put the greeting/account link in the desktop header row too. |
| `/[locale]/drafts` as a non-admin | Access is `account`, but the only link lives in `AdminNav`, which renders under `/admin/**` only. A non-admin who types the address sees the list and no Finish button (`mayFinish` is admin-only). | Either make the page `admin` (it is an admin workflow) or link it from the header for everybody. The first is honest. |
| `/[locale]/admin/invites` | A redirect stub kept for old bookmarks; nothing links to it. | Fine as is. Remove once the bookmark is gone. |
| `/[locale]/register` without `?invite=` | Linked from `/login`, but the page refuses to draw the form; its only exit is back to `/login`. | The login page should say "by invitation" rather than offer a link that dead-ends. |
| `/[locale]/c/[token]` | A leaf: tiles are not links (`linkTo={null}`), by design — the visitor has no account. | Fine, but the page could carry the shared-collection's recipes as `/r/` links if recipes in a shared collection are meant to be readable. Decide, then document. |

`/reset`, `/verify`, `/r/[token]`, `/p/[token]` are reachable only by mailed
or shared link, which is their purpose.

### 3. Actions that fail silently

The "then" of a button should never be "nothing". These are the ones where a
failure looks identical to success:

| Where | What happens on failure | Recommendation |
|---|---|---|
| `LogoutButton` | `console.error` only; the person stays signed in and the button looks dead. | Show the shared error message and keep the button enabled. |
| `FavoriteButton` | Anything but a 401 silently reverts the heart. | Same message; the revert is right, the silence is not. |
| `AiKeys.changeMode` | `PATCH /api/ai-keys` result is never read; the chip already moved locally. | Read the status; move the chip back on failure. |
| `AiKeys.remove`, `SiteProfiles.forget` | Non-OK response produces no message; the list reloads unchanged. | Same. |
| `ShareLink.copy`, `Visibility.copy` | Clipboard failure is `catch {}` — no fallback field. `ShareButton` at least shows the address to copy by hand. | Reuse `ShareButton`'s manual fallback. |
| `ShareButton` | If minting the `/r/` token fails it falls through to `window.location.href` — the share *appears* to work but hands out a link that lands on the login form, which is the failure the component exists to prevent. | Say so instead of falling through, or fall through only for public recipes. |
| `RecipeForm` Cancel | `router.push('/admin')` without `clearDraft()`, so the abandoned draft silently reappears next time. | Ask, or clear. Not both, not neither. |

**Closed.** `src/lib/apiMessage.ts` is the one reader of a failed response —
it returns the route's own `{ message }` or the caller's sentence, and never
throws. `useAction()` wraps a request in it and shows the failure in the
dialog the application already had. Components that already owned a place to
put a message (`AiKeys`, `SiteProfiles`) use that instead of a second one.
Every row above now says something when it fails; `ShareButton` stops rather
than sharing an address the recipient cannot open, and Cancel clears the
draft it abandoned.

### 4. Same action, different labels

| Action | Labels in use | Recommendation |
|---|---|---|
| ~~Publish / unpublish a recipe~~ | `makePublic` and `makePublicShort` held the *same string* in both languages; `makePrivate`/`makePrivateShort` held two. | **Done.** One key per action, shortened so it fits a list row as well as a panel. |
| Get a link to a recipe | `Share.share`, `Visibility.share`, `Share.copyLink`, `Visibility.copyAddress` — four labels, and they can copy *different* URLs (`/recipe/<slug>` vs `/r/<token>`) | Two verbs at most: **Share** (mints the token, copies the `/r/` link, uses the share sheet on a phone) and **Copy address** (the plain URL, for people with accounts). Say which is which. |
| Create the share token | Explicit `createLink` button in `ShareLink`; invisible inside `share` in `ShareButton` — both on the recipe page at once | Keep one of the two components on the recipe page. |
| ~~Write a note on a recipe~~ | Read again: `addNote` is "Write a blog entry about this recipe" and `newPost` is "New entry". Same destination, different offers — the first carries the recipe with it. | **Not a duplicate.** This row was wrong; the labels stay. |
| ~~Open the devices page~~ | Three entry points, and `Inbox.devices` held the same string as `Devices.nav` rather than a different one. | **Done.** The inbox reads the navigation's key; two keys holding one string is two strings waiting to disagree. |

### 5. The three longest paths, and where they can be shortened

**A. Share a recipe from the iPhone until it is in the list.** 3 screens and
4 taps if you Accept straight from the inbox; 6 screens and 8 taps if you
Stage it, open Drafts, open the draft, Finish, go back to Recipes. Two things
cost more than they should:

- After **Accept** the inbox reloads its own list and does not take you to the
  recipe you just made. One `router.push` to `/recipe/<slug>` (the response
  already carries the slug) saves a screen and a search.
- `/drafts` is outside `/admin`, so the admin navigation disappears when you
  arrive; the only way back is the header. Either move it under `/admin`
  (which also fixes the non-admin dead end above) or render `AdminNav` there.

**B. Create a recipe by hand and share it with a link.** 4 screens, 8 clicks
via the recipe page's `Visibility` panel; 6 clicks if you know that
`RecipeRowActions` on `/admin` mints *and* copies in one click. That the
shortcut exists but under a different label is the point of section 4.

**C. Invite a person and have them sign in.** 3 admin screens and 4 clicks to
mint and copy an invitation, then 4 invitee screens: register, home (already
signed in), verify from the mail, home. Reasonable; the app does not send the
invitation itself, and it says so. The one oddity is that `/verify` redeems on
mount and then offers a button to the cookbook rather than going there —
one click that could be a redirect.

### 6. Endpoints with nothing in the UI

- `GET /api/cron/backup` — called by the Vercel cron with the secret. Correct.
- `DELETE /api/errors/[id]` — an admin can *resolve* an error from the errors
  page (`POST`) but nothing deletes one. Either add the button next to
  "resolve" or remove the handler; a route nobody calls is a route nobody
  tests.

## Recommendations, in order

1. ~~Make the proxy honour `'recipe'` access.~~ Done — `proxyStepsAside()`, commit f6b1ea1.
2. ~~One shared client error path, then wire the silent actions to it.~~ Done — `messageFrom()` and `useAction()`; the eight sites in the table above all say so now.
3. ~~Collapse the duplicated labels.~~ Done for publish/unpublish and the
   devices link; the `addNote`/`newPost` row turned out not to be a duplicate
   and is struck above. **Still open:** the recipe page offers both an
   implicit mint (`ShareButton`) and an explicit one (`ShareLink`, inside the
   visibility panel). Keeping both is deliberate — the explicit one is also
   where a link is *withdrawn* — but the panel should say that the Share
   button above makes the same link.
4. After Accept in the inbox, go to the recipe.
5. Put the account link in the desktop header.
6. Move `/drafts` under `/admin`, or make its access `admin`.
7. Login page: "by invitation" text instead of a dead register link.
8. `DELETE /api/errors/[id]`: a button or a deletion.

Every one of these is a small change; none needs a migration. When one is
done, regenerate the map (`npm run map`) and strike the line here.
