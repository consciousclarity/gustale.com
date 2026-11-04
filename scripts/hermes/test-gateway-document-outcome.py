#!/usr/bin/env python3
"""Test the TRUTHFUL attachment note and the outcome propagation.

The defect this covers
----------------------
`gateway/run.py::_build_document_context_note` said, for every `text/*`
document, "Its content has been included below". It decided that from the
MIME type alone. When the adapter correctly WITHHELD a secret-shaped
document, the note still claimed the content was included -- so the agent
was told to look for text that was never sent.

The fix
-------
The adapter is the component that knows whether content was inlined, so it
records that decision and the note is built from the record.

What this suite proves
----------------------
  A. The note is truthful in every case:
       - content included   -> the note says it was included
       - content withheld   -> the note says it was NOT included, and why
       - no outcome at all  -> the note does NOT claim inclusion
  B. The propagation works end to end: the adapter records the outcome,
     it lands on the event's metadata, and the note reads it back.
  C. The patcher is IDEMPOTENT: applying it twice changes nothing.
  D. The patcher FAILS LOUDLY: a broken tree is rejected and NOTHING is
     written.
  E. MUTATION: the suite FAILS when the guard, the outcome recording, the
     import, or the truthful wording is removed. A test that cannot fail
     is not a test.

Every test runs against a THROWAWAY COPY of the package tree. The
installed gateway is never modified. The key material is a fresh,
in-memory, throwaway RSA key -- never a real credential.

Run:
    python3 scripts/hermes/test-gateway-document-outcome.py
"""
from __future__ import annotations

import ast
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PATCHER = REPO / "scripts/hermes/patch-gateway-secret-documents.py"
SITE = Path(
    os.environ.get(
        "HERMES_GATEWAY_PKG",
        "/home/gustale/.local/share/uv/tools/hermes-agent/lib/python3.12/site-packages",
    )
)

# The files the patcher touches.
TARGETS = [
    "gateway/platforms/base.py",
    "gateway/run.py",
    "plugins/platforms/telegram/adapter.py",
    "plugins/platforms/discord/adapter.py",
    "plugins/platforms/slack/adapter.py",
    "plugins/platforms/feishu/adapter.py",
    "plugins/platforms/whatsapp/adapter.py",
]

PASSED = 0
FAILED = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"    [PASS] {name}")
    else:
        FAILED += 1
        print(f"    [FAIL] {name}" + (f" -- {detail}" if detail else ""))


def make_throwaway_key() -> str:
    """A fresh, in-memory, throwaway RSA key. Never a real credential."""
    out = subprocess.run(
        ["openssl", "genrsa", "2048"], capture_output=True, text=True, timeout=120
    )
    if out.returncode != 0:
        raise RuntimeError("openssl genrsa failed")
    return out.stdout


def build_tree(root: Path) -> None:
    """Copy the pristine sources into a throwaway tree.

    The `.orig` files are the pre-patch backups the patcher itself wrote,
    so they are the closest thing to pristine upstream we have. If a
    backup is missing, the installed file is used (and the suite still
    works, because the patcher normalises what it finds).
    """
    for rel in TARGETS:
        dst = root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        backup = SITE / (rel + ".orig")
        src = backup if backup.exists() else SITE / rel
        shutil.copy2(src, dst)


def run_patcher(root: Path, extra: list[str] | None = None) -> subprocess.CompletedProcess:
    cmd = [sys.executable, str(PATCHER), "--pkg-root", str(root)]
    if extra:
        cmd += extra
    return subprocess.run(cmd, capture_output=True, text=True, timeout=300)


def tree_digest(root: Path) -> dict[str, str]:
    """A digest of every target file. A missing file hashes as MISSING."""
    out: dict[str, str] = {}
    for rel in TARGETS:
        path = root / rel
        out[rel] = (
            hashlib.sha256(path.read_bytes()).hexdigest()
            if path.exists()
            else "MISSING"
        )
    return out


def load_module_from_source(path: Path, name: str):
    """Load a module from a source file without importing the package."""
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ----------------------------------------------------------------------
# The note builder, extracted from the patched run.py and executed.
# ----------------------------------------------------------------------
def extract_from_source(path: Path, func_name: str, extra_globals: dict | None = None):
    """Compile one function out of a source file, with its module globals.

    The function is extracted by AST so the test exercises the REAL
    source, not a copy of it. Module-level constants the function
    depends on (e.g. DOCUMENT_OUTCOMES_KEY) are pulled in too.
    """
    src = path.read_text()
    tree = ast.parse(src)
    ns: dict = {"Optional": None, "Dict": None, "Any": None, "os": os}
    if extra_globals:
        ns.update(extra_globals)
    # The module-level assignments the function may reference.
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    try:
                        ns[target.id] = ast.literal_eval(node.value)
                    except (ValueError, SyntaxError):
                        pass
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == func_name:
            mod = ast.Module(body=[node], type_ignores=[])
            ast.fix_missing_locations(mod)
            code = compile(mod, str(path), "exec")
            exec(code, ns)
            return ns[func_name]
    raise AssertionError(f"{func_name} not found in {path}")


def extract_note_builder(run_py: Path):
    """Compile `_build_document_context_note` out of run.py."""
    return extract_from_source(run_py, "_build_document_context_note")


def extract_document_outcome(base_py: Path):
    """Compile `document_outcome` out of the patched base.py."""
    return extract_from_source(base_py, "document_outcome")


def extract_record_document_outcome(base_py: Path):
    """Compile `record_document_outcome` out of the patched base.py."""
    return extract_from_source(base_py, "record_document_outcome")


def extract_is_secret_shaped_document(base_py: Path):
    """Compile `_is_secret_shaped_document` out of the patched base.py."""
    return extract_from_source(base_py, "_is_secret_shaped_document")


# ----------------------------------------------------------------------
def main() -> int:
    print("=== TRUTHFUL attachment note + outcome propagation ===\n")

    tmp = Path(tempfile.mkdtemp(prefix="gwoutcome-", dir="/tmp"))
    os.chmod(tmp, 0o700)
    tree = tmp / "tree"
    tree.mkdir()

    print("=== 0. the patcher applies to a pristine tree ===")
    build_tree(tree)
    r = run_patcher(tree)
    check("the patcher succeeds on a pristine tree", r.returncode == 0,
          (r.stdout or r.stderr)[-400:])
    if r.returncode != 0:
        print("\nABORT: the patcher could not apply")
        return 1

    run_py = tree / "gateway/run.py"
    base_py = tree / "gateway/platforms/base.py"

    note = extract_note_builder(run_py)
    document_outcome = extract_document_outcome(base_py)
    record_document_outcome = extract_record_document_outcome(base_py)

    # ------------------------------------------------------------------
    print("\n=== 1. the note is TRUTHFUL in every case ===")
    # (a) content WAS included
    n_included = note("notes.txt", "/cache/doc_1_notes.txt", "text/plain",
                      {"included": True, "reason": None})
    check("an included document is reported as included",
          "has been included below" in n_included, n_included)
    check("an included document still points at the path",
          "/cache/doc_1_notes.txt" in n_included, n_included)

    # (b) content was WITHHELD, with a reason
    n_withheld = note("key.pem", "/cache/doc_2_key.pem", "text/plain",
                      {"included": False, "reason": "it looks like it holds a secret"})
    check("a withheld document is NOT reported as included",
          "has been included below" not in n_withheld, n_withheld)
    check("a withheld document says its content was NOT included",
          "NOT included here" in n_withheld, n_withheld)
    check("a withheld document gives the reason",
          "it looks like it holds a secret" in n_withheld, n_withheld)
    check("a withheld document still points at the path",
          "/cache/doc_2_key.pem" in n_withheld, n_withheld)

    # (c) NO outcome at all -- the note must not claim inclusion
    n_unknown = note("notes.txt", "/cache/doc_3_notes.txt", "text/plain", None)
    check("with no recorded outcome the note does NOT claim inclusion",
          "has been included below" not in n_unknown, n_unknown)
    check("with no recorded outcome the note says it was not confirmed",
          "NOT confirmed as included" in n_unknown, n_unknown)

    # (d) a withheld outcome with NO reason still does not claim inclusion
    n_noreason = note("x.txt", "/cache/doc_4_x.txt", "text/plain",
                      {"included": False, "reason": None})
    check("a withheld outcome without a reason still does NOT claim inclusion",
          "has been included below" not in n_noreason, n_noreason)

    # (e) a binary document keeps its own wording
    n_binary = note("report.pdf", "/cache/doc_5_report.pdf", "application/pdf",
                    {"included": False, "reason": "x"})
    check("a binary document keeps the extract-the-text wording",
          "extract the document's text yourself" in n_binary, n_binary)
    check("a binary document does not claim its content was included",
          "has been included below" not in n_binary, n_binary)

    # ------------------------------------------------------------------
    print("\n=== 2. the outcome channel round-trips ===")
    metadata: dict = {}
    record_document_outcome(metadata, "/cache/doc_6_key.pem", False,
                             "it looks like it holds a secret")
    got = document_outcome(metadata, "/cache/doc_6_key.pem")
    check("the recorded outcome can be read back", got is not None, str(got))
    check("the read-back outcome says it was withheld",
          bool(got) and got.get("included") is False, str(got))
    check("the read-back outcome carries the reason",
          bool(got) and got.get("reason") == "it looks like it holds a secret",
          str(got))
    check("an unknown path has NO outcome",
          document_outcome(metadata, "/cache/doc_7_other.pem") is None)
    check("an empty metadata has NO outcome", document_outcome({}, "/x") is None)

    # The note builder must read the outcome out of the SAME metadata.
    n_from_meta = note("key.pem", "/cache/doc_6_key.pem", "text/plain",
                       document_outcome(metadata, "/cache/doc_6_key.pem"))
    check("the note built from the recorded metadata is truthful",
          "NOT included here" in n_from_meta, n_from_meta)

    # ------------------------------------------------------------------
    print("\n=== 3. every adapter records an outcome ===")
    for label, rel in (
        ("telegram", "plugins/platforms/telegram/adapter.py"),
        ("discord", "plugins/platforms/discord/adapter.py"),
        ("slack", "plugins/platforms/slack/adapter.py"),
        ("feishu", "plugins/platforms/feishu/adapter.py"),
        ("whatsapp", "plugins/platforms/whatsapp/adapter.py"),
    ):
        src = (tree / rel).read_text()
        check(f"{label}: records the outcome", "record_document_outcome(" in src)
        check(f"{label}: puts the outcome on the event",
              "document_outcomes_metadata(" in src)
        # The guard must come BEFORE the content is read.
        guard_at = src.find("_is_secret_shaped_document(")
        read_at = max(
            [p for p in (src.find('raw_bytes.decode("utf-8")'),
                         src.find("Path(cached_path).read_text("),
                         src.find("Path(doc_path).read_text(")) if p >= 0] or [-1]
        )
        check(f"{label}: the guard comes BEFORE the content is read",
              guard_at >= 0 and read_at >= 0 and guard_at < read_at,
              f"guard@{guard_at} read@{read_at}")

    # ------------------------------------------------------------------
    print("\n=== 4. the patcher is IDEMPOTENT ===")
    before = tree_digest(tree)
    r2 = run_patcher(tree)
    check("the second run succeeds", r2.returncode == 0, (r2.stdout or r2.stderr)[-300:])
    after = tree_digest(tree)
    check("the second run changes NOTHING", before == after,
          ", ".join(rel for rel in TARGETS if before[rel] != after[rel]))

    for label, rel in (
        ("telegram", "plugins/platforms/telegram/adapter.py"),
        ("discord", "plugins/platforms/discord/adapter.py"),
        ("slack", "plugins/platforms/slack/adapter.py"),
        ("feishu", "plugins/platforms/feishu/adapter.py"),
        ("whatsapp", "plugins/platforms/whatsapp/adapter.py"),
    ):
        src = (tree / rel).read_text()
        n_guard = src.count("# hermes:secret-document-guard:begin")
        n_redact = src.count("# hermes:secret-document-redact:begin")
        n_max = src.count("MAX_TEXT_INJECT_BYTES = 100 * 1024")
        check(f"{label}: exactly ONE guard after two runs (got {n_guard})", n_guard == 1)
        check(f"{label}: exactly ONE redaction after two runs (got {n_redact})", n_redact == 1)
        check(f"{label}: exactly ONE MAX_TEXT_INJECT_BYTES (got {n_max})", n_max == 1)

    # ------------------------------------------------------------------
    print("\n=== 4b. the patcher NORMALISES an already-patched tree ===")
    # This is the real reinstall path: the tree on disk was patched by an
    # EARLIER version of this patcher, which could write the MAX
    # assignment twice and left no markers. The new patcher must bring
    # it to the canonical form, not refuse it and not compound it.
    legacy = tmp / "legacy"
    legacy.mkdir()
    build_tree(legacy)
    # Recreate the legacy artifacts: a duplicated MAX assignment and a
    # guard written without markers.
    lg = legacy / "plugins/platforms/discord/adapter.py"
    lgt = lg.read_text()
    lgt = lgt.replace(
        "                MAX_TEXT_INJECT_BYTES = 100 * 1024\n",
        "                MAX_TEXT_INJECT_BYTES = 100 * 1024\n"
        "                MAX_TEXT_INJECT_BYTES = 100 * 1024\n",
        1,
    )
    lg.write_text(lgt)
    check("the legacy tree really has the duplicate",
          lgt.count("MAX_TEXT_INJECT_BYTES = 100 * 1024") == 2)
    rl = run_patcher(legacy)
    check("the patcher accepts the legacy tree", rl.returncode == 0,
          (rl.stdout or rl.stderr)[-400:])
    if rl.returncode == 0:
        lgt2 = lg.read_text()
        check("the duplicate MAX assignment is normalised away",
              lgt2.count("MAX_TEXT_INJECT_BYTES = 100 * 1024") == 1,
              f"got {lgt2.count('MAX_TEXT_INJECT_BYTES = 100 * 1024')}")
        check("the normalised tree has exactly one guard",
              lgt2.count("# hermes:secret-document-guard:begin") == 1)
        rl2 = run_patcher(legacy)
        check("the legacy tree is idempotent after normalisation",
              rl2.returncode == 0
              and lg.read_text() == lgt2)

    # ------------------------------------------------------------------
    print("\n=== 5. the patcher FAILS LOUDLY on a broken tree ===")
    broken = tmp / "broken"
    broken.mkdir()
    build_tree(broken)
    # Break an anchor the patcher depends on: the size cap. The patcher
    # must refuse to guess what the new value is.
    tg = broken / "plugins/platforms/telegram/adapter.py"
    tg.write_text(tg.read_text().replace(
        "MAX_TEXT_INJECT_BYTES = 100 * 1024",
        "MAX_TEXT_INJECT_BYTES = 200 * 1024", 1))
    before_broken = tree_digest(broken)
    rb = run_patcher(broken)
    check("the patcher REJECTS a tree whose anchor changed", rb.returncode != 0,
          f"rc={rb.returncode}")
    check("the failure is reported loudly", "FAILED" in (rb.stdout + rb.stderr),
          (rb.stdout + rb.stderr)[-200:])
    check("NOTHING was written to the broken tree", tree_digest(broken) == before_broken)

    # A missing file must also be refused, not silently skipped.
    missing = tmp / "missing"
    missing.mkdir()
    build_tree(missing)
    (missing / "plugins/platforms/slack/adapter.py").unlink()
    before_missing = tree_digest(missing)
    rm2 = run_patcher(missing)
    check("the patcher REJECTS a tree with a missing adapter", rm2.returncode != 0,
          f"rc={rm2.returncode}")
    check("NOTHING was written to the tree with the missing adapter",
          tree_digest(missing) == before_missing)

    # ------------------------------------------------------------------
    print("\n=== 6. MUTATION: the patcher must REPAIR a mutated tree ===")

    def mutate_and_run(rel: str, old: str, new: str, label: str) -> None:
        """Patch a tree, mutate the PATCHED file, and assert the patcher
        detects the mutation (by failing loudly or by repairing it)."""
        mt = tmp / ("mut-" + label.replace(" ", "_").replace("/", "_"))
        mt.mkdir(exist_ok=True)
        build_tree(mt)
        r0 = run_patcher(mt)
        if r0.returncode != 0:
            check(f"mutation '{label}': the tree patched cleanly first", False,
                  (r0.stdout or r0.stderr)[-300:])
            return
        target = mt / rel
        text = target.read_text()
        if old not in text:
            check(f"mutation '{label}': the mutation target is present", False,
                  f"{old[:70]!r} not found in {rel}")
            return
        target.write_text(text.replace(old, new, 1))
        rm = run_patcher(mt)
        after = (mt / rel).read_text()
        # Either the patcher refused the mutated tree, or it repaired it.
        repaired = old in after
        refused = rm.returncode != 0
        check(f"mutation '{label}': the patcher detects or repairs it",
              repaired or refused,
              f"rc={rm.returncode} repaired={repaired}")
        if repaired:
            check(f"mutation '{label}': the repaired tree is back to one guard",
                  after.count("# hermes:secret-document-guard:begin") == 1,
                  f"got {after.count('# hermes:secret-document-guard:begin')}")

    # 6a. the outcome recording is removed from the Telegram adapter.
    mutate_and_run(
        "plugins/platforms/telegram/adapter.py",
        "                record_document_outcome(\n",
        "                # removed by the mutation test\n",
        "outcome recording removed",
    )

    # 6b. the truthful wording is reverted to the lying wording.
    mutate_and_run(
        "gateway/run.py",
        '            f"Its content was NOT included here -- {_reason}. "',
        '            f"Its content has been included below. "',
        "truthful note reverted",
    )

    # 6c. the guard is removed from the Discord adapter.
    mutate_and_run(
        "plugins/platforms/discord/adapter.py",
        "                        _secret = _is_secret_shaped_document(\n",
        "                        _secret = False\n",
        "guard removed",
    )

    # 6d. the helper import is removed from the Slack adapter.
    mutate_and_run(
        "plugins/platforms/slack/adapter.py",
        "    _is_secret_shaped_document,\n",
        "",
        "helper import removed",
    )

    # ------------------------------------------------------------------
    print("\n=== 7. MUTATION: the NOTE checks fail when the note is reverted ===")
    # This is the check that matters most: if the truthful wording is
    # reverted, the note must stop saying the content was withheld.
    mut_run = tmp / "mut-note"
    mut_run.mkdir(exist_ok=True)
    build_tree(mut_run)
    rm = run_patcher(mut_run)
    check("the mutation tree patched cleanly", rm.returncode == 0)

    # Revert ONLY the wording, keep everything else.
    src = (mut_run / "gateway/run.py").read_text()
    reverted = src.replace(
        """        if outcome.get("included"):
            return (
                f"[The user sent a text document: '{display_name}'. "
                f"Its content has been included below. "
                f"The file is also saved at: {agent_path}]"
            )
""",
        """        return (
            f"[The user sent a text document: '{display_name}'. "
            f"Its content has been included below. "
            f"The file is also saved at: {agent_path}]"
        )
""",
    )
    check("the mutation was applied", reverted != src)
    (mut_run / "gateway/run.py").write_text(reverted)
    note_mut = extract_note_builder(mut_run / "gateway/run.py")
    n_mut = note_mut("key.pem", "/cache/doc.pem", "text/plain",
                     {"included": False, "reason": "it looks like it holds a secret"})
    check("with the truthful wording reverted the note LIES again",
          "has been included below" in n_mut, n_mut)

    # ------------------------------------------------------------------
    print("\n=== 8. the secret guard still withholds a real key ===")
    pem = make_throwaway_key()
    marker = pem.splitlines()[1][:24]
    check("the throwaway key has a detectable body", len(marker) > 10)

    # The guard helper itself, executed.
    is_secret = extract_is_secret_shaped_document(base_py)

    key_file = tmp / "throwaway.pem"
    key_file.write_text(pem)
    check("a .pem file is secret-shaped",
          is_secret(str(key_file), "throwaway.pem", "text/plain"))
    plain = tmp / "plain.txt"
    plain.write_text("an ordinary note about agidi\n")
    check("an ordinary .txt is NOT secret-shaped",
          not is_secret(str(plain), "plain.txt", "text/plain"))

    # ------------------------------------------------------------------
    print("\n=== 9. the outcome survives a merged pending event ===")
    merge_fn = None
    for node in ast.parse(base_py.read_text()).body:
        if isinstance(node, ast.FunctionDef) and node.name == "merge_document_outcomes":
            merge_fn = extract_from_source(base_py, "merge_document_outcomes")
            break
    check("the merge helper exists", merge_fn is not None)
    if merge_fn is not None:
        class _E:
            def __init__(self, md):
                self.metadata = md
        existing = _E({})
        incoming = _E({"hermes_document_outcomes": {"/cache/a.pem": {"included": False, "reason": "r"}}})
        merge_fn(existing, incoming)
        merged = existing.metadata.get("hermes_document_outcomes")
        check("the merge carries the outcome onto the existing event",
              bool(merged) and "/cache/a.pem" in merged, str(existing.metadata))

    # ------------------------------------------------------------------
    shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n{'=' * 60}")
    print(f"{PASSED} passed, {FAILED} failed")
    if FAILED:
        print("SOME TESTS FAILED")
    print("=" * 60)
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
