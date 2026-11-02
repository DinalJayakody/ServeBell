import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { formatMoney, type OrderView, type ServiceRequestView } from '@servebell/shared';
import { Appear, Avatar, EmptyState, ErrorState, IconBadge, InfoLabel, Screen, SegmentedControl, ServiceIcon, Skeleton, Text, Thumb, useTheme } from '@servebell/design-system';
import { api, ServiceStatusBadge, timeAgo, useNow, useSession } from '@servebell/mobile-core';
import { SignInPrompt } from '@/components/SignInPrompt';
import { mediaUrl } from '@/lib/media';

type Tab = 'all' | 'requests' | 'orders';
type Item = { kind: 'req'; r: ServiceRequestView; at: string } | { kind: 'order'; o: OrderView; at: string };

function Row({ left, title, body, right, onPress }: { left: React.ReactNode; title: string; body: string; right: React.ReactNode; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radii.lg, backgroundColor: pressed ? t.colors.surfacePressed : t.colors.surface, borderWidth: 1, borderColor: t.colors.border })}>
      {left}
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="captionStrong" numberOfLines={1}>{title}</Text>
        <Text variant="micro" color="textSecondary" numberOfLines={1}>{body}</Text>
      </View>
      {right}
    </Pressable>
  );
}

/** Reference "Messages" screen: conversations, request statuses and orders. */
export default function Requests() {
  const t = useTheme();
  const now = useNow(60_000);
  const status = useSession((s) => s.status);
  const [tab, setTab] = useState<Tab>('all');
  const services = useInfiniteQuery({
    queryKey: queryKeys.myServices(false),
    queryFn: ({ pageParam }) => api.services.mine({ cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: status === 'signedIn',
  });
  const orders = useQuery({ queryKey: queryKeys.myOrders(false), queryFn: () => api.orders.mine({ limit: 30 }), enabled: status === 'signedIn' });
  if (status !== 'signedIn') return <Screen><SignInPrompt title="Your requests live here" message="Sign in to see your requests, orders and messages." /></Screen>;

  const reqs = services.data?.pages.flatMap((p) => p.items) ?? [];
  const all: Item[] = [
    ...(tab !== 'orders' ? reqs.map((r): Item => ({ kind: 'req', r, at: r.lastMessage?.createdAt ?? r.createdAt })) : []),
    ...(tab !== 'requests' ? (orders.data?.items ?? []).map((o): Item => ({ kind: 'order', o, at: o.createdAt })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const pending = services.isPending || orders.isPending;
  const error = services.error ?? orders.error;

  const renderRow = (item: Item) => {
    if (item.kind === 'order') {
      const o = item.o;
      return (
        <Row
          left={<Thumb uri={mediaUrl(o.items.find((i) => i.imageUrl)?.imageUrl)} size={44} radius={22} />}
          title={`Order #${o.number} · ${o.restaurant.name}`}
          body={`${o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')} · ${formatMoney(o.totalCents, o.currency)}`}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Text variant="micro" color="textMuted">{timeAgo(o.createdAt, now)}</Text><Text variant="micro" color="primary">{o.status.charAt(0) + o.status.slice(1).toLowerCase()}</Text></View>}
          onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
        />
      );
    }
    const r = item.r;
    const m = r.lastMessage;
    const fromStaff = m?.senderRole === 'STAFF';
    return (
      <Row
        left={r.acceptedBy ? <Avatar name={r.acceptedBy.fullName} uri={r.acceptedBy.avatarUrl} size={44} /> : <IconBadge size={44} round><ServiceIcon icon={r.serviceType.icon} kind={r.serviceType.kind} size={20} color={t.colors.primary} /></IconBadge>}
        title={tab === 'requests' ? r.serviceType.name : fromStaff ? (m?.senderName ?? 'Waiter') : m?.senderRole === 'CUSTOMER' ? 'You' : r.restaurant.name}
        body={tab === 'requests' ? `${r.restaurant.name} · Table ${r.table.label}` : (m?.body ?? r.serviceType.name)}
        right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Text variant="micro" color="textMuted">{timeAgo(item.at, now)}</Text>{tab === 'requests' ? <ServiceStatusBadge status={r.status} /> : null}</View>}
        onPress={() => router.push({ pathname: tab === 'all' ? '/chat/[id]' : '/request/[id]', params: { id: r.id } })}
      />
    );
  };

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 14, paddingBottom: 12 }}>
        <InfoLabel label="Messages" variant="title1" color="text" info="Your requests and chats with the restaurant staff during your visit." />
        <SegmentedControl<Tab> value={tab} onChange={setTab} options={[{ value: 'all', label: 'All' }, { value: 'requests', label: 'Requests' }, { value: 'orders', label: 'Orders' }]} />
      </View>
      <FlatList
        data={all}
        keyExtractor={(i) => (i.kind === 'req' ? i.r.id : i.o.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 10, flexGrow: 1 }}
        refreshControl={<RefreshControl tintColor={t.colors.primary} refreshing={services.isRefetching} onRefresh={() => void Promise.all([services.refetch(), orders.refetch()])} />}
        onEndReached={() => services.hasNextPage && !services.isFetchingNextPage && void services.fetchNextPage()}
        renderItem={({ item, index }) => <Appear index={index}>{renderRow(item)}</Appear>}
        ListEmptyComponent={
          pending ? <View style={{ gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={68} radius={t.radii.lg} />)}</View>
          : error ? <ErrorState network={error instanceof ApiError && error.isNetwork} message={error.message} onRetry={() => void Promise.all([services.refetch(), orders.refetch()])} />
          : <EmptyState icon={<ClipboardList size={28} color={t.colors.primary} />} title="Nothing yet" message="Requests, orders and messages from your table appear here." />
        }
      />
    </Screen>
  );
}
