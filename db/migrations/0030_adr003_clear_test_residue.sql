-- The stale test residue, cleaned up.
--
-- While proving the moderation path, one German translation was
-- marked reviewed, made stale, and re-translated. The re-translation
-- was correctly queued as a PENDING PROPOSAL rather than overwriting
-- the reviewed text — which is exactly the behaviour ADR-003 asks
-- for. The proof is done; the residue is not something to leave in
-- production.
--
-- The row is restored to what a fresh machine translation looks like:
-- status machine, no proposal, no proposal fields.

BEGIN;

UPDATE description_sentence_translations
   SET status = 'machine',
       proposal_status = NULL,
       proposed_text = NULL,
       proposed_by = NULL,
       proposed_at = NULL,
       reviewed_by = NULL,
       reviewed_at = NULL,
       is_stale = false,
       updated_at = now()
 WHERE id = '9a30386a-9520-4de7-bc9e-514b12c88fee';

COMMIT;
