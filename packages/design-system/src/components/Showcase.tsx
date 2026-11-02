import type { ReactNode } from 'react';
import { Image, Pressable, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, Minus, Plus, UtensilsCrossed } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { InfoLabel, InfoTip } from './InfoTip';
import { resolveMedia } from '../media';
import Animated from 'react-native-reanimated';
import { ConfettiPiece, PopIn, Pulse, usePressScale } from './Motion';

/** Glowing gradient circle used for the bell, check marks and hero icons. */
export function IconCircle({ children, size = 56, tone = 'primary' }: { children: ReactNode; size?: number; tone?: 'primary' | 'success' }) {
  const t = useTheme();
  const colors = tone === 'success' ? t.colors.successGradient : t.colors.iconGradient;
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2 }, { shadowColor: colors[0], shadowOpacity: 0.65, shadowRadius: size / 3, shadowOffset: { width: 0, height: 0 }, elevation: 10 }]}>
      <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ flex: 1, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
        {children}
      </LinearGradient>
    </View>
  );
}

/** "Need something?" — the blue gradient call-to-action card. */
export function HeroCard({ title, subtitle, icon, action }: { title: string; subtitle: string; icon: ReactNode; action: ReactNode }) {
  const t = useTheme();
  return (
    <LinearGradient
      colors={t.colors.heroGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: t.radii.xl, padding: 18, gap: 14, borderWidth: 1, borderColor: 'rgba(140,180,255,0.35)', overflow: 'hidden' }, t.shadows.card]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="title2" style={{ color: '#fff' }}>{title}</Text>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.82)' }}>{subtitle}</Text>
        </View>
        {icon}
      </View>
      {action}
    </LinearGradient>
  );
}

/** Square-ish tile: icon on top, label (+ optional subtitle). Quick requests and Request Service grid. */
export function ActionTile({ icon, label, subtitle, onPress, selected, disabled, size = 'sm', style }: { icon: ReactNode; label: string; subtitle?: string; onPress?: () => void; selected?: boolean; disabled?: boolean; size?: 'sm' | 'lg'; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const press = usePressScale(0.95);
  return (
    <Animated.View style={[press.style, style]}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: selected ? t.colors.borderActive : t.colors.border,
          backgroundColor: selected || pressed ? t.colors.surfaceActive : t.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          gap: size === 'lg' ? 8 : 6,
          paddingVertical: size === 'lg' ? 20 : 12,
          paddingHorizontal: 8,
          opacity: disabled ? 0.6 : 1,
        },
        selected && t.shadows.glow,
      ]}
    >
      {icon}
      <Text variant={size === 'lg' ? 'bodyStrong' : 'micro'} align="center" numberOfLines={2} style={size === 'sm' ? { fontSize: 11, lineHeight: 13 } : undefined}>{label}</Text>
      {subtitle ? <Text variant="micro" color="textSecondary" align="center" numberOfLines={2}>{subtitle}</Text> : null}
    </Pressable>
    </Animated.View>
  );
}

export function SectionHeader({ title, action, info }: { title: string; action?: { label: string; onPress: () => void }; info?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <InfoLabel label={title} info={info} variant="title3" color="text" />
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button">
          <Text variant="captionStrong" color="primary">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Back arrow + title (+ subtitle) row used by pushed screens. */
export function ScreenHeader({ title, subtitle, onBack, right, large, info }: { title?: string; subtitle?: string; onBack?: () => void; right?: ReactNode; large?: boolean; info?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: large ? 'flex-start' : 'center', gap: 12, minHeight: 48, paddingVertical: 6 }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back" style={{ paddingTop: large ? 4 : 0 }}>
          <ArrowLeft size={22} color={t.colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant={large ? 'title1' : 'title3'} numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Text>
            {info ? <InfoTip text={info} title={title} /> : null}
          </View>
        ) : null}
        {subtitle ? <Text variant="caption" color="textSecondary" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Rounded food/restaurant photo with a designed fallback. */
export function Thumb({ uri, source, size = 58, radius = 12 }: { uri?: string | null; source?: ImageSourcePropType; size?: number; radius?: number }) {
  const t = useTheme();
  const resolved = resolveMedia(uri);
  const src = source ?? (resolved ? { uri: resolved } : null);
  if (src) return <Image source={src} style={{ width: size, height: size, borderRadius: radius, backgroundColor: t.colors.surfaceMuted }} />;
  return (
    <LinearGradient colors={[t.colors.surfacePressed, t.colors.surfaceMuted]} style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}>
      <UtensilsCrossed size={size * 0.38} color={t.colors.textMuted} />
    </LinearGradient>
  );
}

/** Small round "+" (outlined on dark, filled on light, as in the reference). */
export function PlusButton({ onPress, label, disabled }: { onPress: () => void; label: string; disabled?: boolean }) {
  const t = useTheme();
  const filled = t.scheme === 'light';
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: filled ? t.colors.primary : pressed ? t.colors.primarySoft : 'transparent', borderWidth: filled ? 0 : 1.5, borderColor: t.colors.primary, opacity: disabled ? 0.4 : 1 })}>
      <Plus size={15} color={filled ? '#fff' : t.colors.primary} strokeWidth={2.6} />
    </Pressable>
  );
}

export function QuantityStepper({ value, onChange, min = 0, max = 50 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const t = useTheme();
  const btn = (icon: ReactNode, next: number, label: string) => (
    <Pressable onPress={() => onChange(next)} disabled={next < min || next > max} hitSlop={6} accessibilityLabel={label} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.primarySoft }}>
      {icon}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {btn(<Minus size={14} color={t.colors.primary} />, value - 1, 'Decrease')}
      <Text variant="bodyStrong" style={{ minWidth: 18, textAlign: 'center' }}>{value}</Text>
      {btn(<Plus size={14} color={t.colors.primary} />, value + 1, 'Increase')}
    </View>
  );
}

/** Horizontal progress tracker: done = teal check, current = blue with icon, upcoming = outline. */
export function OrderStepper({ steps, current, currentIcon }: { steps: string[]; current: number; currentIcon?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row' }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : i <= current ? t.colors.primary : t.colors.borderStrong }} />
              {done ? (
                <IconCircle size={24} tone="success"><Check size={13} color="#fff" strokeWidth={3} /></IconCircle>
              ) : active ? (
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Pulse color={t.colors.primary} size={30} />
                  <IconCircle size={30}>{currentIcon ?? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}</IconCircle>
                </View>
              ) : (
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: t.colors.borderStrong }} />
              )}
              <View style={{ flex: 1, height: 2, backgroundColor: i === steps.length - 1 ? 'transparent' : i < current ? t.colors.primary : t.colors.borderStrong }} />
            </View>
            <Text variant="micro" color={active ? 'primary' : done ? 'text' : 'textMuted'} style={active ? { fontFamily: 'Inter_600SemiBold' } : undefined}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const CONFETTI = [
  { x: -96, y: -40, c: '#F87171', r: 25 }, { x: 92, y: -54, c: '#1FD1B2', r: -30 }, { x: -70, y: 52, c: '#F5A524', r: 60 },
  { x: 104, y: 30, c: '#5B9BFF', r: 15 }, { x: -118, y: 6, c: '#A78BFA', r: -45 }, { x: 60, y: -86, c: '#F5A524', r: 40 },
  { x: -40, y: -92, c: '#5B9BFF', r: -20 }, { x: 128, y: -14, c: '#F87171', r: 70 },
];

/** Big success check: spring pop-in, soft pulse and a confetti burst ("Request Sent!"). */
export function SuccessMark({ size = 88, tone = 'success' }: { size?: number; tone?: 'success' | 'primary' }) {
  const t = useTheme();
  return (
    <View style={{ width: 280, height: size + 80, alignItems: 'center', justifyContent: 'center' }}>
      {CONFETTI.map((p, i) => <ConfettiPiece key={i} x={p.x} y={p.y} color={p.c} rotate={p.r} delay={140 + i * 35} />)}
      <Pulse color={tone === 'success' ? t.colors.success : t.colors.primary} size={size} />
      <PopIn>
        <IconCircle size={size} tone={tone}>
          <Check size={size * 0.48} color="#fff" strokeWidth={3} />
        </IconCircle>
      </PopIn>
    </View>
  );
}
