-- =============================================================
-- Migration 003: Enable RLS on reference tables
-- These are immutable, publicly readable tables seeded from PokéAPI.
-- RLS is enabled with unrestricted SELECT to satisfy Supabase security checks.
-- All writes go through the service role (seed scripts), not the anon/authenticated roles.
-- =============================================================

ALTER TABLE pokemon       ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_moves ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pokemon' AND policyname = 'public read pokemon') THEN
    CREATE POLICY "public read pokemon" ON pokemon FOR SELECT USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'moves' AND policyname = 'public read moves') THEN
    CREATE POLICY "public read moves" ON moves FOR SELECT USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pokemon_moves' AND policyname = 'public read pokemon_moves') THEN
    CREATE POLICY "public read pokemon_moves" ON pokemon_moves FOR SELECT USING (TRUE);
  END IF;
END $$;
