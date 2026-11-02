import { useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, ShoppingBag } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { formatMoney, type OrderStatus, type OrderView } from '@servebell/shared';
import { Badge, Button, Card, EmptyState, ErrorState, InfoLabel, Screen, SegmentedControl, Skeleton, Text, Thumb, useTheme, type Tone } from '@servebell/design-system';
import { api, config, formatDuration, useNow } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';

const NEXT: Partial<Record<OrderStatus, { to: 'ACCEPTED' | 'PREPARING' | 'READY' | 'DELIVERED'; label: string }>> = {
  PENDING: { to: 'ACCEPTED', label: 'Accept order' },
  ACCEPTED: { to: 'PREPARING', label: 'Start preparing' },
  PREPARING: { to: 'READY', label: 'Mark ready' },
  READY: { to: 'DELIVERED', label: 'Mark served' },
};
const TONE: Record<OrderStatus, Tone> = { PENDING: 'warning', ACCEPTED: 'primary', PREPARING: 'primary', READY: 'success', DELIVERED: 'neutral', CANCELLED: 'danger' };
const media = (u: string | null) => (u ? (u.startsWith('http') ? u : `${config.apiUrl}${u}`) : null);

function OrderCard({ o, restaurantId, now }: { o: OrderView; restaurantId: string; now: number }) {
  const t = useTheme();
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: (v: { status: 'ACCEPTED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'; reason?: string }) => api.staffOrders.setStatus(restaurantId, o.id, v),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.orders }),
    onError: (e) => Alert.alert('Update failed', e.message),
  });
  const next = NEXT[o.status];
  return (
    <Card style={{ gap: 12, borderColor: o.status === 'PENDING' ? t.colors.warning : t.colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text variant="title3">Table {o.table.label}{o.guestCount ? ` · ${o.guestCount} guests` : ''}</Text>
          <Text variant="caption" color="textSecondary">Order #{o.number} · {o.customer.fullName}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Badge label={o.status === 'PENDING' ? 'New' : o.status.charAt(0) + o.status.slice(1).toLowerCase()} tone={TONE[o.status]} dot />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Clock size={12} color={t.colors.textMuted} />
            <Text variant="micro" color="textMuted">{formatDuration((o.deliveredAt ? new Date(o.deliveredAt).getTime() : now) - new Date(o.createdAt).getTime())}</Text>
          </View>
        </View>
      </View>
      {o.items.map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Thumb uri={media(i.imageUrl)} size={38} radius={19} />
          <View style={{ flex: 1 }}>
            <Text variant="callout" color="textAccent" numberOfLines={1}>{i.name}</Text>
            {i.options.length || i.note ? <Text variant="micro" color="textSecondary">{[...i.options, i.note].filter(Boolean).join(' · ')}</Text> : null}
          </View>
          <Text variant="bodyStrong">x{i.quantity}</Text>
        </View>
      ))}
      {o.note ? <Text variant="caption" color="textSecondary">Note: “{o.note}”</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="callout" color="textSecondary">Total</Text>
        <Text variant="bodyStrong">{formatMoney(o.totalCents, o.currency)}</Text>
      </View>
      {next ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {o.status === 'PENDING' || o.status === 'ACCEPTED' ? (
            <Button title="Cancel" variant="outline" size="md" style={{ flex: 1 }} disabled={set.isPending} onPress={() => Alert.alert('Cancel order', 'Tell the guest why.', [{ text: 'Back', style: 'cancel' }, { text: 'Item unavailable', onPress: () => set.mutate({ status: 'CANCELLED', reason: 'Item unavailable' }) }, { text: 'Kitchen closed', onPress: () => set.mutate({ status: 'CANCELLED', reason: 'Kitchen closed' }) }])} />
          ) : null}
          <Button title={next.label} size="md" style={{ flex: 2 }} loading={set.isPending} onPress={() => set.mutate({ status: next.to })} />
        </View>
      ) : null}
    </Card>
  );
}

export default function Orders() {
  const t = useTheme();
  const now = useNow(1000);
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const [view, setView] = useState<'open' | 'done'>('open');
  const list = useQuery({ queryKey: queryKeys.staffOrders(rid, view), queryFn: () => api.staffOrders.list(rid, view), enabled: !!rid });
  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 14, paddingBottom: 12 }}>
        <InfoLabel label="Orders" variant="title1" color="text" info="Food and drink orders placed from the menu at the table. Move each order through Preparing → Ready → Served so guests see progress." />
        <SegmentedControl value={view} onChange={setView} options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Completed' }]} />
      </View>
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12, flexGrow: 1 }}
        renderItem={({ item }) => <OrderCard o={item} restaurantId={rid} now={now} />}
        refreshControl={<RefreshControl tintColor={t.colors.primary} refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
        ListEmptyComponent={
          list.isPending ? <View style={{ gap: 12 }}>{[0, 1].map((i) => <Skeleton key={i} height={200} radius={t.radii.lg} />)}</View>
          : list.isError ? <ErrorState network={list.error instanceof ApiError && list.error.isNetwork} message={list.error.message} onRetry={() => void list.refetch()} />
          : <EmptyState icon={<ShoppingBag size={28} color={t.colors.primary} />} title={view === 'open' ? 'No open orders' : 'No completed orders yet'} message="New table orders appear here instantly." />
        }
      />
    </Screen>
  );
}
