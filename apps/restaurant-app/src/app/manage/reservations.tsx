import { useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, Users } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Permission, type ReservationStatus, type ReservationView } from '@servebell/shared';
import { Badge, Button, Card, Chip, EmptyState, InfoLabel, LoadingState, Screen, ScreenHeader, Text, useTheme, type Tone } from '@servebell/design-system';
import { api } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';

const TONE: Record<ReservationStatus, Tone> = { PENDING: 'warning', CONFIRMED: 'success', REJECTED: 'danger', CANCELLED: 'neutral', COMPLETED: 'primary', NO_SHOW: 'danger' };
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace('_', '-');

export default function Reservations() {
  const t = useTheme();
  const qc = useQueryClient();
  const { membership, can } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const days = useMemo(() => Array.from({ length: 10 }, (_, i) => { const d = new Date(Date.now() + i * 86_400_000); return { key: d.toLocaleDateString('en-CA'), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric' }) }; }), []);
  const [date, setDate] = useState(days[0]!.key);
  const [status, setStatus] = useState<ReservationStatus | 'ALL'>('ALL');
  const q = useQuery({ queryKey: queryKeys.staffReservations(rid, date, status), queryFn: () => api.reservations.list(rid, { date, ...(status === 'ALL' ? {} : { status }) }), enabled: !!rid });
  const [assigning, setAssigning] = useState<string | null>(null);
  const tables = useQuery({ queryKey: queryKeys.tables(rid), queryFn: () => api.tables.list(rid), enabled: !!rid && !!assigning });
  const set = useMutation({
    mutationFn: (v: { id: string; status: Exclude<ReservationStatus, 'PENDING'>; reason?: string; tableId?: string }) => api.reservations.setStatus(rid, v.id, v.status, v.reason, v.tableId),
    onSuccess: () => setAssigning(null),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.reservations }),
    onError: (e) => Alert.alert('Couldn’t update', e.message),
  });
  const manage = can(Permission.RESERVATIONS_MANAGE);
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const card = ({ item: r }: { item: ReservationView }) => (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text variant="title3">{r.customer.fullName}</Text>
          <Text variant="caption" color={r.table ? 'textSecondary' : 'warning'}>{r.table ? `Table ${r.table.label}${r.table.zone ? ` · ${r.table.zone}` : ''}` : 'Any table · choose one when confirming'}{r.customer.phone ? ` · ${r.customer.phone}` : ''}</Text>
        </View>
        <Badge label={label(r.status)} tone={TONE[r.status]} dot />
      </View>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Clock size={14} color={t.colors.textMuted} /><Text variant="callout">{time(r.startsAt)} – {time(r.endsAt)}</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Users size={14} color={t.colors.textMuted} /><Text variant="callout">{r.partySize}</Text></View>
      </View>
      {r.note ? <Text variant="caption" color="textSecondary">“{r.note}”</Text> : null}
      {manage && r.status === 'PENDING' && assigning === r.id ? (
        <View style={{ gap: 8 }}>
          <InfoLabel label={`Choose a table for ${r.partySize}`} info="Only active tables that seat the whole party are listed. Tables already booked at this time are refused automatically." />
          {tables.isPending ? <LoadingState /> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(tables.data ?? []).filter((x) => x.isActive && x.capacity >= r.partySize).map((x) => <Chip key={x.id} label={`${x.label} · ${x.capacity}`} onPress={() => set.mutate({ id: r.id, status: 'CONFIRMED', tableId: x.id })} />)}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Back" variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => setAssigning(null)} />
            <Button title="Confirm without table" variant="outline" size="sm" style={{ flex: 1.6 }} onPress={() => set.mutate({ id: r.id, status: 'CONFIRMED' })} />
          </View>
        </View>
      ) : manage && r.status === 'PENDING' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Decline" variant="outline" size="md" style={{ flex: 1 }} onPress={() => Alert.alert('Decline reservation', 'Tell the guest why.', [{ text: 'Back', style: 'cancel' }, { text: 'Fully booked', onPress: () => set.mutate({ id: r.id, status: 'REJECTED', reason: 'Fully booked' }) }, { text: 'Closed that day', onPress: () => set.mutate({ id: r.id, status: 'REJECTED', reason: 'Closed that day' }) }])} />
          <Button title={r.table ? 'Confirm' : 'Choose table'} size="md" style={{ flex: 1 }} onPress={() => (r.table ? set.mutate({ id: r.id, status: 'CONFIRMED' }) : setAssigning(r.id))} />
        </View>
      ) : manage && r.status === 'CONFIRMED' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="No-show" variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => set.mutate({ id: r.id, status: 'NO_SHOW' })} />
          <Button title="Cancel" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => set.mutate({ id: r.id, status: 'CANCELLED', reason: 'Cancelled by the restaurant' })} />
          <Button title="Seated" size="sm" style={{ flex: 1 }} onPress={() => set.mutate({ id: r.id, status: 'COMPLETED' })} />
        </View>
      ) : null}
    </Card>
  );

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <ScreenHeader title="Reservations" subtitle="Double bookings are prevented automatically" onBack={() => router.back()} info="Guests book a specific table from your floor plan, or ask for any table. Confirm or decline pending requests; for any-table requests you pick the table. Mark guests as Seated or No-show on the day." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{days.map((d) => <Chip key={d.key} label={d.label} selected={date === d.key} onPress={() => setDate(d.key)} />)}</ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'] as const).map((s) => <Chip key={s} label={s === 'ALL' ? 'All' : label(s)} selected={status === s} onPress={() => setStatus(s)} />)}
        </ScrollView>
      </View>
      {q.isPending ? <LoadingState /> : (
        <FlatList data={q.data} keyExtractor={(r) => r.id} renderItem={card} contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={<CalendarDays size={26} color={t.colors.primary} />} title="No reservations" message="Bookings for this day appear here instantly." />} />
      )}
    </Screen>
  );
}
