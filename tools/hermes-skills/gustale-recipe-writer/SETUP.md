# Running Gustale recipes with Hermes

One skill (`gustale-recipe-writer`) and one Kanban board (`gustale-recipes`). Every recipe is three linked
cards: **research → write → verify**. The verifier publishes HIGH (when auto-publish is on), sends MEDIUM to
Alejandro for review, and blocks LOW. Hermes keeps its usual model (MiniMax-M3); nothing in its setup changes.

## 1. Install (once, on geekobot, in WSL)

```bash
# keep the canonical copy in the gustale repo so changes have history
REPO=/home/alex/projects/gustale.com            # the primary path in docs/AGENT-RUNBOOK.md
mkdir -p $REPO/tools/hermes-skills && cd $REPO/tools/hermes-skills
python3 -m zipfile -e /mnt/c/Users/alex/Downloads/gustale-recipe-writer.zip .
cd gustale-recipe-writer

# work folder for source sheets and drafts: inside the project, ignored locally (the repo itself is unchanged)
grep -qx ".work/" $REPO/.git/info/exclude || echo ".work/" >> $REPO/.git/info/exclude

bash install.sh --recipes-dir $REPO/.work/recipes gustale
```

The repo path is the primary one in `docs/AGENT-RUNBOOK.md`. `install.sh` copies the skill into the `gustale` profile,
fills in its paths, creates the board, and keeps any previous copy under `skill-backups/`.

If you use separate role profiles, install into each one and point the stages at them:

```bash
GUSTALE_RESEARCH_PROFILE=researcher GUSTALE_VERIFY_PROFILE=verifier \
  bash install.sh --recipes-dir /home/alex/projects/gustale.com/.work/recipes gustale researcher verifier
```

Check that it worked:

```bash
S=~/.hermes/profiles/gustale/skills/gustale/gustale-recipe-writer
python3 $S/scripts/check_recipe.py $S/examples/joulutorttu-pinwheel.json --only-locale en   # expect PASS
hermes kanban boards list                                                                 # gustale-recipes
```

## 2. Make sure cards get picked up

Cards are started by the Kanban dispatcher, which runs inside **one** gateway, the one with
`kanban.dispatch_in_gateway: true`. If cards sit in `ready`, run one pass by hand:

```bash
hermes kanban --board gustale-recipes dispatch
```

## 3. Pilot: moussaka-greek

```bash
bash $S/scripts/new-recipe.sh moussaka-greek moussaka-greek el,en
hermes kanban --board gustale-recipes list
hermes kanban --board gustale-recipes show <id>       # body, handoffs, comments
```

The files appear in `.work/recipes/moussaka-greek/`: `source-sheet.md`, `moussaka-greek.json` and
`verify-report.md`.

The first recipes always stop at review until the small D4 migration (RECIPE-STYLE.md §10) is applied. The
verifier proposes it in its review note.

## 4. Review (MEDIUM, and the first recipes)

```bash
hermes kanban --board gustale-recipes list --status review
```

Read `verify-report.md` and the JSON, then choose one:

```bash
hermes kanban --board gustale-recipes request-changes <id> "APPROVED — publish"       # publish it
hermes kanban --board gustale-recipes request-changes <id> "Step 4: …; failure 2: …"  # fix and re-verify
hermes kanban --board gustale-recipes block <id> "reason"                             # stop it
```

The same verbs work from Telegram as `/kanban …`.

## 5. Then let it run gradually

After the pilot is approved, add a daily job that queues the next dishes. It starts paused; resume it when
you're ready.

```bash
hermes -p gustale cron create "every 1d at 02:40" \
  "Queue the next 5 Atlas dishes that have no published recipe and no card on the gustale-recipes board \
(pilot order first: moussaka-greek, then nasi goreng; then the recipes backlog). For each, run: \
bash $S/scripts/new-recipe.sh <dish-slug>. Reply with the dishes queued and their card ids." \
  --skill gustale-recipe-writer --name gustale-recipes-queue \
  --workdir /home/alex/projects/gustale.com --timezone Asia/Makassar \
  --paused --paused-reason "Waiting for the pilot recipe to be approved"

hermes -p gustale cron resume gustale-recipes-queue     # when ready
```

Raise the 5 once the review queue stays short. HIGH recipes still respect auto-publish's switch and its daily
cap of 20.

## Changing the style later

Edit the canonical copy in the repo (`references/RECIPE-STYLE.md`, the schema or the checker), commit it, and
run `install.sh` again. Hermes is told not to edit the skill itself, so every change to the house style goes
through you.
