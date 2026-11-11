# Messages to send Hermes

Send one at a time; wait for each report.

## 1 · Load the pack and run WP-00

```
@gustale Load the Gustale improvement pack at <repo>/docs/improvement-pack/.
Read README.md, OPERATING-MODEL.md and ROADMAP.md, then execute tasks/WP-00-baseline.md.
Read-only for this step: no edits outside docs/ and reports/, no commits to main, no deploys.
Report in the format from OPERATING-MODEL.md.
```

## 2 · Start Phase 1 (after the WP-00 report looks right)

```
@gustale WP-00 approved. Start WP-01 and WP-02 in parallel:
WP-01a → Codex, WP-01b → Claude Code, WP-02 → Codex after WP-01a.
Discovery first and post the findings before editing. Cross-review per OPERATING-MODEL.md.
Ask me before merge and before deploy.
```

## 3 · Decisions for WP-03 / WP-04 (edit to taste)

```
@gustale Decisions: D1 hide view counts until real ones exist. D2 hide language switcher and banner.
D3 replace Add a dish with "Suggest a source or correction". Start WP-03 and WP-04 after WP-01 is deployed.
```

## 4 · Daily check-in (optional, as a scheduled Hermes job)

```
@gustale Every day at 08:00 WITA: run the smoke test against production and post only changes
since yesterday (new PASS, new FAIL), plus the active WP and what's waiting for me.
```
