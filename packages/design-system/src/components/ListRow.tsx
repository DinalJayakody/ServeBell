import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeProvider';
import { usePressScale } from './Motion';
import { Text } from './Text';
import { InfoTip } from './InfoTip';

/** Settings/profile row: icon, title, optional subtitle and trailing content. */
export function ListRow({ icon, title, subtitle, trailing, onPress, destructive, info }: { icon?: ReactNode; title: string; subtitle?: string; trailing?: ReactNode; onPress?: () => void; destructive?: boolean; info?: string }) {
  const t = useTheme();
  const press = usePressScale(0.98);
  return (
    <Animated.View style={press.style}>
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        paddingHorizontal: 14,
        borderRadius: t.radii.lg,
        backgroundColor: pressed ? t.colors.surfacePressed : t.colors.surface,
        borderWidth: 1,
        borderColor: t.colors.border,
      })}
    >
      {icon}
      <View style={{ flex: 1, paddingVertical: 10 }}>
        <Text variant="callout" color={destructive ? 'danger' : 'text'}>{title}</Text>
        {subtitle ? <Text variant="caption" color="textMuted">{subtitle}</Text> : null}
      </View>
      {info ? <InfoTip text={info} title={title} /> : null}
      {trailing ?? (onPress ? <ChevronRight size={18} color={t.colors.textMuted} /> : null)}
    </Pressable>
    </Animated.View>
  );
}
