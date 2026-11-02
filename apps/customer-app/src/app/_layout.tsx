import { useCallback, useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { RealtimeEvent, type RealtimeEnvelope, type ServiceMessageView, type ServiceRequestView } from '@servebell/shared';
import { AppProviders, isFirebaseConfigured, showLocalAlert, startSession, useNotifications, useRealtime, useRealtimeEvent, useSession } from '@servebell/mobile-core';
import { useTheme } from '@servebell/design-system';

/** Live updates + alerts for the signed-in customer. */
function LiveUpdates() {
  const me = useSession((s) => s.user?.id);
  useRealtime();
  useNotifications('CUSTOMER', (id) => router.push({ pathname: '/request/[id]', params: { id } }));
  useRealtimeEvent(
    useCallback(
      (event: string, e: RealtimeEnvelope) => {
        if (event === RealtimeEvent.SERVICE_ACCEPTED) {
          const s = e.data as ServiceRequestView;
          void showLocalAlert('Request accepted', `${s.acceptedBy?.fullName ?? 'Your waiter'} is on the way.`, { serviceRequestId: s.id });
        } else if (event === RealtimeEvent.SERVICE_COMPLETED) {
          const s = e.data as ServiceRequestView;
          void showLocalAlert('Request completed', `${s.serviceType.name} · Table ${s.table.label}`, { serviceRequestId: s.id });
        } else if (event === RealtimeEvent.ORDER_UPDATED) {
          const o = e.data as { id: string; number: number; status: string };
          const copy: Record<string, string> = { ACCEPTED: 'accepted', PREPARING: 'being prepared', READY: 'ready', DELIVERED: 'served' };
          if (copy[o.status]) void showLocalAlert(`Order #${o.number}`, `Your order is ${copy[o.status]}.`, { orderId: o.id });
        } else if (event === RealtimeEvent.SERVICE_MESSAGE_CREATED) {
          const m = e.data as ServiceMessageView;
          if (m.senderRole === 'STAFF' && m.senderUserId !== me) void showLocalAlert(m.senderName ?? 'Restaurant', m.body, { serviceRequestId: m.requestId });
        }
      },
      [me],
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.backgroundGradient[1] } }}>
        <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="service" options={{ presentation: 'modal' }} />
        <Stack.Screen name="request/sent" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => (isFirebaseConfigured() ? startSession('CUSTOMER') : undefined), []);
  return (
    <AppProviders>
      <RootStack />
    </AppProviders>
  );
}
