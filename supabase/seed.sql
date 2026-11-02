-- Reference data only (safe to run on any environment, idempotent).
-- Demo restaurants and accounts are created through the API by backend/scripts/demo-scenario.ts,
-- never by SQL, so they get real Supabase Auth users and go through the same validation as users.
INSERT INTO public.categories (id, slug, name, "sortOrder") VALUES
  (gen_random_uuid(), 'fine-dining', 'Fine Dining', 0),
  (gen_random_uuid(), 'sri-lankan', 'Sri Lankan', 1),
  (gen_random_uuid(), 'seafood', 'Seafood', 2),
  (gen_random_uuid(), 'cafe', 'Café', 3),
  (gen_random_uuid(), 'italian', 'Italian', 4),
  (gen_random_uuid(), 'asian', 'Asian', 5),
  (gen_random_uuid(), 'fast-food', 'Fast Food', 6),
  (gen_random_uuid(), 'desserts', 'Desserts', 7)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, "sortOrder" = EXCLUDED."sortOrder";
