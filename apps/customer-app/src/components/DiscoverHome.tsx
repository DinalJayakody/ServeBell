import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { LocateFixed, MapPin, QrCode, Search, SearchX } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { Appear, Avatar, Button, Card, Chip, EmptyState, ErrorState, HeroCard, IconCircle, Screen, Skeleton, Text, useTheme, Wave } from '@servebell/design-system';
import { api, useSession } from '@servebell/mobile-core';
import { RestaurantCard } from './RestaurantCard';
import { useDiscoveryLocation } from '@/hooks/useDiscoveryLocation';
import { useDebounced } from '@/hooks/useDebounced';
import { greeting } from '@/lib/media';

const CITIES = ['Colombo', 'Kandy', 'Galle', 'Negombo', 'Jaffna', 'Nuwara Eliya', 'Ella', 'Trincomalee'];

/** Home before you're seated: scan CTA + restaurant discovery (guests welcome). */
export function DiscoverHome() {
  const t = useTheme();
  const user = useSession((s) => s.user);
  const { state: loc, request } = useDiscoveryLocation();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [city, setCity] = useState<string | undefined>();
  const q = useDebounced(search.trim(), 300);
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: api.restaurants.categories, staleTime: 3_600_000 });
  const filters = useMemo(
    () => ({ q: q || undefined, category, city: loc.kind === 'located' ? undefined : city, ...(loc.kind === 'located' ? { lat: Number(loc.lat.toFixed(3)), lng: Number(loc.lng.toFixed(3)) } : {}) }),
    [q, category, city, loc],
  );
  const list = useInfiniteQuery({
    queryKey: queryKeys.restaurants(filters),
    queryFn: ({ pageParam }) => api.restaurants.list({ ...filters, cursor: pageParam, limit: 15 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: loc.kind !== 'checking',
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const header = (
    <View style={{ gap: 18, paddingTop: 10, paddingBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="callout" color="textSecondary">{greeting()}{user ? ',' : ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="title1" numberOfLines={1}>{user ? user.fullName.split(' ')[0] : 'Find your table'}</Text>
            {user ? <Wave /> : null}
          </View>
        </View>
        {user ? <Pressable onPress={() => router.navigate('/(tabs)/profile')}><Avatar name={user.fullName} uri={user.avatarUrl} size={54} /></Pressable> : null}
      </View>

      <HeroCard
        title="At a restaurant?"
        subtitle="Scan the QR code on your table to request service"
        icon={<IconCircle size={58}><QrCode size={28} color="#fff" /></IconCircle>}
        action={<Button title="Scan Table QR" size="md" fullWidth={false} onPress={() => router.push(user ? '/scan' : '/(auth)/sign-in')} style={{ minWidth: 160 }} />}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 16, borderRadius: t.radii.pill, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border }}>
        <Search size={17} color={t.colors.textMuted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search restaurants or places…" placeholderTextColor={t.colors.textMuted} returnKeyType="search" accessibilityLabel="Search restaurants" style={[t.typography.callout, { flex: 1, color: t.colors.text, paddingVertical: 0 }]} />
      </View>

      {loc.kind === 'ask' ? (
        <Card padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LocateFixed size={20} color={t.colors.primary} />
          <Text variant="callout" style={{ flex: 1 }}>See restaurants closest to you</Text>
          <Button title="Use location" size="sm" fullWidth={false} onPress={request} />
        </Card>
      ) : null}
      {loc.kind === 'denied' ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MapPin size={14} color={t.colors.textSecondary} />
            <Text variant="captionStrong" color="textSecondary">Choose a city</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="All of Sri Lanka" selected={!city} onPress={() => setCity(undefined)} />
            {CITIES.map((c) => <Chip key={c} label={c} selected={city === c} onPress={() => setCity(c)} />)}
          </ScrollView>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" selected={!category} onPress={() => setCategory(undefined)} />
        {categories.data?.map((c) => <Chip key={c.slug} label={c.name} selected={category === c.slug} onPress={() => setCategory(c.slug)} />)}
      </ScrollView>
      <Text variant="title3">{loc.kind === 'located' ? 'Nearby restaurants' : city ? `Restaurants in ${city}` : 'Popular restaurants'}</Text>
    </View>
  );

  return (
    <Screen padded={false} photo="restaurant" photoHeight={280}>
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 14, flexGrow: 1 }}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => <Appear index={index}><RestaurantCard r={item} onPress={() => router.push({ pathname: '/restaurant/[slug]', params: { slug: item.slug } })} /></Appear>}
        onEndReachedThreshold={0.4}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        refreshControl={<RefreshControl tintColor={t.colors.primary} refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
        ListEmptyComponent={
          list.isPending ? <View style={{ gap: 14 }}>{[0, 1].map((i) => <Skeleton key={i} height={230} radius={t.radii.xl} />)}</View>
          : list.isError ? <ErrorState network={list.error instanceof ApiError && list.error.isNetwork} message={list.error.message} onRetry={() => void list.refetch()} />
          : <EmptyState icon={<SearchX size={28} color={t.colors.primary} />} title="No restaurants found" message="Try a different name, city or category." />
        }
        ListFooterComponent={list.isFetchingNextPage ? <Skeleton height={230} radius={t.radii.xl} /> : undefined}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </Screen>
  );
}
