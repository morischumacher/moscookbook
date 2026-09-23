# Interaction map — generated

Read from the source by `scripts/interaction-map.ts`. Do not edit; run `npm run map`.
The analysis lives in [interaction-map.md](./interaction-map.md).

40 screens · 75 endpoints · 70 link edges · 76 call edges

## Screens

| Route | Access | Proxy | Calls | Links to |
|---|---|---|---|---|
| `/[locale]/account` | account | requires session | `* /api/account`<br>`* /api/account/email`<br>`* /api/account/name`<br>`* /api/account/password`<br>`* /api/auth/logout`<br>`DELETE /api/account/avatar`<br>`POST /api/account/avatar` | `/[locale]/login` |
| `/[locale]/admin/ai` | admin | requires admin | `DELETE /api/ai-keys/[id]`<br>`DELETE /api/site-profiles/[id]`<br>`GET /api/ai-keys`<br>`GET /api/site-profiles`<br>`PATCH /api/ai-keys`<br>`POST /api/ai-keys`<br>`POST /api/ai-keys/[id]/test`<br>`POST /api/site-profiles` | — |
| `/[locale]/admin/collections/[id]` | admin | requires admin | `* /api/collections`<br>`* /api/collections/[id]`<br>`DELETE /api/collections/[id]` | `/[locale]/admin/collections`<br>`/[locale]/collections/[id]` |
| `/[locale]/admin/collections/new` | admin | requires admin | `* /api/collections`<br>`* /api/collections/[id]`<br>`DELETE /api/collections/[id]` | `/[locale]/admin/collections`<br>`/[locale]/collections/[id]` |
| `/[locale]/admin/collections` | admin | requires admin | `POST /api/examples` | `/[locale]/admin/collections/[id]`<br>`/[locale]/admin/collections/new`<br>`/[locale]/collections/[id]` |
| `/[locale]/admin/create` | admin | requires admin | `* /api/recipes`<br>`* /api/recipes/[id]`<br>`POST /api/ai/polish`<br>`POST /api/import/ai`<br>`POST /api/import/url` | `/[locale]/admin` |
| `/[locale]/admin/devices` | admin | requires admin | `DELETE /api/capture-tokens/[id]`<br>`GET /api/capture-tokens`<br>`POST /api/capture-tokens` | — |
| `/[locale]/admin/drafts` | admin | requires admin | `POST /api/recipes/[id]/draft` | `/[locale]/recipe/[id]` |
| `/[locale]/admin/edit/[id]` | admin | requires admin | `* /api/recipes`<br>`* /api/recipes/[id]`<br>`POST /api/ai/polish`<br>`POST /api/import/ai`<br>`POST /api/import/url`<br>`POST /api/recipes/[id]/revisions/[id]` | `/[locale]/admin` |
| `/[locale]/admin/errors` | admin | requires admin | — | `/[locale]/admin/reports` |
| `/[locale]/admin/inbox` | admin | requires admin | `DELETE /api/capture/[id]`<br>`GET /api/capture`<br>`POST /api/capture/[id]`<br>`POST /api/capture/[id]/merge` | `/[locale]/admin/create`<br>`/[locale]/recipe/[id]`<br>`/[locale]/tickets` |
| `/[locale]/admin/invites` | admin | requires admin | — | `/[locale]/admin/users` |
| `/[locale]/admin` | admin | requires admin | `* /api/collections/[id]/share`<br>`* /api/collections/[id]/visibility`<br>`* /api/posts/[id]/share`<br>`* /api/posts/[id]/visibility`<br>`* /api/recipes/[id]/share`<br>`* /api/recipes/[id]/visibility`<br>`DELETE /api/recipes/[id]`<br>`GET /api/export`<br>`POST /api/import/archive`<br>`POST /api/import/recipes` | `/[locale]/admin/create`<br>`/[locale]/admin/drafts`<br>`/[locale]/admin/edit/[id]`<br>`/[locale]/recipe/[id]` |
| `/[locale]/admin/posts/[id]` | admin | requires admin | `* /api/posts`<br>`* /api/posts/[id]` | `/[locale]/admin/posts` |
| `/[locale]/admin/posts/new` | admin | requires admin | `* /api/posts`<br>`* /api/posts/[id]` | `/[locale]/admin/posts` |
| `/[locale]/admin/posts` | admin | requires admin | `* /api/collections/[id]/share`<br>`* /api/collections/[id]/visibility`<br>`* /api/posts/[id]/share`<br>`* /api/posts/[id]/visibility`<br>`* /api/recipes/[id]/share`<br>`* /api/recipes/[id]/visibility`<br>`DELETE /api/posts/[id]`<br>`POST /api/examples` | `/[locale]/admin/posts/[id]`<br>`/[locale]/admin/posts/new`<br>`/[locale]/blog/[id]`<br>`/[locale]/collections/[id]`<br>`/[locale]/recipe/[id]` |
| `/[locale]/admin/reports` | admin | requires admin | `DELETE /api/errors/[id]`<br>`GET /api/errors`<br>`GET /api/tickets`<br>`PATCH /api/tickets`<br>`POST /api/errors/[id]` | — |
| `/[locale]/admin/tickets` | admin | requires admin | — | `/[locale]/admin/reports` |
| `/[locale]/admin/users` | admin | requires admin | `DELETE /api/invites/[id]`<br>`DELETE /api/users/[id]`<br>`GET /api/invites`<br>`GET /api/users`<br>`PATCH /api/users/[id]/role`<br>`POST /api/invites` | — |
| `/[locale]/blog/[slug]` | decides | steps aside | `* /api/collections/[id]/share`<br>`* /api/collections/[id]/visibility`<br>`* /api/posts/[id]/share`<br>`* /api/posts/[id]/visibility`<br>`* /api/recipes/[id]/share`<br>`* /api/recipes/[id]/visibility` | `/[locale]/collections/[id]`<br>`/[locale]/login`<br>`/[locale]/recipe/[id]` |
| `/[locale]/blog` | account | requires session | `* /api/collections/[id]/share`<br>`* /api/collections/[id]/visibility`<br>`* /api/posts/[id]/share`<br>`* /api/posts/[id]/visibility`<br>`* /api/recipes/[id]/share`<br>`* /api/recipes/[id]/visibility` | `/[locale]/blog/[id]`<br>`/[locale]/collections/[id]`<br>`/[locale]/recipe/[id]` |
| `/[locale]/c/[token]` | open | steps aside | — | `/[locale]/recipe/[id]` |
| `/[locale]/collections/[slug]` | decides | steps aside | `* /api/collections/[id]/share`<br>`* /api/collections/[id]/visibility`<br>`* /api/posts/[id]/share`<br>`* /api/posts/[id]/visibility`<br>`* /api/recipes/[id]/share`<br>`* /api/recipes/[id]/visibility`<br>`POST /api/shopping` | `/[locale]/admin/collections/[id]`<br>`/[locale]/blog/[id]`<br>`/[locale]/login`<br>`/[locale]/recipe/[id]`<br>`/[locale]/shopping` |
| `/[locale]/collections` | account | requires session | — | `/[locale]/admin/collections/new`<br>`/[locale]/collections/[id]` |
| `/[locale]/drafts` | account | requires session | — | `/[locale]/admin/drafts` |
| `/[locale]/forgot` | open | steps aside | `POST /api/auth/forgot` | `/[locale]/login` |
| `/[locale]/imprint` | open | steps aside | — | — |
| `/[locale]/login` | open | steps aside | `POST /api/auth/login` | `/[locale]/forgot` |
| `/[locale]/p/[token]` | open | steps aside | `* /api/collections/[id]/share`<br>`* /api/collections/[id]/visibility`<br>`* /api/posts/[id]/share`<br>`* /api/posts/[id]/visibility`<br>`* /api/recipes/[id]/share`<br>`* /api/recipes/[id]/visibility` | `/[locale]/collections/[id]`<br>`/[locale]/login`<br>`/[locale]/recipe/[id]` |
| `/[locale]` | account | requires session | `* /api/recipes/[id]/favorite`<br>`GET /api/favorites`<br>`POST /api/recipes/[id]/rate` | `/[locale]/blog`<br>`/[locale]/recipe/[id]` |
| `/[locale]/privacy` | open | steps aside | — | — |
| `/[locale]/r/[token]` | open | steps aside | `* /api/collections/[id]/share`<br>`* /api/collections/[id]/visibility`<br>`* /api/posts/[id]/share`<br>`* /api/posts/[id]/visibility`<br>`* /api/recipes/[id]/favorite`<br>`* /api/recipes/[id]/share`<br>`* /api/recipes/[id]/visibility`<br>`DELETE /api/recipes/[id]/cooked`<br>`DELETE /api/recipes/[id]/cooked/photos`<br>`PATCH /api/recipes/[id]/cooked`<br>`POST /api/recipes/[id]/cooked`<br>`POST /api/recipes/[id]/cooked/photos`<br>`POST /api/recipes/[id]/rate`<br>`POST /api/recipes/[id]/view`<br>`POST /api/shopping` | `/[locale]`<br>`/[locale]/admin/posts/new`<br>`/[locale]/blog/[id]`<br>`/[locale]/login`<br>`/[locale]/recipe/[id]`<br>`/[locale]/shopping` |
| `/[locale]/recipe/[slug]` | decides | steps aside | `* /api/collections/[id]/share`<br>`* /api/collections/[id]/visibility`<br>`* /api/posts/[id]/share`<br>`* /api/posts/[id]/visibility`<br>`* /api/recipes/[id]/favorite`<br>`* /api/recipes/[id]/share`<br>`* /api/recipes/[id]/visibility`<br>`DELETE /api/recipes/[id]/cooked`<br>`DELETE /api/recipes/[id]/cooked/photos`<br>`PATCH /api/recipes/[id]/cooked`<br>`POST /api/recipes/[id]/cooked`<br>`POST /api/recipes/[id]/cooked/photos`<br>`POST /api/recipes/[id]/draft`<br>`POST /api/recipes/[id]/rate`<br>`POST /api/recipes/[id]/view`<br>`POST /api/shopping` | `/[locale]`<br>`/[locale]/admin/posts/new`<br>`/[locale]/blog/[id]`<br>`/[locale]/login`<br>`/[locale]/recipe/[id]`<br>`/[locale]/shopping` |
| `/[locale]/register` | open | steps aside | `POST /api/auth/register` | `/[locale]/login` |
| `/[locale]/reset` | open | steps aside | `POST /api/auth/reset` | `/[locale]/forgot` |
| `/[locale]/s/[token]` | open | steps aside | `* /api/shopping`<br>`* /api/shopping/share`<br>`* /api/shopping/shared/[id]`<br>`DELETE /api/shopping`<br>`DELETE /api/shopping/[id]`<br>`PATCH /api/shopping/[id]` | `/[locale]` |
| `/[locale]/share` | account | requires session | `POST /api/capture/share` | `/[locale]/admin/inbox` |
| `/[locale]/shopping` | account | requires session | `* /api/shopping`<br>`* /api/shopping/share`<br>`* /api/shopping/shared/[id]`<br>`DELETE /api/shopping`<br>`DELETE /api/shopping/[id]`<br>`PATCH /api/shopping/[id]` | `/[locale]`<br>`/[locale]/login` |
| `/[locale]/tickets` | account | requires session | `POST /api/tickets` | `/[locale]` |
| `/[locale]/verify` | open | steps aside | `POST /api/auth/verify` | `/[locale]` |

## Endpoints

| Method | Path | Gate | Validated | Rate-limited | Called from |
|---|---|---|---|---|---|
| POST | `/api/account/avatar` | user (manual) | — | yes | `account/AvatarForm` |
| DELETE | `/api/account/avatar` | user (manual) | — | yes | `account/AvatarForm` |
| POST | `/api/account/email` | user | zod | yes | `account/AccountSettings` |
| POST | `/api/account/name` | user | zod | — | `account/AccountSettings` |
| POST | `/api/account/password` | user | zod | yes | `account/AccountSettings` |
| DELETE | `/api/account` | user | zod | yes | `account/AccountSettings` |
| DELETE | `/api/ai-keys/[provider]` | admin | — | — | `admin/AiKeys` |
| POST | `/api/ai-keys/[provider]/test` | admin | — | yes | `admin/AiKeys` |
| GET | `/api/ai-keys` | admin | zod | — | `admin/AiKeys` |
| POST | `/api/ai-keys` | admin | zod | — | `admin/AiKeys` |
| PATCH | `/api/ai-keys` | admin | zod | — | `admin/AiKeys` |
| POST | `/api/ai/polish` | admin | zod | yes | `recipe-form/PolishPanel` |
| POST | `/api/auth/forgot` | none (open by design) | zod | yes | `src/app/[locale]/forgot/page.tsx` |
| POST | `/api/auth/login` | none (open by design) | zod | yes | `src/app/[locale]/login/page.tsx` |
| POST | `/api/auth/logout` | none (open by design) | — | — | `LogoutButton`<br>`account/AccountSettings` |
| POST | `/api/auth/register` | none (open by design) | zod | yes | `auth/RegisterForm` |
| POST | `/api/auth/resend-verification` | user | zod | yes | `auth/ResendVerification` |
| POST | `/api/auth/reset` | device token | zod | yes | `auth/ResetForm` |
| POST | `/api/auth/verify` | device token | zod | yes | `src/app/[locale]/verify/page.tsx` |
| DELETE | `/api/capture-tokens/[id]` | admin | — | — | `src/app/[locale]/admin/devices/page.tsx` |
| GET | `/api/capture-tokens` | admin | zod | — | `src/app/[locale]/admin/devices/page.tsx` |
| POST | `/api/capture-tokens` | admin | zod | — | `src/app/[locale]/admin/devices/page.tsx` |
| POST | `/api/capture/[id]/merge` | admin | zod | — | `src/app/[locale]/admin/inbox/page.tsx` |
| POST | `/api/capture/[id]` | admin | zod | — | `src/app/[locale]/admin/inbox/page.tsx` |
| DELETE | `/api/capture/[id]` | admin | zod | — | `src/app/[locale]/admin/inbox/page.tsx` |
| POST | `/api/capture` | device token | zod | yes | *(nothing in the UI)* |
| GET | `/api/capture` | admin | zod | yes | `src/app/[locale]/admin/inbox/page.tsx` |
| PUT | `/api/collections/[id]` | admin | zod | — | `collection/CollectionForm` |
| DELETE | `/api/collections/[id]` | admin | zod | — | `collection/CollectionForm` |
| POST | `/api/collections/[id]/share` | admin | — | — | `share/ShareDialog` |
| DELETE | `/api/collections/[id]/share` | admin | — | — | `share/ShareDialog` |
| PATCH | `/api/collections/[id]/visibility` | admin | zod | — | `share/ShareDialog` |
| GET | `/api/collections` | user (manual) | zod | — | `collection/CollectionForm` |
| POST | `/api/collections` | admin | zod | — | `collection/CollectionForm` |
| GET | `/api/cron/backup` | cron secret | — | — | *(nothing in the UI)* |
| POST | `/api/errors/[id]` | admin | — | — | `admin/ErrorsPanel` |
| DELETE | `/api/errors/[id]` | admin | — | — | `admin/ErrorsPanel` |
| POST | `/api/errors` | none (open by design) | zod | yes | `ErrorReporter`<br>`GlobalErrorReporter` |
| GET | `/api/errors` | admin | zod | yes | `admin/ErrorsPanel` |
| GET | `/api/export` | admin | — | — | `admin/BackupPanel` |
| POST | `/api/import/ai` | admin | zod | yes | `recipe-form/QuickImport` |
| POST | `/api/import/archive` | admin | — | — | `admin/BackupPanel` |
| POST | `/api/import/url` | admin | zod | yes | `recipe-form/QuickImport` |
| DELETE | `/api/invites/[id]` | admin | — | — | `admin/InvitationList` |
| GET | `/api/invites` | admin | zod | — | `admin/InvitationList` |
| POST | `/api/invites` | admin | zod | — | `admin/InvitationList` |
| PUT | `/api/posts/[id]` | admin | zod | — | `post/PostForm` |
| DELETE | `/api/posts/[id]` | admin | zod | — | `post/DeletePostButton`<br>`post/PostForm` |
| POST | `/api/posts/[id]/share` | admin | — | — | `share/ShareDialog` |
| DELETE | `/api/posts/[id]/share` | admin | — | — | `share/ShareDialog` |
| PATCH | `/api/posts/[id]/visibility` | admin | zod | — | `share/ShareDialog` |
| POST | `/api/posts` | admin | zod | — | `post/PostForm` |
| POST | `/api/recipes/[id]/cooked/photos` | user (manual) | — | yes | `recipe/Cooked` |
| DELETE | `/api/recipes/[id]/cooked/photos` | user (manual) | — | yes | `recipe/Cooked` |
| POST | `/api/recipes/[id]/draft` | admin | — | — | `recipe/FinishDraft` |
| POST | `/api/recipes/[id]/favorite` | user | — | — | `FavoriteButton` |
| DELETE | `/api/recipes/[id]/favorite` | user | — | — | `FavoriteButton` |
| POST | `/api/recipes/[id]/rate` | user | zod | — | `Rating` |
| PUT | `/api/recipes/[id]` | admin | zod | — | `recipe-form/RecipeForm` |
| DELETE | `/api/recipes/[id]` | admin | zod | — | `DeleteRecipeButton`<br>`recipe-form/RecipeForm` |
| POST | `/api/recipes/[id]/share` | admin | — | — | `share/ShareDialog` |
| DELETE | `/api/recipes/[id]/share` | admin | — | — | `share/ShareDialog` |
| POST | `/api/recipes/[id]/view` | user (manual) | — | yes | `ViewTracker` |
| PATCH | `/api/recipes/[id]/visibility` | admin | zod | — | `share/ShareDialog` |
| POST | `/api/recipes` | admin | zod | — | `recipe-form/RecipeForm` |
| DELETE | `/api/site-profiles/[host]` | admin | — | — | `admin/SiteProfiles` |
| GET | `/api/site-profiles` | admin | zod | yes | `admin/SiteProfiles` |
| POST | `/api/site-profiles` | admin | zod | yes | `admin/SiteProfiles` |
| POST | `/api/tickets` | user (manual) | zod | yes | `src/app/[locale]/tickets/page.tsx` |
| GET | `/api/tickets` | admin | zod | yes | `admin/TicketsPanel` |
| PATCH | `/api/tickets` | admin | zod | yes | `admin/TicketsPanel` |
| POST | `/api/upload` | admin | — | — | *(nothing in the UI)* |
| PATCH | `/api/users/[id]/role` | admin | zod | — | `admin/UserList` |
| DELETE | `/api/users/[id]` | admin | — | — | `admin/UserList` |
| GET | `/api/users` | admin | — | — | `admin/UserList` |

Calls the map could not match to an endpoint (a URL built elsewhere, or a path the regex misread):

- `* /api/shopping  (from shopping/ShoppingListView)`
- `* /api/shopping/share  (from shopping/ShoppingListView)`
- `* /api/shopping/shared/[id]  (from shopping/ShoppingListView)`
- `DELETE /api/recipes/[id]/cooked  (from recipe/Cooked)`
- `DELETE /api/shopping  (from shopping/ShoppingListView)`
- `DELETE /api/shopping/[id]  (from shopping/ShoppingListView)`
- `GET /api/favorites  (from home/OfflineFavorites)`
- `PATCH /api/recipes/[id]/cooked  (from recipe/Cooked)`
- `PATCH /api/shopping/[id]  (from shopping/ShoppingListView)`
- `POST /api/capture/share  (from admin/ShareIntoInbox)`
- `POST /api/examples  (from admin/ExampleButton)`
- `POST /api/import/recipes  (from admin/ForeignImport)`
- `POST /api/recipes/[id]/cooked  (from recipe/Cooked)`
- `POST /api/recipes/[id]/revisions/[id]  (from recipe-form/RecipeHistory)`
- `POST /api/shopping  (from shopping/AddToShopping)`

## Always present

Rendered by a layout rather than a page, so they are on every screen (or every admin screen) and are listed once rather than drawn as forty edges.

| Where | Component | Links to |
|---|---|---|
| Header | `Navbar` | `/[locale]`<br>`/[locale]/account`<br>`/[locale]/admin`<br>`/[locale]/blog`<br>`/[locale]/collections`<br>`/[locale]/login`<br>`/[locale]/shopping` |
| Footer | `Footer` | `/[locale]/imprint`<br>`/[locale]/privacy` |
| Admin nav | `admin/AdminNav` | `/[locale]/admin`<br>`/[locale]/admin/ai`<br>`/[locale]/admin/collections`<br>`/[locale]/admin/devices`<br>`/[locale]/admin/drafts`<br>`/[locale]/admin/inbox`<br>`/[locale]/admin/posts`<br>`/[locale]/admin/reports`<br>`/[locale]/admin/users` |

## Navigation

Screen to screen, from every `href`, `router.push` and `redirect` in the page and the components it renders — the layouts' header, footer and admin nav excluded, since those are on every screen and are listed above.

```mermaid
flowchart LR
  subgraph account
    n__locale__account["/[locale]/account"]
    n__locale__blog["/[locale]/blog"]
    n__locale__collections["/[locale]/collections"]
    n__locale__drafts["/[locale]/drafts"]
    n__locale_["/[locale]"]
    n__locale__share["/[locale]/share"]
    n__locale__shopping["/[locale]/shopping"]
    n__locale__tickets["/[locale]/tickets"]
  end
  subgraph admin
    n__locale__admin_ai["/[locale]/admin/ai"]
    n__locale__admin_collections__id_["/[locale]/admin/collections/[id]"]
    n__locale__admin_collections_new["/[locale]/admin/collections/new"]
    n__locale__admin_collections["/[locale]/admin/collections"]
    n__locale__admin_create["/[locale]/admin/create"]
    n__locale__admin_devices["/[locale]/admin/devices"]
    n__locale__admin_drafts["/[locale]/admin/drafts"]
    n__locale__admin_edit__id_["/[locale]/admin/edit/[id]"]
    n__locale__admin_errors["/[locale]/admin/errors"]
    n__locale__admin_inbox["/[locale]/admin/inbox"]
    n__locale__admin_invites["/[locale]/admin/invites"]
    n__locale__admin["/[locale]/admin"]
    n__locale__admin_posts__id_["/[locale]/admin/posts/[id]"]
    n__locale__admin_posts_new["/[locale]/admin/posts/new"]
    n__locale__admin_posts["/[locale]/admin/posts"]
    n__locale__admin_reports["/[locale]/admin/reports"]
    n__locale__admin_tickets["/[locale]/admin/tickets"]
    n__locale__admin_users["/[locale]/admin/users"]
  end
  subgraph decides
    n__locale__blog__slug_["/[locale]/blog/[slug]"]
    n__locale__collections__slug_["/[locale]/collections/[slug]"]
    n__locale__recipe__slug_["/[locale]/recipe/[slug]"]
  end
  subgraph open
    n__locale__c__token_["/[locale]/c/[token]"]
    n__locale__forgot["/[locale]/forgot"]
    n__locale__imprint["/[locale]/imprint"]
    n__locale__login["/[locale]/login"]
    n__locale__p__token_["/[locale]/p/[token]"]
    n__locale__privacy["/[locale]/privacy"]
    n__locale__r__token_["/[locale]/r/[token]"]
    n__locale__register["/[locale]/register"]
    n__locale__reset["/[locale]/reset"]
    n__locale__s__token_["/[locale]/s/[token]"]
    n__locale__verify["/[locale]/verify"]
  end
  n__locale__account --> n__locale__login
  n__locale__admin_collections__id_ --> n__locale__admin_collections
  n__locale__admin_collections__id_ --> n__locale__collections__slug_
  n__locale__admin_collections_new --> n__locale__admin_collections
  n__locale__admin_collections_new --> n__locale__collections__slug_
  n__locale__admin_collections --> n__locale__admin_collections__id_
  n__locale__admin_collections --> n__locale__admin_collections_new
  n__locale__admin_collections --> n__locale__collections__slug_
  n__locale__admin_create --> n__locale__admin
  n__locale__admin_drafts --> n__locale__recipe__slug_
  n__locale__admin_edit__id_ --> n__locale__admin
  n__locale__admin_errors --> n__locale__admin_reports
  n__locale__admin_inbox --> n__locale__admin_create
  n__locale__admin_inbox --> n__locale__recipe__slug_
  n__locale__admin_inbox --> n__locale__tickets
  n__locale__admin_invites --> n__locale__admin_users
  n__locale__admin --> n__locale__admin_create
  n__locale__admin --> n__locale__admin_drafts
  n__locale__admin --> n__locale__admin_edit__id_
  n__locale__admin --> n__locale__recipe__slug_
  n__locale__admin_posts__id_ --> n__locale__admin_posts
  n__locale__admin_posts_new --> n__locale__admin_posts
  n__locale__admin_posts --> n__locale__admin_posts__id_
  n__locale__admin_posts --> n__locale__admin_posts_new
  n__locale__admin_posts --> n__locale__blog__slug_
  n__locale__admin_posts --> n__locale__collections__slug_
  n__locale__admin_posts --> n__locale__recipe__slug_
  n__locale__admin_tickets --> n__locale__admin_reports
  n__locale__blog__slug_ --> n__locale__collections__slug_
  n__locale__blog__slug_ --> n__locale__login
  n__locale__blog__slug_ --> n__locale__recipe__slug_
  n__locale__blog --> n__locale__blog__slug_
  n__locale__blog --> n__locale__collections__slug_
  n__locale__blog --> n__locale__recipe__slug_
  n__locale__c__token_ --> n__locale__recipe__slug_
  n__locale__collections__slug_ --> n__locale__admin_collections__id_
  n__locale__collections__slug_ --> n__locale__blog__slug_
  n__locale__collections__slug_ --> n__locale__login
  n__locale__collections__slug_ --> n__locale__recipe__slug_
  n__locale__collections__slug_ --> n__locale__shopping
  n__locale__collections --> n__locale__admin_collections_new
  n__locale__collections --> n__locale__collections__slug_
  n__locale__drafts --> n__locale__admin_drafts
  n__locale__forgot --> n__locale__login
  n__locale__login --> n__locale__forgot
  n__locale__p__token_ --> n__locale__collections__slug_
  n__locale__p__token_ --> n__locale__login
  n__locale__p__token_ --> n__locale__recipe__slug_
  n__locale_ --> n__locale__blog
  n__locale_ --> n__locale__recipe__slug_
  n__locale__r__token_ --> n__locale_
  n__locale__r__token_ --> n__locale__admin_posts_new
  n__locale__r__token_ --> n__locale__blog__slug_
  n__locale__r__token_ --> n__locale__login
  n__locale__r__token_ --> n__locale__recipe__slug_
  n__locale__r__token_ --> n__locale__shopping
  n__locale__recipe__slug_ --> n__locale_
  n__locale__recipe__slug_ --> n__locale__admin_posts_new
  n__locale__recipe__slug_ --> n__locale__blog__slug_
  n__locale__recipe__slug_ --> n__locale__login
  n__locale__recipe__slug_ --> n__locale__shopping
  n__locale__register --> n__locale__login
  n__locale__reset --> n__locale__forgot
  n__locale__s__token_ --> n__locale_
  n__locale__share --> n__locale__admin_inbox
  n__locale__shopping --> n__locale_
  n__locale__shopping --> n__locale__login
  n__locale__tickets --> n__locale_
  n__locale__verify --> n__locale_
```

## Who calls what

```mermaid
flowchart LR
  ePOST_api_account_avatar(["POST /api/account/avatar"])
  caccount_AvatarForm["account/AvatarForm"]
  caccount_AvatarForm --> ePOST_api_account_avatar
  eDELETE_api_account_avatar(["DELETE /api/account/avatar"])
  caccount_AvatarForm --> eDELETE_api_account_avatar
  ePOST_api_account_email(["POST /api/account/email"])
  caccount_AccountSettings["account/AccountSettings"]
  caccount_AccountSettings --> ePOST_api_account_email
  ePOST_api_account_name(["POST /api/account/name"])
  caccount_AccountSettings --> ePOST_api_account_name
  ePOST_api_account_password(["POST /api/account/password"])
  caccount_AccountSettings --> ePOST_api_account_password
  eDELETE_api_account(["DELETE /api/account"])
  caccount_AccountSettings --> eDELETE_api_account
  eDELETE_api_ai_keys__provider_(["DELETE /api/ai-keys/[provider]"])
  cadmin_AiKeys["admin/AiKeys"]
  cadmin_AiKeys --> eDELETE_api_ai_keys__provider_
  ePOST_api_ai_keys__provider__test(["POST /api/ai-keys/[provider]/test"])
  cadmin_AiKeys --> ePOST_api_ai_keys__provider__test
  eGET_api_ai_keys(["GET /api/ai-keys"])
  cadmin_AiKeys --> eGET_api_ai_keys
  ePOST_api_ai_keys(["POST /api/ai-keys"])
  cadmin_AiKeys --> ePOST_api_ai_keys
  ePATCH_api_ai_keys(["PATCH /api/ai-keys"])
  cadmin_AiKeys --> ePATCH_api_ai_keys
  ePOST_api_ai_polish(["POST /api/ai/polish"])
  crecipe_form_PolishPanel["recipe-form/PolishPanel"]
  crecipe_form_PolishPanel --> ePOST_api_ai_polish
  ePOST_api_auth_forgot(["POST /api/auth/forgot"])
  csrc_app__locale__forgot_page_tsx["src/app/[locale]/forgot/page.tsx"]
  csrc_app__locale__forgot_page_tsx --> ePOST_api_auth_forgot
  ePOST_api_auth_login(["POST /api/auth/login"])
  csrc_app__locale__login_page_tsx["src/app/[locale]/login/page.tsx"]
  csrc_app__locale__login_page_tsx --> ePOST_api_auth_login
  ePOST_api_auth_logout(["POST /api/auth/logout"])
  cLogoutButton["LogoutButton"]
  cLogoutButton --> ePOST_api_auth_logout
  caccount_AccountSettings --> ePOST_api_auth_logout
  ePOST_api_auth_register(["POST /api/auth/register"])
  cauth_RegisterForm["auth/RegisterForm"]
  cauth_RegisterForm --> ePOST_api_auth_register
  ePOST_api_auth_resend_verification(["POST /api/auth/resend-verification"])
  cauth_ResendVerification["auth/ResendVerification"]
  cauth_ResendVerification --> ePOST_api_auth_resend_verification
  ePOST_api_auth_reset(["POST /api/auth/reset"])
  cauth_ResetForm["auth/ResetForm"]
  cauth_ResetForm --> ePOST_api_auth_reset
  ePOST_api_auth_verify(["POST /api/auth/verify"])
  csrc_app__locale__verify_page_tsx["src/app/[locale]/verify/page.tsx"]
  csrc_app__locale__verify_page_tsx --> ePOST_api_auth_verify
  eDELETE_api_capture_tokens__id_(["DELETE /api/capture-tokens/[id]"])
  csrc_app__locale__admin_devices_page_tsx["src/app/[locale]/admin/devices/page.tsx"]
  csrc_app__locale__admin_devices_page_tsx --> eDELETE_api_capture_tokens__id_
  eGET_api_capture_tokens(["GET /api/capture-tokens"])
  csrc_app__locale__admin_devices_page_tsx --> eGET_api_capture_tokens
  ePOST_api_capture_tokens(["POST /api/capture-tokens"])
  csrc_app__locale__admin_devices_page_tsx --> ePOST_api_capture_tokens
  ePOST_api_capture__id__merge(["POST /api/capture/[id]/merge"])
  csrc_app__locale__admin_inbox_page_tsx["src/app/[locale]/admin/inbox/page.tsx"]
  csrc_app__locale__admin_inbox_page_tsx --> ePOST_api_capture__id__merge
  ePOST_api_capture__id_(["POST /api/capture/[id]"])
  csrc_app__locale__admin_inbox_page_tsx --> ePOST_api_capture__id_
  eDELETE_api_capture__id_(["DELETE /api/capture/[id]"])
  csrc_app__locale__admin_inbox_page_tsx --> eDELETE_api_capture__id_
  eGET_api_capture(["GET /api/capture"])
  csrc_app__locale__admin_inbox_page_tsx --> eGET_api_capture
  ePUT_api_collections__id_(["PUT /api/collections/[id]"])
  ccollection_CollectionForm["collection/CollectionForm"]
  ccollection_CollectionForm --> ePUT_api_collections__id_
  eDELETE_api_collections__id_(["DELETE /api/collections/[id]"])
  ccollection_CollectionForm --> eDELETE_api_collections__id_
  ePOST_api_collections__id__share(["POST /api/collections/[id]/share"])
  cshare_ShareDialog["share/ShareDialog"]
  cshare_ShareDialog --> ePOST_api_collections__id__share
  eDELETE_api_collections__id__share(["DELETE /api/collections/[id]/share"])
  cshare_ShareDialog --> eDELETE_api_collections__id__share
  ePATCH_api_collections__id__visibility(["PATCH /api/collections/[id]/visibility"])
  cshare_ShareDialog --> ePATCH_api_collections__id__visibility
  eGET_api_collections(["GET /api/collections"])
  ccollection_CollectionForm --> eGET_api_collections
  ePOST_api_collections(["POST /api/collections"])
  ccollection_CollectionForm --> ePOST_api_collections
  ePOST_api_errors__id_(["POST /api/errors/[id]"])
  cadmin_ErrorsPanel["admin/ErrorsPanel"]
  cadmin_ErrorsPanel --> ePOST_api_errors__id_
  eDELETE_api_errors__id_(["DELETE /api/errors/[id]"])
  cadmin_ErrorsPanel --> eDELETE_api_errors__id_
  ePOST_api_errors(["POST /api/errors"])
  cErrorReporter["ErrorReporter"]
  cErrorReporter --> ePOST_api_errors
  cGlobalErrorReporter["GlobalErrorReporter"]
  cGlobalErrorReporter --> ePOST_api_errors
  eGET_api_errors(["GET /api/errors"])
  cadmin_ErrorsPanel --> eGET_api_errors
  eGET_api_export(["GET /api/export"])
  cadmin_BackupPanel["admin/BackupPanel"]
  cadmin_BackupPanel --> eGET_api_export
  ePOST_api_import_ai(["POST /api/import/ai"])
  crecipe_form_QuickImport["recipe-form/QuickImport"]
  crecipe_form_QuickImport --> ePOST_api_import_ai
  ePOST_api_import_archive(["POST /api/import/archive"])
  cadmin_BackupPanel --> ePOST_api_import_archive
  ePOST_api_import_url(["POST /api/import/url"])
  crecipe_form_QuickImport --> ePOST_api_import_url
  eDELETE_api_invites__id_(["DELETE /api/invites/[id]"])
  cadmin_InvitationList["admin/InvitationList"]
  cadmin_InvitationList --> eDELETE_api_invites__id_
  eGET_api_invites(["GET /api/invites"])
  cadmin_InvitationList --> eGET_api_invites
  ePOST_api_invites(["POST /api/invites"])
  cadmin_InvitationList --> ePOST_api_invites
  ePUT_api_posts__id_(["PUT /api/posts/[id]"])
  cpost_PostForm["post/PostForm"]
  cpost_PostForm --> ePUT_api_posts__id_
  eDELETE_api_posts__id_(["DELETE /api/posts/[id]"])
  cpost_DeletePostButton["post/DeletePostButton"]
  cpost_DeletePostButton --> eDELETE_api_posts__id_
  cpost_PostForm --> eDELETE_api_posts__id_
  ePOST_api_posts__id__share(["POST /api/posts/[id]/share"])
  cshare_ShareDialog --> ePOST_api_posts__id__share
  eDELETE_api_posts__id__share(["DELETE /api/posts/[id]/share"])
  cshare_ShareDialog --> eDELETE_api_posts__id__share
  ePATCH_api_posts__id__visibility(["PATCH /api/posts/[id]/visibility"])
  cshare_ShareDialog --> ePATCH_api_posts__id__visibility
  ePOST_api_posts(["POST /api/posts"])
  cpost_PostForm --> ePOST_api_posts
  ePOST_api_recipes__id__cooked_photos(["POST /api/recipes/[id]/cooked/photos"])
  crecipe_Cooked["recipe/Cooked"]
  crecipe_Cooked --> ePOST_api_recipes__id__cooked_photos
  eDELETE_api_recipes__id__cooked_photos(["DELETE /api/recipes/[id]/cooked/photos"])
  crecipe_Cooked --> eDELETE_api_recipes__id__cooked_photos
  ePOST_api_recipes__id__draft(["POST /api/recipes/[id]/draft"])
  crecipe_FinishDraft["recipe/FinishDraft"]
  crecipe_FinishDraft --> ePOST_api_recipes__id__draft
  ePOST_api_recipes__id__favorite(["POST /api/recipes/[id]/favorite"])
  cFavoriteButton["FavoriteButton"]
  cFavoriteButton --> ePOST_api_recipes__id__favorite
  eDELETE_api_recipes__id__favorite(["DELETE /api/recipes/[id]/favorite"])
  cFavoriteButton --> eDELETE_api_recipes__id__favorite
  ePOST_api_recipes__id__rate(["POST /api/recipes/[id]/rate"])
  cRating["Rating"]
  cRating --> ePOST_api_recipes__id__rate
  ePUT_api_recipes__id_(["PUT /api/recipes/[id]"])
  crecipe_form_RecipeForm["recipe-form/RecipeForm"]
  crecipe_form_RecipeForm --> ePUT_api_recipes__id_
  eDELETE_api_recipes__id_(["DELETE /api/recipes/[id]"])
  cDeleteRecipeButton["DeleteRecipeButton"]
  cDeleteRecipeButton --> eDELETE_api_recipes__id_
  crecipe_form_RecipeForm --> eDELETE_api_recipes__id_
  ePOST_api_recipes__id__share(["POST /api/recipes/[id]/share"])
  cshare_ShareDialog --> ePOST_api_recipes__id__share
  eDELETE_api_recipes__id__share(["DELETE /api/recipes/[id]/share"])
  cshare_ShareDialog --> eDELETE_api_recipes__id__share
  ePOST_api_recipes__id__view(["POST /api/recipes/[id]/view"])
  cViewTracker["ViewTracker"]
  cViewTracker --> ePOST_api_recipes__id__view
  ePATCH_api_recipes__id__visibility(["PATCH /api/recipes/[id]/visibility"])
  cshare_ShareDialog --> ePATCH_api_recipes__id__visibility
  ePOST_api_recipes(["POST /api/recipes"])
  crecipe_form_RecipeForm --> ePOST_api_recipes
  eDELETE_api_site_profiles__host_(["DELETE /api/site-profiles/[host]"])
  cadmin_SiteProfiles["admin/SiteProfiles"]
  cadmin_SiteProfiles --> eDELETE_api_site_profiles__host_
  eGET_api_site_profiles(["GET /api/site-profiles"])
  cadmin_SiteProfiles --> eGET_api_site_profiles
  ePOST_api_site_profiles(["POST /api/site-profiles"])
  cadmin_SiteProfiles --> ePOST_api_site_profiles
  ePOST_api_tickets(["POST /api/tickets"])
  csrc_app__locale__tickets_page_tsx["src/app/[locale]/tickets/page.tsx"]
  csrc_app__locale__tickets_page_tsx --> ePOST_api_tickets
  eGET_api_tickets(["GET /api/tickets"])
  cadmin_TicketsPanel["admin/TicketsPanel"]
  cadmin_TicketsPanel --> eGET_api_tickets
  ePATCH_api_tickets(["PATCH /api/tickets"])
  cadmin_TicketsPanel --> ePATCH_api_tickets
  ePATCH_api_users__id__role(["PATCH /api/users/[id]/role"])
  cadmin_UserList["admin/UserList"]
  cadmin_UserList --> ePATCH_api_users__id__role
  eDELETE_api_users__id_(["DELETE /api/users/[id]"])
  cadmin_UserList --> eDELETE_api_users__id_
  eGET_api_users(["GET /api/users"])
  cadmin_UserList --> eGET_api_users
```

