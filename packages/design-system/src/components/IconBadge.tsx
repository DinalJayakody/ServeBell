import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export function useToneColors(tone: Tone) {
  const c = useTheme().colors;
  return {
    primary: { fg: c.primary, bg: c.primarySoft },
    success: { fg: c.success, bg: c.successSoft },
    warning: { fg: c.warning, bg: c.warningSoft },
    danger: { fg: c.danger, bg: c.dangerSoft },
    neutral: { fg: c.textSecondary, bg: c.surfaceMuted },
  }[tone];
}

/** Rounded-square tinted icon container used on quick actions and list rows. */
export function IconBadge({ children, size = 44, tone = 'primary', round }: { children: ReactNode; size?: number; tone?: Tone; round?: boolean }) {
  const { bg } = useToneColors(tone);
  return (
    <View style={{ width: size, height: size, borderRadius: round ? size / 2 : size * 0.32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  );
}
