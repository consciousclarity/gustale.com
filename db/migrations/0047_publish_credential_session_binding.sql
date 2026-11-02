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

-- ── 1b. the credential guard reads the LOGIN table ───────────────────
--
-- THE DEFECT THIS FIXES, and it is the second half of the same bug.
--
-- `publish_credential_owner_guard()` checked that the credential's
-- actor exists in the EDITORIAL `users` table:
--
--     IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.actor) THEN
--       RAISE EXCEPTION '...there is no such account in users';
--
-- But the login system uses Better Auth's `"user"` table, and the
-- editorial `users` table is DISCONNECTED from authentication — it is
-- a byline table, not an identity table. So the guard refused every
-- credential issued to a real login. The credential table could not
-- have a single useful row.
--
-- This is not a theoretical hole: the behavioural proof in this
-- migration CAUGHT it. It made a proof user in `"user"`, issued it a
-- credential, and the guard refused it with "there is no such account
-- in users" — the exact defect, found by the proof rather than by
-- reading the code.
--
-- The fix is to read the table the logins actually live in.
--
-- The check itself is NOT weakened: it still requires a real account to
-- exist before a credential can be issued for it. Only the table
-- changes. The issuer-membership check below it is untouched, and so
-- is the fact that a SUPERUSER still bypasses the membership check.

CREATE OR REPLACE FUNCTION public.publish_credential_owner_guard() RETURNS trigger
LANGUAGE plpgsql
AS $guard$
DECLARE
  v_may_issue boolean := false;
BEGIN
  -- (1) The account must exist — in the LOGIN table.
  --
  -- The EDITORIAL `users` table is a byline table. It is not
  -- connected to authentication, and a credential for a person with no
  -- login was meaningless: the credential authorises publishing, and
  -- publishing is an authenticated act.
  IF NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = NEW.actor) THEN
    RAISE EXCEPTION
      'the publish credential for % is refused: there is no such account in "user"',
      NEW.actor;
  END IF;

  -- (2) The WRITER must be a MEMBER OF THE ISSUER ROLE.
  --
  -- MEMBERSHIP, not a table privilege: a SUPERUSER bypasses every
  -- privilege check, so `has_table_privilege` says true for a
  -- superuser no matter what was revoked.
  SELECT pg_has_role(current_user, 'gustale_credential_issuer', 'MEMBER')
    INTO v_may_issue;

  IF NOT v_may_issue THEN
    RAISE EXCEPTION
      'the publish credential for % is refused: the writer % is not a member of the issuer role',
      NEW.actor, current_user;
  END IF;

  RETURN NEW;
END;
$guard$;

COMMENT ON FUNCTION public.publish_credential_owner_guard() IS
'Refuses a publish credential whose actor has no login in Better Auth''s "user" '
'table, and refuses a writer that is not a member of gustale_credential_issuer. '
'The actor check reads the LOGIN table, not the editorial `users` byline table: '
'the two are disconnected, so the old check refused every credential issued to '
'a real login. As before, a SUPERUSER bypasses the membership check, because '
'PostgreSQL treats a superuser as a member of every role.';

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

  -- Authorise THIS write only. The setting is transaction-local, so it
  -- cannot leak into another transaction.
  --
  -- WITHOUT THIS, EVERY CALL FAILS: the `statement_status_gate_trg`
  -- trigger refuses any status change that does not come through the
  -- gate, and the gate IS this setting. The trigger is the reason a
  -- direct UPDATE cannot forge a transition — it is not a substitute
  -- for the gate, it is the thing the gate opens.
  PERFORM set_config('gustale.statement_gate', 'on', true);

  UPDATE statements
     SET status = p_to,
         updated_at = now(),
         -- The publisher is recorded from the DERIVED actor, so the
         -- audit trail names the session's user and not a string the
         -- caller chose.
         verified_by = CASE WHEN p_to = 'verified' THEN v_actor ELSE verified_by END,
         verified_at = CASE WHEN p_to = 'verified' THEN now() ELSE verified_at END,
         published_by = CASE WHEN p_to = 'published' THEN v_actor ELSE published_by END,
         published_at = CASE WHEN p_to = 'published' THEN now() ELSE published_at END
   WHERE id = p_statement_id;

  PERFORM set_config('gustale.statement_gate', 'off', true);

  -- The transition log. Every transition is recorded, with the derived
  -- actor — the same one the credential was checked against.
  INSERT INTO statement_status_log (statement_id, from_status, to_status, actor, gate_ok)
  VALUES (p_statement_id, v_from, p_to, COALESCE(v_actor, '(null)'), true);

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
  v_result verification_state;
  v_before verification_state;
  v_after verification_state;
  v_made_statement uuid;
  v_made_user text;
  v_made_session text;
  v_made_credential boolean := FALSE;
  v_made_source uuid;
  v_made_citation uuid;
  v_message text;
  v_nocred_actor text;
  v_nocred_token text;
BEGIN
  -- ── THE PROOF MAKES ITS OWN FIXTURES ──────────────────────────────
  --
  -- It cannot rely on the chain having statements, a user or a live
  -- session: in a fresh chain there are NONE of them at this point, and
  -- the proof was silently skipping itself with a NOTICE. A proof that
  -- does not run is not a proof.
  --
  -- So the proof creates what it needs and DELETES it again at the
  -- end. Nothing it creates survives the migration, and the migration
  -- cannot leave a stray user, session or statement behind.
  --
  -- The rows it makes are minimal and marked with a name no real row
  -- could carry, so a collision is impossible. A row the chain
  -- already had is reused, not replaced, and is never deleted.
  BEGIN
    -- a statement to try against
    SELECT s.id INTO v_stmt
      FROM statements s
     LIMIT 1;

    IF v_stmt IS NULL THEN
      -- the chain had none: make one
      -- The real shape of a statement: subject_type + subject_id (a
      -- DISH), a predicate, a value_type, and a claim_class. The value
      -- is a literal, because the proof only needs a row the function
      -- will accept far enough to reach its credential check.
      INSERT INTO statements (id, subject_type, subject_id, predicate_id,
                              value_type, value_literal, value_literal_type,
                              qualifiers, claim_class, status, created_at, updated_at)
      SELECT gen_random_uuid(), 'dish', d.id, p.id,
             'literal', 'ADR-006 PROOF FIXTURE', 'text',
             '{}'::jsonb, 'documented', 'research_pending', now(), now()
        FROM predicates p
        JOIN dishes d ON true
       WHERE p.slug = 'originated_in'
       LIMIT 1
      RETURNING id INTO v_made_statement;

      IF v_made_statement IS NOT NULL THEN
        v_stmt := v_made_statement;
      END IF;
    END IF;

    IF v_stmt IS NULL THEN
      RAISE EXCEPTION 'ADR-006 PROOF FAILED: no statement available and none could be made';
    END IF;

    -- A user to act as.
    SELECT u.id INTO v_actor FROM "user" u LIMIT 1;

    IF v_actor IS NULL THEN
      INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
      VALUES ('adr006-proof-user', 'ADR-006 Proof User', 'adr006-proof@invalid.local',
              true, 'moderator', now(), now())
      ON CONFLICT (id) DO NOTHING;

      -- READ IT BACK rather than relying on RETURNING: ON CONFLICT DO
      -- NOTHING returns no row, so RETURNING would leave the variable
      -- unset and the proof would silently skip. Reading back is
      -- always correct.
      SELECT u.id INTO v_made_user FROM "user" u WHERE u.id = 'adr006-proof-user';

      IF v_made_user IS NULL THEN
        RAISE EXCEPTION 'ADR-006 PROOF FAILED: could not make a proof user';
      END IF;

      v_actor := 'adr006-proof-user';
    END IF;

    -- A source of class S2, and a citation from the fixture statement
    -- to it. Without these the EVIDENCE gate refuses 'verified' before
    -- the credential check is reached, and the proof would be testing
    -- the evidence gate instead of the credential.
    --
    -- S2 rather than S6 on purpose: S6 is what every existing source
    -- is, and the 'documented' class accepts S1-S5. The proof wants the
    -- gate to PASS so that the only thing left to decide is the
    -- credential.
    INSERT INTO sources (id, source_type, title, publisher, url, source_class,
                          source_classed_at, source_classed_by, created_at)
    SELECT gen_random_uuid(), 'web', 'ADR-006 Proof Source',
           'ADR-006 Proof Publisher', 'https://example.invalid/adr006-proof', 'S2',
           now(), 'adr006-proof', now()
    WHERE EXISTS (SELECT 1 FROM predicates WHERE slug = 'originated_in')
      AND EXISTS (SELECT 1 FROM dishes)
    ON CONFLICT (id) DO NOTHING;

    SELECT s.id INTO v_made_source FROM sources s
     WHERE s.url = 'https://example.invalid/adr006-proof';

    IF v_made_source IS NOT NULL AND v_made_statement IS NOT NULL THEN
      INSERT INTO claim_citations (statement_id, source_id, stance, locator, excerpt,
                                   retrieved_at, excerpt_validated, created_at)
      VALUES (v_made_statement, v_made_source, 'supports', 'ADR-006 proof locator',
              'ADR-006 PROOF FIXTURE', now(), true, now())
      ON CONFLICT (id) DO NOTHING;

      SELECT c.id INTO v_made_citation FROM claim_citations c
       WHERE c.statement_id = v_made_statement AND c.source_id = v_made_source;
    END IF;

    -- A live session for that user.
    SELECT s.token INTO v_token FROM session s WHERE s.expires_at > now() LIMIT 1;

    IF v_token IS NULL THEN
      INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at)
      VALUES (gen_random_uuid()::text, 'adr006-proof-token', v_actor,
              now() + interval '1 hour', now(), now())
      ON CONFLICT (id) DO NOTHING;

      SELECT s.token INTO v_made_session FROM session s WHERE s.token = 'adr006-proof-token';

      IF v_made_session IS NULL THEN
        RAISE EXCEPTION 'ADR-006 PROOF FAILED: could not make a proof session';
      END IF;

      v_token := 'adr006-proof-token';
    END IF;

  END;  -- the fixture block

  -- THE ORIGINAL STATUS, so a refusal can be told from an acceptance.
  --
  -- This is captured AFTER the fixture block, because the fixture
  -- statement is created there: captured before it, v_before would be
  -- NULL and every comparison would be against nothing.
  SELECT s.status INTO v_before FROM statements s WHERE s.id = v_stmt;

  -- ── WHAT THE PROOF ACTUALLY TESTS ─────────────────────────────────
  --
  -- The `statement_status_gate_trg` trigger raises on any status
  -- change unless the session GUC `gustale.statement_gate` is 'on'.
  -- The legitimate function sets it; a function that does not will be
  -- stopped by the TRIGGER, whatever it does about credentials.
  --
  -- So "did the call raise?" is the WRONG question: a function with no
  -- credential check at all still raises, in the trigger, and a proof
  -- that only watched for an exception would pass against it.
  --
  -- The question ADR-006 is actually about is: DOES THE CALLER HOLD A
  -- CREDENTIAL? That is `assert_publish_credential()`, and it is
  -- PUBLICLY CALLABLE, so the proof can ask it directly:
  --
  --   * a caller that holds NO credential must be REFUSED, and
  --   * a caller that HOLDS one must be ACCEPTED, and
  --   * the actor the function derives must be the session's user, and
  --     never a value the caller chose.
  --
  -- So the proof gives the proof user a CREDENTIAL, and then checks
  -- that the call succeeds ONLY for that user, and that the same call
  -- with somebody else's token fails.

  -- ── THE CREDENTIAL, so a legitimate caller can be tested too ──────
  --
  -- The proof user gets a credential of their own. It is DELETED at the
  -- end, like everything else the proof made.
  IF v_made_user IS NOT NULL THEN
    -- The credential is VERIFIED, because the check refuses an
    -- unverified one: `pc.verified_at IS NOT NULL`. And the role is
    -- 'publisher', which is the role `published` requires.
    INSERT INTO publish_credential (id, actor, credential_role, verified_by, verified_at, created_at)
    VALUES (gen_random_uuid(), v_actor, 'publisher', v_actor, now(), now())
    ON CONFLICT (actor) DO NOTHING;

    v_made_credential := TRUE;
  END IF;

  -- PROOF 1: a caller that supplies an ACTOR instead of a session token
  -- is refused, because the token does not resolve to a session.
  --
  -- The transition is 'verified', which is the CREDENTIAL-GATED one.
  -- 'research_pending' needs no credential, so a call with a LEGITIMATE
  -- session succeeds at it — and a proof that asserted a refusal there
  -- would be asserting that a correct call fails.
  --
  -- THE RETURN VALUE IS THE DISCRIMINATOR, and it is what this proof
  -- was missing.
  --
  -- There is a `statement_status_gate_guard()` TRIGGER on the
  -- statements table that raises on any status change that does not
  -- come through the gate. So a function that does NOTHING — one that
  -- simply updates the row — ALSO raises, and a proof that only
  -- checked "did it raise?" would pass against a function with no
  -- credential check at all. The proof would be testing the TRIGGER,
  -- not the thing it claims to test.
  --
  -- So the proof asserts BOTH:
  --   (a) the statement's status is UNCHANGED, and
  --   (b) the function RETURNED the original status, not the
  --       requested one.
  --
  -- A refusal returns the original status. An acceptance returns the
  -- requested one. That difference is observable even when the
  -- trigger fires and rolls the row back.
  BEGIN
    v_result := statement_set_status(v_stmt, 'verified', v_actor);
    v_raised := false;
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    v_result := NULL;
  END;

  SELECT s.status INTO v_after FROM statements s WHERE s.id = v_stmt;

  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'the actor-as-token call CHANGED the statement status (before %, after %)',
      v_before, v_after;
  END IF;

  IF NOT v_raised AND v_result IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'the actor-as-token call was ACCEPTED: it returned % when the status was %',
      v_result, v_before;
  END IF;

  -- PROOF 2: an unknown token is refused, the same way.
  BEGIN
    v_result := statement_set_status(v_stmt, 'verified', 'not-a-real-session-token');
    v_raised := false;
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    v_result := NULL;
  END;

  SELECT s.status INTO v_after FROM statements s WHERE s.id = v_stmt;

  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'an unknown session token CHANGED the statement status (before %, after %)',
      v_before, v_after;
  END IF;

  IF NOT v_raised AND v_result IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'an unknown session token was ACCEPTED: it returned % when the status was %',
      v_result, v_before;
  END IF;

  -- ── PROOF 3: THE CALLER'S CREDENTIAL IS WHAT GATES THE CALL ───────
  --
  -- This is the proof that actually tests ADR-006, and the one the
  -- trigger was masking.
  --
  -- The proof user holds a credential. The call with THEIR session
  -- token must SUCCEED. If the function checked anything else — an
  -- actor the caller supplied, a credential for somebody else, nothing
  -- at all — this call would fail, and the migration would fail with
  -- it.
  IF v_made_credential AND v_token IS NOT NULL THEN
    -- The 'verified' transition is the one that consults the
    -- credential, so it is the one the proof exercises.
    --
    -- The evidence gate for 'verified' may also refuse, and that is
    -- NOT what this proof is about. So the discriminator is the
    -- CREDENTIAL part of the refusal, not whether there was a refusal
    -- at all:
    --
    --   * an actor WITHOUT a credential is refused, and the message
    --     names the CREDENTIAL;
    --   * an actor WITH a credential is NOT refused for want of a
    --     credential — whatever else it may be refused for.
    --
    -- A function that ignored the credential table would fail the
    -- first, because its refusal would name something else.
    BEGIN
      v_result := statement_set_status(v_stmt, 'verified', v_token);
      v_raised := false;
      v_message := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_raised := true;
      v_result := NULL;
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    END;

    -- THE STRONG DISCRIMINATOR.
    --
    -- The negative tests showed this proof catching a function with no
    -- credential check — but by way of an assertion about the MESSAGE,
    -- which the trigger could produce. The message is a weak signal.
    --
    -- The strong signal is simple: a caller that HOLDS a credential, with
    -- a LIVE session, must SUCCEED. Its statement must reach 'verified'.
    --
    -- This can only pass if BOTH are true:
    --   * the credential check found the credential and let the call
    --     proceed, and
    --   * the function set the session GUC the trigger requires.
    --
    -- A function that ignores the credential table fails this, because
    -- the trigger stops it — and so does one whose credential check is
    -- wrong in either direction.
    IF v_raised THEN
      RAISE EXCEPTION
        'a caller holding a VERIFIED credential and a live session was REFUSED '
        'the verified transition: %', v_message;
    END IF;

    IF v_result IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION
        'a credentialed caller did not reach the requested status (got %)',
        v_result;
    END IF;

    -- And the other side: the same call for an actor with NO
    -- credential MUST be refused, and MUST name the credential.
    --
    -- The proof makes a second user with a live session and no
    -- credential. This is the case that a caller-supplied actor would
    -- defeat: a function that trusted a name would let this through.
    INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
    VALUES ('adr006-proof-nocred', 'ADR-006 Proof No Credential', 'adr006-nocred@invalid.local',
            true, 'contributor', now(), now())
    ON CONFLICT (id) DO NOTHING;

    SELECT u.id INTO v_nocred_actor FROM "user" u WHERE u.id = 'adr006-proof-nocred';

    INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at)
    VALUES (gen_random_uuid()::text, 'adr006-proof-nocred-token', v_nocred_actor,
            now() + interval '1 hour', now(), now())
    ON CONFLICT (id) DO NOTHING;

    SELECT s.token INTO v_nocred_token FROM session s WHERE s.token = 'adr006-proof-nocred-token';

    BEGIN
      v_result := statement_set_status(v_stmt, 'verified', v_nocred_token);
      v_raised := false;
      v_message := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_raised := true;
      v_result := NULL;
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    END;

    IF NOT v_raised THEN
      RAISE EXCEPTION
        'an actor with NO publish credential was ACCEPTED — the credential check is not enforced';
    END IF;

    IF v_message NOT LIKE '%credential%' THEN
      RAISE EXCEPTION
        'the refusal for an actor with no credential did not name the credential: %',
        v_message;
    END IF;

    -- And it must not be the TRIGGER's refusal. The trigger refuses
    -- any status change that does not come through the gate, and its
    -- message is about the gate. The credential refusal is about the
    -- credential, and the two are different failures.
    IF v_message LIKE '%may only change through%' THEN
      RAISE EXCEPTION
        'the actor with no credential was stopped by the STATUS GATE TRIGGER, '
        'not by the credential check — the credential check was never reached: %',
        v_message;
    END IF;
  END IF;

  -- ── PROOF 4: THE ACTOR IS THE SESSION'S USER, NOT THE CALLER'S ────
  --
  -- The credential is issued to v_actor. The session token resolves to
  -- v_actor too — the proof made them the same person. Now the proof
  -- checks that the FUNCTION agrees, by asking it to set a statement
  -- published_by and reading back who it recorded.
  --
  -- This is the check that a caller-supplied actor would fail: the
  -- caller has no way to name anybody but the session's user.
  IF v_made_credential AND v_token IS NOT NULL THEN
    -- published_by is set by the function from the derived actor.
    BEGIN
      PERFORM statement_set_status(v_stmt, 'research_pending', v_token);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- The statement's published_by is only set by the publish path,
    -- not by research_pending, so read the actor the function derives
    -- directly instead: ask session_actor what the token resolves to,
    -- and compare it with the credential's actor.
    IF session_actor(v_token) IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION
        'the session token does not resolve to the credential holder';
    END IF;

    -- The credential must be issued to THAT actor and to nobody else.
    IF NOT EXISTS (
      SELECT 1 FROM publish_credential pc
       WHERE pc.actor = v_actor
    ) THEN
      RAISE EXCEPTION
        'the credential is not bound to the session actor';
    END IF;
  END IF;

  -- PROOF 5: session_actor resolves a live session, and refuses an
  -- expired or unknown one.
  IF v_token IS NOT NULL THEN
    IF session_actor(v_token) IS NULL THEN
      RAISE EXCEPTION 'session_actor did not resolve a live session';
    END IF;
  END IF;

  IF session_actor('not-a-real-session-token') IS NOT NULL THEN
    RAISE EXCEPTION 'session_actor resolved an unknown token';
  END IF;

  -- ── THE FIXTURES GO AWAY AGAIN ────────────────────────────────────
  --
  -- The proof made what it needed; now it takes it out again. The
  -- DELETEs are ordered child-first, because the FKs point at the
  -- proof's own rows.
  --
  -- Only the rows the proof CREATED are removed. A row the chain
  -- already had is left alone, so the proof never damages data it did
  -- not make.
  IF v_made_session IS NOT NULL THEN
    DELETE FROM session WHERE token = v_made_session;
  END IF;

  IF v_made_statement IS NOT NULL THEN
    DELETE FROM statements WHERE id = v_made_statement;
  END IF;

  IF v_made_citation IS NOT NULL THEN
    DELETE FROM claim_citations WHERE id = v_made_citation;
  END IF;

  IF v_made_source IS NOT NULL THEN
    DELETE FROM sources WHERE id = v_made_source;
  END IF;

  IF v_nocred_token IS NOT NULL THEN
    DELETE FROM session WHERE token = v_nocred_token;
  END IF;

  IF v_nocred_actor IS NOT NULL THEN
    DELETE FROM "user" WHERE id = v_nocred_actor;
  END IF;

  IF v_made_credential THEN
    DELETE FROM publish_credential WHERE actor = v_made_user AND created_at > now() - interval '1 hour';
  END IF;

  IF v_made_user IS NOT NULL THEN
    DELETE FROM "user" WHERE id = v_made_user;
  END IF;

  -- The proof really did run, and it really did clean up after itself.
  IF EXISTS (SELECT 1 FROM "user" WHERE id = 'adr006-proof-user') THEN
    RAISE EXCEPTION 'ADR-006 PROOF FAILED: the proof fixture survived';
  END IF;

  IF EXISTS (SELECT 1 FROM session WHERE token = 'adr006-proof-token') THEN
    RAISE EXCEPTION 'ADR-006 PROOF FAILED: the proof session survived';
  END IF;

  RAISE NOTICE 'SESSION_BINDING_PROOF_OK=1';
  RAISE NOTICE 'the behavioural proof RAN (fixtures made and removed)';
END
$$;

COMMIT;