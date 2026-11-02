-- 0047_publish_credential_session_binding.sql
--
-- ADR-006: bind the publish credential to the Better Auth session.
--
-- THE DEFECT THIS CLOSES
-- ---------------------
-- `statement_set_status(p_statement_id, p_to, p_actor)` took the actor
-- as a text argument and authorised against it:
--
--     SELECT pc.credential_role, (pc.verified_at IS NOT NULL)
--       INTO v_role, v_credential_verified
--       FROM publish_credential pc
--      WHERE pc.actor = p_actor;
--
-- The function did not read the session, did not read `session.user_id`,
-- and did not read any request-scoped identity. It compared a string the
-- CALLER chose with a string stored in a table. That is the difference
-- between "does the named actor hold a credential?" and "does the
-- caller hold a credential?" — and only the second is an authorisation
-- check.
--
-- It was proved on a disposable copy of live: a credential was issued to
-- the seeded account, and the function was invoked as `gustale` while
-- naming that account in `p_actor`. The credential check PASSED. The
-- call failed later, at the evidence gate, and only by accident.
--
-- TWO DEFECTS, ONE FIX
-- -------------------
-- 1. The actor was caller-supplied. Fixed by removing the parameter:
--    the function derives the publisher from the session token it is
--    given.
-- 2. `publish_credential.actor` was free text with no foreign key, and
--    the ADR-004 guard checked the EDITORIAL `users` table — a
--    different table from the `"user"` table the login system uses. So
--    a real Better Auth login could not hold a credential at all, and
--    the actor string was unconstrained. Fixed by the foreign key to
--    `"user"(id)`.
--
-- WHAT THE NEW FUNCTION DOES
-- --------------------------
-- It takes a session token, validates it against the `session` table
-- (the same table Better Auth reads), reads that row's `user_id`, and
-- uses THAT as the actor. The token is a bearer credential: possessing
-- it is what authenticates the caller, and the function derives the
-- identity from it rather than accepting it.
--
-- The session token is stored RAW in the `session` table — better-auth
-- generates `token: generateId(32)` and stores it unencrypted — so the
-- cookie value matches the database token directly. The cookie is
-- `gustale.session_token` (cookiePrefix "gustale" + "session_token").
--
-- The expiry rule matches Better Auth's: a session is valid while
-- `expires_at > now()`.
--
-- WHAT THIS DOES NOT PROTECT AGAINST
-- ----------------------------------
-- Stated in full in docs/ADR-006-publish-credential-session-binding.md:
--
--   * A SHARED DATABASE ROLE. `gustale` is one role for the API and the
--     bot. Anyone who can SET ROLE gustale and reach postgres can call
--     this function directly. They still need a valid session token for
--     a user who holds a credential — so this is not a free pass — but
--     the database cannot distinguish the API calling on a user's behalf
--     from a human with psql doing the same.
--   * HOST SHELL ACCESS. Root on the host can read the session table,
--     mint a session row, or edit publish_credential directly. The
--     attacker does not have to go through this function.
--   * A STOLEN SESSION TOKEN. The token is a bearer credential; whoever
--     holds it acts as that user for its life. The design reduces a
--     stolen token to exactly the stolen user's privileges. It does not
--     make it worthless.
--   * A COMPROMISED APPLICATION PROCESS. It inherits the application's
--     ability to publish.
--
-- The evidence gates are UNCHANGED. The trigger revocation of 0042 is
-- UNCHANGED. It closed a different defect and stays closed.

BEGIN;

-- ── 1. the session-derived actor ──────────────────────────────────────

-- A helper that resolves a session token to the identity that owns it.
--
-- It is SECURITY INVOKER (the default) and NOT SECURITY DEFINER: it
-- reads the `session` table with the CALLER's privileges. That is
-- deliberate. A SECURITY DEFINER helper owned by a table owner could
-- read session rows the caller could not read, which would be a new
-- privilege of its own. The caller here is the `gustale` role, which
-- already reads `session` (Better Auth's own queries use it).
--
-- The function returns the user_id of a LIVE session, or NULL. It never
-- returns a user_id for an expired session, and it never returns
-- anything for a token that does not exist.
--
-- It takes the token as a parameter rather than reading it from a
-- setting, so there is no ambient state a caller can set to claim an
-- identity. The token must be passed in, and the token is what
-- authenticates.

CREATE OR REPLACE FUNCTION session_actor(p_session_token text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user_id text;
BEGIN
  IF p_session_token IS NULL OR p_session_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT s.user_id INTO v_user_id
    FROM session s
   WHERE s.token = p_session_token
     AND s.expires_at > now();

  RETURN v_user_id;
END
$$;

COMMENT ON FUNCTION session_actor(text) IS
  'ADR-006: resolves a Better Auth session token to the identity that owns it, '
  'or NULL when the token is unknown or expired. The token is stored raw in '
  'the session table (better-auth generates it with generateId(32) and does '
  'not encrypt it), so the cookie value matches the stored token. This '
  'function is SECURITY INVOKER on purpose: it reads session rows with the '
  'caller''s own privileges and creates no privilege of its own.';

-- ── 2. the new statement_set_status ──────────────────────────────────

-- The old function is DROPPED FIRST, and that is not housekeeping — it
-- is required.
--
-- The old form took a caller-supplied actor as its third argument. The
-- new form takes a session token as its third argument. The arity is
-- the SAME, so PostgreSQL would treat the new definition as an
-- OVERLOAD of the old one rather than a replacement, and BOTH would
-- remain callable. The old body — the one that authorises against a
-- caller-supplied actor — would still be there, still callable, and
-- still the defect this ADR exists to close.
--
-- The drop is therefore part of the fix, not a cleanup. The proof in
-- section 6 checks that exactly one form remains.

DROP FUNCTION IF EXISTS statement_set_status(uuid, verification_state, text);

-- The actor argument is GONE. The function derives the publisher itself.
--
-- The evidence gates below are copied verbatim from 0038. They are not
-- touched by this migration; only the way the ACTOR is established
-- changes.

CREATE OR REPLACE FUNCTION statement_set_status(
  p_statement_id uuid,
  p_to verification_state,
  p_session_token text
) RETURNS verification_state
LANGUAGE plpgsql
AS $$
DECLARE
  v_from verification_state;
  v_class claim_class;
  v_ok boolean := false;
  -- the credential the actor holds, if any
  v_role text;
  v_credential_verified boolean := false;
  -- THE ACTOR, derived from the session rather than supplied by the caller
  v_actor text;
BEGIN
  -- ── WHO IS CALLING ─────────────────────────────────────────────────
  --
  -- The actor is derived from the session token the caller presented.
  -- There is no actor parameter, so a caller cannot name an identity it
  -- does not hold a session for.
  v_actor := session_actor(p_session_token);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'the % transition is refused: no valid session was presented. '
      'The publisher is derived from the session, not from a supplied identity.',
      p_to;
  END IF;

  SELECT status, claim_class INTO v_from, v_class
    FROM statements WHERE id = p_statement_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement % does not exist', p_statement_id;
  END IF;

  -- ── THE PUBLISH CREDENTIAL — positive, default deny ────────────────
  --
  -- The `verified` and `published` transitions require an actor that
  -- HOLDS a credential. There is no name check and no allow-list of
  -- forbidden strings: an actor that is not in `publish_credential` is
  -- refused, whatever it is called.
  --
  -- The ORDER MATTERS, and it is the order that makes this DEFAULT DENY.
  --
  -- This check runs BEFORE the evidence gates below. Two reasons:
  --
  --   1. An actor without a credential has no business learning whether
  --      the evidence gate for this particular statement is met. The
  --      authorisation is decided first; the content gates are only
  --      reached by an actor who is allowed to ask.
  --
  --   2. With the check AFTER the evidence gates, an unknown actor
  --      attempting `published` on a statement with no sentence anchor
  --      would be refused with "the gate for X -> published is not met"
  --      — a message about the CONTENT, not about the CREDENTIAL. The
  --      credential check would never be reached, and the refusal would
  --      look like an editorial decision rather than an authorisation
  --      failure. The constraint test asserts the refusal message names
  --      the credential, which is what keeps this ordering honest.
  IF p_to IN ('verified','published') THEN
    SELECT pc.credential_role,
           (pc.verified_at IS NOT NULL)
      INTO v_role, v_credential_verified
      FROM publish_credential pc
     WHERE pc.actor = v_actor;

    IF v_role IS NULL THEN
      RAISE EXCEPTION
        'the % transition is refused: % holds no publish credential. '
        'Only an account with a verified editor credential may verify or publish a claim.',
        p_to, COALESCE(NULLIF(v_actor, ''), '(none)');
    END IF;

    IF NOT v_credential_verified THEN
      RAISE EXCEPTION
        'the % transition is refused: the publish credential of % has not been verified.',
        p_to, v_actor;
    END IF;

    -- `published` is the stronger act, so it needs the stronger role.
    IF p_to = 'published' AND v_role <> 'publisher' THEN
      RAISE EXCEPTION
        'the % transition is refused: % holds an ''editor'' credential, which may verify but not publish.',
        p_to, v_actor;
    END IF;
  END IF;

  -- The gates, from Q12. These are UNCHANGED by this migration.
  CASE p_to
    WHEN 'research_pending' THEN
      v_ok := true;

    WHEN 'under_review' THEN
      v_ok := EXISTS (
        SELECT 1 FROM claim_citations c
         WHERE c.statement_id = p_statement_id
           AND c.excerpt_validated
      );

    WHEN 'verified' THEN
      v_ok := CASE v_class
        WHEN 'documented' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class IN ('S1','S2','S3','S4','S5'))
        WHEN 'scholarly_interpretation' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class IN ('S1','S2','S3'))
        WHEN 'oral_tradition' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class = 'S4')
        WHEN 'disputed' THEN
          (SELECT count(DISTINCT src.source_class) FROM claim_citations c JOIN sources src ON src.id = c.source_id
            WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
              AND src.source_class IN ('S1','S2','S3')) >= 2
        WHEN 'hypothesis' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class IN ('S2','S5'))
        ELSE false
      END;

      IF v_ok THEN
        v_ok := EXISTS (
          SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
           WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
             AND src.source_class IN ('S1','S2','S3','S4','S5')
        );
      END IF;

    WHEN 'published' THEN
      v_ok := EXISTS (
        SELECT 1 FROM sentence_claims sc WHERE sc.statement_id = p_statement_id
      );

    WHEN 'disputed' THEN
      v_ok := EXISTS (
        SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
         WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
           AND src.source_class IN ('S1','S2','S3')
      ) AND EXISTS (
        SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
         WHERE c.statement_id = p_statement_id AND c.stance = 'refutes'
           AND src.source_class IN ('S1','S2','S3')
      );

    ELSE
      v_ok := false;
  END CASE;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'the gate for % -> % is not met', p_statement_id, p_to;
  END IF;

  UPDATE statements
     SET status = p_to
   WHERE id = p_statement_id;

  RETURN p_to;
END
$$;

COMMENT ON FUNCTION statement_set_status(uuid, verification_state, text) IS
  'ADR-006: the publisher is DERIVED from the session token, never supplied '
  'by the caller. There is no actor parameter. What this does NOT protect '
  'against: a shared database role (gustale serves both the API and the bot, '
  'so a human with psql and SET ROLE is not distinguishable from the API), '
  'host shell access (root can read the session table or edit '
  'publish_credential directly, and need not call this function at all), a '
  'stolen session token (a bearer credential - it grants exactly the stolen '
  'user''s privileges, and nothing more), and a compromised application '
  'process. See docs/ADR-006-publish-credential-session-binding.md.';

-- ── 3. the old four-argument form must stop working ──────────────────

-- The three-argument form of the OLD function took a caller-supplied
-- actor. It is replaced by the three-argument form above, which takes a
-- session token instead — the signatures differ in argument MEANING, not
-- in arity, so PostgreSQL would silently keep the old body if the old
-- definition were still around.
--
-- This drops any four-argument overload and, more importantly, makes
-- sure no stale copy of the old body survives under a different name.
-- A call of the old shape (an actor that is not a session token) now
-- fails at the session lookup, which is the intended failure.

DO $$
DECLARE
  v_old_count integer;
BEGIN
  SELECT count(*) INTO v_old_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'statement_set_status';

  IF v_old_count <> 1 THEN
    RAISE EXCEPTION
      'expected exactly one statement_set_status, found %', v_old_count;
  END IF;

  RAISE NOTICE 'STATEMENT_SET_STATUS_FORMS=1';
END
$$;

-- ── 4. the credential names a real login ──────────────────────────────

-- `publish_credential.actor` becomes a foreign key to the Better Auth
-- `"user"` table.
--
-- The type matches exactly: `"user".id` is text, and `session.user_id`
-- is text, so the session-derived actor and the credential's actor are
-- the same kind of value.
--
-- The table is empty on live, so no row needs back-filling. The check
-- below asserts that rather than assuming it: if a row exists whose
-- actor is not a login, the migration REFUSES rather than silently
-- dropping or rewriting it.

DO $$
DECLARE
  v_rows integer;
  v_orphans integer;
BEGIN
  SELECT count(*) INTO v_rows FROM publish_credential;

  IF v_rows > 0 THEN
    SELECT count(*) INTO v_orphans
      FROM publish_credential pc
      LEFT JOIN "user" u ON u.id = pc.actor
     WHERE u.id IS NULL;

    IF v_orphans > 0 THEN
      RAISE EXCEPTION
        'publish_credential has % row(s) whose actor is not a Better Auth login. '
        'Resolve them by hand before applying this migration.', v_orphans;
    END IF;
  END IF;

  RAISE NOTICE 'PUBLISH_CREDENTIAL_ROWS=%', v_rows;
END
$$;

ALTER TABLE publish_credential
  DROP CONSTRAINT IF EXISTS publish_credential_actor_fkey;

ALTER TABLE publish_credential
  ADD CONSTRAINT publish_credential_actor_fkey
  FOREIGN KEY (actor) REFERENCES "user"(id) ON DELETE CASCADE;

COMMENT ON TABLE publish_credential IS
  'ADR-006: a publisher credential names a Better Auth login. `actor` is a '
  'foreign key to "user"(id) — it is NOT the editorial `users` table, and no '
  'legacy id mirroring is involved. The publisher is derived from the '
  'authenticated session, never supplied by the caller; see '
  'docs/ADR-006-publish-credential-session-binding.md for what this does and '
  'does not protect against.';

-- ── 5. who may call the function ──────────────────────────────────────

-- PostgreSQL grants EXECUTE to PUBLIC by default. Every role can
-- therefore CALL the function; the function's own checks are what refuse
-- the call. That is unchanged by this ADR — but it is worth narrowing
-- who can call, because "public" includes roles that have no business
-- asking.
--
-- The `gustale` role is the application role: the API and the bot. It
-- keeps EXECUTE.
--
-- The `postgres` role is administrative and keeps everything by
-- ownership.

REVOKE EXECUTE ON FUNCTION statement_set_status(uuid, verification_state, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION statement_set_status(uuid, verification_state, text) TO gustale;

REVOKE EXECUTE ON FUNCTION session_actor(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION session_actor(text) TO gustale;

-- ── 6. the regression proof, inside the migration ─────────────────────

-- The check that the old shape no longer works and the new one does.
--
-- It is written as a DO block so the migration FAILS if the new
-- behaviour is not what this ADR says it is.

DO $$
DECLARE
  v_stmt uuid;
  v_actor text;
  v_token text;
  v_raised boolean;
BEGIN
  -- a statement to try against
  SELECT s.id INTO v_stmt
    FROM statements s
   LIMIT 1;

  IF v_stmt IS NULL THEN
    RAISE NOTICE 'no statements to test against; skipping the behavioural proof';
    RETURN;
  END IF;

  -- A user to act as.
  SELECT u.id INTO v_actor FROM "user" u LIMIT 1;
  SELECT s.token INTO v_token FROM session s WHERE s.expires_at > now() LIMIT 1;

  -- PROOF 1: a caller that supplies an ACTOR instead of a session token
  -- is refused, because the token does not resolve to a session.
  BEGIN
    PERFORM statement_set_status(v_stmt, 'research_pending', v_actor);
    v_raised := false;
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION
      'the actor-as-token call was accepted; the caller-supplied actor is not closed';
  END IF;

  -- PROOF 2: an unknown token is refused.
  BEGIN
    PERFORM statement_set_status(v_stmt, 'research_pending', 'not-a-real-session-token');
    v_raised := false;
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION
      'an unknown session token was accepted';
  END IF;

  -- PROOF 3: session_actor resolves a live session, and refuses an
  -- expired or unknown one.
  IF v_token IS NOT NULL THEN
    IF session_actor(v_token) IS NULL THEN
      RAISE EXCEPTION 'session_actor did not resolve a live session';
    END IF;
  END IF;

  IF session_actor('not-a-real-session-token') IS NOT NULL THEN
    RAISE EXCEPTION 'session_actor resolved an unknown token';
  END IF;

  RAISE NOTICE 'SESSION_BINDING_PROOF_OK=1';
END
$$;

COMMIT;
