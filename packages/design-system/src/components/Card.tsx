import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeProvider';
import { usePressScale } from './Motion';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padding?: number;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Card({ children, onPress, padding = 16, elevated, style, accessibilityLabel }: CardProps) {
  const t = useTheme();
  const press = usePressScale(0.98);
  const base: ViewStyle = { backgroundColor: t.colors.surface, borderRadius: t.radii.lg, borderWidth: 1, borderColor: t.colors.border, padding };
  if (!onPress) return <View style={[base, elevated && t.shadows.card, style]}>{children}</View>;
  return (
    <Animated.View style={press.style}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={({ pressed }) => [base, elevated && t.shadows.card, pressed && { backgroundColor: t.colors.surfacePressed }, style]}
    >
      {children}
    </Pressable>
    </Animated.View>
  );
}
