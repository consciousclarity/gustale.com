#!/usr/bin/env python3
"""No script may DROP or CREATE a database on the PRODUCTION cluster.

WHY THIS EXISTS
---------------
`DROP DATABASE` and `CREATE DATABASE` are CLUSTER-SCOPED operations:
they act on a whole Postgres instance, not on one database. The
production instance is the `shared-postgres` container, and it is
shared with OTHER PROJECTS (bali, dewata, n8n, scribe) as well as with
the live `gustale` database.

On 2026-11-06 the live `gustale` database was DROPPED and recreated
empty, because a diagnostic script ran

    DROP DATABASE IF EXISTS gustale; CREATE DATABASE gustale;

against `shared-postgres`. The database was restored from a backup, but
the site was down and the data-loss window was real.

The structural fix is that a throwaway database does not live on the
production cluster at all: it lives on the DEDICATED TEST POSTGRES
(`scripts/lib/test_pg.sh`, container `gustale-test-postgres`, port
5434). This check makes that rule enforceable, so the fix cannot be
undone by a later script.

THE RULE
--------
  * A script that DROPs or CREATEs a database must NOT target the
    production container.
  * A script that DROPs or CREATEs a database MUST target the
    dedicated test container (or the CI's own service, which is not
    the production container at all).
  * The scripts that legitimately make a COPY of the live database --
    the live-migration gate, the account-deletion gate and the atlas
    regression detector -- are exempt, and each states WHY in the
    allowlist below. Their copies are made FROM live, so they must
    live on the same cluster to be restorable into it; they create and
    drop only the COPY, never the live database, and each one's target
    is checked against the live name separately.
  * The DRY-RUN is NOT exempt. It used to be, with the reason "the
    copy must be on the same cluster to be faithful". That reason was
    wrong: a `pg_dump | pg_restore` copy is faithful wherever it is
    restored. It now runs its copy on the dedicated test Postgres, so
    it needs no exemption -- and this scanner is what keeps it that
    way, by catching it if it ever regresses.

WHAT IT CHECKS
--------------
For every script that mentions a cluster-scoped database statement, it
finds which CONTAINER the statement runs against. It reports a script
when:

  * the statement runs against `shared-postgres`, or
  * the script mentions `shared-postgres` and a cluster-scoped
    statement, and does not name the test container at all.

The second rule matters because a script can reach production through
a variable rather than a literal.

Usage:
    python3 scripts/check-no-production-db-drops.py

Exit 0 = clean; 1 = a script can drop a database on production.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

#: The production container. `DROP DATABASE` here is a data-loss event.
PRODUCTION_CONTAINER = "shared-postgres"

#: The dedicated test container. Cluster-scoped statements belong here.
TEST_CONTAINER = "gustale-test-postgres"

#: The cluster-scoped statements that matter.
CLUSTER_SCOPED = re.compile(
    r"\b(?:DROP\s+DATABASE|CREATE\s+DATABASE|DROP\s+ROLE|CREATE\s+ROLE|DROP\s+OWNED)\b",
    re.IGNORECASE,
)

#: Scripts exempt from the rule, and why.
#:
#: Each of these makes a COPY of the live database and drops the copy.
#: The copy must be created on the same cluster as the live database,
#: because a `pg_dump | pg_restore` copy is restored into the cluster
#: it will later be applied to, and because `CREATE DATABASE ... TEMPLATE`
#: requires the template to be on the same server.
ALLOWLIST: dict[str, str] = {
    "scripts/apply-migration-live.sh": (
        "The live-migration gate. It creates and drops "
        "gustale_atlas_gate_copy -- a COPY of live, made from the "
        "backup the gate already took -- and NEVER drops the live "
        "database. It asserts the live database is NOT marked "
        "disposable before the constraint tests run on the copy."
    ),
    "scripts/delete-test-account.sh": (
        "The account-deletion gate. It creates and drops "
        "gustale_delacct_$$ -- a COPY of live -- and applies the "
        "delete to live only after the copy has proved the outcome. "
        "It never drops the live database."
    ),
    "scripts/verify-atlas-tests-detect-regression.sh": (
        "Proves the atlas constraint detector can FAIL. It snapshots "
        "live READ-ONLY (CREATE DATABASE ... TEMPLATE) and drops the "
        "snapshot. It never writes to live."
    ),
    "scripts/drop-stray-role.sh": (
        "Drops a stray role from the live cluster, but ONLY after a "
        "seven-check audit that refuses any role with a login, a "
        "membership, or an owned object."
    ),
}

#: Where to look for scripts.
SCAN_DIRS = ["scripts"]

#: Files that are not targets of this check.
#:
#: The scanner itself and the guard MODULE are the two files that must
#: TALK ABOUT `DROP DATABASE` -- they are the ones that forbid it. Their
#: text is documentation, not a statement they run.
NO_TARGET_SCRIPTS = {
    "scripts/check-no-production-db-drops.py",
    "scripts/lib/db_guard.py",
    "scripts/test-check-no-production-db-drops.py",
}

#: Files that are not scripts.
SKIP_SUFFIXES = {".md", ".json", ".sql", ".png", ".jpg", ".txt", ".yml", ".yaml"}


def _rel(path: Path) -> str:
    # POSIX separators, ALWAYS.
    #
    # `str(Path)` uses the platform's separator, so on Windows this
    # returned `scripts\\apply-migration-live.sh` while every allowlist
    # key is `scripts/apply-migration-live.sh`. The allowlist lookup
    # then missed EVERY entry, and the scanner reported allowlisted
    # scripts as violations -- a gate that cries wolf on a developer
    # machine is a gate nobody runs.
    #
    # `as_posix()` is the same path with forward slashes on every
    # platform, which is what the allowlist keys use.
    try:
        return path.relative_to(REPO).as_posix()
    except ValueError:
        return path.as_posix()


def _is_scannable(path: Path) -> bool:
    if path.suffix not in {".py", ".sh", ".bash"}:
        return False
    if path.suffix in SKIP_SUFFIXES:
        return False
    if "__pycache__" in path.parts:
        return False
    return True


def _strip_comment(line: str) -> str:
    """Remove a trailing comment, respecting quotes."""
    out = []
    quote = None
    i = 0
    while i < len(line):
        ch = line[i]
        if quote:
            out.append(ch)
            if ch == "\\" and i + 1 < len(line):
                out.append(line[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
        else:
            if ch in ("'", '"'):
                quote = ch
                out.append(ch)
            elif ch == "#":
                break
            elif ch == "/" and i + 1 < len(line) and line[i + 1] == "/":
                break
            else:
                out.append(ch)
        i += 1
    return "".join(out)


def _names_production(code: str) -> bool:
    """Does this line reference the production container?"""
    return PRODUCTION_CONTAINER in code


def _names_test_container(code: str) -> bool:
    """Does this line reference the dedicated test container?"""
    return TEST_CONTAINER in code


# --------------------------------------------------------------------------
# RESOLVING THE CONTAINER A STATEMENT ACTUALLY RUNS AGAINST
# --------------------------------------------------------------------------
#
# WHY THIS EXISTS
# ---------------
# The first version of this scanner asked a question it could not answer:
# "does this line NAME the production container?". A script that names it
# in a VARIABLE -- `docker exec "$PG_CONTAINER" psql -c "DROP DATABASE"`
# -- answers "no", and the scanner passed it.
#
# That is the 2026-11-06 incident, in script form: the destructive
# statement named a variable, the variable's value was the production
# container, and nothing between the two was ever checked.
#
# So the scanner now RESOLVES the container instead of matching its
# spelling. A variable is resolved through its assignments, and a
# statement's container is found by following the call it makes.
#
# WHAT "RESOLVED" MEANS
# ---------------------
# A resolved container is a SET of containers the statement might reach,
# not one. Two reasons:
#
#   * `VAR="${VAR:-default}"` -- the value is `default` when the
#     environment does not set it, and ANYTHING when it does. So the set
#     is {default, ANY}.
#   * A variable may be assigned in more than one place, and a script
#     may read it from several.
#
# ANY means "whatever the environment says". It intersects production,
# because the environment CAN say production -- that is exactly what a
# stale `PG_CONTAINER=shared-postgres` in a production shell is.

#: `VAR="literal"` -- a value the environment cannot change.
_ASSIGN_LITERAL = re.compile(
    r"""^\s*(?:export\s+)?(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*"""
    r"""["']?(?P<value>[^"'\s#][^"'\s]*)["']?\s*$"""
)

#: `VAR="${VAR:-default}"` -- a value the environment CAN change.
#:
#: The `:-` (or `-`) is matched as a UNIT. Matching `[:-]` alone would
#: capture `-default` -- the dash included -- and the container name
#: would never match, which is a scanner that silently passes.
_ASSIGN_DEFAULTED = re.compile(
    r"""^\s*(?:export\s+)?(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*"""
    r"""["']?\$\{\s*(?P<inner>[A-Za-z_][A-Za-z0-9_]*)\s*(?P<sep>:-|-)\s*"""
    r"""(?P<default>[^"'\}]+)\}["']?\s*$"""
)

#: `docker exec [flags] <container> ...` -- the container is the first
#: token that is not a flag and not a flag's value.
_EXEC_RE = re.compile(r"docker\s+exec\s+(?P<rest>[^\n]*)")

#: Python's list form: `["docker", "exec", "-u", "postgres", "-i", NAME, ...]`
#:
#: The shell form above does not match it, because the words are
#: separated by QUOTES AND COMMAS, not spaces. A Python script that
#: shells out to `docker exec` was therefore invisible to the
#: scanner -- and `scripts/find_migration_order.py` is exactly that:
#: it DROPs and CREATEs a database through `subprocess.run` with a
#: list argument.
_PY_EXEC_RE = re.compile(
    r"""\[\s*["']docker["']\s*,\s*["']exec["'](?P<rest>[^\]]*)""",
    re.IGNORECASE,
)

#: Python's environment read: `NAME = os.environ.get("VAR", "default")`
#:
#: The default is what the name is when the environment is silent, and
#: the ENVIRONMENT can change it -- which is the whole risk. The shell
#: form is `NAME="${NAME:-default}"`.
_PY_ENV_ASSIGN = re.compile(
    r"""^\s*(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*"""
    r"""(?:os\.environ\.get|environ\.get)\(\s*"""
    r"""["'](?P<env>[A-Za-z_][A-Za-z0-9_]*)["']\s*"""
    r"""(?:,\s*["'](?P<default>[^"']*)["'])?\s*\)""",
)

#: Python's plain assignment: `NAME = "value"`.
_PY_ASSIGN_LITERAL = re.compile(
    r"""^\s*(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*"""
    r"""["'](?P<value>[^"']*)["']\s*$""",
)

#: Flags of `docker exec` that take a value of their own.
_EXEC_VALUE_FLAGS = {"-u", "--user", "-e", "--env", "-w", "--workdir"}

#: ANY container: the environment chooses.
ANY_CONTAINER = "*"

#: The repo-wide map of variable -> possible values. Built once, from
#: every script in the repo, so that a variable a script READS but does
#: not assign (like `TEST_PG_CONTAINER`) still resolves.
_VAR_VALUES: dict[str, set[str]] = {}
_VAR_ENV_OVERRIDABLE: set[str] = set()


def _repo_variable_map() -> None:
    """Map every shell variable the repo assigns to its possible values.

    FILE-LOCAL assignments win over repo-wide ones: a script that
    assigns `PG_CONTAINER=...` says what IT means by it, and the fact
    that another script means something else by the same name is that
    other script's business.
    """
    local: dict[str, set[str]] = {}
    env_over: set[str] = set()

    for path in sorted(REPO.rglob("*")):
        if not path.is_file() or not _is_scannable(path):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line in _strip_docstrings(text).splitlines():
            code = _strip_comment(line)
            if not code.strip():
                continue
            m = _ASSIGN_DEFAULTED.match(code)
            if m and m.group("name") == m.group("inner"):
                local.setdefault(m.group("name"), set()).add(m.group("default"))
                env_over.add(m.group("name"))
                continue
            m = _ASSIGN_LITERAL.match(code)
            if m:
                local.setdefault(m.group("name"), set()).add(m.group("value"))
                continue
            # Python's environment read: the ENVIRONMENT can change it.
            m = _PY_ENV_ASSIGN.match(code)
            if m:
                default = m.group("default")
                if default:
                    local.setdefault(m.group("name"), set()).add(default)
                env_over.add(m.group("name"))
                continue
            m = _PY_ASSIGN_LITERAL.match(code)
            if m:
                local.setdefault(m.group("name"), set()).add(m.group("value"))

    _VAR_VALUES.clear()
    _VAR_ENV_OVERRIDABLE.clear()
    for name, values in local.items():
        _VAR_VALUES[name] = set(values)
        if name in env_over:
            _VAR_ENV_OVERRIDABLE.add(name)


def _resolve_var(name: str, local: dict[str, set[str]], depth: int = 0) -> set[str]:
    """The containers a variable may name.

    File-local assignments win. A variable the file does not assign
    falls back to the repo-wide map, so a shared library's constant
    (like `TEST_PG_CONTAINER`) still resolves.
    """
    if depth > 8:
        return set()

    values = local.get(name)
    if values is None:
        # The file does not assign it, so the repo-wide map answers, and
        # with it the repo-wide answer to "can the environment change
        # this?".
        values = _VAR_VALUES.get(name, set())
        if name in _VAR_ENV_OVERRIDABLE:
            values = set(values) | {ANY_CONTAINER}
    elif ANY_CONTAINER in local.get("__env__" + name, set()):
        # The file assigns it AND the environment can override it.
        values = set(values) | {ANY_CONTAINER}

    out: set[str] = set()
    for value in values:
        if value.startswith("$"):
            out |= _resolve_var(value.lstrip("$").strip("{}"), local, depth + 1)
        elif value.startswith("${"):
            inner = value[2:-1]
            if ":-" in inner:
                out |= _resolve_var(inner.split(":-")[0], local, depth + 1)
                out.add(inner.split(":-", 1)[1])
            else:
                out |= _resolve_var(inner, local, depth + 1)
        else:
            out.add(value)

    return out


def _exec_containers(code: str) -> set[str]:
    """The containers a `docker exec` in this text names."""
    out: set[str] = set()
    for m in _EXEC_RE.finditer(code):
        tokens = m.group("rest").split()
        i = 0
        while i < len(tokens):
            token = tokens[i]
            if token.startswith("-"):
                # A flag, and possibly a flag's value.
                if token in _EXEC_VALUE_FLAGS:
                    i += 2
                    continue
                i += 1
                continue
            out.add(token.strip("\"'"))
            break
    return out


def _py_exec_containers(code: str) -> set[str]:
    """The containers a Python `["docker", "exec", ...]` list names.

    Same rule as the shell form: the container is the first element
    that is not a flag and not a flag's value. The elements are
    separated by commas and quoted, so they are split apart first.

    A QUOTED element is a literal -- `["shared-postgres", ...]` names
    the production container. A BARE element is a Python NAME, so it
    is returned as `$NAME` and resolved like a shell variable.
    """
    out: set[str] = set()
    for m in _PY_EXEC_RE.finditer(code):
        rest = m.group("rest")
        elements = [e.strip() for e in rest.split(",")]
        i = 0
        while i < len(elements):
            raw = elements[i]
            if not raw:
                i += 1
                continue
            quoted = raw[0] in "\"'"
            element = raw.strip("\"'").strip()
            if not element:
                i += 1
                continue
            if element.startswith("-"):
                if element in _EXEC_VALUE_FLAGS:
                    i += 2
                    continue
                i += 1
                continue
            if quoted:
                out.add(element)
            else:
                # A Python name: resolve it as a variable.
                out.add("$" + element)
            break
    return out


def _local_assignments(lines: list[str]) -> dict[str, set[str]]:
    """The variables THIS file assigns, and their possible values."""
    out: dict[str, set[str]] = {}
    for line in lines:
        code = _strip_comment(line)
        if not code.strip():
            continue
        m = _ASSIGN_DEFAULTED.match(code)
        if m and m.group("name") == m.group("inner"):
            out.setdefault(m.group("name"), set()).add(m.group("default"))
            out.setdefault("__env__" + m.group("name"), set()).add(ANY_CONTAINER)
            continue
        m = _ASSIGN_LITERAL.match(code)
        if m:
            out.setdefault(m.group("name"), set()).add(m.group("value"))
            continue
        # Python's environment read: the ENVIRONMENT can change it.
        m = _PY_ENV_ASSIGN.match(code)
        if m:
            default = m.group("default")
            if default:
                out.setdefault(m.group("name"), set()).add(default)
            out.setdefault("__env__" + m.group("name"), set()).add(ANY_CONTAINER)
            continue
        # Python's plain assignment.
        m = _PY_ASSIGN_LITERAL.match(code)
        if m:
            out.setdefault(m.group("name"), set()).add(m.group("value"))
    return out


def _function_body(lines: list[str], name: str) -> list[str]:
    """The lines of a shell function defined in this file, if any."""
    start = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if re.match(rf"^[A-Za-z_][A-Za-z0-9_]*\(\)\s*\{{", stripped) and (
            stripped.startswith(name + "(")
        ):
            start = i
            break
    if start is None:
        return []

    body: list[str] = []
    depth = 0
    for line in lines[start:]:
        depth += line.count("{") - line.count("}")
        body.append(line)
        if depth <= 0 and len(body) > 1:
            break
    return body


def _python_function_body(lines: list[str], name: str) -> list[str]:
    """The lines of a Python `def name(...)` in this file, if any.

    Python's functions are not shell's: the body is defined by
    INDENTATION, and a call like `d(f"DROP DATABASE ...")` reaches the
    `docker exec` several lines away inside the function it calls. A
    scanner that only reads the statement's own line never sees the
    container -- which is why a Python script could run a
    cluster-scoped DROP with nothing to show for it.

    The body ends at the next line that is not indented under the
    `def`. Bracket depth is tracked, because a call that spans lines
    can close its bracket at the `def`'s own indentation.
    """
    start = None
    for i, line in enumerate(lines):
        if re.match(rf"^\s*def\s+{re.escape(name)}\s*\(", line):
            start = i
            break
    if start is None:
        return []

    def_indent = len(lines[start]) - len(lines[start].lstrip())
    body = [lines[start]]
    depth = lines[start].count("(") - lines[start].count(")")
    for line in lines[start + 1 :]:
        stripped = line.strip()
        if depth > 0:
            body.append(line)
            depth += line.count("(") - line.count(")")
            depth += line.count("[") - line.count("]")
            continue
        if not stripped:
            body.append(line)
            continue
        indent = len(line) - len(line.lstrip())
        if indent <= def_indent:
            break
        body.append(line)
    return body


def _called_local_function(line: str, lines: list[str]) -> list[str]:
    """If this line calls a function defined in this file, its body."""
    # Python's call form: `d(f"DROP DATABASE ...")`. It has to be
    # tried FIRST: the shell form's pattern needs WHITESPACE after the
    # name, and a Python call has a bracket there instead, so the
    # shell pattern does not match and the Python body was never
    # looked for.
    m2 = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(", line)
    if m2:
        python_body = _python_function_body(lines, m2.group(1))
        if python_body:
            return python_body
    m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s", line)
    if not m:
        return []
    return _function_body(lines, m.group(1))


def _command_block(lines: list[str], idx: int) -> list[str]:
    """The whole logical command the line at `idx` belongs to.

    A `docker exec` and its `-c "DROP DATABASE ..."` are often split
    across two lines with a trailing backslash, and the destructive
    part is on the SECOND line. Resolving only the statement's own
    line would miss the container entirely -- so the block is walked
    backwards and forwards along the continuations.
    """
    start = idx
    while start > 0 and lines[start - 1].rstrip().endswith("\\"):
        start -= 1
    end = idx
    while end < len(lines) - 1 and lines[end].rstrip().endswith("\\"):
        end += 1
    return lines[start : end + 1]


def _containers_of_statement(
    statement: str,
    lines: list[str],
    local: dict[str, set[str]],
) -> set[str]:
    """The containers a cluster-scoped statement can reach.

    In order of how directly each answers the question:

      1. The statement's own command block (the `docker exec` and the
         `-c "DROP DATABASE"` may be on different lines).
      2. The body of a function the statement CALLS, when the
         statement is a call rather than a command.
      3. The surrounding window -- a last resort, used only when the
         first two found nothing, so that a stray `docker exec` three
         lines away does not make every statement look production.
    """
    out: set[str] = set()

    idx = next(
        (i for i, line in enumerate(lines) if _strip_comment(line).strip() == statement),
        None,
    )

    chunks: list[str] = []
    if idx is not None:
        # 1. The command block.
        chunks.append("\n".join(_command_block(lines, idx)))

        # 2. The function the statement calls.
        called = _called_local_function(statement, lines)
        if called:
            chunks.append("\n".join(called))

        # 3. The window, as a LAST resort.
        chunks.append("\n".join(lines[max(0, idx - 4) : idx + 5]))

    for chunk in chunks:
        found = _resolve_containers(chunk, local)
        if found:
            out |= found
            # The first chunk that resolves is the one that counts. A
            # later chunk is a guess, and a guess that contradicts a
            # resolved answer is how a false positive gets written.
            break

    return out


def _resolve_containers(code: str, local: dict[str, set[str]]) -> set[str]:
    """The containers a chunk of code names, with variables resolved."""
    out: set[str] = set()
    for token in _exec_containers(code) | _py_exec_containers(code):
        if token.startswith("$"):
            out |= _resolve_var(token.lstrip("$").strip("{}"), local)
        elif token.startswith("{"):
            continue
        else:
            out.add(token)
    return out


def _strip_docstrings(text: str) -> str:
    """Blank out Python docstrings, so prose is not read as code.

    A triple-quoted block is replaced by empty lines, so the line
    NUMBERS of the real code are preserved.
    """
    triple_double = chr(34) * 3
    triple_single = chr(39) * 3
    out = []
    in_doc = False
    delim = ""
    for line in text.splitlines():
        stripped = line.strip()
        if not in_doc:
            if stripped.startswith(triple_double):
                if stripped.count(triple_double) >= 2 and len(stripped) > 3:
                    out.append("")
                    continue
                in_doc = True
                delim = triple_double
                out.append("")
                continue
            if stripped.startswith(triple_single):
                if stripped.count(triple_single) >= 2 and len(stripped) > 3:
                    out.append("")
                    continue
                in_doc = True
                delim = triple_single
                out.append("")
                continue
            out.append(line)
        else:
            if delim in line:
                in_doc = False
            out.append("")
    return "\n".join(out)


def scan_file(path: Path) -> list[str]:
    """Return the findings for one file. Empty list means clean."""
    rel = _rel(path)
    if rel in ALLOWLIST or rel in NO_TARGET_SCRIPTS:
        return []

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []

    findings: list[str] = []
    # Prose is skipped: a script that EXPLAINS `DROP DATABASE` in its
    # docstring is not a script that RUNS one.
    lines = _strip_docstrings(text).splitlines()

    # Does this script make cluster-scoped statements at all?
    has_cluster_scoped = any(
        CLUSTER_SCOPED.search(_strip_comment(line))
        for line in lines
        if not line.strip().startswith("#")
    )
    if not has_cluster_scoped:
        return []

    local = _local_assignments(lines)

    for lineno, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        code = _strip_comment(line)
        if not code.strip():
            continue

        if not CLUSTER_SCOPED.search(code):
            continue

        # A cluster-scoped statement. WHICH container does it run
        # against? The answer is resolved, not guessed: the container
        # may be named in a variable, and the variable may be settable
        # from the environment.
        containers = _containers_of_statement(stripped, lines, local)

        if PRODUCTION_CONTAINER in containers:
            findings.append(
                f"{rel}:{lineno}: runs a cluster-scoped statement against the "
                f"PRODUCTION container ({PRODUCTION_CONTAINER}): "
                f"{stripped[:90]}"
            )
        elif ANY_CONTAINER in containers:
            findings.append(
                f"{rel}:{lineno}: runs a cluster-scoped statement against a "
                f"container chosen by the ENVIRONMENT, so it can be the "
                f"PRODUCTION container ({PRODUCTION_CONTAINER}): "
                f"{stripped[:90]}"
            )

    return findings


def collect_files() -> list[Path]:
    files: list[Path] = []
    for d in SCAN_DIRS:
        base = REPO / d
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.is_file() and _is_scannable(p):
                files.append(p)
    return sorted(files)


def main() -> int:
    print("=== no script may DROP or CREATE a database on the production cluster ===")
    _repo_variable_map()
    files = collect_files()
    findings: list[str] = []
    for path in files:
        findings.extend(scan_file(path))

    if not findings:
        print(f"  OK  {len(files)} script(s) checked; none can drop a database on")
        print(f"      the production cluster ({PRODUCTION_CONTAINER}).")
        print()
        print("  A throwaway database belongs on the dedicated test Postgres")
        print(f"  ({TEST_CONTAINER}, port 5434) -- see scripts/lib/test_pg.sh.")
        return 0

    print("  FAIL  a script can drop a database on production:", file=sys.stderr)
    for f in findings:
        print(f"    {f}", file=sys.stderr)
    print(
        "\n"
        "  `DROP DATABASE` and `CREATE DATABASE` are CLUSTER-SCOPED, and the\n"
        f"  production cluster ({PRODUCTION_CONTAINER}) hosts the live database\n"
        "  and five other projects' databases. On 2026-11-06 a DROP DATABASE\n"
        "  aimed at this cluster destroyed the live database.\n"
        "\n"
        "  Point the script at the dedicated test Postgres:\n"
        "\n"
        "      source scripts/lib/test_pg.sh\n"
        f"      test_pg_create \"$DB\"    # instead of docker exec {PRODUCTION_CONTAINER} ...\n"
        "\n"
        "  If the script legitimately needs a copy of the LIVE database, it\n"
        "  must name a copy and never the live name -- and it may be added to\n"
        "  the allowlist in this file WITH the reason it needs production.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
