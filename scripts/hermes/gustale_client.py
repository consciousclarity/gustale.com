#!/usr/bin/env python3
"""
Gustale API client for Hermes (project-bot operations).

Use from the repo (or anywhere with network access to api.gustale.recipes):

  from gustale_client import signin, api
  signin()
  api("PATCH", "/api/dishes/nasi-goreng", body={"longDescription": "..."})

SECURITY RULES (learned 2026-10-16):
  - Never print, log, or send tokens, cookies, or passwords — not even partially.
  - Never include any secrets in this file. Credentials are read from
    /home/hermes/.hermes/.hermes/.env at runtime (GUSTALE_API_BASE,
    GUSTALE_API_EMAIL, GUSTALE_API_PASSWORD).
  - The signin() function returns the email and role, NEVER the token.
  - On 401, signin() re-authenticates once; never echo the new token.

WHY HTTPS-ONLY:
  The session cookies are `Secure`-flagged. They will not travel over
  HTTP, so this client always uses the public HTTPS endpoint
  (https://api.gustale.recipes) and the requests library sends them
  with the cookie jar. The env value GUSTALE_API_BASE is documentation
  only; the client hardcodes the HTTPS base.

API SHAPE NOTES:
  - PATCH endpoint uses cookies, not the bearer token returned by signin.
    Cookies must travel on the same HTTPS connection that set them.
  - PATCH `/api/dishes/:slug` takes full-replace semantics for
    `categories` and `tagIds` — the client sends the complete desired set.
  - The bearer token from signin is generally NOT accepted; rely on
    cookies. (This is intentional server-side config, not a bug to fix.)
"""

import json
import os
import sys
import time
from pathlib import Path

import requests

ENV_FILE = Path("/home/hermes/.hermes/.env")
ORIGIN = "https://gustale.com"
PUBLIC_BASE = "https://api.gustale.recipes"

# Module-level state (per-process; restart process to force re-signin).
_session: requests.Session | None = None
_email: str | None = None
_password: str | None = None  # never echoed, never logged


def _load_env() -> None:
    """Read GUSTALE_API_EMAIL and GUSTALE_API_PASSWORD from the env file.
    No-op after the first call. Never logs the values.
    """
    global _email, _password
    if _email and _password:
        return
    if not ENV_FILE.is_file():
        raise RuntimeError(f"env file not found: {ENV_FILE}")
    env = {}
    with ENV_FILE.open() as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    _email = env.get("GUSTALE_API_EMAIL")
    _password = env.get("GUSTALE_API_PASSWORD")
    if not _email or not _password:
        raise RuntimeError(
            "GUSTALE_API_EMAIL / GUSTALE_API_PASSWORD missing in env file"
        )


def _has_session_cookie() -> bool:
    if _session is None:
        return False
    return any(c.name == "__Secure-gustale.session_token" for c in _session.cookies)


def signin(force: bool = False) -> dict:
    """Sign in once, cache the session. Returns the sign-in body
    (email + role + displayName — NEVER the token).
    Re-signin is automatic on 401 inside api().
    """
    global _session
    _load_env()
    if _session is not None and _has_session_cookie() and not force:
        return {"email": _email, "note": "session reused"}
    s = requests.Session()
    last_err = None
    for attempt in range(4):
        try:
            r = s.post(
                f"{PUBLIC_BASE}/api/auth/sign-in/email",
                data=json.dumps({"email": _email, "password": _password}),
                headers={"Origin": ORIGIN, "Content-Type": "application/json"},
                timeout=15,
            )
            if r.status_code == 429:
                time.sleep(3 + attempt * 2)
                continue
            r.raise_for_status()
            body = r.json()
            # Confirm a session cookie was set, but don't echo it.
            if not any(c.name == "__Secure-gustale.session_token" for c in s.cookies):
                raise RuntimeError("signin response did not set session cookie")
            _session = s
            # Return only the safe fields; never the token.
            user = body.get("user", {})
            return {
                "email": user.get("email"),
                "role": user.get("role"),
                "id": user.get("id"),
                "displayName": user.get("displayName"),
            }
        except requests.HTTPError as e:
            last_err = e
            time.sleep(2)
    raise last_err or RuntimeError("signin failed")


def api(method: str, path: str, body=None, params=None, timeout: int = 15):
    """Authenticated API call. Returns parsed JSON or raw text.
    Re-signs once on 401; backs off on 429.
    """
    global _session
    _load_env()
    if not _has_session_cookie():
        signin()
    url = PUBLIC_BASE + path
    last_err = None
    last_resp = None
    for attempt in range(3):
        try:
            r = _session.request(
                method,
                url,
                json=body,
                params=params,
                headers={"Origin": ORIGIN, "Content-Type": "application/json"},
                timeout=timeout,
            )
            if r.status_code == 401:
                # Token expired or revoked; re-signin (user must have
                # re-enabled the token in their env file).
                _session = None
                signin(force=True)
                continue
            if r.status_code == 429:
                time.sleep(2 + attempt * 2)
                continue
            r.raise_for_status()
            if not r.content:
                return None
            try:
                return r.json()
            except json.JSONDecodeError:
                return r.text
        except requests.HTTPError as e:
            last_err = e
            last_resp = e.response
            if 500 <= e.response.status_code < 600:
                time.sleep(1 + attempt)
                continue
            try:
                body_text = e.response.text[:500]
            except Exception:
                body_text = "(no body)"
            raise RuntimeError(
                f"{method} {path} -> {e.response.status_code}: {body_text}"
            ) from e
    if last_err:
        try:
            body_text = (last_resp.text if last_resp is not None else "")[:500]
        except Exception:
            body_text = ""
        raise RuntimeError(
            f"{method} {path} -> {last_err.response.status_code if last_err.response else '?'}: {body_text}"
        )
    raise RuntimeError(f"api({method} {path}) failed after retries")


if __name__ == "__main__":
    body = signin()
    print(f"signed in as: {body.get('email')} (role={body.get('role')}, id={body.get('id')})")
    s = api("GET", "/api/auth/get-session")
    sess = (s or {}).get("session", {})
    print(f"session expires: {sess.get('expiresAt')}, userId: {sess.get('userId')}")
    d = api("GET", "/api/dishes/nasi-goreng")
    print(f"nasi-goreng: longDescription has {len((d.get('dish',{}).get('longDescription') or ''))} chars")
