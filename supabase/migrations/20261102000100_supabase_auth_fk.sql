-- Supabase only: tie local profiles to Supabase Auth users. Deleting the auth user keeps the
-- profile (and its history) but unlinks it.
ALTER TABLE public.users
  ADD CONSTRAINT users_auth_user_fk FOREIGN KEY ("authUserId") REFERENCES auth.users (id) ON DELETE SET NULL;
