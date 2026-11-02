import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import type { ClientApp } from '@servebell/shared';
import { api, useSession } from './session';

// Foreground: the socket already shows a local alert, so suppress the duplicate remote push.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const remote = (n.request.trigger as { type?: string } | null)?.type === 'push';
    const show = !(remote && AppState.currentState === 'active');
    return { shouldShowBanner: show, shouldShowList: true, shouldPlaySound: show, shouldSetBadge: false };
  },
});

let registeredToken: string | null = null;

/**
 * Remote push requires a real device and an EAS project id (`npx eas-cli init`).
 * Without them the app still gets in-app + local alerts via the socket.
 */
async function registerPush(app: ClientApp) {
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!Device.isDevice || !projectId) return;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (data === registeredToken) return;
    await api.devices.register({ expoPushToken: data, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', app });
    registeredToken = data;
  } catch {
    // Expo Go on Android has no remote push (SDK 53+); local alerts still work.
  }
}

export async function unregisterPush() {
  if (!registeredToken) return;
  await api.devices.unregister(registeredToken).catch(() => undefined);
  registeredToken = null;
}

/** Show an immediate local notification (works in Expo Go and simulators). */
export async function showLocalAlert(title: string, body: string, data: Record<string, string> = {}) {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({ content: { title, body, data, sound: 'default' }, trigger: null }).catch(() => undefined);
}

/** Mount once. Asks permission after sign-in, registers push, and routes taps. */
export function useNotifications(app: ClientApp, onOpenRequest: (serviceRequestId: string) => void) {
  const status = useSession((s) => s.status);
  const open = useRef(onOpenRequest);
  open.current = onOpenRequest;

  useEffect(() => {
    if (status !== 'signedIn') return;
    (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', { name: 'Service updates', importance: Notifications.AndroidImportance.HIGH });
      }
      const current = await Notifications.getPermissionsAsync();
      const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
      if (granted) await registerPush(app);
    })().catch(() => undefined);
  }, [status, app]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = (r.notification.request.content.data as { serviceRequestId?: string } | undefined)?.serviceRequestId;
      if (id) open.current(id);
    });
    return () => sub.remove();
  }, []);
}
