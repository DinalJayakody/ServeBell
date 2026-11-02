import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, BellRing, Clock, Heart, MapPin, Phone, Star, UtensilsCrossed, Check } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { Backdrop, Badge, Button, Card, ErrorState, IconBadge, InfoLabel, LoadingState, Screen, Text, useTheme } from '@servebell/design-system';
import { api, useSession } from '@servebell/mobile-core';
import { RestaurantLayout } from '@/components/RestaurantLayout';
import { formatHours, mediaUrl } from '@/lib/media';
import { useLastRestaurant } from '@/hooks/useLastRestaurant';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Section({ title, children, info }: { title: string; children: React.ReactNode; info?: string }) {
  return (
    <View style={{ gap: 10 }}>
      <InfoLabel label={title} info={info} variant="title3" color="text" />
      {children}
    </View>
  );
}

export default function RestaurantDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { slug, view } = useLocalSearchParams<{ slug: string; view?: string }>();
  const q = useQuery({ queryKey: queryKeys.restaurant(slug), queryFn: () => api.restaurants.detail(slug) });
  const remember = useLastRestaurant((s) => s.set);
  const qc = useQueryClient();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const fav = useMutation({
    mutationFn: (on: boolean) => (on ? api.favourites.add(q.data!.id) : api.favourites.remove(q.data!.id)),
    onMutate: (on) => qc.setQueryData(queryKeys.restaurant(slug), (d: typeof q.data) => (d ? { ...d, isFavourite: on } : d)),
    onSettled: () => { void qc.invalidateQueries({ queryKey: queryKeys.restaurant(slug) }); void qc.invalidateQueries({ queryKey: queryKeys.favourites }); },
  });
  useEffect(() => {
    if (q.data) remember(q.data.slug, q.data.name);
  }, [q.data, remember]);

  if (q.isPending) return <Screen><LoadingState /></Screen>;
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return <Screen><ErrorState network={q.error instanceof ApiError && q.error.isNetwork} message={notFound ? 'This restaurant is no longer available.' : q.error.message} onRetry={notFound ? undefined : () => void q.refetch()} /></Screen>;
  }
  const r = q.data;
  const cover = mediaUrl(r.coverUrl ?? r.images[0]?.url);
  const today = new Date().getDay();

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 260 }}>
          {cover ? (
            <Image source={cover} style={{ flex: 1 }} contentFit="cover" />
          ) : (
            <LinearGradient colors={[t.colors.surfacePressed, t.colors.background]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <UtensilsCrossed size={44} color={t.colors.textMuted} />
            </LinearGradient>
          )}
          <LinearGradient colors={['transparent', t.colors.backgroundGradient[0]]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }} />
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Back"
            style={{ position: 'absolute', top: insets.top + 8, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft size={20} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => (signedIn ? fav.mutate(!r.isFavourite) : router.push('/(auth)/sign-in'))}
            accessibilityLabel={r.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            style={{ position: 'absolute', top: insets.top + 8, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center' }}
          >
            <Heart size={20} color={r.isFavourite ? t.colors.danger : '#fff'} fill={r.isFavourite ? t.colors.danger : 'transparent'} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: -36, gap: 24 }}>
          <View style={{ gap: 8 }}>
            <Badge label={r.openNow ? 'Open now' : 'Closed'} tone={r.openNow ? 'success' : 'neutral'} dot />
            <Text variant="display">{r.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {r.ratingAvg ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Star size={14} color={t.colors.warning} fill={t.colors.warning} />
                  <Text variant="captionStrong">{r.ratingAvg.toFixed(1)}</Text>
                  <Text variant="caption" color="textMuted">({r.ratingCount} reviews)</Text>
                </View>
              ) : null}
              {r.categories.length ? <Text variant="caption" color="textSecondary">{r.categories.map((c) => c.name).join(' · ')}</Text> : null}
            </View>
            {r.description ? <Text variant="body" color="textSecondary">{r.description}</Text> : null}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="View Menu" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/menu/[slug]', params: { slug: r.slug, id: r.id, name: r.name } })} />
            {r.acceptsReservations ? <Button title="Reserve a table" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/reserve/[slug]', params: { slug: r.slug } })} /> : null}
          </View>

          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <MapPin size={18} color={t.colors.primary} />
              <Text variant="callout" style={{ flex: 1 }}>{r.addressLine}, {r.city}</Text>
            </View>
            {r.phone ? (
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Phone size={18} color={t.colors.primary} />
                <Text variant="callout">{r.phone}</Text>
              </View>
            ) : null}
          </Card>

          {r.hasFloorPlan ? <RestaurantLayout slug={r.slug} initialMode={view === '3d' ? '3d' : '2d'} /> : null}

          {r.services.length ? (
            <Section title="Service at your table" info="When you sit down, scan the QR code on your table with the Scan tab. You can then call a waiter, ask for water or the bill, order from the menu and chat — no need to wave anyone down.">
              <Text variant="caption" color="textSecondary">Scan the QR code on your table to request any of these instantly.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {r.services.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: s.isPrimary ? t.colors.primarySoft : t.colors.surface, borderWidth: 1, borderColor: s.isPrimary ? t.colors.primary : t.colors.border }}>
                    {s.isPrimary ? <BellRing size={14} color={t.colors.primary} /> : null}
                    <Text variant="captionStrong" color={s.isPrimary ? 'primary' : 'textSecondary'}>{s.name}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          <Section title="Opening hours" info="Times are in the restaurant’s local time. Reservations are only possible while it is open.">
            <Card padding={4}>
              {DAYS.map((d, i) => {
                const windows = r.openingHours.filter((h) => h.dayOfWeek === i);
                return (
                  <View key={d} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderRadius: t.radii.sm, backgroundColor: i === today ? t.colors.primarySoft : 'transparent' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {i === today ? <Clock size={14} color={t.colors.primary} /> : null}
                      <Text variant={i === today ? 'bodyStrong' : 'callout'}>{d}</Text>
                    </View>
                    <Text variant="callout" color="textSecondary">{windows.length ? windows.map((w) => `${formatHours(w.opensMinute)} – ${formatHours(w.closesMinute)}`).join(', ') : 'Closed'}</Text>
                  </View>
                );
              })}
            </Card>
          </Section>

          {r.amenities.length ? (
            <Section title="Amenities">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {r.amenities.map((a) => (
                  <View key={a.key} style={{ width: '47%', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <IconBadge size={32} tone="success" round><Check size={16} color={t.colors.success} /></IconBadge>
                    <Text variant="callout" style={{ flex: 1 }}>{a.name}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {r.utensils.length ? (
            <Section title="Available on request" info="Ask for any of these from your table once you have scanned its QR code.">
              <Text variant="callout" color="textSecondary">{r.utensils.filter((u) => u.isAvailable).map((u) => u.name).join(' · ')}</Text>
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
