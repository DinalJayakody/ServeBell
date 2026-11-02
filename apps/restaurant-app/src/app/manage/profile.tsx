import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Plus, Trash2 } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import type { ManagedRestaurant } from '@servebell/shared';
import { Badge, Button, Card, Input, LoadingState, Screen, ScreenHeader, Text, Thumb, useTheme } from '@servebell/design-system';
import { api, mediaUrl, pickAndUploadImage } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';
import { minutesLabel, Section, StepperRow } from '@/components/Form';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Hours = ManagedRestaurant['openingHours'];

export default function RestaurantProfile() {
  const t = useTheme();
  const qc = useQueryClient();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const q = useQuery({ queryKey: queryKeys.managed(rid), queryFn: () => api.manage.get(rid), enabled: !!rid });
  const [form, setForm] = useState({ name: '', description: '', phone: '', addressLine: '', city: '', escalationMinutes: 15 });
  const [hours, setHours] = useState<Hours>([]);
  useEffect(() => {
    if (!q.data) return;
    setForm({ name: q.data.name, description: q.data.description ?? '', phone: q.data.phone ?? '', addressLine: q.data.addressLine, city: q.data.city, escalationMinutes: q.data.escalationMinutes });
    setHours(q.data.openingHours);
  }, [q.data]);
  const done = (r: ManagedRestaurant) => qc.setQueryData(queryKeys.managed(rid), r);
  const save = useMutation({
    mutationFn: async () => {
      await api.manage.update(rid, { name: form.name, description: form.description || null, phone: form.phone || null, addressLine: form.addressLine, city: form.city, escalationMinutes: form.escalationMinutes });
      return api.manage.setHours(rid, hours);
    },
    onSuccess: (r) => { done(r); Alert.alert('Saved', 'Your restaurant details are up to date.'); },
    onError: (e) => Alert.alert('Couldn’t save', e.message),
  });
  const status = useMutation({ mutationFn: (s: 'ACTIVE' | 'DRAFT') => api.manage.setStatus(rid, s), onSuccess: done, onError: (e) => Alert.alert('Not yet', e.message) });
  const cover = useMutation({
    mutationFn: async () => {
      const f = await pickAndUploadImage('RESTAURANT_IMAGE', rid, [16, 9]);
      return f ? api.manage.update(rid, { coverFileId: f.id }) : null;
    },
    onSuccess: (r) => r && done(r),
  });
  if (!q.data) return <Screen><LoadingState /></Screen>;
  const setDay = (i: number, patch: Partial<Hours[number]>) => setHours((h) => h.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const field = (key: keyof typeof form, label: string, extra: object = {}) => <Input label={label} value={String(form[key])} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} {...extra} />;

  return (
    <Screen padded={false} footer={<Button title="Save changes" loading={save.isPending} onPress={() => save.mutate()} />}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 18 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Restaurant profile" onBack={() => router.back()} right={<Badge label={q.data.status === 'ACTIVE' ? 'Live' : 'Not live'} tone={q.data.status === 'ACTIVE' ? 'success' : 'warning'} dot />} />
        <Pressable onPress={() => cover.mutate()} style={{ borderRadius: t.radii.xl, overflow: 'hidden' }}>
          <Thumb uri={mediaUrl(q.data.coverUrl)} size={340} radius={t.radii.xl} />
          <View style={{ position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: t.colors.overlay }}>
            <Camera size={15} color="#fff" />
            <Text variant="captionStrong" style={{ color: '#fff' }}>{cover.isPending ? 'Uploading…' : 'Change photo'}</Text>
          </View>
        </Pressable>
        <Card style={{ gap: 12 }}>
          {field('name', 'Restaurant name')}
          {field('description', 'Description', { multiline: true })}
          {field('phone', 'Phone', { keyboardType: 'phone-pad', placeholder: '011 234 5678' })}
          {field('addressLine', 'Address')}
          {field('city', 'City')}
          <StepperRow label="Escalate unaccepted requests after" value={form.escalationMinutes} display={`${form.escalationMinutes} min`} min={1} max={240} step={5} onChange={(v) => setForm((f) => ({ ...f, escalationMinutes: Math.max(1, v) }))} />
        </Card>

        <Section title="Opening hours" info="Guests can only reserve within these hours. Add a second window for split shifts (e.g. lunch and dinner). Closing after midnight is supported." right={<Text variant="micro" color="textMuted">Restaurant local time</Text>}>
          {DAYS.map((d, day) => {
            const windows = hours.map((h, i) => ({ h, i })).filter((x) => x.h.dayOfWeek === day);
            return (
              <View key={d} style={{ paddingVertical: 6, borderBottomWidth: day < 6 ? 1 : 0, borderBottomColor: t.colors.border, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text variant="bodyStrong">{d}</Text>
                  <Pressable onPress={() => setHours((h) => [...h, { dayOfWeek: day, opensMinute: 660, closesMinute: 1320 }])} hitSlop={8} accessibilityLabel={`Add hours for ${d}`}>
                    <Plus size={18} color={t.colors.primary} />
                  </Pressable>
                </View>
                {windows.length === 0 ? <Text variant="caption" color="textMuted">Closed</Text> : null}
                {windows.map(({ h, i }) => (
                  <View key={i} style={{ gap: 2 }}>
                    <StepperRow label="Opens" value={h.opensMinute} display={minutesLabel(h.opensMinute)} step={30} min={0} max={h.closesMinute - 30} onChange={(v) => setDay(i, { opensMinute: v })} />
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}><StepperRow label="Closes" value={h.closesMinute} display={minutesLabel(h.closesMinute)} step={30} min={h.opensMinute + 30} max={2880} onChange={(v) => setDay(i, { closesMinute: v })} /></View>
                      <Pressable onPress={() => setHours((x) => x.filter((_, k) => k !== i))} hitSlop={8} style={{ marginLeft: 10 }} accessibilityLabel="Remove hours"><Trash2 size={17} color={t.colors.danger} /></Pressable>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
        </Section>

        <Card style={{ gap: 10 }}>
          <Text variant="title3">{q.data.status === 'ACTIVE' ? 'Your restaurant is live' : 'Go live'}</Text>
          <Text variant="caption" color="textSecondary">{q.data.status === 'ACTIVE' ? 'Guests can find you, scan tables, order and reserve.' : 'Guests can’t find you yet. Add opening hours and at least one menu item, then go live.'}</Text>
          <Button title={q.data.status === 'ACTIVE' ? 'Hide from guests' : 'Go live'} variant={q.data.status === 'ACTIVE' ? 'outline' : 'primary'} loading={status.isPending} onPress={() => status.mutate(q.data.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE')} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
