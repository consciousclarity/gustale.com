#!/usr/bin/env python3
"""The populator's CONTAINER must follow the TARGET, not the machine.

THE DEFECT THIS PROVES ABSENT
------------------------------
`psql_command` used to ask "is the `shared-postgres` container here?"
and use the answer to choose the container. On the production host --
which IS the host that has that container -- EVERY target resolved to
the production cluster, including throwaway databases. So a scratch
database was created and written ON THE PRODUCTION CLUSTER, which hosts
the live database and five other projects' databases.

These cases drive `psql_command` directly and assert which container
the command names.

Usage:
    python3 scripts/test-populator-target.py
"""
from __future__ import annotations

import os
import sys
from contextlib import contextmanager
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))
sys.path.insert(0, str(REPO / "scripts" / "lib"))

import populate_description_sentences as pop  # noqa: E402

FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}  {detail}")
        FAILURES.append(name)


#: The `docker exec` flags that take a value of their own.
_EXEC_VALUE_FLAGS = {"-u", "--user", "-e", "--env", "-w", "--workdir"}


def container_of(cmd: list[str]) -> str:
    """The container a `docker exec` command names, or ''.

    The container is the first token after `exec` that is not a flag
    and not a flag's VALUE. `-u postgres` is one flag and one value, so
    `postgres` is not the container.
    """
    if "docker" not in cmd:
        return ""
    try:
        i = cmd.index("exec")
    except ValueError:
        return ""
    tokens = cmd[i + 1:]
    j = 0
    while j < len(tokens):
        token = tokens[j]
        if token in _EXEC_VALUE_FLAGS:
            j += 2
            continue
        if token.startswith("-"):
            j += 1
            continue
        return token
    return ""


#: The environment variables that decide the populator's path. They are
#: CLEARED for every case, so the test does not depend on the shell it
#: happens to run in. An ambient `CHAIN_MODE=ci` or `PGUSER` would
#: otherwise make every case pass or fail for the wrong reason.
_PATH_ENV = (
    "CHAIN_MODE",
    "PG_HOST",
    "PG_PORT",
    "PGUSER",
    "PGPASSWORD",
    "GUSTALE_TEST_PG_CONTAINER",
    "GUSTALE_TEST_PG_PORT",
    "DATABASE_URL",
)


@contextmanager
def clean_env(**overrides: str):
    """The decision variables cleared, with the given overrides applied."""
    saved = {k: os.environ.get(k) for k in _PATH_ENV}
    for k in _PATH_ENV:
        os.environ.pop(k, None)
    os.environ.update(overrides)
    try:
        yield
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


@contextmanager
def with_env(env: dict[str, str]):
    saved = dict(os.environ)
    os.environ.update(env)
    try:
        yield
    finally:
        os.environ.clear()
        os.environ.update(saved)


@contextmanager
def containers(present: set[str]):
    """Stub the container probe: only these containers 'exist'."""
    real = pop._container_exists
    pop._container_exists = lambda name: name in present
    try:
        yield
    finally:
        pop._container_exists = real


def main() -> int:
    print("=== the container follows the TARGET, not the machine ===")

    # The THREE machine shapes this script can run on.
    #
    #   HOST      -- the production host: docker, the PRODUCTION
    #                container, and the dedicated test Postgres.
    #   RUNNER    -- a GitHub CI runner: docker, NEITHER container, and
    #                Postgres as a service on 127.0.0.1.
    #   TESTONLY  -- a dev box: docker and the dedicated test Postgres.
    HOST = {"shared-postgres", "gustale-test-postgres"}
    RUNNER: set[str] = set()
    TESTONLY = {"gustale-test-postgres"}

    # 1. A THROWAWAY target must NEVER resolve to the production
    #    container -- on ANY machine shape. This is the defect.
    for shape_name, shape in (("host", HOST), ("test-only", TESTONLY)):
        with clean_env(), containers(shape):
            cmd = pop.psql_command("gustale_pr3_assert_test")
        check(
            f"a throwaway target does not name production ({shape_name})",
            container_of(cmd) != "shared-postgres",
            f"got {container_of(cmd)!r}",
        )
    with clean_env(), containers(TESTONLY):
        cmd = pop.psql_command("gustale_pr3_assert_test")
    check(
        "a throwaway target names the dedicated test container",
        container_of(cmd) == "gustale-test-postgres",
        f"got {container_of(cmd)!r}",
    )

    # 2. The LIVE target must still reach the production container.
    #    (The guard refuses the live name before this, so this is the
    #    shape an APPROVED live operation gets.)
    with clean_env(), containers(HOST):
        cmd = pop.psql_command("gustale")
    check(
        "the live target names the production container",
        container_of(cmd) == "shared-postgres",
        f"got {container_of(cmd)!r}",
    )

    # 3. CHAIN_MODE=ci must still use the service path.
    with clean_env(CHAIN_MODE="ci", PG_HOST="127.0.0.1", PG_PORT="5432"), containers(HOST):
        cmd = pop.psql_command("gustale_ci")
    check(
        "CHAIN_MODE=ci uses a local psql client, not docker",
        "docker" not in cmd,
        f"got {cmd}",
    )
    check(
        "CHAIN_MODE=ci uses the CI's port",
        "5432" in cmd,
        f"got {cmd}",
    )

    # 4. An environment variable that names the production container as
    #    the TEST container must be REFUSED, not obeyed.
    with clean_env(GUSTALE_TEST_PG_CONTAINER="shared-postgres"), containers(TESTONLY):
        try:
            cmd = pop.psql_command("gustale_pr3_assert_test")
            refused = False
        except pop.db_guard.ProductionContainerRefused:
            refused = True
            cmd = []
    check(
        "an env var naming production as the test container is REFUSED",
        refused,
        f"got {cmd}",
    )

    # 5. And the refusal must not block the LIVE target: the live path
    #    is the one thing that legitimately reaches production.
    with clean_env(GUSTALE_TEST_PG_CONTAINER="shared-postgres"), containers(HOST):
        try:
            pop.psql_command("gustale")
            reached = True
        except Exception:
            reached = False
    check(
        "the live target still reaches production (the env var does not block it)",
        reached,
    )

    # 6. THE CI RUNNER'S SHAPE: docker is present, NEITHER container is.
    #    This is the shape a GitHub runner has -- and it is the shape the
    #    CI workflow actually runs the populator in, because ci.yml does
    #    NOT set CHAIN_MODE. It must use a local psql on the CI service.
    with clean_env(), containers(RUNNER):
        cmd = pop.psql_command("gustale_ci")
    check(
        "a CI runner (docker, no containers) uses a local psql client",
        "docker" not in cmd,
        f"got {cmd}",
    )
    check(
        "a CI runner connects to the CI service on 5432",
        "5432" in cmd,
        f"got {cmd}",
    )
    check(
        "a CI runner connects as the bot role 'gustale'",
        "gustale" in cmd,
        f"got {cmd}",
    )

    # 7. THE PRODUCTION HOST with NO test container: there is no safe
    #    target here -- the only local Postgres is production's -- so the
    #    script must REFUSE rather than guess.
    with clean_env(), containers({"shared-postgres"}):
        try:
            pop.psql_command("gustale_pr3_assert_test")
            refused = False
        except pop.db_guard.ProductionContainerRefused:
            refused = True
    check(
        "the production host with no test container REFUSES rather than guessing",
        refused,
    )

    print()
    if FAILURES:
        print(f"FAILED: {len(FAILURES)} case(s): {', '.join(FAILURES)}")
        return 1
    print("POPULATOR_TARGET_OK=1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
