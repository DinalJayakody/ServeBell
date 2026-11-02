import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', padding: 4, borderRadius: t.radii.pill, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border }} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, height: 34, borderRadius: t.radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? t.colors.primary : 'transparent' }}
          >
            <Text variant="captionStrong" style={{ color: active ? t.colors.textOnPrimary : t.colors.textSecondary }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
