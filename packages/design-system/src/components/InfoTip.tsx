import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Info } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text, type TextProps } from './Text';

const BUBBLE_W = 270;

/**
 * Small ⓘ button that shows a short guide. Tap (or long-press) to open, tap anywhere to close.
 * Rendered in a Modal so the bubble is never clipped by scroll views or cards.
 */
export function InfoTip({ text, title, size = 16 }: { text: string; title?: string; size?: number }) {
  const t = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const ref = useRef<ComponentRef<typeof Pressable>>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const open = () => ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  const below = anchor ? anchor.y < screenH * 0.6 : true;
  const left = anchor ? Math.min(Math.max(12, anchor.x + anchor.w / 2 - BUBBLE_W / 2), screenW - BUBBLE_W - 12) : 0;

  return (
    <>
      <Pressable ref={ref} onPress={open} onLongPress={open} hitSlop={10} accessibilityRole="button" accessibilityLabel={`About ${title ?? 'this option'}`} accessibilityHint={text}>
        <Info size={size} color={t.colors.primary} />
      </Pressable>
      <Modal transparent visible={!!anchor} animationType="none" onRequestClose={() => setAnchor(null)} statusBarTranslucent>
        <Pressable style={{ flex: 1 }} onPress={() => setAnchor(null)} accessibilityLabel="Close guide">
          {anchor ? (
            <Animated.View
              entering={FadeIn.duration(140)}
              exiting={FadeOut.duration(100)}
              style={{
                position: 'absolute', left, width: BUBBLE_W,
                ...(below ? { top: anchor.y + anchor.h + 8 } : { bottom: screenH - anchor.y + 8 }),
                backgroundColor: t.colors.backgroundElevated, borderRadius: t.radii.md, padding: 14, gap: 4,
                borderWidth: 1, borderColor: t.colors.primary, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
              }}
            >
              {title ? <Text variant="captionStrong" color="primary">{title}</Text> : null}
              <Text variant="caption">{text}</Text>
            </Animated.View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

/** A label with an optional ⓘ guide next to it. */
export function InfoLabel({ label, info, variant = 'captionStrong', color = 'textSecondary', right }: { label: string; info?: string; variant?: TextProps['variant']; color?: TextProps['color']; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text variant={variant} color={color}>{label}</Text>
      {info ? <InfoTip text={info} title={label} size={14} /> : null}
      {right ? <View style={{ marginLeft: 'auto' }}>{right}</View> : null}
    </View>
  );
}
