-- Run with: supabase test db
-- Database-level security: RLS everywhere, no client table access, Realtime channel isolation.
BEGIN;
SELECT plan(19);

-- ── Fixtures (as the database owner) ──
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'staff-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-00000000000b', 'staff-b@test.local', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-00000000000c', 'guest-c@test.local', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-00000000000d', 'guest-d@test.local', 'authenticated', 'authenticated');
INSERT INTO public.users (id, "authUserId", email, "fullName", "updatedAt") VALUES
  ('10000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'staff-a@test.local', 'Staff A', now()),
  ('10000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', 'staff-b@test.local', 'Staff B', now()),
  ('10000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-00000000000c', 'guest-c@test.local', 'Guest C', now()),
  ('10000000-0000-4000-8000-00000000000d', 'd0000000-0000-4000-8000-00000000000d', 'guest-d@test.local', 'Guest D', now());
INSERT INTO public.restaurants (id, slug, name, "addressLine", city, status, "updatedAt") VALUES
  ('20000000-0000-4000-8000-000000000001', 'rest-one', 'Restaurant One', 'x', 'Colombo', 'ACTIVE', now()),
  ('20000000-0000-4000-8000-000000000002', 'rest-two', 'Restaurant Two', 'y', 'Kandy', 'ACTIVE', now());
INSERT INTO public.restaurant_members (id, "restaurantId", "userId", role, "employeeCode", "updatedAt") VALUES
  (gen_random_uuid(), '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', 'WAITER', 'E1', now()),
  (gen_random_uuid(), '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000b', 'WAITER', 'E2', now());
INSERT INTO public.service_types (id, "restaurantId", kind, name, "updatedAt") VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'WAITER', 'Call waiter', now());
INSERT INTO public.restaurant_tables (id, "restaurantId", label, capacity, "updatedAt") VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'T1', 4, now());
INSERT INTO public.restaurant_visits (id, "restaurantId", "tableId", "customerId", "expiresAt") VALUES
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', now() + interval '3 hours');
INSERT INTO public.service_requests (id, "restaurantId", "tableId", "visitId", "customerId", "serviceTypeId", "updatedAt") VALUES
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', '30000000-0000-4000-8000-000000000001', now());

-- ── RLS everywhere ──
SELECT is_empty('SELECT * FROM public.servebell_tables_without_rls', 'every public table has RLS enabled');

-- ── Publishable key without a session (anon) gets nothing ──
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.users', '42501', NULL, 'anon cannot read users');
SELECT throws_ok('SELECT * FROM public.restaurants', '42501', NULL, 'anon cannot read restaurants');
SELECT throws_ok($$INSERT INTO public.service_requests (id) VALUES (gen_random_uuid())$$, '42501', NULL, 'anon cannot create service requests');
RESET ROLE;

-- ── Signed-in app user gets no direct table access either (the API is the only path) ──
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
SELECT throws_ok('SELECT * FROM public.service_requests', '42501', NULL, 'customer cannot read service_requests directly');
SELECT throws_ok($$UPDATE public.users SET "platformRole" = 'PLATFORM_ADMIN'$$, '42501', NULL, 'customer cannot escalate their own role');
SELECT throws_ok('SELECT * FROM public.servebell_tables_without_rls', '42501', NULL, 'helper view is not exposed');

-- ── Realtime channel authorisation ──
-- Staff A (Restaurant One)
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
SELECT ok(servebell.can_receive('restaurant:20000000-0000-4000-8000-000000000001'), 'staff receives own restaurant channel');
SELECT ok(NOT servebell.can_receive('restaurant:20000000-0000-4000-8000-000000000002'), 'staff cannot receive another restaurant');
SELECT ok(servebell.can_receive('service:60000000-0000-4000-8000-000000000001'), 'staff receives requests of own restaurant');
SELECT ok(NOT servebell.can_receive('user:10000000-0000-4000-8000-00000000000c'), 'staff cannot receive a guest''s private channel');
-- Staff B (Restaurant Two)
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
SELECT ok(NOT servebell.can_receive('service:60000000-0000-4000-8000-000000000001'), 'other restaurant''s staff cannot receive the request');
-- Guest C (owns the request)
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
SELECT ok(servebell.can_receive('user:10000000-0000-4000-8000-00000000000c'), 'guest receives own user channel');
SELECT ok(servebell.can_receive('service:60000000-0000-4000-8000-000000000001'), 'guest receives own request');
SELECT ok(NOT servebell.can_receive('restaurant:20000000-0000-4000-8000-000000000001'), 'guest cannot receive staff channel');
-- Guest D (someone else)
SELECT set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
SELECT ok(NOT servebell.can_receive('service:60000000-0000-4000-8000-000000000001'), 'another guest cannot receive the request');
SELECT ok(NOT servebell.can_receive('user:10000000-0000-4000-8000-00000000000c'), 'another guest cannot receive a user channel');
SELECT ok(NOT servebell.can_receive('user:not-a-uuid') AND NOT servebell.can_receive('user:10000000-0000-4000-8000-00000000000d:extra'), 'malformed topics are rejected');
RESET ROLE;

-- A suspended member loses the staff channel immediately.
UPDATE public.restaurant_members SET status = 'SUSPENDED' WHERE "userId" = '10000000-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
SELECT ok(NOT servebell.can_receive('restaurant:20000000-0000-4000-8000-000000000001'), 'suspended staff loses the restaurant channel');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
