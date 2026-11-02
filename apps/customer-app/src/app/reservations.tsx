import { Alert, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, Users } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import type { ReservationStatus } from '@servebell/shared';
import { Badge, Button, Card, EmptyState, LoadingState, Screen, ScreenHeader, Text, useTheme, type Tone } from '@servebell/design-system';
import { api } from '@servebell/mobile-core';

const TONE: Record<ReservationStatus, Tone> = { PENDING: 'warning', CONFIRMED: 'success', REJECTED: 'danger', CANCELLED: 'neutral', COMPLETED: 'primary', NO_SHOW: 'danger' };
const LABEL: Record<ReservationStatus, string> = { PENDING: 'Awaiting confirmation', CONFIRMED: 'Confirmed', REJECTED: 'Declined', CANCELLED: 'Cancelled', COMPLETED: 'Completed', NO_SHOW: 'No-show' };

export default function MyReservations() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: queryKeys.myReservations, queryFn: api.reservations.mine });
  const cancel = useMutation({ mutationFn: api.reservations.cancel, onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.reservations }), onError: (e) => Alert.alert('Couldn’t cancel', e.message) });
  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 20 }}><ScreenHeader title="My reservations" onBack={() => router.back()} info="Pending = waiting for the restaurant. Confirmed = your table is held for 90 minutes from the start time. You can cancel upcoming reservations here." /></View>
      {q.isPending ? <LoadingState /> : (
        <FlatList
          data={q.data}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={<CalendarDays size={26} color={t.colors.primary} />} title="No reservations yet" message="Open any restaurant and tap Reserve a table, or pick a table on its floor plan." />}
          renderItem={({ item: r }) => {
            const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat([], { timeZone: r.restaurant.timezone, ...o }).format(new Date(r.startsAt));
            const upcoming = new Date(r.startsAt).getTime() > Date.now();
            return (
              <Card style={{ gap: 10 }} onPress={() => router.push({ pathname: '/restaurant/[slug]', params: { slug: r.restaurant.slug } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="title3">{r.restaurant.name}</Text>
                    <Text variant="caption" color="textSecondary">{r.table ? `Table ${r.table.label}${r.table.zone ? ` · ${r.table.zone}` : ''}` : r.status === 'PENDING' ? 'Any table · the restaurant will assign one' : 'Table assigned on arrival'}</Text>
                  </View>
                  <Badge label={LABEL[r.status]} tone={TONE[r.status]} dot />
                </View>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><CalendarDays size={14} color={t.colors.textMuted} /><Text variant="callout">{f({ weekday: 'short', day: 'numeric', month: 'short' })}</Text></View>
                  <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><Clock size={14} color={t.colors.textMuted} /><Text variant="callout">{f({ hour: 'numeric', minute: '2-digit' })}</Text></View>
                  <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><Users size={14} color={t.colors.textMuted} /><Text variant="callout">{r.partySize}</Text></View>
                </View>
                {r.cancelReason ? <Text variant="caption" color="textSecondary">{r.cancelReason}</Text> : null}
                {upcoming && (r.status === 'PENDING' || r.status === 'CONFIRMED') ? (
                  <Button title="Cancel reservation" variant="outline" size="sm" onPress={() => Alert.alert('Cancel this reservation?', undefined, [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel it', style: 'destructive', onPress: () => cancel.mutate(r.id) }])} />
                ) : null}
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}
