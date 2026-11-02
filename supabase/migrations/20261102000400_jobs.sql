-- Supabase only: timers that used to run inside the long-lived Nest process.
-- pg_cron ticks the (serverless) backend through pg_net; the backend keeps all business logic
-- (escalation, notifications, realtime, push), so behaviour is identical to the Oracle version.
-- The API base URL and a shared secret come from Supabase Vault; without them ticks are no-ops,
-- which keeps local stacks and fresh projects quiet until configured:
--   select vault.create_secret('https://<api-host>', 'servebell_api_url');
--   select vault.create_secret('<random 48+ chars>', 'servebell_cron_secret');   -- same value as CRON_SECRET on the API
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION servebell.tick(job text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE base text; secret text;
BEGIN
  SELECT decrypted_secret INTO base FROM vault.decrypted_secrets WHERE name = 'servebell_api_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'servebell_cron_secret';
  IF base IS NULL OR secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := rtrim(base, '/') || '/api/v1/internal/jobs/' || job,
    headers := jsonb_build_object('content-type', 'application/json', 'x-servebell-cron', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000);
END $$;
REVOKE ALL ON FUNCTION servebell.tick(text) FROM PUBLIC, anon, authenticated;

-- Escalation threshold is minutes; a 30 s tick keeps it accurate to half a minute.
SELECT cron.schedule('servebell-escalate', '30 seconds', $$SELECT servebell.tick('escalate')$$);
SELECT cron.schedule('servebell-expire-visits', '* * * * *', $$SELECT servebell.tick('expire-visits')$$);
-- Safety sweep for push retries and Expo receipts; new pushes are flushed immediately (trigger below).
SELECT cron.schedule('servebell-push-sweep', '* * * * *', $$SELECT servebell.tick('push')$$);

CREATE OR REPLACE FUNCTION servebell.push_enqueued() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM servebell.tick('push');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS push_deliveries_flush ON public.push_deliveries;
CREATE TRIGGER push_deliveries_flush AFTER INSERT ON public.push_deliveries
  FOR EACH STATEMENT EXECUTE FUNCTION servebell.push_enqueued();

-- Retention (free tier = 500 MB): keep job logs, delivered pushes and old read notifications small.
SELECT cron.schedule('servebell-retention', '17 3 * * *', $$
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days';
  DELETE FROM public.push_deliveries WHERE "createdAt" < now() - interval '30 days';
  DELETE FROM public.notifications WHERE "readAt" IS NOT NULL AND "createdAt" < now() - interval '180 days';
  DELETE FROM public.audit_logs WHERE "createdAt" < now() - interval '365 days';
$$);
