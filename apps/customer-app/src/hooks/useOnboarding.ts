import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'servebell.customer.onboarded';

export function useOnboardingSeen() {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setSeen(v === '1')).catch(() => setSeen(true));
  }, []);
  return seen;
}

export const markOnboardingSeen = () => AsyncStorage.setItem(KEY, '1');
