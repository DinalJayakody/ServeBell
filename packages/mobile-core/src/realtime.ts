import { useEffect } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { queryKeys } from '@servebell/api-client';
import { RealtimeCommand, RealtimeEvent, type RealtimeEnvelope, type ServiceMessageView, type ServiceRequestView } from '@servebell/shared';
import { config } from './config';
import { supabase } from './supabase';
import { queryClient } from './providers';
import { useSession } from './session';

type Listener = (event: string, envelope: RealtimeEnvelope) => void;

let socket: Socket | null = null;
const listeners = new Set<Listener>();
let staffRestaurantId: string | null = null;

function joinRooms() {
  if (socket?.connected && staffRestaurantId) socket.emit(RealtimeCommand.JOIN_RESTAURANT, { id: staffRestaurantId });
}

function connect() {
  if (socket) return socket;
  socket = io(config.apiUrl, {
    transports: ['websocket'],
    // Called on every (re)connect, so an expired access token is refreshed automatically.
    auth: (cb) => {
      supabase()
        .auth.getSession()
        .then(({ data }) => cb(data.session ? { token: data.session.access_token } : {}), () => cb({}));
    },
    reconnectionDelayMax: 10_000,
  });
  socket.on('connect', () => {
    joinRooms();
    // Anything could have changed while disconnected: REST is the source of truth.
    void queryClient.invalidateQueries({ queryKey: queryKeys.services });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activeVisit });
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
  });
  for (const event of Object.values(RealtimeEvent)) {
    socket.on(event, (envelope: RealtimeEnvelope) => {
      apply(event, envelope);
      listeners.forEach((l) => l(event, envelope));
    });
  }
  return socket;
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

function disconnect() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

/**
 * Mount once near the root. Connects while signed in; staff apps pass the
 * restaurant whose staff room to join (the server re-checks membership).
 */
export function useRealtime(options: { staffRestaurantId?: string | null } = {}) {
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.user?.id);

  useEffect(() => {
    staffRestaurantId = options.staffRestaurantId ?? null;
    joinRooms();
  }, [options.staffRestaurantId]);

  useEffect(() => {
    if (status !== 'signedIn' || !userId) {
      disconnect();
      return;
    }
    connect();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && socket && !socket.connected) socket.connect();
    });
    return () => sub.remove();
  }, [status, userId]);
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

export const realtimeStatus = () => (socket?.connected ? 'connected' : 'disconnected');
