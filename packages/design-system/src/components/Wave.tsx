import { View } from 'react-native';
import { Hand } from 'lucide-react-native';
import { palette } from '../theme/tokens';

/**
 * Greeting wave. An icon rather than the 👋 emoji: Inter has no emoji glyphs and
 * React Native on iOS does not reliably fall back, which rendered "?" boxes.
 */
export function Wave({ size = 24 }: { size?: number }) {
  return (
    <View style={{ transform: [{ rotate: '-18deg' }], marginLeft: 6 }} accessibilityElementsHidden importantForAccessibility="no">
      <Hand size={size} color={palette.amber500} fill={palette.amber500} strokeWidth={1.5} />
    </View>
  );
}
