# Proof: GitHub operations now run as the gustale-bot App

This file was created by the `gustale-bot` GitHub App (App ID 5596451)
using an **installation token**, not a personal access token.

The App's granted permissions, as reported by `GET /app`:

| permission | level |
|---|---|
| contents | write |
| pull_requests | write |
| issues | read |
| checks | read |
| actions | read |
| statuses | read |
| metadata | read |

There is **no `administration`** and **no `workflows`** permission. The App
cannot administer the repository, cannot change branch protection, and
cannot push to a workflow file. Those stay with the repository owner.

This file is a scratch artifact for the proof; it is safe to close and
delete.
