import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { MapPin, Users } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { Badge, Button, Card, Chip, ErrorState, InfoLabel, Input, LoadingState, Screen, ScreenHeader, Skeleton, Text, Thumb, useTheme } from '@servebell/design-system';
import { api, mediaUrl, statusColor, TABLE_STATUS_LABEL, useSession } from '@servebell/mobile-core';

const PLACE: Record<string, string> = { WINDOW: 'Window', DOOR: 'Door', ENTRANCE: 'Entrance', BAR: 'Bar', KITCHEN: 'Kitchen', RESTROOM: 'Washrooms', STAGE: 'Stage', PLANT: 'Greenery', PILLAR: 'Pillar', SCREEN: 'Big screen', TV: 'TV', OTHER: 'Feature' };

/** Table details + reservation with live availability (times in the restaurant's timezone). */
export default function TableScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id, slug } = useLocalSearchParams<{ id: string; slug: string }>();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const table = useQuery({ queryKey: queryKeys.table(slug, id), queryFn: () => api.floorPlans.table(slug, id) });
  const tz = table.data?.restaurant.timezone ?? 'Asia/Colombo';
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return { key: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Intl.DateTimeFormat([], { timeZone: tz, weekday: 'short', day: 'numeric' }).format(d) };
  }), [tz]);
  const [date, setDate] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const day = date ?? days[0]!.key;
  const slots = useQuery({ queryKey: queryKeys.availability(id, day, party), queryFn: () => api.reservations.availability(id, day, party), enabled: !!table.data?.isReservable });
  const book = useMutation({
    mutationFn: () => api.reservations.create({ tableId: id, startsAt: slot!, partySize: party, note: note.trim() || null }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: queryKeys.reservations });
      Alert.alert('Reservation requested', `Table ${r.table?.label ?? table.data?.label} · ${fmt(r.startsAt)} for ${r.partySize}. We’ll notify you when the restaurant confirms.`, [{ text: 'My reservations', onPress: () => router.replace('/reservations') }, { text: 'OK' }]);
      setSlot(null);
    },
    onError: (e) => { void slots.refetch(); Alert.alert(e instanceof ApiError && e.code === 'TABLE_UNAVAILABLE' ? 'Just booked' : 'Couldn’t reserve', e.message); },
  });
  const fmt = (iso: string) => new Intl.DateTimeFormat([], { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const timeOnly = (iso: string) => new Intl.DateTimeFormat([], { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  if (table.isPending) return <Screen><LoadingState /></Screen>;
  if (table.isError) return <Screen><ErrorState message={table.error.message} onRetry={() => void table.refetch()} /></Screen>;
  const tb = table.data;
  const photos = tb.imageUrls.map(mediaUrl).filter(Boolean) as string[];

  return (
    <Screen padded={false} footer={tb.isReservable ? <Button title={slot ? `Reserve · ${timeOnly(slot)}` : 'Choose a time'} disabled={!slot} loading={book.isPending} onPress={() => (signedIn ? book.mutate() : router.push('/(auth)/sign-in'))} /> : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={`Table ${tb.label}`} subtitle={tb.restaurant.name} onBack={() => router.back()} right={<Badge label={TABLE_STATUS_LABEL[tb.status]} tone={tb.status === 'AVAILABLE' ? 'success' : tb.status === 'OCCUPIED' ? 'danger' : 'warning'} dot />} />
        {photos.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {photos.map((p) => <Image key={p} source={p} style={{ width: 300, height: 190, borderRadius: t.radii.xl }} contentFit="cover" />)}
          </ScrollView>
        ) : <View style={{ alignItems: 'center' }}><Thumb size={120} radius={t.radii.xl} /></View>}
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Users size={16} color={t.colors.primary} /><Text variant="callout">Up to {tb.capacity} guests</Text></View>
            {tb.zone ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><MapPin size={16} color={t.colors.primary} /><Text variant="callout">{tb.zone}</Text></View> : null}
          </View>
          {tb.floorPlanName ? <Text variant="caption" color="textSecondary">{tb.floorPlanName} · {tb.shape.toLowerCase()} table</Text> : null}
          {tb.description ? <Text variant="body">{tb.description}</Text> : null}
          {tb.features.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{tb.features.map((f) => <Badge key={f} label={f} tone="primary" />)}</View> : null}
          {tb.nearby.length ? <Text variant="caption" color="textSecondary">Nearby: {tb.nearby.map((n) => `${n.label ?? PLACE[n.kind]} (${n.distanceM} m)`).join(' · ')}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor(t.colors, tb.status) }} />
            <Text variant="micro" color="textSecondary">Right now: {TABLE_STATUS_LABEL[tb.status].toLowerCase()}</Text>
          </View>
        </Card>

        {tb.isReservable ? (
          <View style={{ gap: 12 }}>
            <InfoLabel label="Reserve this table" variant="title3" color="text" info="Pick your party size, a day and a time. The restaurant confirms your request and you get a notification. You can cancel from My reservations." />
            <Text variant="captionStrong" color="textSecondary">Guests</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {Array.from({ length: tb.capacity }, (_, i) => i + 1).map((n) => <Chip key={n} label={String(n)} selected={party === n} onPress={() => { setParty(n); setSlot(null); }} />)}
            </ScrollView>
            <Text variant="captionStrong" color="textSecondary">Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map((d) => <Chip key={d.key} label={d.label} selected={day === d.key} onPress={() => { setDate(d.key); setSlot(null); }} />)}
            </ScrollView>
            <Text variant="captionStrong" color="textSecondary">Time (1 h 30 min)</Text>
            {slots.isPending ? <Skeleton height={80} /> : slots.data?.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {slots.data.filter((s) => s.available).map((s) => <Chip key={s.startsAt} label={timeOnly(s.startsAt)} selected={slot === s.startsAt} onPress={() => setSlot(s.startsAt)} />)}
              </View>
            ) : <Text variant="caption" color="textMuted">No times available on this day. Try another date.</Text>}
            {slots.data && slots.data.length > 0 && !slots.data.some((s) => s.available) ? <Text variant="caption" color="textMuted">Fully booked on this day.</Text> : null}
            <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Birthday, high chair, …" maxLength={300} />
          </View>
        ) : <Text variant="caption" color="textMuted">This table can’t be reserved in advance — just walk in.</Text>}
      </ScrollView>
    </Screen>
  );
}
