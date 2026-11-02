import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * Motion primitives. All run on the UI thread (Reanimated) and respect the
 * system "Reduce Motion" setting.
 */

const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.6 };

/** Subtle scale-down while pressed. Spread the handlers onto a Pressable inside an Animated.View. */
export function usePressScale(amount = 0.97) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      scale.value = withSpring(amount, PRESS_SPRING);
    },
    onPressOut: () => {
      scale.value = withSpring(1, PRESS_SPRING);
    },
  };
}

/** Staggered fade-and-rise entrance for list items and sections. */
export function Appear({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.duration(420).delay(Math.min(index, 8) * 60).springify().damping(18).reduceMotion(ReduceMotion.System)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Gentle "ring" every few seconds — used on the service bell. */
export function Ringing({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const reduced = useReducedMotion();
  const angle = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) return;
    const swing = (deg: number) => withTiming(deg, { duration: 90, easing: Easing.inOut(Easing.quad) });
    angle.value = withRepeat(withSequence(withDelay(2600, swing(-16)), swing(14), swing(-10), swing(8), swing(-4), swing(0)), -1);
  }, [active, reduced, angle]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Soft breathing ring behind an element (live / attention states). */
export function Pulse({ color, size, active = true }: { color: string; size: number; active?: boolean }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) return;
    p.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
  }, [active, reduced, p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - p.value), transform: [{ scale: 1 + p.value * 0.55 }] }));
  if (!active) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

/** Spring pop-in (success marks, badges). */
export function PopIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(reduced ? 1 : 0.3);
  const o = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    s.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 180 }));
    o.value = withDelay(delay, withTiming(1, { duration: 220 }));
  }, [delay, s, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** One confetti piece bursting from the centre to (x, y). */
export function ConfettiPiece({ x, y, color, rotate, delay }: { x: number; y: number; color: string; rotate: number; delay: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    t.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 90 }));
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 1.6),
    transform: [{ translateX: x * t.value }, { translateY: y * t.value }, { rotate: `${rotate * t.value}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', width: 10, height: 4, borderRadius: 2, backgroundColor: color }, style]} />;
}
