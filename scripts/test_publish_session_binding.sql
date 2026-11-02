-- The behavioural proof for ADR-006, run against the disposable copy.
-- Read-only: it changes nothing, it only reports what the functions do.

\echo '=== 1. the new signatures'
SELECT p.proname || '(' || pg_get_function_arguments(p.oid) || ') -> ' || pg_get_function_result(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('statement_set_status', 'session_actor')
 ORDER BY p.proname;

\echo '=== 2. the EXECUTE grants'
SELECT '  ' || p.proname || ' | the acl: ' || COALESCE(p.proacl::text, 'the default (PUBLIC EXECUTE)')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('statement_set_status', 'session_actor')
 ORDER BY p.proname;

\echo '=== 3. the credential foreign key'
SELECT '  ' || conname || ' -> ' || pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'publish_credential'::regclass AND contype = 'f';

\echo '=== 4. the credential rows and the login table'
SELECT '  the credentials: ' || count(*) FROM publish_credential;
SELECT '  the logins: ' || count(*) FROM "user";

\echo '=== 5. PROOF: a caller-supplied actor is refused (the defect closed)'
DO $$
DECLARE
  v_stmt  uuid;
  v_actor text;
  v_err   text;
BEGIN
  SELECT id INTO v_stmt FROM statements LIMIT 1;
  SELECT id INTO v_actor FROM "user" LIMIT 1;

  BEGIN
    PERFORM statement_set_status(v_stmt, 'research_pending', v_actor);
    v_err := 'ACCEPTED — THE DEFECT IS STILL OPEN';
  EXCEPTION WHEN OTHERS THEN
    v_err := 'refused: ' || SQLERRM;
  END;

  RAISE NOTICE '%', v_err;
END $$;

\echo '=== 6. PROOF: an unknown session token is refused'
DO $$
DECLARE
  v_stmt uuid;
  v_err  text;
BEGIN
  SELECT id INTO v_stmt FROM statements LIMIT 1;

  BEGIN
    PERFORM statement_set_status(v_stmt, 'research_pending', 'not-a-real-token');
    v_err := 'ACCEPTED — THE DEFECT IS STILL OPEN';
  EXCEPTION WHEN OTHERS THEN
    v_err := 'refused: ' || SQLERRM;
  END;

  RAISE NOTICE '%', v_err;
END $$;

\echo '=== 7. PROOF: an empty session token is refused'
DO $$
DECLARE
  v_stmt uuid;
  v_err  text;
BEGIN
  SELECT id INTO v_stmt FROM statements LIMIT 1;

  BEGIN
    PERFORM statement_set_status(v_stmt, 'research_pending', '');
    v_err := 'ACCEPTED — THE DEFECT IS STILL OPEN';
  EXCEPTION WHEN OTHERS THEN
    v_err := 'refused: ' || SQLERRM;
  END;

  RAISE NOTICE '%', v_err;
END $$;

\echo '=== 8. PROOF: session_actor resolves a live session and refuses the rest'
SELECT '  a live session resolves to: ' || COALESCE(session_actor(token), 'NULL')
  FROM session WHERE expires_at > now() LIMIT 1;

SELECT '  an unknown token resolves to: ' || COALESCE(session_actor('not-a-real-token'), 'NULL');

SELECT '  an expired session resolves to: ' || COALESCE(
         (SELECT session_actor(token) FROM session WHERE expires_at <= now() LIMIT 1), 'NULL')
  ;
