-- =============================================================
-- jrose11 Gen 1 Stat Tracker — Full Schema
-- =============================================================

-- ---------------------
-- Enums
-- ---------------------

CREATE TYPE user_role AS ENUM ('account', 'contributor', 'trusted_contributor', 'admin');
CREATE TYPE run_status AS ENUM ('stub', 'in_progress', 'needs_review', 'complete');
CREATE TYPE custom_field_type AS ENUM ('boolean', 'text', 'number', 'enum');
CREATE TYPE custom_field_status AS ENUM ('pending', 'active', 'deprecated');
CREATE TYPE note_status AS ENUM ('pending', 'approved', 'rejected', 'pinned');

-- ---------------------
-- Profiles
-- Extends Supabase auth.users; created automatically on sign-up via trigger.
-- ---------------------

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  role        user_role NOT NULL DEFAULT 'account',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------
-- Pokémon reference data
-- Seeded from PokéAPI. Not user-editable.
-- ---------------------

CREATE TABLE pokemon (
  dex_number  INTEGER PRIMARY KEY CHECK (dex_number BETWEEN 0 AND 151),
  name        TEXT NOT NULL,
  sprite_url  TEXT,
  type1       TEXT NOT NULL,  -- e.g. 'fire'
  type2       TEXT,           -- nullable; second type
  is_glitch   BOOLEAN NOT NULL DEFAULT FALSE  -- TRUE for MissingNo. and any future glitch entries
);

-- ---------------------
-- Gen 1 moves
-- Seeded from PokéAPI. Not user-editable.
-- ---------------------

CREATE TABLE moves (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  category  TEXT  -- 'physical' | 'special' | 'status' (from PokéAPI damage_class)
);

-- ---------------------
-- Gen 1 learnsets (per-Pokémon move eligibility)
-- Drives move typeahead on run pages.
-- ---------------------

CREATE TABLE pokemon_moves (
  pokemon_id  INTEGER NOT NULL REFERENCES pokemon(dex_number) ON DELETE CASCADE,
  move_id     INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  PRIMARY KEY (pokemon_id, move_id)
);

CREATE INDEX idx_pokemon_moves_pokemon ON pokemon_moves(pokemon_id);
CREATE INDEX idx_pokemon_moves_move    ON pokemon_moves(move_id);

-- ---------------------
-- Runs
-- One row per Pokémon (151 total). Created as stubs; filled by contributors.
-- ---------------------

CREATE TABLE runs (
  id                      SERIAL PRIMARY KEY,
  pokemon_id              INTEGER NOT NULL UNIQUE REFERENCES pokemon(dex_number),

  -- YouTube
  youtube_url             TEXT,


  -- Erika flags (independent — both can be true)
  erika_skipped           BOOLEAN,
  erika_joked             BOOLEAN,

  -- Badge boost glitch: resolved value shown publicly.
  -- NULL = unresolved (defer to vote majority). TRUE/FALSE = admin override.
  -- See glitch_votes table for per-contributor votes.
  badge_boost_glitch      BOOLEAN,

  -- Brock finish time stored as total seconds; display as MM:SS in the UI
  brock_finish_seconds    INTEGER,
  brock_time_estimated    BOOLEAN NOT NULL DEFAULT FALSE,

  -- Seeded from community spreadsheet
  final_level             INTEGER,
  completion_seconds      INTEGER,  -- total seconds; display formatted in UI

  -- jrose's own ranking, revealed at end of each video.
  -- Tier group naming TBD (see open questions in spec).
  jrose_tier              TEXT,     -- e.g. 'S', 'A', 'Tier 1', etc.
  jrose_tier_position     INTEGER,  -- rank within the tier (1 = best in tier)

  status                  run_status NOT NULL DEFAULT 'stub',

  -- Primary contributor who filled this run
  contributor_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_runs_pokemon    ON runs(pokemon_id);
CREATE INDEX idx_runs_status     ON runs(status);
CREATE INDEX idx_runs_jrose_tier ON runs(jrose_tier, jrose_tier_position);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------
-- Run moves
-- Tracks which of a Pokémon's Gen 1 learnset moves were used in its run.
-- Auto-populated when a run is created (see trigger below).
-- ---------------------

CREATE TABLE run_moves (
  run_id   INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  move_id  INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  used     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (run_id, move_id)
);

CREATE INDEX idx_run_moves_run  ON run_moves(run_id);
CREATE INDEX idx_run_moves_used ON run_moves(run_id, used);

-- When a run is inserted, pre-populate run_moves from the Pokémon's learnset
CREATE OR REPLACE FUNCTION populate_run_moves()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO run_moves (run_id, move_id, used)
  SELECT NEW.id, pm.move_id, FALSE
  FROM pokemon_moves pm
  WHERE pm.pokemon_id = NEW.pokemon_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_run_created
  AFTER INSERT ON runs
  FOR EACH ROW EXECUTE FUNCTION populate_run_moves();

-- ---------------------
-- Gym order
-- Sequence in which badges were obtained. One row per gym per run.
-- sequence_position: 1–8 (the Nth badge obtained)
-- gym_number: 1–8 (which gym, by canonical Kanto order: Brock=1 … Giovanni=8)
-- Standard run has sequence_position = gym_number for all 8 rows.
-- Deviations: e.g. sequence_position=1, gym_number=3 means Cerulean was first.
-- ---------------------

CREATE TABLE run_gyms (
  run_id            INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sequence_position INTEGER NOT NULL CHECK (sequence_position BETWEEN 1 AND 8),
  gym_number        INTEGER NOT NULL CHECK (gym_number BETWEEN 1 AND 8),
  PRIMARY KEY (run_id, sequence_position),
  UNIQUE (run_id, gym_number)  -- can't get the same badge twice
);

CREATE INDEX idx_run_gyms_run ON run_gyms(run_id);
-- Supports "which gym is most commonly done Nth?" queries
CREATE INDEX idx_run_gyms_position ON run_gyms(sequence_position, gym_number);
-- Supports "which runs deviated at gym N?" queries
CREATE INDEX idx_run_gyms_gym ON run_gyms(gym_number, sequence_position);

-- ---------------------
-- Glitch votes
-- Contributors vote on whether the badge boost glitch meaningfully contributed
-- to the E4 win. One vote per contributor per run.
-- runs.badge_boost_glitch is the resolved value:
--   NULL  → unresolved; UI shows vote tally and majority
--   TRUE/FALSE → admin override; overrides the vote majority
-- ---------------------

CREATE TABLE glitch_votes (
  run_id          INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  contributor_id  UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote            BOOLEAN NOT NULL,  -- TRUE = glitch meaningfully contributed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, contributor_id)
);

CREATE INDEX idx_glitch_votes_run ON glitch_votes(run_id);

CREATE TRIGGER glitch_votes_updated_at
  BEFORE UPDATE ON glitch_votes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------
-- Custom field definitions
-- Proposed by trusted contributors; go live after admin approval.
-- ---------------------

CREATE TABLE custom_field_definitions (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  field_type    custom_field_type NOT NULL,
  description   TEXT,
  required      BOOLEAN NOT NULL DEFAULT FALSE,

  -- For 'enum' fields: the list of allowed option strings
  enum_options  TEXT[],

  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status        custom_field_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------
-- Custom field values (per run, per field definition)
-- value is JSONB to accommodate boolean/text/number/enum uniformly.
-- ---------------------

CREATE TABLE custom_field_values (
  run_id               INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  field_definition_id  INTEGER NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  value                JSONB,
  PRIMARY KEY (run_id, field_definition_id)
);

CREATE INDEX idx_custom_field_values_run   ON custom_field_values(run_id);
CREATE INDEX idx_custom_field_values_field ON custom_field_values(field_definition_id);

-- ---------------------
-- Community notes
-- Anonymous users submit to pending queue; attributed users with trusted status skip queue.
-- ---------------------

CREATE TABLE community_notes (
  id           SERIAL PRIMARY KEY,
  run_id       INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,

  -- author_id null = anonymous submission
  author_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  author_name  TEXT,  -- display name for anonymous submissions

  content      TEXT NOT NULL,
  status       note_status NOT NULL DEFAULT 'pending',
  reviewed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_run    ON community_notes(run_id);
CREATE INDEX idx_notes_status ON community_notes(status);

-- ---------------------
-- Auto-create profile on Supabase auth sign-up
-- ---------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================
-- Grants
-- Tables created via SQL migration don't get automatic anon/authenticated
-- grants — those only happen when using the Supabase dashboard UI.
-- =============================================================

-- Reference tables (no RLS — grant SELECT to all roles)
GRANT SELECT ON TABLE pokemon       TO anon, authenticated;
GRANT SELECT ON TABLE moves         TO anon, authenticated;
GRANT SELECT ON TABLE pokemon_moves TO anon, authenticated;

-- User-facing tables — anon can read public data; write access via RLS policies
GRANT SELECT, INSERT, UPDATE        ON TABLE profiles               TO authenticated;
GRANT SELECT                        ON TABLE profiles               TO anon;
GRANT SELECT                        ON TABLE runs                   TO anon, authenticated;
GRANT INSERT, UPDATE                ON TABLE runs                   TO authenticated;
GRANT SELECT                        ON TABLE run_moves              TO anon, authenticated;
GRANT UPDATE                        ON TABLE run_moves              TO authenticated;
GRANT SELECT                        ON TABLE run_gyms               TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE run_gyms              TO authenticated;
GRANT SELECT                        ON TABLE glitch_votes           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE        ON TABLE glitch_votes           TO authenticated;
GRANT SELECT                        ON TABLE custom_field_definitions TO anon, authenticated;
GRANT INSERT, UPDATE                ON TABLE custom_field_definitions TO authenticated;
GRANT SELECT                        ON TABLE custom_field_values    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE        ON TABLE custom_field_values    TO authenticated;
GRANT SELECT, INSERT                ON TABLE community_notes        TO anon;
GRANT SELECT, INSERT, UPDATE        ON TABLE community_notes        TO authenticated;

-- Sequences (needed for SERIAL inserts)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =============================================================
-- Row-Level Security
-- =============================================================

ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
-- pokemon, moves, pokemon_moves are immutable reference data seeded once.
-- No RLS needed — public read is the default when RLS is off.
ALTER TABLE runs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_moves              ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_gyms               ENABLE ROW LEVEL SECURITY;
ALTER TABLE glitch_votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values    ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_notes        ENABLE ROW LEVEL SECURITY;

-- Helper: returns current user's role (NULL if not authenticated)
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- Helper: true if current user has at least the given role
CREATE OR REPLACE FUNCTION has_role(minimum user_role)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT current_user_role() >= minimum
$$;

-- ---------------------
-- pokemon / moves / pokemon_moves: public read, no public write (seeded by service role)
-- ---------------------

-- ---------------------
-- profiles
-- ---------------------

CREATE POLICY "public read profiles"
  ON profiles FOR SELECT USING (TRUE);

CREATE POLICY "users insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "users update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid() OR has_role('admin'));

-- ---------------------
-- runs
-- ---------------------

CREATE POLICY "public read runs"
  ON runs FOR SELECT USING (TRUE);

CREATE POLICY "contributors can insert runs"
  ON runs FOR INSERT
  WITH CHECK (has_role('contributor'));

-- Contributors can update non-complete runs; admins can update any run
CREATE POLICY "contributors can update runs"
  ON runs FOR UPDATE
  USING (
    has_role('admin')
    OR (has_role('contributor') AND status <> 'complete')
  );

-- ---------------------
-- run_moves
-- ---------------------

CREATE POLICY "public read run_moves"
  ON run_moves FOR SELECT USING (TRUE);

CREATE POLICY "contributors can update run_moves"
  ON run_moves FOR UPDATE
  USING (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r WHERE r.id = run_moves.run_id AND r.status <> 'complete'
      )
    )
  );

-- ---------------------
-- run_gyms
-- ---------------------

CREATE POLICY "public read run_gyms"
  ON run_gyms FOR SELECT USING (TRUE);

CREATE POLICY "contributors can write run_gyms"
  ON run_gyms FOR INSERT
  WITH CHECK (
    has_role('contributor')
    AND EXISTS (
      SELECT 1 FROM runs r WHERE r.id = run_gyms.run_id AND r.status <> 'complete'
    )
  );

CREATE POLICY "contributors can update run_gyms"
  ON run_gyms FOR UPDATE
  USING (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r WHERE r.id = run_gyms.run_id AND r.status <> 'complete'
      )
    )
  );

CREATE POLICY "contributors can delete run_gyms"
  ON run_gyms FOR DELETE
  USING (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r WHERE r.id = run_gyms.run_id AND r.status <> 'complete'
      )
    )
  );

-- ---------------------
-- glitch_votes
-- ---------------------

CREATE POLICY "public read glitch_votes"
  ON glitch_votes FOR SELECT USING (TRUE);

-- Only contributors can vote; one upsert per (run, contributor)
CREATE POLICY "contributors can vote"
  ON glitch_votes FOR INSERT
  WITH CHECK (
    has_role('contributor')
    AND contributor_id = auth.uid()
  );

CREATE POLICY "contributors can change their vote"
  ON glitch_votes FOR UPDATE
  USING (
    contributor_id = auth.uid()
    OR has_role('admin')
  );

-- ---------------------
-- custom_field_definitions
-- ---------------------

-- Active fields visible to all; pending visible to contributors+
CREATE POLICY "public read active custom fields"
  ON custom_field_definitions FOR SELECT
  USING (status = 'active' OR has_role('contributor'));

CREATE POLICY "trusted contributors can propose custom fields"
  ON custom_field_definitions FOR INSERT
  WITH CHECK (has_role('trusted_contributor'));

-- Only admins can approve/deprecate
CREATE POLICY "admins manage custom field status"
  ON custom_field_definitions FOR UPDATE
  USING (has_role('admin'));

-- ---------------------
-- custom_field_values
-- ---------------------

CREATE POLICY "public read custom field values"
  ON custom_field_values FOR SELECT USING (TRUE);

CREATE POLICY "contributors can write custom field values"
  ON custom_field_values FOR INSERT
  WITH CHECK (
    has_role('contributor')
    AND EXISTS (
      SELECT 1 FROM runs r WHERE r.id = custom_field_values.run_id AND r.status <> 'complete'
    )
  );

CREATE POLICY "contributors can update custom field values"
  ON custom_field_values FOR UPDATE
  USING (
    has_role('admin')
    OR (
      has_role('contributor')
      AND EXISTS (
        SELECT 1 FROM runs r WHERE r.id = custom_field_values.run_id AND r.status <> 'complete'
      )
    )
  );

-- ---------------------
-- community_notes
-- ---------------------

-- Public sees approved/pinned; contributors+ see all
CREATE POLICY "public read approved notes"
  ON community_notes FOR SELECT
  USING (status IN ('approved', 'pinned') OR has_role('contributor'));

-- Anyone can submit a note (goes to pending)
CREATE POLICY "anyone can submit notes"
  ON community_notes FOR INSERT
  WITH CHECK (status = 'pending');

-- Contributors can approve/reject/pin
CREATE POLICY "contributors can moderate notes"
  ON community_notes FOR UPDATE
  USING (has_role('contributor'));
