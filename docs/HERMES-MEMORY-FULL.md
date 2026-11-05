# Why "Memory is full" fires

**2026-11-06**

The short answer: it is a **character budget on two local files**, and
it is a *local* limit — nothing to do with Hindsight, and nothing to
do with tokens.

## The mechanism

`tools/memory_tool.py` in the Hermes install owns two stores:

| File | Holds | Limit |
|---|---|---|
| `~/.hermes/memories/MEMORY.md` | the agent's own notes | `memory_char_limit` |
| `~/.hermes/memories/USER.md` | what the agent knows about the user | `user_char_limit` |

Entries are separated by `§` and the tool counts
`len(ENTRY_DELIMITER.join(entries))` — **characters, not tokens**,
deliberately, so the budget does not move when the model changes.

The limits come from `~/.hermes/config.yaml`:

    memory:
      memory_char_limit: 6000
      user_char_limit: 3500

Raised on 2026-11-05 from the built-in defaults of 2,200 / 1,375
(`hermes_cli/config.py:2319` and the `MemoryStore.__init__`
signature).

On `add`, the tool computes what the total *would* be and refuses:

    if new_total > limit:
        return {"error": f"Memory at {current:,}/{limit:,} chars. ..."}

## The current numbers, measured the tool's way

Reproduced by importing the tool's own `ENTRY_DELIMITER` and counting:

    MEMORY: 12 entries, 5,387 / 6,000 chars  ->  89.8%   613 headroom
    USER:    7 entries, 1,292 / 3,500 chars  ->  36.9%  2,208 headroom

## So is it "full"?

**No — not any more.** It *was*: at the old 2,200 / 1,375 limits the
store sat at 2,093-2,195 chars (95-99%), which is why the message
kept appearing. Raising the limits on 2026-11-05 cleared it.

The message reappears when a **single proposed entry** would push the
total past the limit — not when the store is empty of space in
general. With 613 characters of headroom, an entry longer than that
is refused. That is the real constraint now: entries have to be
short, and MEMORY.md is the store under pressure (89.8%), not
USER.md (36.9%).

## Why the distinction matters

Hindsight is a *separate* system with a *separate* store (3,252 nodes
in the `gustale` bank) and a *separate* budget. It has its own
failure mode — right now, writes fail with a 401 — and the two never
interact. A "Memory is full" message says nothing about Hindsight, and
a Hindsight write failure says nothing about the character budget.
