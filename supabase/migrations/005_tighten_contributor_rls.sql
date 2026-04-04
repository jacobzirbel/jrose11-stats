-- =============================================================
-- Migration 005: Tighten contributor RLS
--
-- Contributors can only edit runs assigned to them that are in_progress.
-- Admins can edit everything.
-- =============================================================

-- ---------------------
-- runs
-- ---------------------

DROP POLICY IF EXISTS "contributors can update runs" ON runs;

-- Admins: unrestricted. Contributors: only their assigned in_progress runs.
-- (Contributors also need to set status → needs_review, which is an update on
-- an in_progress run they own, so this covers mark-done.)
CREATE POLICY "update runs"
  ON runs FOR UPDATE
  USING (
    has_role('admin')
    OR (
      has_role('contributor')
      AND status = 'in_progress'
      AND contributor_id = auth.uid()
    )
  );

-- ---------------------
-- run_moves
-- ---------------------

DROP POLICY IF EXISTS "contributors can update run_moves" ON run_moves;

CREATE POLICY "update run_moves"
  ON run_moves FOR UPDATE
  USING (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r
        WHERE r.id = run_moves.run_id
          AND r.status = 'in_progress'
          AND r.contributor_id = auth.uid()
      )
    )
  );

-- ---------------------
-- run_gyms
-- ---------------------

DROP POLICY IF EXISTS "contributors can write run_gyms" ON run_gyms;
DROP POLICY IF EXISTS "contributors can update run_gyms" ON run_gyms;
DROP POLICY IF EXISTS "contributors can delete run_gyms" ON run_gyms;

CREATE POLICY "insert run_gyms"
  ON run_gyms FOR INSERT
  WITH CHECK (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r
        WHERE r.id = run_gyms.run_id
          AND r.status = 'in_progress'
          AND r.contributor_id = auth.uid()
      )
    )
  );

CREATE POLICY "update run_gyms"
  ON run_gyms FOR UPDATE
  USING (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r
        WHERE r.id = run_gyms.run_id
          AND r.status = 'in_progress'
          AND r.contributor_id = auth.uid()
      )
    )
  );

CREATE POLICY "delete run_gyms"
  ON run_gyms FOR DELETE
  USING (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r
        WHERE r.id = run_gyms.run_id
          AND r.status = 'in_progress'
          AND r.contributor_id = auth.uid()
      )
    )
  );

-- ---------------------
-- custom_field_values
-- ---------------------

DROP POLICY IF EXISTS "contributors can write custom field values" ON custom_field_values;
DROP POLICY IF EXISTS "contributors can update custom field values" ON custom_field_values;

CREATE POLICY "insert custom_field_values"
  ON custom_field_values FOR INSERT
  WITH CHECK (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r
        WHERE r.id = custom_field_values.run_id
          AND r.status = 'in_progress'
          AND r.contributor_id = auth.uid()
      )
    )
  );

CREATE POLICY "update custom_field_values"
  ON custom_field_values FOR UPDATE
  USING (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r
        WHERE r.id = custom_field_values.run_id
          AND r.status = 'in_progress'
          AND r.contributor_id = auth.uid()
      )
    )
  );
