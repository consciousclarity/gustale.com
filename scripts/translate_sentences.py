#!/usr/bin/env python3
"""Translate the description sentences — ADR-003 layer 3b.

WHAT THIS DOES

For each English description sentence, and for each target locale, it
produces a translation, and writes it to
`description_sentence_translations` with:

  - the hash of the ENGLISH SOURCE SENTENCE (so a change to the
    source invalidates exactly this translation, and only this one);
  - `status = 'machine'` (it has not been reviewed by a human);
  - `is_stale = false` (it matches its source right now).

The English source is canonical, and the claim anchors stay on it: the
translation REFERENCES the source sentence (source_sentence_id), it
does not copy the anchors.

WHY MINIMAX OAUTH

The translation runs on MiniMax through the Hermes OAuth token, which
is covered by the existing subscription. It does NOT use the prepaid
PAYG credential, which is exhausted (HTTP 402), and it does not spend
the user's OpenAI or DeepSeek credit on 2,600 translations.

THE OUTPUT IS MACHINE TRANSLATED, and the schema says so: the status
is 'machine', not 'reviewed'. The UI badges it. A human correcting it
goes through the moderation path, which promotes it to 'reviewed'.

Usage:
    python3 scripts/translate_sentences.py --locale es          # one locale
    python3 scripts/translate_sentences.py --all                 # every locale
    python3 scripts/translate_sentences.py --locale es --limit 5 # a sample
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

# A CITATION LINE — "[Source: Wikipedia — Aloo gobhi, accessed ...]".
#
# These are METADATA, not prose. They name a source, a title and a
# date, and they are the same in every language: the source is the
# English Wikipedia article whatever locale the reader is in.
#
# Translating them produces a shorter, mangled version — "Fuente:
# Wikipedia — Aloo gobhi..." — which then trips the output check, and
# which is wrong anyway: the citation points at the English source.
#
# So they are SKIPPED, not translated. The English citation is shown
# in every locale, and that is correct.
CITATION_PREFIX = "[Source:"


# The nine non-English core locales.
LOCALES = ["es", "de", "fr", "pt", "id", "zh", "ja", "ar", "hi"]

# The English locale name of each target, for the prompt. The model
# understands the code, but the name makes it unambiguous.
LOCALE_NAMES = {
    "es": "Spanish (español)",
    "de": "German (Deutsch)",
    "fr": "French (français)",
    "pt": "Portuguese (português)",
    "id": "Indonesian (Bahasa Indonesia)",
    "zh": "Simplified Chinese (简体中文)",
    "ja": "Japanese (日本語)",
    "ar": "Arabic (العربية)",
    "hi": "Hindi (हिन्दी)",
}

MODEL = "MiniMax-M3.1-Flash"
API_URL = "https://api.minimax.io/anthropic/v1/messages"

ENV_FILE = "/home/gustale/.hermes/.env"

SYSTEM_PROMPT = """\
You translate one sentence about a dish from English into {language}.

Rules:
- Output ONLY the translated sentence. No quotes, no explanation, no \
notes, no original text, no repetition of these rules.
- Translate the MEANING, not word for word. Write it as a native \
speaker of {language} would write it about a dish.
- Keep the sentence as ONE sentence. Do not split it into two, and do \
not merge it with another.
- Keep proper nouns as they are written in the target language's \
convention. If a dish name has a well-known form in {language}, use \
that; otherwise keep the original spelling.
- Do not add information that is not in the sentence. Do not remove \
information that is in it.
- If a term has no good equivalent, keep the English word.
"""


def load_token() -> str:
    """The MiniMax OAuth token, refreshed into the env file.

    The session-guard plugin refreshes it; this reads the current
    value. A missing token is a hard error — the script will not fall
    back to a different provider, because that would spend the user's
    prepaid credit without them asking.
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


def translate(token: str, sentence: str, locale: str) -> str:
    """Translate one sentence. Returns the translation, or raises.

    The token budget has to cover the model's REASONING as well as
    the answer. The reasoning comes back as a `thinking` block, and
    when it takes the whole allowance the call returns no text at
    all, with `stop_reason: max_tokens`.

    So the budget is generous, and a call that comes back empty is
    RETRIED with a larger one. Retrying is safe: the call is
    idempotent and a failed call wrote nothing.
    """
    language = LOCALE_NAMES[locale]
    last_error = ""

    for attempt, budget in enumerate((4000, 8000, 16000), start=1):
        translated = _translate_once(token, sentence, language, budget)
        if translated:
            return translated
        last_error = "the model returned no text"
        print(f"    (retrying with {budget} tokens, attempt {attempt})")

    raise RuntimeError(last_error)


def _translate_once(
    token: str, sentence: str, language: str, max_tokens: int
) -> str:
    """One translation call. Returns the text, or "" if there was none."""
    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": max_tokens,
            "system": SYSTEM_PROMPT.format(language=language),
            "messages": [{"role": "user", "content": sentence}],
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
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = json.loads(response.read())

    # The response may carry a `thinking` block before the answer.
    # The translation is the LAST `text` block.
    text_parts = [
        block.get("text", "")
        for block in payload.get("content", [])
        if block.get("type") == "text"
    ]
    return "\n".join(text_parts).strip()


# ── The output check ────────────────────────────────────────────────────
#
# The model occasionally emits an artefact: a stray instruction word
# ("simplementeDesigna"), a leaked prefix, or an empty translation.
# Those are caught here rather than written, because a bad translation
# with a valid source hash looks perfectly correct to the database.
#
# The check is deliberately narrow. It rejects only what is
# unambiguously broken, and it never rewrites the text — a rewrite
# would be a silent editorial decision.
#
#   | check                        | why
#   |------------------------------|------------------------------------
#   | empty                        | nothing to show
#   | starts with the source       | the model echoed the input
#   | no sentence-ending mark      | it is a fragment
#   | a word glued to the next one | "simplementeDesigna"
#   | the instruction words        | the model copied the prompt
#
INSTRUCTION_WORDS = {
    "translate", "translation", "output", "only", "sentence",
    "keep", "rules", "note", "notes", "english", "original",
}


def check_translation(source: str, translated: str, locale: str) -> str | None:
    """Return a reason string if the translation is broken, else None."""
    if not translated or not translated.strip():
        return "the translation is empty"

    stripped = translated.strip()

    # It echoed the source.
    if stripped == source.strip():
        return "the translation is the source text"

    # It starts with the source — a partial echo.
    src_words = source.strip().split()
    if len(src_words) > 8 and stripped.startswith(" ".join(src_words[:8])):
        return "the translation starts with the source text"

    # A FRAGMENT: the translation was cut off mid-sentence.
    #
    # The tell is not the missing sentence-ending mark on its own —
    # a translated sentence sometimes legitimately ends without one.
    # The tell is that it ends mid-PHRASE: the last few words are not
    # a complete clause, which shows up as a very short tail after
    # the last comma, or as the text stopping at a conjunction.
    #
    # The reliable signal is the LENGTH RATIO: a translation that is
    # dramatically shorter than its source was truncated.
    # The measured length ratios for the real sentences are 0.97 to
    # 1.31 — a translation is about the same length as its source.
    # A truncation lands well below 0.6.
    if len(stripped) < 0.6 * len(source.strip()):
        return (
            f"the translation is too short to be complete "
            f"({len(stripped)} chars for a {len(source.strip())}-char source)"
        )

    # A GLUED WORD: a lowercase run immediately followed by an
    # uppercase run, with no space between them. This is the shape of
    # "simplementeDesigna" — the model dropped a space and ran the
    # next word into the previous one.
    #
    # A real word can contain an uppercase letter inside it ("iPhone",
    # "McDonald"), but the glued shape here is: at least three
    # lowercase letters, then an uppercase, then more lowercase, with
    # no space. That does not occur in a normal sentence.
    if re.search(r"[a-zà-öø-ÿ]{3}[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]{2,}", stripped):
        return "the translation has a glued word (missing space)"

    # The instruction words, if they leaked into the output.
    for word in INSTRUCTION_WORDS:
        if re.search(r"\b" + word + r"\b", stripped, re.IGNORECASE):
            # "the translation" is a legitimate word in some contexts,
            # so only flag it when the SOURCE has no such word.
            if not re.search(r"\b" + word + r"\b", source, re.IGNORECASE):
                return f"the translation contains the instruction word {word!r}"

    return None


def source_hash(text: str) -> str:
    """The same hash the database computes: sha256 of the UTF-8 bytes."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def fetch_sentences() -> list[dict]:
    """The English sentences, with their ids."""
    sql = """
    select json_agg(row_to_json(t))
    from (
      select s.id, s.dish_id, s.field, s.position, s.text, d.slug
        from description_sentences s
        join dishes d on d.id = s.dish_id
       where s.locale = 'en'
       order by d.slug, s.field, s.position
    ) t;
    """
    out = subprocess.run(
        ["bash", "scripts/dbq.sh", sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("[{"):
            return json.loads(line)
    raise SystemExit("could not parse the sentences out of dbq.sh")


def write_translation(
    source_sentence_id: str,
    locale: str,
    text: str,
    hash_value: str,
    translator: str,
) -> None:
    """Write one translation, idempotently.

    An existing translation is updated rather than duplicated, and its
    staleness is recomputed from the hash — so a re-run after a source
    edit refreshes the row instead of leaving it stale forever.
    """
    sql = f"""
    INSERT INTO description_sentence_translations
      (source_sentence_id, locale, text, source_hash, status, translator, is_stale)
    VALUES
      ('{source_sentence_id}', '{locale}', $${text}$$, '{hash_value}', 'machine', '{translator}', false)
    ON CONFLICT (source_sentence_id, locale) DO UPDATE
      SET text = EXCLUDED.text,
          source_hash = EXCLUDED.source_hash,
          status = CASE
                     -- A REVIEWED translation is not overwritten by
                     -- the machine: a human's correction wins.
                     --
                     -- The cast is needed: a CASE expression over an
                     -- ENUM column comes out as TEXT, and assigning
                     -- TEXT to an ENUM column is an error.
                     WHEN description_sentence_translations.status = 'reviewed'
                     THEN 'reviewed'::sentence_translation_status
                     ELSE 'machine'::sentence_translation_status
                   END,
          -- the hash now matches the source again, so it is no longer
          -- stale.
          is_stale = false,
          updated_at = now();
    """
    result = subprocess.run(
        [
            "docker",
            "exec",
            "-u",
            "postgres",
            "-i",
            "shared-postgres",
            "psql",
            "-U",
            "postgres",
            "-d",
            "gustale",
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            "-",
        ],
        input=sql,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"the write failed: {result.stderr[-500:]}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", help="one locale, e.g. es")
    parser.add_argument("--all", action="store_true", help="every locale")
    parser.add_argument("--limit", type=int, help="only this many sentences")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.locale:
        locales = [args.locale]
    elif args.all:
        locales = LOCALES
    else:
        parser.error("pass --locale or --all")

    for locale in locales:
        if locale not in LOCALE_NAMES:
            raise SystemExit(f"unknown locale: {locale}")

    token = load_token()
    sentences = fetch_sentences()
    if args.limit:
        sentences = sentences[: args.limit]

    print(f"[translate] {len(sentences)} sentences × {len(locales)} locales")
    if args.dry_run:
        for locale in locales[:1]:
            for row in sentences[:2]:
                out = translate(token, row["text"], locale)
                print(f"  [{locale}] {row['text'][:70]!r}")
                print(f"      -> {out[:70]!r}")
        return 0

    failures = []
    rejected = []
    total = 0
    # The citation lines are not translated. See CITATION_PREFIX.
    translatable = [
        r for r in sentences if not r["text"].lstrip().startswith(CITATION_PREFIX)
    ]
    skipped = len(sentences) - len(translatable)
    print(
        f"[translate] {len(translatable)} sentences to translate; "
        f"{skipped} citation lines skipped"
    )

    for locale in locales:
        for index, row in enumerate(translatable, start=1):
            try:
                translated = translate(token, row["text"], locale)
                problem = check_translation(row["text"], translated, locale)
                if problem:
                    rejected.append((locale, row["slug"], problem))
                    print(f"  REJECTED {locale} {row['slug']}: {problem}")
                    continue
                write_translation(
                    row["id"],
                    locale,
                    translated,
                    source_hash(row["text"]),
                    MODEL,
                )
                total += 1
            except Exception as exc:  # noqa: BLE001
                failures.append((locale, row["slug"], str(exc)[:200]))
                print(f"  FAILED {locale} {row['slug']}: {str(exc)[:160]}")
            if index % 20 == 0:
                print(f"  {locale}: {index}/{len(translatable)}")
            # A small pause, so the API is not hammered.
            time.sleep(0.25)

    print(f"[translate] {total} translations written")
    if rejected:
        print(f"[translate] {len(rejected)} REJECTED by the output check")
    if failures:
        print(f"[translate] {len(failures)} FAILURES")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
