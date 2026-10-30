#!/usr/bin/env python3
"""Rewrite the Pool A descriptions in the site's own voice.

WHAT THIS DOES

Pool A imported 1,354 dishes from Wikidata. Their descriptions were
the Wikipedia lead verbatim — 1,322 of 1,354 were EXACT copies — and
the publication policy (RULES.md, the Pool A gates) requires a
description that is the SITE'S OWN wording about the dish.

So this writes a new description for each dish, from the facts that
dish's cited source actually contains, in the house voice, and holds
the result against the same 0.45 similarity gate that
`check_description_similarity.py` applies.

WHY THE MODEL IS THE RIGHT TOOL, AND WHERE ITS LIMITS ARE

The facts are fixed: each dish has exactly ONE statement ("Originated
in") and exactly ONE citation, whose excerpt IS the Wikipedia lead.
There is no other evidence for these dishes. So a description can only
ever say what that lead says — it cannot be researched into anything
richer.

What the model CAN do is restate those facts in different words and
in the house voice, without importing facts from its own memory. A
model with encyclopedic knowledge of "Abacha" will happily add details
that are not in the cited excerpt. That is the failure mode this
script is built to prevent: the model is told to use ONLY the supplied
facts, and the output is checked for the length, the shape, and the
similarity to the source.

THE GATE

The same measure as `check_description_similarity.py`: the content
n-gram (n >= 3) overlap between our description and the source lead,
with a threshold of 0.45. The overlap function is IMPORTED from that
script rather than re-implemented, so the two cannot disagree about
what the gate means.

A dish whose new description scores at or above the threshold is NOT
written. It is reported as a failure and left for a human.

THE INSISTENT CASES

A dish whose cited source supports only a sentence or two — "Bouyiourdi
is a Greek meze" — cannot honestly carry a full description. Padding
it out would mean inventing the kind of detail the lead does not
contain. The model is told to return the single token INSUFFICIENT
in that case, and the dish is reported separately as "the sources do
not support a full description" rather than being quietly padded.

WHAT IT WRITES

Nothing, by itself. It writes a JSON file of proposals
(`data/pool_a_descriptions.json`) and a report. The DB is updated
only by an explicit apply step, so a bad run never touches the live
data.

Usage:
    python3 scripts/rewrite_pool_a_descriptions.py --batch 1 --limit 100
    python3 scripts/rewrite_pool_a_descriptions.py --batch 1 --report
    python3 scripts/rewrite_pool_a_descriptions.py --apply batch 1
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LEADS_FILE = REPO / "data" / "pool_a_leads.json"
PROPOSALS_FILE = REPO / "data" / "pool_a_descriptions.json"

# The gate. Imported from the checker so the two agree by construction.
sys.path.insert(0, str(REPO / "scripts"))
from check_description_similarity import THRESHOLD, overlap  # noqa: E402

MODEL = "MiniMax-M3.1-Flash"
API_URL = "https://api.minimax.io/anthropic/v1/messages"
ENV_FILE = "/home/gustale/.hermes/.env"

BATCH_SIZE = 100

# The token the model returns when the sources cannot support a full
# description. It is a single word, chosen so it cannot be confused
# with prose.
INSUFFICIENT = "INSUFFICIENT"


# ── The house voice ─────────────────────────────────────────────
#
# These are the actual openings of the 121 published descriptions —
# the ones a reader already sees. The model is given the PATTERN, not
# a list of sentences to copy, because copying them would fail the
# similarity gate against the source in the same way.
VOICE_EXAMPLES = [
    "A Levantine dip of fire-roasted eggplant blended with tahini, lemon juice, garlic, and olive oil, often finished with parsley or pomegranate seeds.",
    "A French beef stew braised in red wine (traditionally Burgundy) with beef broth, bacon, onions, mushrooms, and a bouquet garni.",
    "Indonesian meatballs made from beef, chicken, or fish, served in a clear noodle soup with greens, tofu, fried shallots, and chili sauce.",
    "A Vietnamese sandwich of a short baguette with grilled pork, pâté, pickled vegetables, fresh herbs, and chili. A legacy of French colonial rule.",
    "A griddled or baked cornmeal cake from northern South America, split and filled or topped with cheese, meat, beans, avocado, or eggs.",
]

SYSTEM_PROMPT = """\
You write one short encyclopedia entry about a dish, in the house voice of \
an encyclopedia that writes its own prose rather than borrowing it.

You will be given the FACTS that one cited source contains about the dish, \
and the classification the encyclopedia has already assigned (family, \
cuisine, country). Write a description using ONLY those facts.

ABSOLUTE RULES

1. Use ONLY the facts given. Do not add a single fact from your own \
knowledge of the dish, even if you are certain of it. If the facts do not \
mention the ingredients, the description does not name ingredients. If the \
facts do not say when it is served, the description does not say when it is \
served. Every claim you make must be traceable to the supplied facts.

2. Write it in your OWN words. Do not reuse the source's phrasing, its \
sentence order, or its clause structure. Do not start your answer with the \
dish's name followed by "is a" if the facts do not begin that way. Do not \
use the words "originating from", "originating in", "is a type of food \
originating", or "is a traditional X dish originating" — the house voice \
names the place and the people directly instead.

3. Do not mention the source, Wikipedia, or that anything "was found" or \
"is documented". The description stands alone.

4. Do not pad. Do not add adjectives, sensory detail, history, cultural \
commentary, nutritional claims, serving suggestions, or comparison with \
other dishes unless the facts supply them. But equally, do not write a \
one-line stub: "A food of the Igbos in Nigeria." says nothing a reader \
did not already get from the title. A good entry names the dish's \
character, its place, and what it is made of or how it is cooked, in \
100 to 220 characters.

5. If the facts support only a short phrase — for example the facts say \
only "a Greek meze" — do NOT expand it into a full entry. Inventing \
details would be worse than a short entry. In that case reply with the \
single word INSUFFICIENT and nothing else.

THE HOUSE VOICE

- One to three sentences, normally under 220 characters.
- Concrete: name the ingredients, the technique and the place the facts \
give you, plainly and without ceremony.
- Read like the entries below, which are the published ones. They are a \
guide to register and density, NOT sentences to imitate or reuse.

{examples}

- Lead with what the dish IS and where it belongs, then give the \
ingredients or the method if the facts supply them.
- "A Nigerian dish of ..." / "A French beef stew ..." / "Indonesian \
meatballs made from ..." — a description, not a crossword clue.

OUTPUT

Reply with ONLY the description text. No preamble, no quotes, no \
explanation, no notes, no markdown, no bullet points. If the facts are \
insufficient, reply with only INSUFFICIENT."""


def load_token() -> str:
    """The MiniMax OAuth token. A missing token is a hard error.

    The script will not fall back to another provider: that would
    spend the user's own credit on work they did not ask for.
    """
    if not os.path.exists(ENV_FILE):
        raise SystemExit(f"the token file {ENV_FILE} does not exist")
    with open(ENV_FILE) as fh:
        for line in fh:
            if line.startswith("MINIMAX_OAUTH_MAX_TOKEN="):
                token = line.split("=", 1)[1].strip().strip('"').strip("'")
                if token:
                    return token
    raise SystemExit("MINIMAX_OAUTH_MAX_TOKEN is not in the env file")


def db_rows(sql: str) -> list[dict]:
    """The rows of a query, as dicts.

    The query is WRAPPED in a json_agg, so every caller passes a plain
    SELECT and gets structured rows back. psql wraps a long value
    across several lines, so the JSON does not arrive as one line —
    the whole output is scanned for the first JSON array instead.
    """
    out = subprocess.run(
        ["bash", str(REPO / "scripts" / "dbq.sh"),
         "select coalesce(json_agg(row_to_json(t)), '[]'::json) from ("
         + sql + ") t"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    text = out.strip()
    start = text.find("[{")
    if start == -1:
        return []
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    return []


def fetch_batch(batch: int, limit: int) -> list[dict]:
    """The dishes of one batch, with everything the prompt needs.

    The batch is a stable slice of the drafts ordered by slug, so
    batch 1 is always the same 100 dishes and a re-run resumes
    cleanly.

    THE FACTS COME FROM THE FULL SOURCE TEXT, NOT THE EXCERPT.

    The citation's `excerpt` holds only the FIRST SENTENCE of the
    source — that is what the attribution line quotes. But the source
    itself is the whole Wikipedia lead, and the rest of it is where
    the ingredients live: "Achu soup is a yellow soup that is a
    traditional food in Cameroon. It is made with cocoyam, spices,
    water, palm oil, limestone, and fish." The excerpt alone stops at
    "Cameroon" and leaves nothing but the name and the country, which
    is not enough for a description — and asking the model to expand
    it would mean inventing the ingredients.

    So the facts are the full lead, which is the cached fetch of the
    very URL the citation points at. The excerpt is kept as well, for
    the report.

    THE BATCH MEMBERSHIP IS FROZEN IN THE DATABASE.

    The batch is selected by `dishes.pool_a_batch`, a column assigned
    once by slug order (migration 0015) and never changed. It is not
    an offset.

    The earlier version of this sliced with `order by slug offset N
    limit 100`, first over the drafts and then over the whole Pool A
    set. Both were wrong in the same way: they made the membership a
    function of the CURRENT contents of the table, so publishing a
    batch or importing a new dish moved the boundary. Measured
    against the live database after batch 1 shipped, the drafts-only
    slice overlapped batch 2's intended dishes by ZERO.

    With the column, batch N is exactly the N dishes the column says,
    forever. A dish already published simply drops out of its batch
    (it is filtered out below), and the batch gets a little smaller;
    the other batches are untouched. A new import is assigned the
    next free batch number, or NULL until it is, and never disturbs
    an existing one.
    """
    return db_rows(
        f"""
        select d.id::text                       as id,
               d.slug                           as slug,
               d.canonical_name                 as name,
               d.short_description              as current,
               coalesce(c.excerpt, '')          as excerpt,
               coalesce(s.title, '')            as source_title,
               coalesce(s.url, '')              as source_url,
               (select string_agg(distinct v.name, ', ')
                  from dish_dish_families df
                  join dish_families v on v.id = df.value_id
                 where df.dish_id = d.id)        as family,
               (select string_agg(distinct v.name, ', ')
                  from dish_dish_cuisines dc
                  join dish_cuisines v on v.id = dc.value_id
                 where dc.dish_id = d.id)        as cuisine,
               (select string_agg(distinct g.name, ', ')
                  from geo_entities g
                 where g.id = d.origin_geo_id)          as places
          from dishes d
          left join statements st
                 on st.subject_type = 'dish' and st.subject_id = d.id
          left join claim_citations c on c.statement_id = st.id
          left join sources s on s.id = c.source_id
         where d.created_by = 'wikidata-derived'
           and d.pool_a_batch = {batch}
           and d.status = 'draft'
         order by d.slug
        """
    )


def call_model(
    token: str, prompt: str, max_tokens: int = 4000, attempts: int = 2
) -> str:
    """One call to MiniMax. Returns the text, or "" if there was none.

    The token budget has to be generous, because the model spends part
    of it THINKING before it writes. At 700 tokens the thinking block
    regularly ate the whole allowance and the answer was never
    produced — the response came back with a `thinking` block and no
    `text` block at all. The answer is short (under 220 characters),
    but the reasoning in front of it is not.

    A thinking-only response is retried with a bigger budget. The
    repair step depends on this: a repair that came back empty was
    read as "there is no better description", and the dish was
    reported as a plain failure when a second try would have passed
    it. (bici-bici and big-red-gum were lost this way in batch 2.)
    """
    budget = max_tokens
    for attempt in range(attempts):
        body = json.dumps(
            {
                "model": MODEL,
                "max_tokens": budget,
                "system": SYSTEM_PROMPT.format(
                    examples="\n".join(f"- {e}" for e in VOICE_EXAMPLES)
                ),
                "messages": [{"role": "user", "content": prompt}],
            }
        ).encode()
        request = urllib.request.Request(
            API_URL,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
                "anthropic-version": "2023-06-01",
            },
        )
        with urllib.request.urlopen(request, timeout=240) as response:
            payload = json.loads(response.read())

        # The response may carry a `thinking` block before the answer;
        # the answer is the last `text` block. A thinking-only response
        # has no text at all — the answer was never produced — and the
        # retry ladder asks again with a bigger budget.
        content = payload.get("content") or []
        text = "\n".join(
            block.get("text", "")
            for block in content
            if block.get("type") == "text"
        ).strip()
        if text:
            return text
        stop = payload.get("stop_reason", "?")
        kinds = [b.get("type") for b in content]
        if attempt + 1 < attempts:
            budget = budget * 3
            print(
                f"    (no text block: stop_reason={stop}, blocks={kinds}) "
                f"— retrying with {budget} tokens",
                file=sys.stderr,
            )
        else:
            print(
                f"    (no text block: stop_reason={stop}, blocks={kinds})",
                file=sys.stderr,
            )
    return ""


def build_prompt(dish: dict) -> str:
    """The user message: the facts, and nothing else.

    The facts are the FULL cited source — the cached fetch of the URL
    the citation points at — not the one-sentence excerpt. The lead is
    what the source actually said, so everything the description may
    claim is traceable to it.
    """
    facts = (dish.get("source_text") or "").strip()
    if not facts:
        facts = (dish.get("excerpt") or "").strip()
    if not facts:
        facts = "(the cited source carries no text)"

    classification = []
    if dish.get("cuisine"):
        classification.append(f"cuisine: {dish['cuisine']}")
    if dish.get("family"):
        classification.append(f"family: {dish['family']}")
    if dish.get("places"):
        classification.append(f"place: {dish['places']}")

    return (
        f"Dish name: {dish['name']}\n"
        f"The encyclopedia's classification: "
        f"{'; '.join(classification) if classification else 'none'}\n"
        f"\n"
        f"FACTS from the cited source ({dish.get('source_title') or 'Wikipedia'}):\n"
        f"{facts}\n"
        f"\n"
        f"Write the description now, using only those facts."
    )


def clean(text: str) -> str:
    """Strip the wrappers a model may still put around the answer."""
    text = text.strip()
    # A quoted answer.
    if len(text) > 1 and text[0] in "\"'“" and text[-1] in "\"'”":
        text = text[1:-1].strip()
    # A leading label, e.g. "Description: ...".
    text = re.sub(r"^(description|answer|entry)\s*:\s*", "", text, flags=re.I)
    return text.strip()


def check(text: str, lead: str) -> tuple[bool, float, float, str | None]:
    """(passed, content overlap, function overlap, reason).

    The reason is None when the description passed every check.
    """
    if not text.strip():
        return False, 1.0, 1.0, "the description is empty"

    # The LENGTH FLOOR.
    #
    # The shortest description on the published site is 113 characters
    # (Poutine). A description below 100 characters cannot say what the
    # dish is AND where it belongs AND what it is made of — it can
    # only restate the name. The real risk is not that such a
    # description is wrong; it is that it is EMPTY, and an empty
    # description published next to a "unevidenced" badge tells the
    # reader nothing at all.
    #
    # The gate below does not catch this on its own: "A food of the
    # Igbos in Nigeria." is a perfect reword of its one-sentence
    # source, at 0.000 content overlap. It passes the similarity gate
    # and fails the job.
    #
    # A description this short is not a FAILED description — it is an
    # INSUFFICIENT source. Every dish measured at under 130 characters
    # of source text lands here, and no honest rewrite of a 58-
    # character source ("Aluek trei ngeat is a Cambodian dried fish
    # and watermelon salad.") reaches 100 characters without the
    # writer inventing something. The caller distinguishes the two.
    if len(text) < 100:
        return False, 0.0, 0.0, (
            f"the description is too thin to be worth publishing "
            f"({len(text)} characters, the floor is 100)"
        )

    if len(text) > 600:
        return False, 0.0, 0.0, f"the description is too long ({len(text)} characters)"

    content, function = overlap(text, lead)
    if content >= THRESHOLD:
        return False, content, function, (
            f"the description is too close to the source ({content:.3f} >= {THRESHOLD})"
        )
    return True, content, function, None


# ── The grounding check ────────────────────────────────────────
#
# The similarity gate catches COPYING. It does not catch INVENTING.
#
# A model asked to write about "Abacha" knows what abacha is. If it
# draws on that knowledge rather than on the supplied facts, the
# description carries ingredients and history that the cited source
# never said — and the citation on the page then points at a source
# that does not support the text beside it. That is worse than a
# copied description, because a copy at least matches its attribution.
#
# So a second, separate call is made with a different job: not
# "write this" but "is every claim in this description supported by
# the facts above". The two calls do not share context, so the
# checker cannot be primed by the writing task.
GROUND_SYSTEM_PROMPT = """\
You check whether a short encyclopedia description is supported by a set \
of facts. You are a fact-checker, not a writer.

You are given FACTS and a DRAFT DESCRIPTION.

For each concrete claim in the draft — every ingredient, every technique, \
every place, every date, every claim about who made it or what it is \
made of — decide whether the FACTS support it.

THE DISH'S OWN NAME IS NOT A CLAIM.

The draft is an entry FOR a particular dish, so it names that dish. The \
name is the SUBJECT of the entry, not something the entry asserts about \
the dish, and it is not judged against the facts. A draft that says "Bai \
ye is a soybean food" is not making a claim that the facts must support \
by the name "Bai ye" — it is saying that whatever this dish is, it is a \
soybean food. Judge the description on everything else it says.

This matters because a dish's article may not use the dish's own name at \
all. "Bai ye" redirects to the article "Tofu skin", whose text never says \
"bai ye" — and a fact-checker that treats the name as a claim will \
reject every honest description of it, including one that says nothing \
but what the facts say. A source that does not name the dish is a problem \
with the CITATION, and the right response to it is not to reject the \
wording but to notice it; that is why the name is out of scope here.

A claim IS supported if the facts state it, or if it follows directly \
from what the facts state (a synonym, a more general wording of the \
same thing, or a straightforward restatement).

A claim is NOT supported if the facts are silent about it and it comes \
from the author's own knowledge of the dish. A dish's real ingredients \
being true in the world is not the question. The question is whether \
THESE FACTS support it.

Answer with exactly one word:
- SUPPORTED  — every claim is supported by the facts.
- UNSUPPORTED — at least one claim is not supported.

Output only that one word."""


def source_facts(lead: str) -> str:
    """The facts, as plain prose the fact-checker can read.

    The cached lead carries structural markers when the article's
    lead was too short and the body was appended:

        Bici bici or bicibici muhallebisi is a Turkish dessert.

        ── full article ──
        Bici bici is a very light dessert, typical of southern Turkey...

    The fact-checker stops reading at the marker, so everything after
    it — which is where the substance is — was invisible to it. A
    description that said "typical of southern Turkey" was rejected
    even when that was the source's own wording, because the
    sentence carrying it sat after the marker.

    The markers are stripped and the sections are joined, so the
    checker sees one continuous piece of source text. The section
    headings the article itself carries ("== Description ==") are
    stripped too, for the same reason.
    """
    if not lead:
        return ""
    text = lead
    for marker in ("── full article ──", "== Description ==", "== See also =="):
        text = text.replace(marker, "\n")
    # Collapse the blank lines the markers leave behind.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def check_grounding(token: str, description: str, facts: str) -> tuple[bool, str]:
    """Is every claim in the description supported by the facts?

    Returns (supported, raw_answer).
    """
    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": 3000,
            "system": GROUND_SYSTEM_PROMPT,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"FACTS:\n{facts}\n\n"
                        f"DRAFT DESCRIPTION:\n{description}\n\n"
                        f"Is every claim in the draft supported by the facts?"
                    ),
                }
            ],
        }
    ).encode()
    request = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        payload = json.loads(response.read())

    content = payload.get("content") or []
    text = "\n".join(
        block.get("text", "") for block in content if block.get("type") == "text"
    ).strip()
    answer = text.upper()
    # A thinking-only response gives no verdict. That is NOT a pass:
    # an unverified description must not be published.
    if "UNSUPPORTED" in answer:
        return False, text
    if "SUPPORTED" in answer:
        return True, text
    return False, text


def repair(token: str, dish: dict, previous: str, problem: str) -> str:
    """One more attempt, with the specific problem named.

    The first attempt failed for a known reason — it was too close to
    the source, too thin, or it asserted something the source does not
    say. The retry is told WHICH of those it was, so it does not
    repeat the same mistake, and it is given the previous attempt so it
    can fix that one rather than start again from nothing.
    """
    lead = dish.get("source_text") or ""
    body = (
        f"Dish name: {dish['name']}\n"
        f"\n"
        f"FACTS from the cited source ({dish.get('source_title') or 'Wikipedia'}):\n"
        f"{lead}\n"
        f"\n"
        f"A previous attempt was rejected:\n"
        f"  attempt: {previous}\n"
        f"  problem: {problem}\n"
        f"\n"
        f"Write a NEW description that fixes that problem. Same rules as "
        f"before: only the facts above, your own words, no mention of the "
        f"source, 100 to 220 characters, one to three sentences."
    )
    return call_model(token, body, max_tokens=4000)


def run_batch(batch: int, limit: int, resume: bool) -> list[dict]:
    """Generate the proposals for one batch."""
    token = load_token()
    leads = json.loads(LEADS_FILE.read_text())
    dishes = fetch_batch(batch, limit)
    if not dishes:
        raise SystemExit(f"batch {batch} is empty")

    existing: dict[str, dict] = {}
    if PROPOSALS_FILE.exists() and resume:
        existing = {p["slug"]: p for p in json.loads(PROPOSALS_FILE.read_text())}

    print(f"[rewrite] batch {batch}: {len(dishes)} dishes")
    results: list[dict] = []

    for index, dish in enumerate(dishes, start=1):
        slug = dish["slug"]
        lead = leads.get(slug) or ""
        # The facts are the full cited source. The lead cache is the
        # fetch of the very URL the citation points at, so this is the
        # source's own text and not a paraphrase of it.
        dish["source_text"] = lead

        if slug in existing and existing[slug].get("status") in (
            "pass",
            "insufficient",
        ):
            results.append(existing[slug])
            print(f"  [{index}/{len(dishes)}] {slug}: cached")
            continue

        text = ""
        error = None
        for attempt in range(3):
            try:
                # The budget grows on each retry: a thinking-only
                # response means the reasoning ate the allowance, and
                # the answer was never written.
                text = call_model(
                    token, build_prompt(dish), max_tokens=4000 * (attempt + 1)
                )
                if text:
                    break
                error = "the model returned no text"
            except urllib.error.HTTPError as exc:
                error = f"HTTP {exc.code}"
                if exc.code == 429:
                    time.sleep(5 * (attempt + 1))
                    continue
                break
            except Exception as exc:  # noqa: BLE001
                error = str(exc)[:200]
                time.sleep(2 * (attempt + 1))

        record: dict = {
            "slug": slug,
            "name": dish["name"],
            "batch": batch,
            "old": dish.get("current") or "",
            "source": lead,
        }

        if not text:
            record.update(status="error", error=error or "no output")
            results.append(record)
            print(f"  [{index}/{len(dishes)}] {slug}: ERROR {error}")
            continue

        text = clean(text)

        if text.upper().startswith(INSUFFICIENT):
            record.update(
                status="insufficient",
                reason="the cited source does not support a full description",
                new=None,
                content=None,
                function=None,
            )
            results.append(record)
            print(f"  [{index}/{len(dishes)}] {slug}: INSUFFICIENT")
            continue

        # ── Evaluate, and if it failed, try once more ─────────────
        #
        # The two checks are cheap next to a wrong publish, so the
        # flow is: write, check, and on failure write AGAIN with the
        # specific problem named. One repair attempt. A dish that
        # still fails after that is reported, not forced through.
        attempts = [(text, None)]
        attempt_log: list[tuple] = []
        final_text = text
        final_status = "fail"
        final_reason = None
        final_content = 0.0
        final_function = 0.0
        grounded = None

        for attempt_index in range(2):
            candidate = attempts[-1][0]
            passed, content, function, reason = check(candidate, lead)
            attempt_log.append((candidate, content, function, reason))

            if passed:
                try:
                    grounded, verdict = check_grounding(
                        token, candidate, source_facts(lead)
                    )
                except Exception as exc:  # noqa: BLE001
                    grounded, verdict = False, f"the grounding check failed: {exc}"[:200]
                if grounded:
                    final_text = candidate
                    final_status = "pass"
                    final_reason = None
                    final_content = content
                    final_function = function
                    break
                reason = (
                    f"a claim is not supported by the cited source "
                    f"(the grounding check said {verdict.strip()[:60]})"
                )
            elif reason is None:
                reason = "the description did not pass the checks"

            final_text = candidate
            final_reason = reason
            final_content = content
            final_function = function
            final_status = "fail"

            if attempt_index == 0:
                # One repair attempt, told what went wrong.
                try:
                    repaired = clean(repair(token, dish, candidate, reason))
                except Exception as exc:  # noqa: BLE001
                    repaired = ""
                if not repaired:
                    break
                if repaired.upper().startswith(INSUFFICIENT):
                    # The model's own verdict, on the retry, is that
                    # the source cannot support a full description.
                    #
                    # That verdict was being DISCARDED: the loop
                    # broke out and kept the original text and the
                    # original reason, so a dish whose source is
                    # genuinely too thin was reported as a plain
                    # failure — "too thin to be worth publishing" —
                    # rather than as the insufficient source it is.
                    # The two are different answers and the
                    # distinction is the whole point of the flag: a
                    # failed description is a writer's problem, an
                    # insufficient source is a source's problem, and
                    # only the first one is worth retrying.
                    final_status = "insufficient"
                    final_reason = (
                        "the cited source does not support a full description"
                    )
                    final_text = ""
                    final_content = 0.0
                    final_function = 0.0
                    grounded = False
                    break
                attempts.append((repaired, None))

        record.update(
            status=final_status,
            reason=final_reason,
            new=final_text,
            content=final_content,
            function=final_function,
            # The attempts are kept so a failure can be diagnosed after
            # the fact: what was tried, and what each try scored.
            attempts=[
                {
                    "text": a_text[:400],
                    "content": a_content,
                    "function": a_function,
                    "reason": a_reason,
                }
                for a_text, a_content, a_function, a_reason in attempt_log
            ],
        )
        if grounded is not None:
            record["grounded"] = grounded

        results.append(record)
        mark = "PASS" if final_status == "pass" else "FAIL"
        print(
            f"  [{index}/{len(dishes)}] {slug}: {mark} "
            f"(content {final_content:.3f}, function {final_function:.3f})"
        )

    # Merge with any other batches already on file.
    merged = {p["slug"]: p for p in json.loads(PROPOSALS_FILE.read_text())} if PROPOSALS_FILE.exists() else {}
    for record in results:
        merged[record["slug"]] = record
    PROPOSALS_FILE.write_text(
        json.dumps(list(merged.values()), ensure_ascii=False, indent=1)
    )
    return results


def report(results: list[dict]) -> None:
    """The per-batch report the user asked for."""
    passed = [r for r in results if r["status"] == "pass"]
    failed = [r for r in results if r["status"] == "fail"]
    insufficient = [r for r in results if r["status"] == "insufficient"]
    errored = [r for r in results if r["status"] == "error"]

    # A description that is too THIN is not a failed rewrite — it is a
    # source that cannot support a full description. The two are
    # reported apart, because the remedy is different: a thin
    # description needs a better source, a failed one needs a better
    # rewrite.
    thin = []
    for r in failed:
        if "too thin" in (r.get("reason") or ""):
            thin.append(r)
    failed = [r for r in failed if "too thin" not in (r.get("reason") or "")]

    print()
    print("=" * 70)
    print(f"BATCH REPORT — {len(results)} dishes")
    print(f"  pass                {len(passed)}")
    print(f"  fail                {len(failed)}")
    print(f"  insufficient        {len(insufficient)}")
    print(f"  insufficient (thin) {len(thin)}")
    print(f"  error               {len(errored)}")
    print("=" * 70)

    if failed:
        print("\nFAILED:")
        for r in failed:
            print(f"  {r['slug']}: {r['reason']}")

    if thin:
        print("\nINSUFFICIENT — the source cannot support a full description:")
        for r in thin:
            print(f"  {r['slug']}: {r['reason']}")

    if insufficient:
        print("\nINSUFFICIENT — the model said the source is too thin:")
        for r in insufficient:
            print(f"  {r['slug']}: {r['reason']}")

    if errored:
        print("\nERRORED:")
        for r in errored:
            print(f"  {r['slug']}: {r.get('error')}")

    if passed:
        cs = sorted(r["content"] for r in passed)
        print(
            f"\nTHE PASSING {len(passed)}: content overlap "
            f"min {cs[0]:.3f}, median {cs[len(cs)//2]:.3f}, max {cs[-1]:.3f} "
            f"(the gate needs < {THRESHOLD})"
        )
        print("  all of them passed the grounding check too")

    print("\nTHREE BEFORE/AFTER PAIRS:")
    for r in passed[:3]:
        print(f"\n  --- {r['name']} ({r['slug']}) ---")
        print(f"  BEFORE: {r['old'][:400]}")
        print(f"  AFTER:  {r['new']}")
        print(f"  gate:   content {r['content']:.3f} (needs < {THRESHOLD}), "
              f"function {r['function']:.3f}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=int, required=True)
    parser.add_argument("--limit", type=int, default=BATCH_SIZE)
    parser.add_argument("--report", action="store_true",
                        help="report on an existing run without calling the model")
    parser.add_argument("--no-resume", action="store_true",
                        help="ignore cached proposals for this batch")
    args = parser.parse_args()

    if args.report:
        records = json.loads(PROPOSALS_FILE.read_text())
        results = [r for r in records if r.get("batch") == args.batch]
        if not results:
            raise SystemExit(f"no proposals on file for batch {args.batch}")
        report(results)
        return 0

    results = run_batch(args.batch, args.limit, not args.no_resume)
    report(results)

    # The exit code says whether the batch is publishable: only a
    # batch with no failures and no errors is.
    failed = [r for r in results if r["status"] in ("fail", "error")]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
