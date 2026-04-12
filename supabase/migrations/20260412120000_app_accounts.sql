-- App login accounts (username/password/role) shared across devices when using Supabase.
-- Same RLS model as other tables: open to anon key; tighten in production if needed.

CREATE TABLE public.app_accounts (
  id TEXT NOT NULL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'duty_editor', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.app_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on app_accounts" ON public.app_accounts FOR SELECT USING (true);
CREATE POLICY "Allow public insert on app_accounts" ON public.app_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on app_accounts" ON public.app_accounts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete on app_accounts" ON public.app_accounts FOR DELETE USING (true);
