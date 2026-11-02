import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Map } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Button, Card, Chip, ErrorState, InfoLabel, Input, LoadingState, Screen, ScreenHeader, Skeleton, Text, useTheme } from '@servebell/design-system';
import { api, useSession } from '@servebell/mobile-core';

const MAX_PARTY = 12;

/** "Any table" booking: works for every restaurant, with or without a floor plan. */
export default function Reserve() {
  const t = useTheme();
  const qc = useQueryClient();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const r = useQuery({ queryKey: queryKeys.restaurant(slug), queryFn: () => api.restaurants.detail(slug) });
  const tz = r.data?.timezone ?? 'Asia/Colombo';
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return { key: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Intl.DateTimeFormat([], { timeZone: tz, weekday: 'short', day: 'numeric' }).format(d) };
  }), [tz]);
  const [date, setDate] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const day = date ?? days[0]!.key;
  const slots = useQuery({ queryKey: queryKeys.restaurantAvailability(slug, day, party), queryFn: () => api.reservations.restaurantAvailability(slug, day, party), enabled: !!r.data });
  const timeOnly = (iso: string) => new Intl.DateTimeFormat([], { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const book = useMutation({
    mutationFn: () => api.reservations.create({ restaurantId: r.data!.id, startsAt: slot!, partySize: party, note: note.trim() || null }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.reservations });
      const when = new Intl.DateTimeFormat([], { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(res.startsAt));
      Alert.alert('Reservation requested', `${res.restaurant.name} · ${when} for ${res.partySize}. The restaurant will confirm and choose your table — we’ll notify you.`, [{ text: 'My reservations', onPress: () => router.replace('/reservations') }, { text: 'OK', onPress: () => router.back() }]);
    },
    onError: (e) => { void slots.refetch(); Alert.alert('Couldn’t reserve', e.message); },
  });

  if (r.isPending) return <Screen><LoadingState /></Screen>;
  if (r.isError) return <Screen><ErrorState message={r.error.message} onRetry={() => void r.refetch()} /></Screen>;
  const open = slots.data?.filter((s) => s.available) ?? [];

  return (
    <Screen padded={false} footer={<Button title={slot ? `Request · ${timeOnly(slot)} for ${party}` : 'Choose a time'} disabled={!slot} loading={book.isPending} onPress={() => (signedIn ? book.mutate() : router.push('/(auth)/sign-in'))} />}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Reserve a table" subtitle={r.data.name} onBack={() => router.back()} info="Tell the restaurant how many of you are coming and when. They confirm and pick the best table for you. You can cancel from My reservations." />
        {r.data.hasFloorPlan ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Map size={20} color={t.colors.primary} />
            <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>Prefer a specific table? Pick one on the floor plan.</Text>
            <Button title="Floor plan" size="sm" variant="secondary" fullWidth={false} onPress={() => router.replace({ pathname: '/restaurant/[slug]', params: { slug } })} />
          </Card>
        ) : null}
        <InfoLabel label="Guests" info="Only times when a table big enough for your party is free are shown." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {Array.from({ length: MAX_PARTY }, (_, i) => i + 1).map((n) => <Chip key={n} label={String(n)} selected={party === n} onPress={() => { setParty(n); setSlot(null); }} />)}
        </ScrollView>
        <InfoLabel label="Date" info="You can book up to 60 days ahead, in the restaurant’s local time." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map((d) => <Chip key={d.key} label={d.label} selected={day === d.key} onPress={() => { setDate(d.key); setSlot(null); }} />)}
        </ScrollView>
        <InfoLabel label="Time (1 h 30 min)" info="Each reservation holds a table for 90 minutes. Times at least 30 minutes from now are shown." />
        {slots.isPending ? <Skeleton height={80} /> : open.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {open.map((s) => <Chip key={s.startsAt} label={timeOnly(s.startsAt)} selected={slot === s.startsAt} onPress={() => setSlot(s.startsAt)} />)}
          </View>
        ) : (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CalendarDays size={18} color={t.colors.textMuted} />
            <Text variant="caption" color="textMuted" style={{ flex: 1 }}>{slots.data?.length ? 'Fully booked for this party size on this day.' : 'No times on this day (closed or too soon). Try another date.'}</Text>
          </Card>
        )}
        <Input label="Note (optional)" info="Anything the restaurant should know: occasion, high chair, accessibility, seating preference." value={note} onChangeText={setNote} placeholder="Birthday, high chair, window seat…" maxLength={300} />
      </ScrollView>
    </Screen>
  );
}
