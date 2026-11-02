import { useState } from 'react';
import { Alert, FlatList, Pressable, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { ServiceKind } from '@servebell/shared';
import { Badge, Button, Card, Chip, IconBadge, Input, Screen, ScreenHeader, SegmentedControl, ServiceIcon, Text, useTheme } from '@servebell/design-system';
import { api } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';

type Tab = 'services' | 'utensils' | 'amenities';
type Row = { id: string; name: string; description: string | null; active: boolean; badge?: string; kind?: string; icon?: string | null; primary?: boolean; available?: boolean };
const ICONS = ['bell-ring', 'glass-water', 'utensils', 'wine', 'scroll-text', 'receipt-text', 'sparkles', 'hand-helping'];

/** What guests can request (services), utensils and amenities — all shown in the customer app. */
export default function Catalog() {
  const t = useTheme();
  const qc = useQueryClient();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const [tab, setTab] = useState<Tab>('services');
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string; kind: ServiceKind; icon: string; key: string } | null>(null);
  const services = useQuery({ queryKey: queryKeys.manageList(rid, 'service-types'), queryFn: () => api.manage.serviceTypes(rid), enabled: !!rid });
  const utensils = useQuery({ queryKey: queryKeys.manageList(rid, 'utensils'), queryFn: () => api.manage.utensils(rid), enabled: !!rid });
  const amenities = useQuery({ queryKey: queryKeys.manageList(rid, 'amenities'), queryFn: () => api.manage.amenities(rid), enabled: !!rid });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['manage', rid] }), qc.invalidateQueries({ queryKey: ['restaurants'] }), qc.invalidateQueries({ queryKey: ['visits'] })]);
  const err = (e: Error) => Alert.alert('Couldn’t save', e.message);

  const toggle = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: 'isActive' | 'isAvailable' | 'isPrimary'; value: boolean }): Promise<unknown> =>
      tab === 'services' ? api.manage.saveServiceType(rid, { [field]: value } as never, id) : tab === 'utensils' ? api.manage.saveUtensil(rid, { [field]: value } as never, id) : api.manage.saveAmenity(rid, { [field]: value } as never, id),
    onSettled: refresh,
    onError: err,
  });
  const save = useMutation({
    mutationFn: (): Promise<unknown> => {
      const e = editing!;
      const base = { name: e.name.trim(), description: e.description.trim() || null };
      if (tab === 'services') return api.manage.saveServiceType(rid, { ...base, kind: e.kind, icon: e.icon }, e.id);
      if (tab === 'utensils') return api.manage.saveUtensil(rid, { ...base, icon: e.icon }, e.id);
      return api.manage.saveAmenity(rid, { ...base, icon: e.icon, ...(e.id ? {} : { key: e.key || e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }) }, e.id);
    },
    onSuccess: () => { setEditing(null); void refresh(); },
    onError: err,
  });
  const remove = useMutation({
    mutationFn: (id: string) => (tab === 'services' ? api.manage.deleteServiceType(rid, id) : tab === 'utensils' ? api.manage.deleteUtensil(rid, id) : api.manage.deleteAmenity(rid, id)),
    onSuccess: () => { setEditing(null); void refresh(); },
    onError: err,
  });

  const rows: Row[] =
    tab === 'services' ? (services.data ?? []).map((s) => ({ id: s.id, name: s.name, description: s.description, active: s.isActive, kind: s.kind, icon: s.icon, primary: s.isPrimary, badge: s.kind.toLowerCase() }))
    : tab === 'utensils' ? (utensils.data ?? []).map((u) => ({ id: u.id, name: u.name, description: u.description, active: u.isActive, available: u.isAvailable, icon: u.icon }))
    : (amenities.data ?? []).map((a) => ({ id: a.id, name: a.name, description: a.description, active: a.isActive, icon: a.icon }));

  return (
    <Screen padded={false} footer={<Button title={`Add ${tab === 'services' ? 'service' : tab === 'utensils' ? 'utensil' : 'amenity'}`} icon={<Plus size={18} color="#fff" />} onPress={() => setEditing({ name: '', description: '', kind: 'CUSTOM', icon: 'sparkles', key: '' })} />}>
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <ScreenHeader title="Services & catalog" subtitle="Shown to guests instantly" onBack={() => router.back()} info="Services are the buttons guests tap at the table (e.g. Call waiter, Water, Bill). The primary one is the big bell button. Utensils are items guests can ask for; amenities appear on your public profile." />
        <SegmentedControl value={tab} onChange={(v) => { setTab(v); setEditing(null); }} options={[{ value: 'services', label: 'Services' }, { value: 'utensils', label: 'Utensils' }, { value: 'amenities', label: 'Amenities' }]} />
        {editing ? (
          <Card style={{ gap: 10 }}>
            <Input label="Name" value={editing.name} onChangeText={(name) => setEditing({ ...editing, name })} autoFocus />
            <Input label="Description (optional)" value={editing.description} onChangeText={(description) => setEditing({ ...editing, description })} />
            {tab === 'services' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {Object.values(ServiceKind).map((k) => <Chip key={k} label={k.charAt(0) + k.slice(1).toLowerCase()} selected={editing.kind === k} onPress={() => setEditing({ ...editing, kind: k })} />)}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Icon">
              {ICONS.map((i) => {
                const on = editing.icon === i;
                return (
                  <Pressable key={i} onPress={() => setEditing({ ...editing, icon: i })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={i}
                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.colors.primary : t.colors.surfaceMuted, borderWidth: 1, borderColor: on ? t.colors.primary : t.colors.border }}>
                    <ServiceIcon icon={i} size={18} color={on ? '#fff' : t.colors.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {editing.id ? <Button title="Delete" variant="ghost" size="md" style={{ flex: 1 }} onPress={() => remove.mutate(editing.id!)} /> : <Button title="Cancel" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setEditing(null)} />}
              <Button title="Save" size="md" style={{ flex: 1 }} disabled={!editing.name.trim()} loading={save.isPending} onPress={() => save.mutate()} />
            </View>
          </Card>
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 20, gap: 10 }}
        renderItem={({ item: r }) => (
          <Card padding={12} onPress={() => setEditing({ id: r.id, name: r.name, description: r.description ?? '', kind: (r.kind as ServiceKind) ?? 'CUSTOM', icon: r.icon ?? 'sparkles', key: '' })} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBadge size={38}><ServiceIcon icon={r.icon} kind={r.kind} size={18} color={t.colors.primary} /></IconBadge>
              <View style={{ flex: 1 }}>
                <Text variant="callout">{r.name}</Text>
                {r.description ? <Text variant="micro" color="textSecondary" numberOfLines={1}>{r.description}</Text> : null}
              </View>
              {r.primary ? <Badge label="Main action" tone="primary" /> : null}
              <Switch value={r.active} onValueChange={(v) => toggle.mutate({ id: r.id, field: 'isActive', value: v })} trackColor={{ true: t.colors.primary, false: t.colors.surfacePressed }} thumbColor="#fff" accessibilityLabel={`${r.name} active`} />
            </View>
            {tab === 'utensils' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="micro" color="textSecondary">In stock</Text>
                <Switch value={!!r.available} onValueChange={(v) => toggle.mutate({ id: r.id, field: 'isAvailable', value: v })} trackColor={{ true: t.colors.success, false: t.colors.surfacePressed }} thumbColor="#fff" />
              </View>
            ) : null}
            {tab === 'services' && !r.primary ? <Button title="Make main “Request” button" variant="ghost" size="sm" fullWidth={false} onPress={() => toggle.mutate({ id: r.id, field: 'isPrimary', value: true })} /> : null}
          </Card>
        )}
      />
    </Screen>
  );
}
