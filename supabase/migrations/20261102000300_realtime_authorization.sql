-- Supabase only: who may receive which private Realtime Broadcast channel.
-- Topics (sent by the backend after a change commits):
--   user:{users.id}         one person (their requests, orders, reservations, notifications)
--   restaurant:{restaurants.id}  active staff of that restaurant
--   service:{service_requests.id} the requesting customer and the restaurant's active staff
-- Clients cannot publish: there is no INSERT policy, so only the backend (secret key) sends.

CREATE SCHEMA IF NOT EXISTS servebell;
REVOKE ALL ON SCHEMA servebell FROM PUBLIC;
GRANT USAGE ON SCHEMA servebell TO authenticated;

-- The application user behind the current Supabase session (null if not linked / deleted).
CREATE OR REPLACE FUNCTION servebell.app_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id FROM public.users u WHERE u."authUserId" = auth.uid() AND u."deletedAt" IS NULL
$$;

CREATE OR REPLACE FUNCTION servebell.can_receive(topic text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  kind text := split_part(topic, ':', 1);
  raw text := split_part(topic, ':', 2);
  me uuid := servebell.app_user_id();
  target uuid;
BEGIN
  IF me IS NULL OR raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR split_part(topic, ':', 3) <> '' THEN
    RETURN false;
  END IF;
  target := raw::uuid;
  IF kind = 'user' THEN
    RETURN target = me;
  ELSIF kind = 'restaurant' THEN
    RETURN EXISTS (SELECT 1 FROM public.restaurant_members m
                   WHERE m."restaurantId" = target AND m."userId" = me AND m.status = 'ACTIVE');
  ELSIF kind = 'service' THEN
    RETURN EXISTS (SELECT 1 FROM public.service_requests s
                   WHERE s.id = target AND (s."customerId" = me OR EXISTS (
                     SELECT 1 FROM public.restaurant_members m
                     WHERE m."restaurantId" = s."restaurantId" AND m."userId" = me AND m.status = 'ACTIVE')));
  END IF;
  RETURN false;
END $$;

REVOKE ALL ON FUNCTION servebell.app_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION servebell.can_receive(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION servebell.app_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION servebell.can_receive(text) TO authenticated;

DROP POLICY IF EXISTS "servebell: receive own private broadcasts" ON realtime.messages;
CREATE POLICY "servebell: receive own private broadcasts" ON realtime.messages
  FOR SELECT TO authenticated
  USING (realtime.messages.extension = 'broadcast' AND servebell.can_receive((SELECT realtime.topic())));
