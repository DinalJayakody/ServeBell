import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { queryKeys } from '@servebell/api-client';
import { RealtimeEvent, topics, type RealtimeEnvelope, type ServiceMessageView, type ServiceRequestView } from '@servebell/shared';
import { queryClient } from './providers';
import { useSession } from './session';
import { supabase } from './supabase';

type Listener = (event: string, envelope: RealtimeEnvelope) => void;

const listeners = new Set<Listener>();
const channels = new Map<string, RealtimeChannel>();

/** Anything could have changed while not subscribed: REST is the source of truth. */
function refetchLiveData() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.services });
  void queryClient.invalidateQueries({ queryKey: queryKeys.activeVisit });
  void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
  void queryClient.invalidateQueries({ queryKey: queryKeys.reservations });
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
}

/** Private Supabase Broadcast topic; Postgres (servebell.can_receive) decides who may join. */
function subscribe(topic: string) {
  if (channels.has(topic)) return;
  const channel = supabase().channel(topic, { config: { private: true } });
  channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
    const envelope = payload as RealtimeEnvelope;
    apply(event, envelope);
    listeners.forEach((l) => l(event, envelope));
  });
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') refetchLiveData();
  });
  channels.set(topic, channel);
}

function unsubscribeAll(keep: string[] = []) {
  for (const [topic, channel] of channels) {
    if (keep.includes(topic)) continue;
    void supabase().removeChannel(channel);
    channels.delete(topic);
  }
}

/** Patches the cache from the payload where possible, then marks lists stale. */
function apply(event: string, envelope: RealtimeEnvelope) {
  if (event.startsWith('service.message')) {
    const m = envelope.data as ServiceMessageView;
    queryClient.setQueryData<ServiceMessageView[]>(queryKeys.serviceMessages(m.requestId), (prev) =>
      prev && !prev.some((x) => x.id === m.id) ? [...prev.filter((x) => x.clientMessageId !== m.clientMessageId || !m.clientMessageId), m] : prev,
    );
    return;
  }
  if (event.startsWith('service.')) {
    const s = envelope.data as ServiceRequestView;
    queryClient.setQueryData(queryKeys.service(s.id), (prev: object | undefined) => (prev ? { ...prev, ...s } : prev));
    void queryClient.invalidateQueries({ queryKey: queryKeys.services });
    void queryClient.invalidateQueries({ queryKey: queryKeys.serviceMessages(s.id) });
    return;
  }
  if (event.startsWith('order.')) {
    const o = envelope.data as { id: string };
    queryClient.setQueryData(queryKeys.order(o.id), envelope.data);
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    return;
  }
  if (event === RealtimeEvent.RESERVATION_UPDATED) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.reservations });
    void queryClient.invalidateQueries({ queryKey: ['availability'] });
    void queryClient.invalidateQueries({ queryKey: ['floor-plans'] });
    return;
  }
  if (event === RealtimeEvent.LAYOUT_UPDATED) {
    void queryClient.invalidateQueries({ queryKey: ['floor-plans'] });
    return;
  }
  if (event === RealtimeEvent.MENU_UPDATED) {
    void queryClient.invalidateQueries({ queryKey: ['menu'] });
    return;
  }
  if (event === RealtimeEvent.NOTIFICATION_CREATED) void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
}

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * Mount once near the root. Subscribes while signed in and in the foreground (push covers
 * the background); staff apps pass the restaurant whose staff topic to receive.
 */
export function useRealtime(options: { staffRestaurantId?: string | null } = {}) {
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.user?.id);
  const active = useAppActive();
  const staffRestaurantId = options.staffRestaurantId ?? null;

  useEffect(() => {
    if (status !== 'signedIn' || !userId || !active) {
      unsubscribeAll();
      return;
    }
    const wanted = [topics.user(userId), ...(staffRestaurantId ? [topics.restaurantStaff(staffRestaurantId)] : [])];
    unsubscribeAll(wanted);
    let cancelled = false;
    // Private channels authenticate with the current access token (refreshed by supabase-js afterwards).
    void supabase()
      .realtime.setAuth()
      .then(() => {
        if (!cancelled) wanted.forEach(subscribe);
      });
    return () => {
      cancelled = true;
    };
  }, [status, userId, staffRestaurantId, active]);
}

/** Subscribe to raw realtime events (e.g. to show an in-app alert). */
export function useRealtimeEvent(handler: Listener) {
  useEffect(() => {
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, [handler]);
}

export const realtimeStatus = () => ([...channels.values()].some((c) => c.state === 'joined') ? 'connected' : 'disconnected');
