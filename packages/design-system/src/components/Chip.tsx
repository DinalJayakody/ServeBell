import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeProvider';
import { usePressScale } from './Motion';
import { Text } from './Text';

/** Filter chip (menu categories, restaurant categories). */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const press = usePressScale(0.94);
  return (
    <Animated.View style={press.style}>
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 32,
        paddingHorizontal: 14,
        borderRadius: t.radii.pill,
        justifyContent: 'center',
        backgroundColor: selected ? t.colors.primary : pressed ? t.colors.surfacePressed : t.colors.surface,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.border,
      })}
    >
      <Text variant="captionStrong" style={{ color: selected ? t.colors.textOnPrimary : t.colors.textSecondary }}>{label}</Text>
    </Pressable>
    </Animated.View>
  );
}
