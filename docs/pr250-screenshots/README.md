# PR #250 -- the single-domain walk on staging

The screenshots the walk `scripts/hermes/pr250-single-domain-walk.cjs`
captures on `staging.gustale.com`, at **1440x900** and **390x844**.

## Why they are committed here and not attached to the PR

GitHub's REST API no longer serves the issue-asset endpoint:
`GET /repos/<owner>/<repo>/issues/<n>/assets` answers **404 Not Found**
for every repository, and the `uploads.github.com` host answers
**422 "Bad Size"** for every multipart body it is sent -- including a
5-byte one, and including the private repositories. The endpoint is
gone, so an image cannot be uploaded to a PR comment by the App.

The committed-file route is therefore the only route, and it matches
what the repo already does: `docs/gus-238-screenshots/` holds 37 PNGs
for the same purpose.

The PR comment links these files through `raw.githubusercontent.com` at
the branch head, so the images render inline in the PR.

## What the walk asserts

For every page, at both widths:

| assertion | why it matters |
|---|---|
| the page serves 200 | the page exists |
| the canonical is the page's OWN origin | no page points a crawler at another site |
| the canonical is never a retired host | `gustale.recipes` / `recipes.gustale.com` must not appear |
| no page LINKS to a retired host | the retired domain is gone from the markup, not just the canonical |
| the home carries a live variant (`geo`\|`recipes`) | the variant is selected, never a retired one |
| `/admin` carries NO canonical | the admin shell is noindex and carries no site identity |
| `/admin` leaks no dish data | the signed-out shell shows no content |
| no console errors, no uncaught errors, no failed requests | the page is not broken |
| nothing overflows horizontally | the layout fits the viewport |
| `/dishes/` and `/recipes/` are a 301 to the slashless form | ONE canonical form per section index |

## The files

| file | page | width |
|---|---|---|
| `pr250-home-desktop.png` | `/` | 1440 |
| `pr250-home-mobile.png` | `/` | 390 |
| `pr250-dishes-desktop.png` | `/dishes` | 1440 |
| `pr250-dishes-mobile.png` | `/dishes` | 390 |
| `pr250-recipes-desktop.png` | `/recipes` | 1440 |
| `pr250-recipes-mobile.png` | `/recipes` | 390 |
| `pr250-recipe-desktop.png` | `/dishes/pilot-bibimbap` | 1440 |
| `pr250-recipe-mobile.png` | `/dishes/pilot-bibimbap` | 390 |
| `pr250-ingredient-desktop.png` | `/ingredients` | 1440 |
| `pr250-ingredient-mobile.png` | `/ingredients` | 390 |
| `pr250-map-desktop.png` | `/map` | 1440 |
| `pr250-map-mobile.png` | `/map` | 390 |
| `pr250-admin-desktop.png` | `/admin` (signed out) | 1440 |
| `pr250-admin-mobile.png` | `/admin` (signed out) | 390 |

## Two things the walk deliberately does NOT claim

**The staging canonical is `staging.gustale.com`, not `gustale.com`.**
`apps/web/src/lib/locales.ts` builds the canonical from the origin the
site is served on, and it says so in a comment: pointing staging at
`gustale.com` "would be telling a crawler the staging copy is the real
one". So on staging the canonical is the staging origin, and the
invariant that matters is that it is NEVER a retired host.

**A deleted account's cookie dies with the cache, not instantly.**
better-auth caches the session in the SIGNED COOKIE for five minutes
(`apps/api/src/auth.ts`: `cookieCache.maxAge = 60 * 5`), so a session
issued moments before the account is deleted keeps authenticating
until that cache expires. The account's row and its session rows are
gone and the sign-in is refused at once; the cookie takes five minutes
to stop working. The walk does not claim otherwise.
