import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type LocationState =
  | { kind: 'checking' }
  | { kind: 'ask' }
  | { kind: 'denied' }
  | { kind: 'located'; lat: number; lng: number };

/**
 * One-shot location for "near me" sorting. Never watches position: a single
 * last-known/current fix is enough for discovery and saves battery.
 */
export function useDiscoveryLocation() {
  const [state, setState] = useState<LocationState>({ kind: 'checking' });

  const locate = useCallback(async () => {
    try {
      const pos = (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setState({ kind: 'located', lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setState({ kind: 'denied' });
    }
  }, []);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? locate() : setState({ kind: p.canAskAgain ? 'ask' : 'denied' })))
      .catch(() => setState({ kind: 'denied' }));
  }, [locate]);

  const request = useCallback(async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.granted) await locate();
    else setState({ kind: 'denied' });
  }, [locate]);

  return { state, request };
}
