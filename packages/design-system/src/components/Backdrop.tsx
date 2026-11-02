import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';

export const images = {
  dining: require('../../assets/bg-dining.jpg') as ImageSourcePropType,
  restaurant: require('../../assets/bg-restaurant.jpg') as ImageSourcePropType,
  special: require('../../assets/special.jpg') as ImageSourcePropType,
};

export type BackdropPhoto = keyof typeof images | ImageSourcePropType;

/**
 * Page background used by every screen: navy gradient, optionally with a dim
 * restaurant photo that fades into the page (as in the reference design).
 */
export function Backdrop({ photo, photoHeight = 420, full, dim = 0.5, children }: { photo?: BackdropPhoto; photoHeight?: number; full?: boolean; dim?: number; children?: ReactNode }) {
  const t = useTheme();
  const source = typeof photo === 'string' ? images[photo] : photo;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Top half holds the first colour so photo scrims (which end in it) blend seamlessly. */}
      <LinearGradient colors={[t.colors.backgroundGradient[0], t.colors.backgroundGradient[0], t.colors.backgroundGradient[1]]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      {source ? (
        <View style={full ? StyleSheet.absoluteFill : { position: 'absolute', top: 0, left: 0, right: 0, height: photoHeight }}>
          <Image source={source} style={[StyleSheet.absoluteFill, { opacity: t.scheme === 'dark' ? dim : dim * 0.45 }]} resizeMode="cover" blurRadius={full ? 0 : 1} />
          <LinearGradient colors={t.colors.photoScrim} locations={[0, 0.65, 1]} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}
      {children}
    </View>
  );
}
