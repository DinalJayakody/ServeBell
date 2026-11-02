import { View } from 'react-native';
import { Text } from './Text';
import { useToneColors, type Tone } from './IconBadge';

/** Compact status pill, e.g. "In Progress", "Online", "Pending". */
export function Badge({ label, tone = 'neutral', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const { fg, bg } = useToneColors(tone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3.5, borderRadius: 999, backgroundColor: bg }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} /> : null}
      <Text variant="micro" style={{ color: fg }}>{label}</Text>
    </View>
  );
}
