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
    #
    # A THINKING-ONLY RESPONSE: sometimes the model returns ONLY a
    # thinking block and no text block at all — the answer was never
    # produced. `stop_reason` is then usually "max_tokens" (the
    # reasoning ate the allowance) or "end_turn" (the model stopped
    # after thinking). Either way there is no text to take.
    #
    # The fix is NOT to take the thinking text — that is the model's
    # reasoning, not the translation, and writing it would put English
    # or a meta-commentary into the catalogue. The fix is to RETURN
    # EMPTY and let the caller's retry ladder ask again with a bigger
    # budget.
    content = payload.get("content") or []
    text_parts = [
        block.get("text", "")
        for block in content
        if block.get("type") == "text"
    ]
    text = "\n".join(p for p in text_parts if p).strip()

    if not text:
        # Log what happened, so a run that keeps failing is
        # diagnosable rather than mysterious.
        stop = payload.get("stop_reason", "?")
        kinds = [b.get("type") for b in content]
        print(
            f"    (no text block: stop_reason={stop}, blocks={kinds})",
            file=sys.stderr,
        )
        return ""

    return text


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
# THE LENGTH FLOOR IS PER-LOCALE, AND IT HAS TO BE.
#
# A single global floor is wrong, because the ratio is a property of
# the LANGUAGES, not of the model. Measured on the real translations:
#
#   fr, de, es, pt, id   the ratio runs 0.9 – 1.4
#   zh, ja              the ratio runs 0.33 – 0.65
#
# Chinese compresses hard because it carries more meaning per
# character than English does. These are COMPLETE and CORRECT
# translations of English sentences of 148 and 188 characters, at 58
# and 64 Chinese characters — ratios of 0.39 and 0.34:
#
#   菲律宾阿多博（adobo）是一种将肉、海鲜或蔬菜用醋、酱油、大蒜、
#   月桂叶和黑胡椒炖煮，直至滋味浓郁、口感鲜嫩的菜肴。
#
# A global floor of 0.45 rejected both. The floor is now per-locale,
# and the CJK floor is set at 0.25 — below the shortest legitimate
# Chinese seen (0.33) and above the band where a real truncation
# lands (a truncated Chinese sentence comes back as a fragment of a
# few characters, a ratio near 0.05).
# THE FLOORS, FROM THE MEASURED DISTRIBUTION.
#
# The measured minimum over the accepted translations, per locale:
#
#   zh   min 0.248   p2 0.254   median 0.322   max 0.739
#   ja   min 0.255   p2 0.295   median 0.473   max 1.411
#   ar   min 0.634   p2 0.705   median 0.919   max 1.869
#   hi   min 0.756   p2 0.759   median 1.030   max 1.556
#
# The CJK floors are set BELOW the measured minimum, with a little
# room, because a floor AT the minimum rejects the next good value
# the moment it arrives. The first CJK floor was 0.25 — which is
# exactly the Chinese measured minimum — and it rejected a
# PERFECTLY GOOD translation:
#
#   日式薄皮煎饺，以猪肉、白菜、韭菜和姜为馅，一面煎至金黄，再蒸至熟透。
#
# 34 characters for a 149-character English source, a ratio of 0.23,
# and a complete and accurate translation of the whole sentence. The
# floor is now 0.20 for Chinese and 0.22 for Japanese.
#
# The Latin-script floor stays at 0.45: the measured minimum for
# fr/de/es/pt/id is 0.9, so 0.45 is comfortably below any real
# value and comfortably above a truncation.
LENGTH_RATIO_FLOOR = {
    "zh": 0.20,
    "ja": 0.22,
}
DEFAULT_LENGTH_RATIO_FLOOR = 0.45

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
    # The reliable signal is the LENGTH RATIO.
    #
    # THE THRESHOLD, calibrated on the measured data rather than
    # guessed. Over the 1,300+ accepted translations the ratio runs
    # from 0.600 to 1.387, with the 2nd percentile at 0.922 and the
    # median at 1.149.
    #
    # The previous threshold of 0.6 was exactly the observed MINIMUM,
    # which is a threshold that rejects every good value at the edge
    # and still lets real problems through. Chinese is the language
    # that compresses hardest: "起源于20世纪50年代加拿大魁北克省的乡村地区。"
    # is 23 characters against a 35-character English source, a ratio
    # of 0.600, and it is a COMPLETE, CORRECT translation.
    #
    # So the floor is 0.45 — below the shortest legitimate Chinese
    # seen, and well above the 0.30 band where the real truncations
    # land (23 chars for a 142-char source is 0.16).
    #
    # The CEILING matters just as much: a runaway generation was
    # accepted at a ratio of 82 — 16,022 characters of Indonesian for
    # a 194-character source, which is the model looping. A ceiling of
    # 3.0 catches that; the observed maximum for a real translation is
    # 1.387.
    src_len = len(source.strip())
    if src_len:
        ratio = len(stripped) / src_len
        floor = LENGTH_RATIO_FLOOR.get(locale, DEFAULT_LENGTH_RATIO_FLOOR)
        if ratio < floor:
            return (
                f"the translation is too short to be complete "
                f"({len(stripped)} chars for a {src_len}-char source, "
                f"ratio {ratio:.2f}, floor {floor:.2f})"
            )
        if ratio > 3.0:
            return (
                f"the translation is far too long — it looks like a "
                f"runaway generation ({len(stripped)} chars for a "
                f"{src_len}-char source, ratio {ratio:.2f})"
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

    # THE SCRIPT CHECK — for the CJK locales.
    #
    # A model can lose the script mid-generation and produce text that
    # LOOKS like the target language while carrying English (or
    # another Latin-script language) straight through. One real
    # example passed every other check:
    #
    #   マrtle bariumは（アパムンバリクをUTRANCE）、チョコレート、チーズ、
    #   または砂糖を Wrap った厚い甘い Implicit
    #
    # It has 27 kana and 4 kanji — so it reads as Japanese — but it
    # also carries 29 Latin characters, including the English words
    # 'barium', 'UTRANCE', 'Wrap' and 'Implicit' and the stray
    # English word 'Implicit' at the end. The length ratio was fine
    # (0.55), the glued-word check did not fire, and it was WRITTEN
    # TO THE CATALOGUE.
    #
    # The tell is the RATIO of Latin characters inside CJK text. A
    # Japanese or Chinese sentence that legitimately contains a Latin
    # word — a brand name, a chemical name — has a few Latin
    # characters, not a third of the string.
    if locale in ("ja", "zh"):
        latin = len(re.findall(r"[A-Za-z]", stripped))
        latin_ratio = latin / max(1, len(stripped))
        if latin > 6 and latin_ratio > 0.12:
            # The Latin text must be WORDS, not debris. A legitimate
            # Chinese or Japanese sentence keeps the original dish
            # name in Latin — 'Babi guling', 'Bakso', 'Martabak
            # manis', 'Chole-bhature', 'carne de vinha d'alhos' — and
            # those are whole words.
            #
            # The corruption is different: the model degenerates into
            # FRAGMENTS and SENTENCES in another language —
            # 'アルー・フルコーピPID Extremely dry and cumin-r',
            # 'ラテンアメリカCITrackの鶏肉とrizzue.sofrito',
            # 'インドESO語では'. Those are not dish names; they are
            # the model losing the thread.
            #
            # So the test is not the RATIO of Latin characters — 43
            # legitimate Chinese rows have a high ratio because a
            # Chinese sentence often KEEPS the dish name in Latin. The
            # test is whether the Latin run contains a REAL WORD from
            # the source, or whether it is debris.
            latin_words = re.findall(r"[A-Za-z]{2,}", stripped)
            source_words = set(w.lower().strip(".,") for w in source.split())

            # (a) An ALLCAPS run of four or more letters. A dish name
            # is never shouted. This is the clearest tell:
            # 'UTRANCE', 'ESO', 'PID', 'ENGLISH_ID',
            # 'PIN_POLICY_SERVING_PREFERENCE'.
            allcaps = [w for w in latin_words if w.isupper() and len(w) > 3]

            # (b) A word that is neither in the source nor a
            # capitalised proper noun of twenty characters or fewer.
            debris = []
            for word in latin_words:
                low = word.lower()
                if low in source_words:
                    continue
                if word[:1].isupper() and len(word) <= 20:
                    continue
                debris.append(word)

            # (c) A RUN of three or more Latin words that contains an
            # ordinary English function word. A proper name is one or
            # two words — 'Martabak manis', 'ras el hanout' — or it is
            # a name with no function words in it, like 'carne de
            # vinha d'alhos'. An English PHRASE that has fallen into
            # the sentence contains 'with', 'and', 'are', 'served',
            # 'staple', 'across'.
            english_run = False
            for m in re.finditer(
                r"[A-Za-z]{2,}[ ][A-Za-z]{2,}[ ][A-Za-z]{2,}", stripped
            ):
                if re.search(
                    r"(?:^| )(with|and|are|is|was|the|of|in|for|to|a|an|"
                    r"that|this|served|staple|considered|across|generally|"
                    r"often|used|made|from|as|its|their)( |$)",
                    m.group(0),
                    re.IGNORECASE,
                ):
                    english_run = True
                    break

            # (d) A long token on its own.
            long_token = [w for w in debris if len(w) > 12]

            if allcaps or english_run or long_token:
                return (
                    f"the translation has Latin debris in it "
                    f"({(allcaps or debris or long_token)[:3]}) — the "
                    f"model lost the script mid-generation"
                )

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


def existing_translations() -> dict[tuple[str, str], str]:
    """The (sentence_id, locale) pairs already translated, and their hash.

    This is what makes the run RESUMABLE. A run that was killed
    half-way — both earlier runs died with SIGTERM (-15) — should not
    redo the work it already did. A pair is skipped when its stored
    hash still matches the CURRENT source hash, which means the
    translation is not stale.

    The write is an UPSERT keyed on (source_sentence_id, locale), so
    running twice is safe even for a pair that IS re-translated.
    """
    sql = """
    select json_agg(row_to_json(t))
    from (
      select source_sentence_id, locale, source_hash, status
        from description_sentence_translations
    ) t;
    """
    out = subprocess.run(
        ["bash", "scripts/dbq.sh", sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    result: dict[tuple[str, str], str] = {}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('[{"'):
            for row in json.loads(line):
                result[(row["source_sentence_id"], row["locale"])] = row["source_hash"]
    return result


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
      ('{source_sentence_id}', '{locale}', $${text}$$, '{hash_value}',
       'machine'::sentence_translation_status, '{translator}', false)
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


# ── The single-instance lock ───────────────────────────────────────────
#
# TWO RUNS AT ONCE IS THE BUG THIS PREVENTS.
#
# The translator was run twice concurrently against the same database
# (once for --all, once for a single locale). Both wrote to the same
# rows, so the totals were whatever the two happened to produce — 313
# for one locale and 291 for another, for the SAME locale, which is
# not a number that means anything.
#
# The lock is an exclusive flock on a file. It is:
#   - NON-BLOCKING by default: a second run exits immediately with a
#     clear message rather than waiting, so a scheduled job cannot
#     pile up behind a long one.
#   - RELEASED ON EXIT, including on SIGTERM — the lock is held by the
#     file descriptor, so the kernel drops it when the process dies.
#     Both earlier runs died with -15 (SIGTERM) and the lock does not
#     survive them.
LOCK_PATH = "/tmp/gustale-translate.lock"


def acquire_lock(path: str = LOCK_PATH, wait_seconds: int = 0) -> "io.TextIOWrapper":
    """Take the single-instance lock, or exit.

    flock() is advisory but it is advisory between the processes that
    respect it — and the whole point is that every run of THIS script
    respects it.
    """
    import fcntl

    handle = open(path, "w")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        if wait_seconds > 0:
            deadline = time.time() + wait_seconds
            while time.time() < deadline:
                time.sleep(1)
                try:
                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError:
                    continue
            else:
                handle.close()
                raise SystemExit(
                    f"another translation run holds {path}; "
                    f"waited {wait_seconds}s and gave up"
                )
        else:
            handle.close()
            raise SystemExit(
                f"another translation run already holds {path}. "
                f"Only one may run at a time — the two would overwrite "
                f"each other's rows and the totals would be meaningless."
            )
    # The pid is written for a human to read; the LOCK is what
    # actually excludes.
    handle.write(f"{os.getpid()}\n")
    handle.flush()
    return handle


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", help="one locale, e.g. es")
    parser.add_argument("--all", action="store_true", help="every locale")
    parser.add_argument("--limit", type=int, help="only this many sentences")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--wait-lock",
        type=int,
        default=0,
        help="seconds to wait for the single-instance lock",
    )
    parser.add_argument(
        "--retry-rejected",
        type=int,
        default=0,
        help="extra attempts for a sentence the output check rejected",
    )
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

    # THE LOCK. Taken before any work, and released when the process
    # exits — including on SIGTERM, because the lock is held by the
    # file descriptor and the kernel drops it when the process dies.
    lock = acquire_lock(wait_seconds=args.wait_lock)
    print(f"[translate] the lock is held (pid {os.getpid()})")

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
    skipped_resume = 0
    # The citation lines are not translated. See CITATION_PREFIX.
    translatable = [
        r for r in sentences if not r["text"].lstrip().startswith(CITATION_PREFIX)
    ]
    skipped = len(sentences) - len(translatable)
    print(
        f"[translate] {len(translatable)} sentences to translate; "
        f"{skipped} citation lines skipped"
    )

    # What is already done, so a killed run can resume.
    done = existing_translations()
    print(f"[translate] {len(done)} translation(s) already in the database")

    for locale in locales:
        for index, row in enumerate(translatable, start=1):
            row_hash = source_hash(row["text"])

            # RESUME. A pair already translated, with a hash that still
            # matches the current source, is done. It is not stale, so
            # there is nothing to fix. Skipping it is what makes the
            # job resumable — and safe to run twice.
            stored = done.get((row["id"], locale))
            if stored == row_hash:
                skipped_resume += 1
                continue

            translated = ""
            problem = ""
            # The retry ladder: a sentence the output check rejected
            # gets asked again, because the failure is often the
            # model's mood rather than the sentence.
            attempts = 1 + max(0, args.retry_rejected)
            for attempt in range(attempts):
                try:
                    translated = translate(token, row["text"], locale)
                except Exception as exc:  # noqa: BLE001
                    failures.append((locale, row["slug"], str(exc)[:200]))
                    print(f"  FAILED {locale} {row['slug']}: {str(exc)[:160]}")
                    translated = ""
                    problem = str(exc)[:160]
                    break

                problem = check_translation(row["text"], translated, locale) or ""
                if not problem:
                    break

                if attempt < attempts - 1:
                    print(
                        f"  RETRY {locale} {row['slug']} "
                        f"(attempt {attempt + 2}/{attempts}): {problem}"
                    )
                    time.sleep(1.0)

            if problem:
                rejected.append((locale, row["slug"], problem))
                print(f"  REJECTED {locale} {row['slug']}: {problem}")
                continue

            try:
                write_translation(
                    row["id"],
                    locale,
                    translated,
                    row_hash,
                    MODEL,
                )
                done[(row["id"], locale)] = row_hash
                total += 1
            except Exception as exc:  # noqa: BLE001
                failures.append((locale, row["slug"], str(exc)[:200]))
                print(f"  FAILED {locale} {row['slug']}: {str(exc)[:160]}")
            if index % 20 == 0:
                print(f"  {locale}: {index}/{len(translatable)}")
            # A small pause, so the API is not hammered.
            time.sleep(0.25)

    print(f"[translate] {total} translations written")
    print(f"[translate] {skipped_resume} already done (resumed)")
    if rejected:
        print(f"[translate] {len(rejected)} REJECTED by the output check")
    if failures:
        print(f"[translate] {len(failures)} FAILURES")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
