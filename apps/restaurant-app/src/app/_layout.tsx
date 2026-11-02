import { useCallback, useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { RealtimeEvent, type RealtimeEnvelope, type ServiceMessageView, type ServiceRequestView } from '@servebell/shared';
import { AppProviders, isFirebaseConfigured, session, showLocalAlert, startSession, useNotifications, useRealtime, useRealtimeEvent, useSession } from '@servebell/mobile-core';
import { useTheme } from '@servebell/design-system';
import { useActiveMembership } from '@/lib/active-restaurant';

/** Joins the active restaurant's staff room and raises alerts for new/overdue requests. */
function LiveUpdates() {
  const me = useSession((s) => s.user?.id);
  const { membership } = useActiveMembership();
  const restaurantId = membership?.restaurantId ?? null;
  useRealtime({ staffRestaurantId: restaurantId });
  useNotifications('RESTAURANT', (id) => router.push({ pathname: '/request/[id]', params: { id } }));
  useRealtimeEvent(
    useCallback(
      (event: string, e: RealtimeEnvelope) => {
        if (event === RealtimeEvent.NOTIFICATION_CREATED) {
          const n = e.data as { type: string; title: string; body: string };
          if (n.type.startsWith('onboarding.')) {
            void showLocalAlert(n.title, n.body);
            // Approval creates the OWNER membership: refresh so the app opens the restaurant tools.
            if (n.type === 'onboarding.approved') void session.refreshUser().catch(() => undefined);
          }
          return;
        }
        if (e.restaurantId !== restaurantId) return;
        if (event === RealtimeEvent.SERVICE_CREATED) {
          const s = e.data as ServiceRequestView;
          void showLocalAlert(`Table ${s.table.label}: ${s.serviceType.name}`, s.note ? `“${s.note}”` : 'New request — tap to respond.', { serviceRequestId: s.id });
        } else if (event === RealtimeEvent.SERVICE_ESCALATED) {
          const s = e.data as ServiceRequestView;
          void showLocalAlert(`Overdue: Table ${s.table.label}`, `${s.serviceType.name} is still waiting.`, { serviceRequestId: s.id });
        } else if (event === RealtimeEvent.ORDER_CREATED) {
          const o = e.data as { id: string; number: number; table: { label: string }; items: { quantity: number }[] };
          void showLocalAlert(`New order · Table ${o.table.label}`, `Order #${o.number} · ${o.items.reduce((s, i) => s + i.quantity, 0)} item(s)`, { orderId: o.id });
        } else if (event === RealtimeEvent.SERVICE_MESSAGE_CREATED) {
          const m = e.data as ServiceMessageView;
          if (m.senderRole === 'CUSTOMER' && m.senderUserId !== me) void showLocalAlert('New message from a table', m.body, { serviceRequestId: m.requestId });
        }
      },
      [restaurantId, me],
    ),
  );
  return null;
}

function RootStack() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <LiveUpdates />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.backgroundGradient[1] } }} />
    </>
  );
}

export default function RootLayout() {
  useEffect(() => (isFirebaseConfigured() ? startSession('RESTAURANT') : undefined), []);
  return (
    <AppProviders>
      <RootStack />
    </AppProviders>
  );
}
