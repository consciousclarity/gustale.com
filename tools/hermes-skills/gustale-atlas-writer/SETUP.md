# Running Gustale Atlas pages with Hermes

One skill (`gustale-atlas-writer`) and one Kanban board (`gustale-atlas`). Every dish, family or lineage is three
linked cards: **research → write → verify**. The verifier compares its record with the live one, applies HIGH
changes through the existing write paths (with history kept), sends MEDIUM to Alejandro, and blocks LOW. The first
five records of each kind always stop at review.

It works the same way as the recipe skill (`gustale-recipe-writer`). Install both the same way.

## 1. Install (once, on geekobot, in WSL)

```bash
REPO=/home/alex/projects/gustale.com            # the primary path in docs/AGENT-RUNBOOK.md
mkdir -p $REPO/tools/hermes-skills && cd $REPO/tools/hermes-skills
python3 -m zipfile -e /mnt/c/Users/alex/Downloads/gustale-atlas-writer.zip .
cd gustale-atlas-writer
grep -qx ".work/" $REPO/.git/info/exclude || echo ".work/" >> $REPO/.git/info/exclude
bash install.sh --work-dir $REPO/.work/atlas gustale
```

Check it:

```bash
A=~/.hermes/profiles/gustale/skills/gustale/gustale-atlas-writer
for f in $A/examples/*.json; do python3 $A/scripts/check_atlas.py $f | tail -1; done   # three PASS lines
hermes kanban boards list                                                            # gustale-atlas
```

## 2. Pilot: one of each

```bash
bash $A/scripts/new-atlas-card.sh dish moussaka-greek
bash $A/scripts/new-atlas-card.sh family dumpling
bash $A/scripts/new-atlas-card.sh lineage <an existing lineage slug>
hermes kanban --board gustale-atlas list
```

If cards sit in `ready`, run `hermes kanban --board gustale-atlas dispatch`. Each entity gets a folder under
`.work/atlas/<kind>-<slug>/` containing `live.json`, `source-sheet.md`, the record, `diff.md` and
`verify-report.md`.

## 3. Review

```bash
hermes kanban --board gustale-atlas list --status review
hermes kanban --board gustale-atlas request-changes <id> "APPROVED — apply"        # apply it
hermes kanban --board gustale-atlas request-changes <id> "Intro: …; connection c2: …"  # fix and re-verify
hermes kanban --board gustale-atlas block <id> "reason"                             # stop it
```

Read `diff.md` first. It lists anything the record would remove or contradict on the live page.

## 4. Then gradually

When the pilots look right, add a paused daily job, the same way as for recipes:

```bash
hermes -p gustale cron create "every 1d at 03:20" \
  "Queue the next 5 Atlas entities that need writing (dishes with no intro or an Unverified-only page first, \
then families with no description, then lineages with no uncertainty note) and have no card on the gustale-atlas \
board. For each, run: bash $A/scripts/new-atlas-card.sh <kind> <slug>. Reply with what you queued." \
  --skill gustale-atlas-writer --name gustale-atlas-queue \
  --workdir /home/alex/projects/gustale.com --timezone Asia/Makassar \
  --paused --paused-reason "Waiting for the Atlas pilots to be approved"
```
