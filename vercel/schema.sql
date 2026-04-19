-- Run once on Vercel Postgres (or any Postgres): Query / SQL editor → paste → execute.
-- Same logical schema as former Supabase migrations, without RLS.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TYPE public.prefect_role AS ENUM ('prefect', 'head_prefect', 'deputy_head_prefect', 'games_captain');
CREATE TYPE public.duty_place_type AS ENUM ('classroom', 'special', 'inspection');
CREATE TYPE public.assignment_method AS ENUM ('auto', 'manual');

CREATE TABLE public.prefects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  reg_number TEXT NOT NULL UNIQUE,
  grade INTEGER NOT NULL CHECK (grade >= 4 AND grade <= 11),
  gender CHAR(1) NOT NULL CHECK (gender IN ('M', 'F')),
  role public.prefect_role NOT NULL DEFAULT 'prefect',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  head_prefect_id UUID REFERENCES public.prefects(id) ON DELETE SET NULL,
  co_head_prefect_id UUID REFERENCES public.prefects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.duty_places (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  type public.duty_place_type NOT NULL DEFAULT 'classroom',
  grade_requirement TEXT,
  gender_requirement TEXT,
  mandatory_slots INTEGER NOT NULL DEFAULT 1,
  max_prefects INTEGER NOT NULL DEFAULT 1,
  same_grade_if_multiple BOOLEAN NOT NULL DEFAULT false,
  required_gender_balance BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  duty_place_id UUID NOT NULL REFERENCES public.duty_places(id) ON DELETE CASCADE,
  prefect_id UUID NOT NULL REFERENCES public.prefects(id) ON DELETE RESTRICT,
  slot_index INTEGER NOT NULL DEFAULT 0,
  assigned_by public.assignment_method NOT NULL DEFAULT 'manual',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(duty_place_id, slot_index)
);

CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  details JSONB,
  admin_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
  key TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.app_accounts (
  id TEXT NOT NULL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'duty_editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_prefects_updated_at BEFORE UPDATE ON public.prefects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_duty_places_updated_at BEFORE UPDATE ON public.duty_places FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.settings (key, value) VALUES
  ('allow_multiple_assignments_per_prefect', 'false'),
  ('admin_password_changed', 'false')
ON CONFLICT (key) DO NOTHING;
