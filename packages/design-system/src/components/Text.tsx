import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { TypographyVariant } from '../theme/tokens';
import type { ColorScheme } from '../theme/tokens';

type ColorKey = { [K in keyof ColorScheme]: ColorScheme[K] extends string ? K : never }[keyof ColorScheme];

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: ColorKey;
  align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body', color = 'text', align, style, ...rest }: TextProps) {
  const t = useTheme();
  return <RNText {...rest} maxFontSizeMultiplier={1.4} style={[t.typography[variant], { color: t.colors[color], textAlign: align }, style]} />;
}
