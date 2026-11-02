import type { ReactNode } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Card, InfoLabel, InfoTip, Text, useTheme } from '@servebell/design-system';

export function ToggleRow({ label, hint, info, value, onChange, disabled }: { label: string; hint?: string; info?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <InfoLabel label={label} info={info} variant="callout" color="text" />
        {hint ? <Text variant="micro" color="textSecondary">{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: t.colors.primary, false: t.colors.surfacePressed }} thumbColor="#fff" />
    </View>
  );
}

export function StepperRow({ label, info, value, display, onChange, step = 1, min = -Infinity, max = Infinity }: { label: string; info?: string; value: number; display?: string; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  const t = useTheme();
  const btn = (icon: ReactNode, next: number, a11y: string) => (
    <Pressable accessibilityLabel={a11y} disabled={next < min || next > max} onPress={() => onChange(next)} hitSlop={6} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.colors.surfacePressed : t.colors.primarySoft, opacity: next < min || next > max ? 0.4 : 1 })}>
      {icon}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
      <View style={{ flex: 1 }}><InfoLabel label={label} info={info} variant="callout" color="text" /></View>
      {btn(<Minus size={16} color={t.colors.primary} />, value - step, `Decrease ${label}`)}
      <Text variant="bodyStrong" style={{ minWidth: 64, textAlign: 'center' }}>{display ?? String(value)}</Text>
      {btn(<Plus size={16} color={t.colors.primary} />, value + step, `Increase ${label}`)}
    </View>
  );
}

export function Section({ title, children, right, info }: { title: string; children: ReactNode; right?: ReactNode; info?: string }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="title3">{title}</Text>
          {info ? <InfoTip text={info} title={title} /> : null}
        </View>
        {right}
      </View>
      <Card style={{ gap: 6 }}>{children}</Card>
    </View>
  );
}

export const minutesLabel = (m: number) => {
  const mm = m % 1440;
  const h = Math.floor(mm / 60);
  return `${((h + 11) % 12) + 1}:${String(mm % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}${m >= 1440 ? ' (+1)' : ''}`;
};
