/**
 * ServeBell design tokens. Derived from the reference UI: deep navy surfaces,
 * a vivid "service blue" primary, teal for success. Light and dark are designed
 * separately (not inverted). Pure data — also importable by the web app.
 */

export const palette = {
  navy950: '#060D1D',
  navy900: '#0A1328',
  navy850: '#0D1832',
  navy800: '#122140',
  navy700: '#18294D',
  navy600: '#22365F',
  slate500: '#7A88A8',
  slate400: '#A3B1CF',
  slate300: '#C3CCDD',
  slate200: '#DCE5F3',
  slate100: '#EAF1FD',
  slate50: '#F3F7FE',
  white: '#FFFFFF',
  blue700: '#1A4FD8',
  blue600: '#1F63F5',
  blue500: '#2F7BFF',
  blue400: '#5B9BFF',
  blue300: '#8DBBFF',
  blue100: '#E2ECFF',
  teal500: '#14B8A6',
  teal400: '#1FD1B2',
  teal100: '#D8F7F1',
  amber500: '#F5A524',
  amber100: '#FEF1DA',
  red500: '#EF4444',
  red400: '#F87171',
  red100: '#FDE4E4',
} as const;

export interface ColorScheme {
  /** Two-stop vertical page gradient (top, bottom). */
  backgroundGradient: readonly [string, string];
  background: string;
  backgroundElevated: string;
  /** Translucent "glass" card fill that lets background photos glow through. */
  surface: string;
  surfaceMuted: string;
  surfacePressed: string;
  /** Highlighted/selected card fill (e.g. the selected service tile). */
  surfaceActive: string;
  border: string;
  borderStrong: string;
  borderActive: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  /** Accent text such as item names on the order screen. */
  textAccent: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  /** Pill buttons. */
  primaryGradient: readonly [string, string];
  /** The large "Need something?" card. */
  heroGradient: readonly [string, string];
  /** Icon circles with glow (bell, check). */
  iconGradient: readonly [string, string];
  successGradient: readonly [string, string];
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
  /** Gradient laid over photos so text stays readable. */
  photoScrim: readonly [string, string, string];
  tabBar: string;
  skeleton: string;
}

export const darkColors: ColorScheme = {
  backgroundGradient: ['#0F1D3C', '#0A1328'],
  background: palette.navy900,
  backgroundElevated: palette.navy850,
  surface: 'rgba(28, 46, 88, 0.62)',
  surfaceMuted: 'rgba(22, 36, 70, 0.72)',
  surfacePressed: 'rgba(40, 64, 120, 0.72)',
  surfaceActive: 'rgba(47, 108, 230, 0.22)',
  border: 'rgba(120, 155, 230, 0.16)',
  borderStrong: 'rgba(120, 155, 230, 0.30)',
  borderActive: 'rgba(91, 155, 255, 0.85)',
  text: palette.white,
  textSecondary: palette.slate400,
  textMuted: palette.slate500,
  textOnPrimary: palette.white,
  textAccent: palette.blue300,
  primary: palette.blue500,
  primaryPressed: palette.blue600,
  primarySoft: 'rgba(47, 123, 255, 0.18)',
  primaryGradient: ['#3D8CFF', '#1F5FF2'],
  heroGradient: ['#2F64E6', '#1B3B97'],
  iconGradient: ['#5EA2FF', '#2463EB'],
  successGradient: ['#2FE0BF', '#12A99A'],
  success: palette.teal400,
  successSoft: 'rgba(31, 209, 178, 0.16)',
  warning: palette.amber500,
  warningSoft: 'rgba(245, 165, 36, 0.18)',
  danger: palette.red400,
  dangerSoft: 'rgba(239, 68, 68, 0.16)',
  overlay: 'rgba(3, 8, 20, 0.64)',
  photoScrim: ['rgba(15, 29, 60, 0.15)', 'rgba(15, 29, 60, 0.72)', '#0F1D3C'],
  tabBar: '#0B1530',
  skeleton: palette.navy700,
};

export const lightColors: ColorScheme = {
  backgroundGradient: ['#DCE8FF', '#F4F8FF'],
  background: palette.slate50,
  backgroundElevated: palette.white,
  surface: 'rgba(255, 255, 255, 0.92)',
  surfaceMuted: palette.slate100,
  surfacePressed: palette.slate200,
  surfaceActive: palette.blue100,
  border: 'rgba(31, 99, 245, 0.10)',
  borderStrong: 'rgba(31, 99, 245, 0.22)',
  borderActive: palette.blue500,
  text: '#0E1B36',
  textSecondary: '#55627D',
  textMuted: '#8A96AE',
  textOnPrimary: palette.white,
  textAccent: palette.blue600,
  primary: palette.blue600,
  primaryPressed: palette.blue700,
  primarySoft: palette.blue100,
  primaryGradient: ['#3D8CFF', '#1F5FF2'],
  heroGradient: ['#3D7BFF', '#1F4FD0'],
  iconGradient: ['#5EA2FF', '#2463EB'],
  successGradient: ['#2FE0BF', '#12A99A'],
  success: '#0E9F84',
  successSoft: palette.teal100,
  warning: '#C77C05',
  warningSoft: palette.amber100,
  danger: '#DC2626',
  dangerSoft: palette.red100,
  overlay: 'rgba(13, 24, 48, 0.42)',
  photoScrim: ['rgba(220, 232, 255, 0.10)', 'rgba(220, 232, 255, 0.78)', '#DCE8FF'],
  tabBar: palette.white,
  skeleton: palette.slate200,
};

/** 4-pt spacing scale. */
export const spacing = { 0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48 } as const;

export const radii = { xs: 6, sm: 10, md: 12, lg: 14, xl: 18, pill: 999 } as const;

/** Inter is loaded by each app; system font is the fallback. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  title1: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  title2: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 24, letterSpacing: -0.2 },
  title3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 14.5, lineHeight: 20 },
  callout: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  captionStrong: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  micro: { fontFamily: fonts.medium, fontSize: 10.5, lineHeight: 13 },
} as const;
export type TypographyVariant = keyof typeof typography;

type Shadow = { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };

export const shadows: Record<'dark' | 'light', { card: Shadow; glow: Shadow }> = {
  dark: {
    card: { shadowColor: '#000', shadowOpacity: 0.30, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
    glow: { shadowColor: palette.blue500, shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
  },
  light: {
    card: { shadowColor: '#1F4FD0', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
    glow: { shadowColor: palette.blue600, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  },
};

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
