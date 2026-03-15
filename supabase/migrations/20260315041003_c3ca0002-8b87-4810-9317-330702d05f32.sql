
-- Enum types
CREATE TYPE public.prefect_role AS ENUM ('prefect', 'head_prefect', 'deputy_head_prefect');
CREATE TYPE public.duty_place_type AS ENUM ('classroom', 'special', 'inspection');
CREATE TYPE public.assignment_method AS ENUM ('auto', 'manual');

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Prefects table
CREATE TABLE public.prefects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  reg_number TEXT NOT NULL UNIQUE,
  grade INTEGER NOT NULL CHECK (grade >= 4 AND grade <= 11),
  gender CHAR(1) NOT NULL CHECK (gender IN ('M', 'F')),
  role public.prefect_role NOT NULL DEFAULT 'prefect',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sections table
CREATE TABLE public.sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  head_prefect_id UUID REFERENCES public.prefects(id) ON DELETE SET NULL,
  co_head_prefect_id UUID REFERENCES public.prefects(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Duty places table
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Assignments table (ON DELETE RESTRICT for prefects to prevent accidental deletion)
CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  duty_place_id UUID NOT NULL REFERENCES public.duty_places(id) ON DELETE CASCADE,
  prefect_id UUID NOT NULL REFERENCES public.prefects(id) ON DELETE RESTRICT,
  slot_index INTEGER NOT NULL DEFAULT 0,
  assigned_by public.assignment_method NOT NULL DEFAULT 'manual',
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(duty_place_id, slot_index)
);

-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  details JSONB,
  admin_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Settings table (key-value store)
CREATE TABLE public.settings (
  key TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default settings
INSERT INTO public.settings (key, value) VALUES
  ('allow_multiple_assignments_per_prefect', 'false'),
  ('admin_password_hash', '$2b$10$YourBcryptHashHere'),
  ('admin_password_changed', 'false');

-- Triggers for updated_at
CREATE TRIGGER update_prefects_updated_at BEFORE UPDATE ON public.prefects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_duty_places_updated_at BEFORE UPDATE ON public.duty_places FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.prefects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables (admin system, no user-level auth yet)
CREATE POLICY "Allow public read on prefects" ON public.prefects FOR SELECT USING (true);
CREATE POLICY "Allow public write on prefects" ON public.prefects FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read on sections" ON public.sections FOR SELECT USING (true);
CREATE POLICY "Allow public write on sections" ON public.sections FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read on duty_places" ON public.duty_places FOR SELECT USING (true);
CREATE POLICY "Allow public write on duty_places" ON public.duty_places FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read on assignments" ON public.assignments FOR SELECT USING (true);
CREATE POLICY "Allow public write on assignments" ON public.assignments FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read on audit_logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow public write on audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read on settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Allow public write on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Seed default sections
INSERT INTO public.sections (name) VALUES
  ('GRADE 4'), ('GRADE 5'), ('GRADE 6'), ('GRADE 7'),
  ('GRADE 8'), ('GRADE 9'), ('GRADE 10'), ('GRADE 11'),
  ('SECTION A'), ('SECTION B');

-- Seed default duty places (classrooms)
DO $$
DECLARE
  sec_id UUID;
  g INTEGER;
  letter CHAR;
  letters CHAR[] := ARRAY['A','B','C','D','E'];
  is_mand BOOLEAN;
BEGIN
  FOR g IN 4..11 LOOP
    SELECT id INTO sec_id FROM public.sections WHERE name = 'GRADE ' || g;
    FOREACH letter IN ARRAY letters LOOP
      is_mand := letter IN ('A','B');
      INSERT INTO public.duty_places (name, section_id, type, mandatory_slots, max_prefects)
      VALUES (g || letter, sec_id, 'classroom', CASE WHEN is_mand THEN 1 ELSE 0 END, 1);
    END LOOP;
  END LOOP;
END $$;

-- Seed special duty places
DO $$
DECLARE
  sec_a_id UUID;
  sec_b_id UUID;
BEGIN
  SELECT id INTO sec_a_id FROM public.sections WHERE name = 'SECTION A';
  SELECT id INTO sec_b_id FROM public.sections WHERE name = 'SECTION B';

  INSERT INTO public.duty_places (name, section_id, type, gender_requirement, grade_requirement, mandatory_slots, max_prefects, required_gender_balance, same_grade_if_multiple) VALUES
    ('Main Gate (Gate A)', sec_a_id, 'special', NULL, '11', 4, 6, true, false),
    ('Shine Room', sec_a_id, 'special', 'F', '10,11', 1, 2, false, true),
    ('Prefect Duty Inspection', sec_a_id, 'inspection', NULL, '10,11', 1, 2, false, false),
    ('Rock Plateau', sec_b_id, 'special', NULL, '10,11', 1, 1, false, false),
    ('Gate B', sec_b_id, 'special', 'F', '10,11', 2, 2, false, true),
    ('Ground', sec_b_id, 'special', 'M', '10,11', 1, 1, false, false);
END $$;
