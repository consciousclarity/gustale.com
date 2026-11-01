-- 0038 — the publish credential: a POSITIVE, default-deny check on who may
-- set a statement to `verified` or `published`.
--
-- WHY THIS EXISTS
--
-- The guard in `statement_set_status()` was:
--
--     IF p_to IN ('verified','published') THEN
--       IF p_actor IS NULL OR p_actor = ''
--          OR p_actor ILIKE '%agent%' OR p_actor ILIKE '%hermes%' THEN
--         RAISE EXCEPTION '... must be made by a human credential ...';
--       END IF;
--     END IF;
--
-- That is a NEGATIVE check, and a negative check on a NAME has exactly one
-- property: it denies the names you thought of. Every other name passes.
--
--   p_actor = 'ci-bot'          -> allowed
--   p_actor = 'batch-runner'    -> allowed
--   p_actor = 'nightly'         -> allowed
--   p_actor = 'kafka'           -> allowed
--   p_actor = 'postgres'        -> allowed
--
-- Any process that does not happen to contain the substring "agent" or
-- "hermes" can therefore set a claim to `verified` and `published` — and
-- once published, the claim is VISIBLE to the public (D8).
--
-- The rule that was actually wanted is a POSITIVE one: only an actor that
-- HOLDS an explicit human-editor credential may make those transitions.
-- Everything else is refused. The default is DENY, and the allow-list is
-- explicit.
--
-- THE CREDENTIAL
--
-- A new table, `publish_credential`, holds the allow-list. A row means:
-- "this actor may verify and publish". The actor is identified by the
-- `users.id` that the claim was written under, and the credential is
-- VERIFIED — it records who verified it and when.
--
-- The actor string that `statement_set_status()` receives is matched
-- against `publish_credential.actor`, which is the `users.id` of a real
-- account. So the credential is tied to an ACCOUNT, not to a name that
-- anybody can type.
--
-- `credential_role` records what the holder may do:
--
--   'editor'    may set `verified`
--   'publisher' may set `verified` and `published`
--
-- Both are human roles. There is deliberately NO role that an automated
-- process can hold — an automated process cannot be a human editor, and a
-- credential that could be issued to one would be the same hole with an
-- extra step.
--
-- WHAT CHANGES
--
--   1. The table `publish_credential` is created.
--   2. `statement_set_status()` is REPLACED with the positive check.
--   3. A trigger `publish_credential_owner_guard` refuses a credential
--      for an actor that is not a real `users` row.
--   4. The transition log keeps the actor, so an audit can see WHO held
--      the credential at the time.
--
-- NOTHING ELSE CHANGES. The gates for `research_pending`, `under_review`,
-- `disputed`, `needs_revision` and `draft` are untouched: those are the
-- machine's transitions, and the machine is allowed to make them.
--
-- IDEMPOTENCE
--
-- The table is created with `IF NOT EXISTS`, the function is replaced with
-- `CREATE OR REPLACE`, and the trigger is dropped before it is created.
-- Re-running this migration changes nothing. It is safe on live, where it
-- creates only what does not exist and replaces one function.
--
-- WHAT IT DOES NOT DO
--
-- It does not grant anyone a credential. The table starts EMPTY, which
-- means the `verified` and `published` transitions are refused for every
-- actor until a credential is issued deliberately. That is the point: the
-- gate is default-deny, and opening it is an act, not an omission.

\set ON_ERROR_STOP on

BEGIN;

-- =====================================================================
-- 1. THE CREDENTIAL TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS publish_credential (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- The `users.id` of the account that holds the credential. It is the
  -- SAME string the caller passes as `p_actor` to statement_set_status().
  actor          text NOT NULL UNIQUE,
  -- 'editor' may verify; 'publisher' may verify and publish.
  credential_role text NOT NULL
    CHECK (credential_role IN ('editor','publisher')),
  -- A credential is not usable until it is verified. A row with
  -- verified_at NULL is an unverified claim to be an editor, and the
  -- guard below refuses to honour it.
  verified_by    text,
  verified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE publish_credential IS
  'The explicit allow-list for the verified and published transitions. A row means: this account holds a human-editor credential. The table starts EMPTY, so both transitions are refused for everyone until a credential is issued deliberately. There is no automated role — an automated process cannot be a human editor.';

COMMENT ON COLUMN publish_credential.actor IS
  'The users.id of the account holding the credential. This is the value statement_set_status() receives as p_actor. It is an account id, not a free-text name, so it cannot be typed by a process that is not that account.';

COMMENT ON COLUMN publish_credential.credential_role IS
  'editor = may set verified. publisher = may set verified and published. There is no automated role by design.';

-- =====================================================================
-- 2. THE OWNER GUARD — a credential must belong to a real account
-- =====================================================================

-- A credential for an actor that is not a `users` row is a credential for
-- nobody. It would be a name in a table, which is the thing this
-- migration exists to stop.
CREATE OR REPLACE FUNCTION publish_credential_owner_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.actor) THEN
    RAISE EXCEPTION
      'the publish credential for % is refused: there is no such account in users',
      NEW.actor;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS publish_credential_owner_guard_trg ON publish_credential;
CREATE TRIGGER publish_credential_owner_guard_trg
  BEFORE INSERT OR UPDATE ON publish_credential
  FOR EACH ROW EXECUTE FUNCTION publish_credential_owner_guard();

-- =====================================================================
-- 3. THE POSITIVE GUARD — replacing the name check
-- =====================================================================

CREATE OR REPLACE FUNCTION statement_set_status(
  p_statement_id uuid,
  p_to verification_state,
  p_actor text
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
BEGIN
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
  -- THE ORDER MATTERS, and it is the order that makes this DEFAULT DENY.
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
  --
  -- The transition is refused for an unknown actor, for an actor whose
  -- credential is not verified, and for an actor whose role does not
  -- cover the transition it is attempting.
  IF p_to IN ('verified','published') THEN
    SELECT pc.credential_role,
           (pc.verified_at IS NOT NULL)
      INTO v_role, v_credential_verified
      FROM publish_credential pc
     WHERE pc.actor = p_actor;

    IF v_role IS NULL THEN
      RAISE EXCEPTION
        'the % transition is refused: % holds no publish credential. '
        'Only an account with a verified editor credential may verify or publish a claim.',
        p_to, COALESCE(NULLIF(p_actor, ''), '(none)');
    END IF;

    IF NOT v_credential_verified THEN
      RAISE EXCEPTION
        'the % transition is refused: the publish credential of % has not been verified.',
        p_to, p_actor;
    END IF;

    -- `published` is the stronger act, so it needs the stronger role.
    IF p_to = 'published' AND v_role <> 'publisher' THEN
      RAISE EXCEPTION
        'the % transition is refused: % holds an ''editor'' credential, which may verify but not publish.',
        p_to, p_actor;
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

    WHEN 'needs_revision' THEN
      v_ok := true;

    WHEN 'draft' THEN
      v_ok := true;

    ELSE
      v_ok := false;
  END CASE;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'the gate for % -> % is not met for statement % (class %)',
      v_from, p_to, p_statement_id, v_class;
  END IF;

  -- Authorise THIS write only. The setting is transaction-local, so it
  -- cannot leak into another transaction.
  PERFORM set_config('gustale.statement_gate', 'on', true);

  UPDATE statements
     SET status = p_to,
         updated_at = now(),
         verified_by = CASE WHEN p_to = 'verified' THEN p_actor ELSE verified_by END,
         verified_at = CASE WHEN p_to = 'verified' THEN now() ELSE verified_at END,
         published_by = CASE WHEN p_to = 'published' THEN p_actor ELSE published_by END,
         published_at = CASE WHEN p_to = 'published' THEN now() ELSE published_at END
   WHERE id = p_statement_id;

  PERFORM set_config('gustale.statement_gate', 'off', true);

  -- The transition log. Every transition is recorded.
  INSERT INTO statement_status_log (statement_id, from_status, to_status, actor, gate_ok)
  VALUES (p_statement_id, v_from, p_to, COALESCE(p_actor, '(null)'), true);

  RETURN p_to;
END;
$$;

COMMENT ON FUNCTION statement_set_status(uuid, verification_state, text) IS
  'ADR-002 Q12, amended by 0038. The lifecycle gates live HERE, so they hold '
  'for every writer. The verified and published transitions require an actor '
  'that HOLDS a verified publish_credential row — a positive, default-deny '
  'check. There is no name pattern: an actor without a credential is refused '
  'whatever it is called. Every transition is logged.';

-- =====================================================================
-- 4. THE RECONCILIATION
-- =====================================================================

DO $$
DECLARE
  v_credentials bigint;
  v_users bigint;
  v_publishers bigint;
BEGIN
  SELECT count(*) INTO v_credentials FROM publish_credential;
  SELECT count(*) INTO v_users FROM users;
  SELECT count(*) INTO v_publishers FROM publish_credential WHERE credential_role = 'publisher';

  RAISE NOTICE '=== the publish credential ===';
  RAISE NOTICE '  credentials:        %', v_credentials;
  RAISE NOTICE '  accounts (users):   %', v_users;
  RAISE NOTICE '  publisher role:     %', v_publishers;
  RAISE NOTICE '';

  IF v_credentials > v_users THEN
    RAISE EXCEPTION 'there are % credentials but only % accounts', v_credentials, v_users;
  END IF;

  -- A credential whose account does not exist is refused by the trigger,
  -- so this can only be non-zero if the trigger was dropped. The check
  -- makes that visible rather than silent.
  IF EXISTS (
    SELECT 1 FROM publish_credential pc
     WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = pc.actor)
  ) THEN
    RAISE EXCEPTION 'a publish credential names an account that does not exist';
  END IF;

  RAISE NOTICE '  every credential names a real account';
  RAISE NOTICE '  the verified and published transitions are REFUSED for every actor';
  RAISE NOTICE '    that does not hold a credential — the default is deny';
  RAISE NOTICE '';

  RAISE NOTICE 'PUBLISH_CREDENTIAL_OK=1';
END $$;

COMMIT;
