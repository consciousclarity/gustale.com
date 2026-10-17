# ROOT_SSH_KEY — gustale deploy SSH key for the deploy user

The Gustale deploy job (`.github/workflows/ci.yml` → `Deploy to Hostinger`)
SSHes into the VPS as the user referenced by the `HOSTINGER_USER` secret.
On the Hostinger box, that user is **`root`**, not `hermes`. The workspace
(`/home/hermes/projects/gustale.com`) and the deploy-key file
(`/home/hermes/.ssh/gustale_deploy`) are owned by `hermes:hermes`, which
means `root` cannot read them by default. The deploy needs `root` to:

1. Have the gustale deploy key at a path it can read.
2. Have a `Host github-gustale` alias in its SSH config that points to
   that key (the workspace's git remote URL is
   `github-gustale:consciousclarity/gustale.com.git`).
3. Have its own `known_hosts` for `github.com` so the first fetch doesn't
   prompt for the host key.

If any of these are missing, the deploy step's `git fetch` fails with one
of:

```
no such identity: /root/.ssh/gustale_deploy: No such file or directory
git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.
```

…and the CI job still reports `success` because the
[appleboy/ssh-action](https://github.com/appleboy/ssh-action) does not
propagate the inner script's exit code (see
`infra/prod/DEPLOY_PIPELINE.md` §"Real verify" for the workaround).

## One-time setup

On the VPS as **root**:

```bash
# 1. Copy the deploy key to a path the deploy user (root) can read.
cp /home/hermes/.ssh/gustale_deploy /root/.ssh/gustale_deploy
chmod 600 /root/.ssh/gustale_deploy
cp /home/hermes/.ssh/gustale_deploy.pub /root/.ssh/gustale_deploy.pub
chmod 644 /root/.ssh/gustale_deploy.pub

# 2. Add the github-gustale Host block to /root/.ssh/config
#    (if it isn't already there).
cat >> /root/.ssh/config <<'EOF'

Host github-gustale
  HostName github.com
  User git
  IdentityFile /root/.ssh/gustale_deploy
  IdentitiesOnly yes
EOF

# 3. Trust the github.com host key (in case it isn't already).
ssh-keyscan -t ed25519,rsa,ecdsa github.com >> /root/.ssh/known_hosts 2>/dev/null

# 4. Verify: this should print a fetch and exit 0.
git -C /home/deploy/gustale-build fetch --no-tags --depth=50 origin main
```

## What can break this

| Symptom | Likely cause | Fix |
|---|---|---|
| `Could not resolve hostname github-gustale` | `/root/.ssh/config` is missing the `Host github-gustale` block | Re-run step 2. |
| `no such identity: /root/.ssh/gustale_deploy` | The key isn't at `/root/.ssh/gustale_deploy` (or wrong perms) | Re-run step 1. |
| `Permission denied (publickey)` | Wrong key file perms (e.g. `0644`), or wrong key contents | `chmod 600`, re-copy from hermes |
| `Host key verification failed` | `/root/.ssh/known_hosts` is missing github.com | Re-run step 3. |
| `dubious ownership` (from git) | The workspace dir is owned by a user other than `root` | `chown -R root:root /home/deploy/gustale-build` (or run `git config --global --add safe.directory '<dir>'`) |

## Verification

After any of the above changes, the most reliable end-to-end test is:

```bash
# 1. Manual fetch as the deploy user (root)
git -C /home/deploy/gustale-build fetch --no-tags --depth=50 origin main

# 2. Re-run the failed CI workflow from the GitHub UI
#    (Actions tab → select the failed run → "Re-run jobs")
# 3. Check the Real verify step output — it should report OK
#    on all three checks (log, docker inspect, live page phrase).
```

## The persistent-build-checkout (also on root)

`/home/deploy/gustale-build/` is the dedicated clone used by the deploy
job. It is owned by `root:root` so the deploy can do
`git fetch`/`git checkout` directly without sudo gymnastics. The dir is
world-readable (mode 755) so `hermes` can still read source for any
local check. If you ever need to reset it:

```bash
rm -rf /home/deploy/gustale-build
mkdir -p /home/deploy/gustale-build
chown root:root /home/deploy/gustale-build
chmod 755 /home/deploy/gustale-build
cd /home/deploy/gustale-build
git init -q
git remote add origin github-gustale:consciousclarity/gustale.com.git
git fetch --no-tags --depth=50 origin main
git checkout -q origin/main
```

The deploy job's `ci.yml` (post-merge) will detect the dir is missing
and surface a clear `::error::Build dir ... is not a git checkout.`
without overwriting it.

## Where to look if the deploy still fails

1. **GHA logs**: Actions tab → run → `Deploy via SSH` step → the
   `--- Updating build checkout $BUILD_DIR to $SHA ---` section shows
   the fetch output.
2. **VPS log file**: `/tmp/gustale-deploy-${GITHUB_RUN_ID}.log` —
   per-run, never shared, never clobbered. The GHA run id is in the
   run's URL.
3. **API key rotation**: if `gustale_deploy` was rotated on GitHub, the
   VPS has the old public key. The fix is `cp` the new private key from
   the `hermes` user (who's in charge of keys) to `/root/.ssh/gustale_deploy`.
