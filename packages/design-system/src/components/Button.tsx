import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { usePressScale } from './Motion';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  /** primary: gradient pill · secondary: tinted · outline: glass pill (e.g. Cancel) · ghost: text link · danger · light: white pill on blue */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'light';
  size?: 'lg' | 'md' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT = { lg: 50, md: 42, sm: 32 } as const;

export function Button({ title, variant = 'primary', size = 'lg', loading, icon, fullWidth = true, disabled, style, onPressIn, onPressOut, ...rest }: ButtonProps) {
  const t = useTheme();
  const press = usePressScale(0.965);
  const inactive = disabled || loading;
  const fg = {
    primary: t.colors.textOnPrimary,
    danger: t.colors.textOnPrimary,
    secondary: t.colors.primary,
    outline: t.colors.text,
    ghost: t.colors.primary,
    light: t.colors.primaryPressed,
  }[variant];

  const content = (
    <View style={styles.row}>
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text variant={size === 'sm' ? 'captionStrong' : 'bodyStrong'} style={{ color: fg }} numberOfLines={1}>{title}</Text>
    </View>
  );

  // `flex` sizes the outer wrapper only; on the inner pressable it would collapse its fixed height.
  const { flex, ...innerStyle } = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  return (
    <Animated.View style={[press.style, { alignSelf: fullWidth ? 'stretch' : 'flex-start' }, flex !== undefined ? { flex } : null]}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPressIn={(e) => { press.onPressIn(); onPressIn?.(e); }}
      onPressOut={(e) => { press.onPressOut(); onPressOut?.(e); }}
      {...rest}
      style={({ pressed }) => [
        { height: HEIGHT[size], borderRadius: t.radii.pill, overflow: variant === 'primary' ? 'visible' : 'hidden', alignSelf: fullWidth ? 'stretch' : 'flex-start', opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
        variant === 'primary' && t.shadows.glow,
        variant === 'secondary' && { backgroundColor: t.colors.primarySoft },
        variant === 'outline' && { borderWidth: 1, borderColor: t.colors.borderStrong, backgroundColor: t.colors.surface },
        variant === 'danger' && { backgroundColor: t.colors.danger },
        variant === 'light' && { backgroundColor: '#FFFFFF' },
        innerStyle,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={t.colors.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, { borderRadius: t.radii.pill, paddingHorizontal: size === 'sm' ? 14 : 22 }]}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.fill, { paddingHorizontal: size === 'sm' ? 14 : 22 }]}>{content}</View>
      )}
    </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
