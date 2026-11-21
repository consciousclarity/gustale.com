# The axe gate has never run

**Lane A2 — 2026-11-21.** The accessibility gate in CI is not failing.
It has **never produced a verdict at all**, because the step before it
dies.

---

## The finding

The `a11y` job in `.github/workflows/ci.yml` has a step:

```yaml
- name: Install Chromium
  run: pnpm exec playwright install --with-deps chromium
```

`--with-deps` shells out to `apt-get install`. On a GitHub Actions runner
whose `/etc/apt/apt-mirrors.txt` points at `azure.archive.ubuntu.com` --
which the runner image does for some regions -- that host fails to
resolve.

From the CI log (run of 2026-11-11, `##[group]Run pnpm exec playwright
install --with-deps chromium`):

```
Ign:2 http://azure.archive.ubuntu.com/ubuntu noble InRelease
...
Err:2 https://security.ubuntu.com/ubuntu noble InRelease
  Temporary failure resolving 'azure.archive.ubuntu.com'
W: Failed to fetch mirror+file:/etc/apt/apt-mirrors.txt/dists/noble/InRelease
  Temporary failure resolving 'azure.archive.ubuntu.com'
...
E: Failed to fetch https://security.ubuntu.com/ubuntu/pool/universe/f/fonts-ipafont/fonts-ipafont-gothic_00303-21ubuntu1_all.deb
  Temporary failure resolving 'azure.archive.ubuntu.com'
Failed to install browsers
Error: Installation process exited with code: 100
##[error]Process completed with exit code 1.
```

**`Failed to install browsers`, exit code 100.** The job dies at the
install step. `pnpm run a11y:gate` never executes.

The gate's own comment says it must not fail silently:

> It does NOT continue-on-error. A gate that can fail silently is
> worse than no gate: it teaches everyone to ignore the red X.

It has not been failing silently on the defects. It has been failing
loudly on its own installation, for as long as it has existed, and
nothing on the other side of it has ever been checked.

---

## What actually fails

Every Chromium **library** installs fine. The log shows 34 packages
reporting "already the newest version":

```
libnspr4, libnss3, libatk1.0-0t64, libatk-bridge2.0-0t64,
libatspi2.0-0t64, libcairo2, libcups2t64, libdbus-1-3, libdrm2,
libgbm1, libglib2.0-0t64, libpango-1.0-0, libx11-6, libxcb1,
libxcomposite1, libxdamage1, libxext6, libxfixes3, libxkbcommon0,
libxrandr2, xvfb, fonts-noto-color-emoji, ...
```

**Only the optional FONT bundle fails:**

```
fonts-wqy-zenhei     fonts-tlwg-loma      fonts-freefont
fonts-ipafont        fonts-unifont         xfonts-cyrillic
xfonts-encodings     xfonts-scalable       xfonts-utils
```

The gate dies installing fonts it does not need. The axe rules this
repository gates on are:

```
wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice
```

Those are DOM and ARIA rules. They read structure, names, roles, and
computed geometry. **They never render a glyph.** The pages the gate
covers are `/`, `/about`, `/families`, `/regions`, `/lineages`,
`/dishes/empanada`, `/place/greece` -- none of which needs a CJK font.

---

## The fix

`scripts/ci-apt-mirror.sh` (in this PR) repoints apt at the canonical
Ubuntu archive -- `archive.ubuntu.com`, a **different host** from the
Azure mirror, so it fails independently -- by writing a drop-in to
`/etc/apt/sources.list.d/00-hermes-ubuntu-mirror.list`. The `00-` prefix
sorts before the runner image's own list, so ours wins. The original
file is copied to `apt-mirrors.txt.hermes-backup` first, and it is
**not** overwritten.

The script:

- is a **no-op** when apt already works;
- **never fails the build by itself** -- if apt cannot be fixed it exits
  0 and says so, so the step that actually needs apt fails with its own
  error naming the real cause, instead of hiding it behind a generic
  mirror error.

### What was deliberately NOT done

**`--with-deps` was kept.** On a fresh runner image the Chromium
libraries genuinely are needed. Dropping the flag would trade a broken
install for a missing-library crash, and would make the gate depend on
whatever the runner image happens to ship that day.

**`--ignore-package-errors` was not used.** A browser install that
silently skips its libraries is a gate that fails for the wrong
reason. That is exactly the failure mode this repository keeps trying
to avoid.

**`--no-install-deps` was not used.** Same reason.

---

## How the script was verified

It was tested against a mocked apt, in four cases:

| case | mocked apt | expected | result |
|---|---|---|---|
| 1 | already works | no-op, nothing written | **pass** -- "already reachable, nothing to do", no drop-in created |
| 2 | broken, then fixed | drop-in written, apt recovers | **pass** -- drop-in written, "reachable through http://archive.ubuntu.com/ubuntu" |
| 3 | stays broken | exit 0, name the cause | **pass** -- "STILL not reachable", "leaving this to the step that needs apt" |
| 4 | broken, backup | the original list is copied | **pass** -- backup contains the original mirror line |

Case 2's drop-in content:

```
deb http://archive.ubuntu.com/ubuntu noble main universe
deb http://archive.ubuntu.com/ubuntu noble-updates main universe
deb http://security.ubuntu.com/ubuntu noble-security main universe
```

The script is `bash -n` clean.

---

## The workflow change

**One step**, added immediately before the Chromium install:

```yaml
      - name: Point apt at a reachable mirror
        run: bash scripts/ci-apt-mirror.sh
```

`.github/workflows/ci.yml` cannot be pushed by the agent -- the GitHub
App has no workflow scope. So the hunk ships as
**`docs/ci-a11y-apt-mirror.patch`**, for the owner to apply.

It was verified against PR #283's head, `8d694fd`:

```console
$ git apply --check docs/ci-a11y-apt-mirror.patch
CHECK_OK
$ git apply docs/ci-a11y-apt-mirror.patch
APPLY_OK
```

---

## What this does NOT prove

**The gate has still never run.** This fixes the install; it does not
say what the axe gate will find when it finally does. There may well be
real WCAG violations waiting behind the broken install -- that is the
whole reason the gate was written, and it has been blind for as long as
it has existed.

**The fix was not run on a real GitHub runner.** It was tested against
a mocked apt and a sandboxed filesystem. The first real run of the
`a11y` job is the first real test, and its verdict -- pass or fail --
is the answer nobody has yet.

**The runner-side DNS failure may have been transient.** If
`azure.archive.ubuntu.com` resolved on the next run, the install might
have succeeded on its own and this patch would have changed nothing.
The drop-in is a no-op when apt already works, so it costs nothing in
that case -- but it also means the patch cannot be distinguished from a
no-op without a run that reproduces the failure.

**The Nightly workflow was checked and has no exposure.** `playwright
install --with-deps` appears in exactly one place in the whole
`.github/workflows/` directory -- `ci.yml`, line 1461. Nightly
installs no browser and runs no axe gate, so it needs no mirror
fix.
