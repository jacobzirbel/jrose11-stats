-- =============================================================
-- Migration 002: Clean up runs table, drop glitch_votes, add time custom field type
-- =============================================================

-- ---------------------
-- Drop glitch_votes entirely
-- ---------------------

DROP TABLE IF EXISTS glitch_votes;

-- ---------------------
-- Remove deprecated columns from runs
-- ---------------------

ALTER TABLE runs
  DROP COLUMN IF EXISTS erika_skipped,
  DROP COLUMN IF EXISTS erika_joked,
  DROP COLUMN IF EXISTS badge_boost_glitch,
  DROP COLUMN IF EXISTS brock_finish_seconds,
  DROP COLUMN IF EXISTS brock_time_estimated;

-- ---------------------
-- Remove trusted_contributor role — contributors and admins are sufficient.
-- Migrate any existing trusted_contributors down to contributor.
-- ---------------------

UPDATE profiles SET role = 'contributor' WHERE role = 'trusted_contributor';

-- Drop all functions and policies that depend on user_role before swapping the type.
DROP FUNCTION IF EXISTS current_user_role() CASCADE;
DROP FUNCTION IF EXISTS has_role(user_role) CASCADE;

DROP POLICY IF EXISTS "users update own profile"                      ON profiles;
DROP POLICY IF EXISTS "contributors can insert runs"                  ON runs;
DROP POLICY IF EXISTS "contributors can update runs"                  ON runs;
DROP POLICY IF EXISTS "contributors can update run_moves"             ON run_moves;
DROP POLICY IF EXISTS "contributors can write run_gyms"               ON run_gyms;
DROP POLICY IF EXISTS "contributors can update run_gyms"              ON run_gyms;
DROP POLICY IF EXISTS "contributors can delete run_gyms"              ON run_gyms;
DROP POLICY IF EXISTS "public read active custom fields"              ON custom_field_definitions;
DROP POLICY IF EXISTS "trusted contributors can propose custom fields" ON custom_field_definitions;
DROP POLICY IF EXISTS "admins manage custom field status"             ON custom_field_definitions;
DROP POLICY IF EXISTS "contributors can write custom field values"    ON custom_field_values;
DROP POLICY IF EXISTS "contributors can update custom field values"   ON custom_field_values;
DROP POLICY IF EXISTS "public read approved notes"                    ON community_notes;
DROP POLICY IF EXISTS "contributors can moderate notes"               ON community_notes;

-- Swap the enum type
ALTER TYPE user_role RENAME TO user_role_old;
CREATE TYPE user_role AS ENUM ('account', 'contributor', 'admin');

ALTER TABLE profiles
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN role TYPE user_role USING role::text::user_role,
  ALTER COLUMN role SET DEFAULT 'account';

DROP TYPE user_role_old;

-- Recreate helper functions with new type
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION has_role(minimum user_role)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT current_user_role() >= minimum
$$;

-- Recreate all dropped policies
CREATE POLICY "users update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid() OR has_role('admin'));

CREATE POLICY "contributors can insert runs"
  ON runs FOR INSERT
  WITH CHECK (has_role('contributor'));

CREATE POLICY "contributors can update runs"
  ON runs FOR UPDATE
  USING (has_role('admin') OR (has_role('contributor') AND status <> 'complete'));

CREATE POLICY "contributors can update run_moves"
  ON run_moves FOR UPDATE
  USING (
    has_role('admin')
    OR (has_role('contributor') AND EXISTS (
      SELECT 1 FROM runs r WHERE r.id = run_moves.run_id AND r.status <> 'complete'
    ))
  );

CREATE POLICY "contributors can write run_gyms"
  ON run_gyms FOR INSERT
  WITH CHECK (
    has_role('contributor')
    AND EXISTS (SELECT 1 FROM runs r WHERE r.id = run_gyms.run_id AND r.status <> 'complete')
  );

CREATE POLICY "contributors can update run_gyms"
  ON run_gyms FOR UPDATE
  USING (
    has_role('admin')
    OR (has_role('contributor') AND EXISTS (
      SELECT 1 FROM runs r WHERE r.id = run_gyms.run_id AND r.status <> 'complete'
    ))
  );

CREATE POLICY "contributors can delete run_gyms"
  ON run_gyms FOR DELETE
  USING (
    has_role('admin')
    OR (has_role('contributor') AND EXISTS (
      SELECT 1 FROM runs r WHERE r.id = run_gyms.run_id AND r.status <> 'complete'
    ))
  );

CREATE POLICY "public read active custom fields"
  ON custom_field_definitions FOR SELECT
  USING (status = 'active' OR has_role('contributor'));

CREATE POLICY "admins manage custom fields"
  ON custom_field_definitions FOR INSERT
  WITH CHECK (has_role('admin'));

CREATE POLICY "admins manage custom field status"
  ON custom_field_definitions FOR UPDATE
  USING (has_role('admin'));

CREATE POLICY "contributors can write custom field values"
  ON custom_field_values FOR INSERT
  WITH CHECK (
    has_role('contributor')
    AND EXISTS (SELECT 1 FROM runs r WHERE r.id = custom_field_values.run_id AND r.status <> 'complete')
  );

CREATE POLICY "contributors can update custom field values"
  ON custom_field_values FOR UPDATE
  USING (
    has_role('admin')
    OR (has_role('contributor') AND EXISTS (
      SELECT 1 FROM runs r WHERE r.id = custom_field_values.run_id AND r.status <> 'complete'
    ))
  );

CREATE POLICY "public read approved notes"
  ON community_notes FOR SELECT
  USING (status IN ('approved', 'pinned') OR has_role('contributor'));

CREATE POLICY "contributors can moderate notes"
  ON community_notes FOR UPDATE
  USING (has_role('contributor'));

-- ---------------------
-- Add 'time' to custom_field_type enum
-- Time values stored as JSONB: {"seconds": 123, "estimated": true}
-- ---------------------

ALTER TYPE custom_field_type ADD VALUE IF NOT EXISTS 'time';

