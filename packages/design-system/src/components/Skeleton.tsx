import { useEffect, useRef } from 'react';
import { Animated, type DimensionValue } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function Skeleton({ width = '100%', height = 14, radius = 8 }: { width?: DimensionValue; height?: number; radius?: number }) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width, height, borderRadius: radius, backgroundColor: t.colors.skeleton, opacity }} />;
}
