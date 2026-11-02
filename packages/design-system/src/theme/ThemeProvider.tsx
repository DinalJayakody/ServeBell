import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radii, shadows, spacing, typography, type ColorScheme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Injected by the app (AsyncStorage) so this package has no storage dependency. */
export interface ThemeStorage {
  get(): Promise<string | null>;
  set(value: ThemePreference): Promise<void>;
}

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ColorScheme;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  shadows: (typeof shadows)['dark'];
}

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** False until the stored preference has been read, to avoid a theme flash. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const build = (scheme: 'light' | 'dark'): Theme => ({
  scheme,
  colors: scheme === 'dark' ? darkColors : lightColors,
  spacing,
  radii,
  typography,
  shadows: scheme === 'dark' ? shadows.dark : shadows.light,
});

export function ThemeProvider({ storage, children }: { storage: ThemeStorage; children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage
      .get()
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [storage]);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPref(p);
      storage.set(p).catch(() => undefined);
    },
    [storage],
  );

  const scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const value = useMemo(() => ({ theme: build(scheme), preference, setPreference, ready }), [scheme, preference, setPreference, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

export const useTheme = () => useThemeContext().theme;
