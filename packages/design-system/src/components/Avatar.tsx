import { Image, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { resolveMedia } from '../media';

export function Avatar({ uri, name, size = 44 }: { uri?: string | null; name: string; size?: number }) {
  const t = useTheme();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  const frame = { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: t.colors.borderStrong };
  const src = resolveMedia(uri);
  if (src) return <Image source={{ uri: src }} style={frame} accessibilityLabel={name} />;
  return (
    <View style={[frame, { backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]} accessibilityLabel={name}>
      <Text variant={size > 52 ? 'title3' : 'captionStrong'} color="primary">{initials}</Text>
    </View>
  );
}
