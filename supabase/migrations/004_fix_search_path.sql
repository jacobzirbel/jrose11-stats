-- =============================================================
-- Migration 004: Fix mutable search_path on security-definer functions
--                + atomic gym save RPC
-- =============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.populate_run_moves()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.run_moves (run_id, move_id, used)
  SELECT NEW.id, pm.move_id, FALSE
  FROM public.pokemon_moves pm
  WHERE pm.pokemon_id = NEW.pokemon_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_role(minimum public.user_role)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT public.current_user_role() >= minimum
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Atomic gym order save: delete + insert in a single transaction so a failed
-- insert cannot leave the run with missing gym data.
CREATE OR REPLACE FUNCTION public.save_gym_order(
  p_run_id INTEGER,
  p_gyms JSONB  -- array of {"sequence_position": N, "gym_number": N}
)
RETURNS void LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.run_gyms
  WHERE run_id = p_run_id
    AND sequence_position NOT IN (1, 2, 8);

  INSERT INTO public.run_gyms (run_id, sequence_position, gym_number)
  SELECT p_run_id, (g->>'sequence_position')::int, (g->>'gym_number')::int
  FROM jsonb_array_elements(p_gyms) AS g;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_gym_order(INTEGER, JSONB) TO authenticated;
