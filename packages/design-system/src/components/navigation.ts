import { fonts } from '../theme/tokens';
import type { Theme } from '../theme/ThemeProvider';

/** Shared bottom-tab styling for both apps (matches the reference tab bar). */
export function tabBarScreenOptions(t: Theme) {
  return {
    headerShown: false,
    tabBarActiveTintColor: t.colors.primary,
    tabBarInactiveTintColor: t.colors.textMuted,
    tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 10.5, marginTop: 2 },
    tabBarStyle: { backgroundColor: t.colors.tabBar, borderTopColor: t.colors.border, borderTopWidth: 1, height: 84, paddingTop: 8 },
    sceneStyle: { backgroundColor: 'transparent' },
  } as const;
}
