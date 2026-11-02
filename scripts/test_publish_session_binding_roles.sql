-- The role-level proof for ADR-006: who can actually call the function.
--
-- The point is that the EXECUTE narrowing is real, and that the
-- application role still works.

\echo '=== 1. as the application role (gustale): the function is callable'
SET ROLE gustale;
SELECT '  gustale may execute: ' || has_function_privilege(
         'gustale', 'statement_set_status(uuid, verification_state, text)', 'EXECUTE')
  AS check;

\echo '=== 2. as the application role: a caller-supplied actor is refused'
DO $$
DECLARE
  v_stmt uuid;
  v_err  text;
BEGIN
  SELECT id INTO v_stmt FROM statements LIMIT 1;
  BEGIN
    PERFORM statement_set_status(v_stmt, 'research_pending', 'someone-else');
    v_err := 'ACCEPTED — THE DEFECT IS STILL OPEN';
  EXCEPTION WHEN OTHERS THEN
    v_err := 'refused: ' || SQLERRM;
  END;
  RAISE NOTICE '%', v_err;
END $$;
RESET ROLE;

\echo '=== 3. PUBLIC no longer holds EXECUTE'
SELECT '  PUBLIC may execute statement_set_status: ' || has_function_privilege(
         'public', 'statement_set_status(uuid, verification_state, text)', 'EXECUTE')
  AS check;

SELECT '  PUBLIC may execute session_actor: ' || has_function_privilege(
         'public', 'session_actor(text)', 'EXECUTE')
  AS check;

\echo '=== 4. only the application role and the owner may execute'
--
-- The check is has_function_privilege over every real role, rather than
-- a SET ROLE and a call: the other roles do not have SELECT on
-- `statements`, so a call would be refused for the WRONG reason and
-- would prove nothing about the EXECUTE grant.
SELECT '  ' || rolname || ' may execute: ' || has_function_privilege(
         rolname, 'statement_set_status(uuid, verification_state, text)', 'EXECUTE')
  AS check
  FROM pg_roles
 WHERE rolname NOT LIKE 'pg\_%'
 ORDER BY rolname;

\echo '=== 5. the credential table is still empty — no credential was created'
SELECT '  the credentials: ' || count(*) FROM publish_credential;
