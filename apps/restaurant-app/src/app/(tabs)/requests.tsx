import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { Permission, type ServiceView } from '@servebell/shared';
import { Appear, Chip, EmptyState, ErrorState, InfoLabel, Screen, Skeleton, Text, useTheme } from '@servebell/design-system';
import { api, useNow } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';
import { RequestCard } from '@/components/RequestCard';

const VIEWS: { value: ServiceView; label: string; empty: string }[] = [
  { value: 'pending', label: 'Pending', empty: 'All caught up. New requests appear here instantly.' },
  { value: 'mine', label: 'Mine', empty: 'Requests you accept appear here.' },
  { value: 'others', label: 'Others', empty: 'Requests handled by teammates or left for others.' },
  { value: 'done', label: 'Done', empty: 'Completed requests appear here.' },
];

export default function RequestsTab() {
  const t = useTheme();
  const now = useNow(1000);
  const { membership, can } = useActiveMembership();
  const [view, setView] = useState<ServiceView>('pending');
  const restaurantId = membership?.restaurantId ?? '';
  const views = can(Permission.SERVICES_MONITOR) ? [...VIEWS, { value: 'all' as const, label: 'All', empty: 'No requests yet.' }] : VIEWS;
  const list = useInfiniteQuery({
    queryKey: queryKeys.staffServices(restaurantId, view),
    queryFn: ({ pageParam }) => api.staffServices.list(restaurantId, { view, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: !!restaurantId,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 12, paddingBottom: 12 }}>
        <InfoLabel label="Requests" variant="title1" color="text" info="Live service requests from guests. Accept one to take it; it moves to Mine. Unaccepted requests escalate after 15 minutes. Pending = nobody has taken it yet." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {views.map((v) => <Chip key={v.value} label={v.label} selected={view === v.value} onPress={() => setView(v.value)} />)}
        </ScrollView>
      </View>
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12, flexGrow: 1 }}
        renderItem={({ item, index }) => <Appear index={index}><RequestCard r={item} restaurantId={restaurantId} now={now} mine={item.acceptedBy?.memberId === membership?.memberId} /></Appear>}
        refreshControl={<RefreshControl tintColor={t.colors.primary} refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        ListEmptyComponent={
          list.isPending ? <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={128} radius={t.radii.lg} />)}</View>
          : list.isError ? <ErrorState network={list.error instanceof ApiError && list.error.isNetwork} message={list.error.message} onRetry={() => void list.refetch()} />
          : <EmptyState icon={<Inbox size={28} color={t.colors.primary} />} title="Nothing here" message={views.find((v) => v.value === view)?.empty} />
        }
      />
    </Screen>
  );
}
