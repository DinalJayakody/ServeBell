import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useThemeContext, type ThemePreference } from '@servebell/design-system';

/** Development only: exp://<host>:<port>/--/dev/theme?mode=light|dark|system (same as Profile → Appearance). */
export default function DevTheme() {
  const { mode } = useLocalSearchParams<{ mode?: ThemePreference }>();
  const { setPreference } = useThemeContext();
  useEffect(() => {
    if (__DEV__ && (mode === 'light' || mode === 'dark' || mode === 'system')) setPreference(mode);
  }, [mode, setPreference]);
  return <Redirect href="/" />;
}
