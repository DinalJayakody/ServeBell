import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Star, UtensilsCrossed } from 'lucide-react-native';
import type { RestaurantSummary } from '@servebell/shared';
import { Badge, Text, useTheme } from '@servebell/design-system';
import { mediaUrl } from '@/lib/media';

export const RestaurantCard = memo(function RestaurantCard({ r, onPress }: { r: RestaurantSummary; onPress: () => void }) {
  const t = useTheme();
  const cover = mediaUrl(r.coverUrl);
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${r.name}, ${r.city}`} style={({ pressed }) => [{ borderRadius: t.radii.xl, overflow: 'hidden', borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface, opacity: pressed ? 0.9 : 1 }, t.shadows.card]}>
      <View style={{ height: 150 }}>
        {cover ? <Image source={cover} style={{ flex: 1 }} contentFit="cover" transition={150} cachePolicy="memory-disk" /> : (
          <LinearGradient colors={[t.colors.surfacePressed, t.colors.surfaceMuted]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <UtensilsCrossed size={30} color={t.colors.textMuted} />
          </LinearGradient>
        )}
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(5,12,28,0.55)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 }} />
        <View style={{ position: 'absolute', top: 10, left: 10 }}><Badge label={r.openNow ? 'Open now' : 'Closed'} tone={r.openNow ? 'success' : 'neutral'} dot /></View>
        {r.ratingAvg ? (
          <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: 'rgba(5,12,28,0.6)' }}>
            <Star size={12} color={t.colors.warning} fill={t.colors.warning} />
            <Text variant="captionStrong" style={{ color: '#fff' }}>{r.ratingAvg.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ padding: 14, gap: 4 }}>
        <Text variant="title3" numberOfLines={1}>{r.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <MapPin size={13} color={t.colors.textMuted} />
          <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
            {r.addressLine}{r.distanceKm !== null ? ` · ${r.distanceKm < 1 ? `${Math.round(r.distanceKm * 1000)} m` : `${r.distanceKm} km`}` : ''}
          </Text>
        </View>
        {r.categories.length ? <Text variant="caption" color="textMuted" numberOfLines={1}>{r.categories.map((c) => c.name).join(' · ')}</Text> : null}
      </View>
    </Pressable>
  );
});
