import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Circle, Map, Plus, QrCode, RectangleHorizontal, Square, Users } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { TableShape, type TableListItem } from '@servebell/shared';
import { Badge, Button, Card, EmptyState, Input, InfoLabel, LoadingState, Screen, ScreenHeader, Text, useTheme } from '@servebell/design-system';
import { api, statusColor, TABLE_STATUS_LABEL } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';
import { StepperRow, ToggleRow } from '@/components/Form';

type Form = { id?: string; label: string; capacity: number; shape: TableShape; zone: string; isReservable: boolean; isActive: boolean };
const blank = (n: number): Form => ({ label: `T${n}`, capacity: 4, shape: 'SQUARE', zone: '', isReservable: true, isActive: true });
const SHAPE_ICON = { ROUND: Circle, SQUARE: Square, RECTANGLE: RectangleHorizontal } as const;

/** Tables without a floor plan: enough for QR codes, service requests and reservations. */
export default function Tables() {
  const t = useTheme();
  const qc = useQueryClient();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const q = useQuery({ queryKey: queryKeys.tables(rid), queryFn: () => api.tables.list(rid), enabled: !!rid, refetchInterval: 30_000 });
  const [form, setForm] = useState<Form | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.tables(rid) });
    void qc.invalidateQueries({ queryKey: queryKeys.qrCodes(rid) });
    void qc.invalidateQueries({ queryKey: queryKeys.manageFloorPlans(rid) });
  };
  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = { label: f.label.trim(), capacity: f.capacity, shape: f.shape, zone: f.zone.trim() || null, isReservable: f.isReservable, isActive: f.isActive };
      return f.id ? api.tables.update(rid, f.id, body) : api.tables.create(rid, body);
    },
    onSuccess: () => { setForm(null); refresh(); },
    onError: (e) => Alert.alert('Couldn’t save table', e.message),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.tables.remove(rid, id), onSuccess: () => { setForm(null); refresh(); }, onError: (e) => Alert.alert('Couldn’t remove', e.message) });
  const edit = (x: TableListItem) => setForm({ id: x.id, label: x.label, capacity: x.capacity, shape: x.shape, zone: x.zone ?? '', isReservable: x.isReservable, isActive: x.isActive });

  if (q.isPending) return <Screen><LoadingState /></Screen>;
  const tables = q.data ?? [];
  const seats = tables.reduce((s, x) => s + (x.isActive ? x.capacity : 0), 0);

  return (
    <Screen scroll>
      <ScreenHeader
        title="Tables"
        subtitle={`${tables.length} tables · ${seats} seats`}
        onBack={() => router.back()}
        info="Add your tables by name and seats. Each table gets its own QR code for service requests and can be reserved. A floor plan is optional — tables you place on a plan also appear here."
      />
      {form ? (
        <Card style={{ gap: 8, borderColor: t.colors.primary, marginBottom: 14 }}>
          <Text variant="title3">{form.id ? `Edit ${form.label}` : 'New table'}</Text>
          <Input label="Table name" info="Printed on the QR sticker and shown to waiters, e.g. T5, Patio 2, Booth A." value={form.label} onChangeText={(label) => setForm({ ...form, label })} maxLength={40} autoFocus={!form.id} />
          <StepperRow label="Seats" info="Guests can only reserve tables that seat their whole party." value={form.capacity} min={1} max={50} onChange={(capacity) => setForm({ ...form, capacity })} />
          <InfoLabel label="Shape" info="Used when you place this table on a floor plan later." />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Object.values(TableShape).map((s) => {
              const Icon = SHAPE_ICON[s];
              const on = form.shape === s;
              return (
                <Pressable key={s} onPress={() => setForm({ ...form, shape: s })} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: t.radii.md, borderWidth: 1, borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? t.colors.primarySoft : t.colors.surface }}>
                  <Icon size={20} color={on ? t.colors.primary : t.colors.textSecondary} />
                  <Text variant="micro" color={on ? 'primary' : 'textSecondary'}>{s.charAt(0) + s.slice(1).toLowerCase()}</Text>
                </Pressable>
              );
            })}
          </View>
          <Input label="Zone (optional)" info="Area name guests see, e.g. Terrace or Window side." value={form.zone} onChangeText={(zone) => setForm({ ...form, zone })} placeholder="e.g. Terrace" />
          <ToggleRow label="Reservable" info="Turn off for walk-in-only tables. They still get a QR code." value={form.isReservable} onChange={(isReservable) => setForm({ ...form, isReservable })} />
          <ToggleRow label="Active" info="Inactive tables can't be reserved and their QR shows as unavailable." value={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Cancel" variant="ghost" size="md" style={{ flex: 1 }} onPress={() => setForm(null)} />
            <Button title={form.id ? 'Save' : 'Add table'} size="md" style={{ flex: 1.4 }} disabled={!form.label.trim()} loading={save.isPending} onPress={() => save.mutate(form)} />
          </View>
          {form.id ? (
            <Button title="Remove table" variant="outline" size="md" loading={remove.isPending} onPress={() => Alert.alert(`Remove ${form.label}?`, 'Its QR code stops working. Past history is kept.', [{ text: 'Keep', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(form.id!) }])} />
          ) : null}
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <Button title="Add table" size="md" style={{ flex: 1 }} icon={<Plus size={16} color="#fff" />} onPress={() => setForm(blank(tables.length + 1))} />
          <Button title="QR codes" variant="secondary" size="md" style={{ flex: 1 }} icon={<QrCode size={16} color={t.colors.primary} />} onPress={() => router.push('/manage/qr')} />
        </View>
      )}

      {tables.length === 0 ? (
        <EmptyState icon={<Users size={26} color={t.colors.primary} />} title="No tables yet" message="Add a table to get its QR code. Guests scan it to call a waiter, order and chat." />
      ) : (
        <View style={{ gap: 10 }}>
          {tables.map((x) => {
            const Icon = SHAPE_ICON[x.shape];
            return (
              <Pressable key={x.id} onPress={() => edit(x)} accessibilityRole="button" accessibilityLabel={`Edit table ${x.label}`}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.primarySoft }}>
                    <Icon size={20} color={t.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{x.label}</Text>
                    <Text variant="caption" color="textSecondary">{x.capacity} seats{x.zone ? ` · ${x.zone}` : ''}{x.floorPlanName ? ` · on ${x.floorPlanName}` : ' · no floor plan'}{x.isReservable ? '' : ' · walk-in only'}</Text>
                  </View>
                  <Badge label={TABLE_STATUS_LABEL[x.status]} tone={x.status === 'AVAILABLE' ? 'success' : x.status === 'OCCUPIED' ? 'danger' : x.status === 'RESERVED' ? 'warning' : 'neutral'} dot />
                  <View style={{ width: 4, height: 30, borderRadius: 2, backgroundColor: statusColor(t.colors, x.status) }} />
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
      <Card style={{ gap: 8, marginTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Map size={18} color={t.colors.primary} />
          <Text variant="bodyStrong">Want guests to see your layout?</Text>
        </View>
        <Text variant="caption" color="textSecondary">Draw a floor plan with your tables, entrance, bar and kitchen. Guests can then pick a table on the map. Tables added here can be placed on the plan any time.</Text>
        <Button title="Open floor plan editor" variant="secondary" size="md" onPress={() => router.push('/manage/floor-plan')} />
      </Card>
    </Screen>
  );
}
