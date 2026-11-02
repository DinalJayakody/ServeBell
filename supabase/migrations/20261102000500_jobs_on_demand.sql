-- Serverless cost control (Vercel Hobby): pg_cron calls the API only when the database has due
-- work, so an idle system makes no function invocations. Visit expiry needs no API at all.

-- Mirrors the WHERE clause of EscalationJob.run() (backend/src/services/escalation.job.ts, MAX_LEVEL = 4).
CREATE OR REPLACE FUNCTION servebell.escalation_due() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_requests sr JOIN public.restaurants r ON r.id = sr."restaurantId"
    WHERE sr.status = 'PENDING' AND sr."escalationLevel" < 4
      AND sr."createdAt" + make_interval(mins => r."escalationMinutes" * (sr."escalationLevel" + 1)) <= now())
$$;

-- Mirrors PushWorker.sendQueued()/checkReceipts(); Expo keeps receipts for 24 h, so older tickets are ignored.
CREATE OR REPLACE FUNCTION servebell.push_due() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.push_deliveries WHERE status = 'QUEUED' AND "nextAttemptAt" <= now())
      OR EXISTS (SELECT 1 FROM public.push_deliveries
                 WHERE status = 'SENT' AND "receiptAt" IS NULL AND "ticketId" IS NOT NULL
                   AND "sentAt" < now() - interval '2 minutes' AND "sentAt" > now() - interval '24 hours')
$$;
REVOKE ALL ON FUNCTION servebell.escalation_due(), servebell.push_due() FROM PUBLIC, anon, authenticated;

-- cron.schedule with an existing name replaces that job.
SELECT cron.schedule('servebell-escalate', '30 seconds', $$SELECT servebell.tick('escalate') WHERE servebell.escalation_due()$$);
SELECT cron.schedule('servebell-push-sweep', '* * * * *', $$SELECT servebell.tick('push') WHERE servebell.push_due()$$);
-- Same statement as VisitsService.expireStale(); no events are emitted for expiry.
SELECT cron.schedule('servebell-expire-visits', '* * * * *', $$
  UPDATE public.restaurant_visits SET status = 'EXPIRED', "endedAt" = now() WHERE status = 'ACTIVE' AND "expiresAt" <= now()
$$);
