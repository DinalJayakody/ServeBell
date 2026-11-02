import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Button, Card, Chip, Input, Screen, ScreenHeader, Text, Thumb, useTheme } from '@servebell/design-system';
import { api, mediaUrl, pickAndUploadImage } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';
import { ToggleRow } from '@/components/Form';

/** Create or edit a dish. Prices are typed in LKR and stored as cents. */
export default function MenuItemEditor() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id, categoryId } = useLocalSearchParams<{ id?: string; categoryId?: string }>();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const cats = useQuery({ queryKey: queryKeys.manageList(rid, 'categories'), queryFn: () => api.manage.categories(rid), enabled: !!rid });
  const items = useQuery({ queryKey: queryKeys.manageList(rid, 'items'), queryFn: () => api.manage.items(rid), enabled: !!rid && !!id });
  const existing = items.data?.find((i) => i.id === id);
  const [f, setF] = useState({ name: '', description: '', price: '', categoryId: categoryId ?? '', isAvailable: true, special: false, prep: '' });
  const [image, setImage] = useState<{ id: string | null; url: string | null } | null>(null);
  useEffect(() => {
    if (existing) setF({ name: existing.name, description: existing.description ?? '', price: String(existing.priceCents / 100), categoryId: existing.categoryId, isAvailable: existing.isAvailable, special: existing.tags?.includes('special') ?? false, prep: existing.prepMinutes ? String(existing.prepMinutes) : '' });
  }, [existing]);
  const done = () => { void qc.invalidateQueries({ queryKey: ['manage', rid] }); void qc.invalidateQueries({ queryKey: ['menu'] }); router.back(); };
  const price = Math.round(Number(f.price.replace(/,/g, '')) * 100);
  const valid = f.name.trim().length > 0 && Number.isFinite(price) && price >= 0 && f.price.trim() !== '' && !!f.categoryId;
  const save = useMutation({
    mutationFn: () => {
      const tags = [...(existing?.tags ?? []).filter((x) => x !== 'special'), ...(f.special ? ['special'] : [])];
      const body = { name: f.name.trim(), description: f.description.trim() || null, priceCents: price, categoryId: f.categoryId, isAvailable: f.isAvailable, tags, prepMinutes: f.prep ? Number(f.prep) : null, ...(image ? { imageFileId: image.id } : {}) };
      return id ? api.manage.updateItem(rid, id, body) : api.manage.createItem(rid, body);
    },
    onSuccess: done,
    onError: (e) => Alert.alert('Couldn’t save', e.message),
  });
  const del = useMutation({ mutationFn: () => api.manage.deleteItem(rid, id!), onSuccess: done });
  const photo = image ? image.url : existing?.imageUrl ?? null;

  return (
    <Screen padded={false} footer={<Button title={id ? 'Save dish' : 'Add dish'} disabled={!valid} loading={save.isPending} onPress={() => save.mutate()} />}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={id ? 'Edit dish' : 'New dish'} onBack={() => router.back()} info="Add a clear name, price and a good photo. Turn off Available when it sells out; guests see it greyed out instead of ordering it." />
        <Pressable onPress={async () => { const up = await pickAndUploadImage('MENU_ITEM', rid); if (up) setImage({ id: up.id, url: up.url }); }} style={{ alignSelf: 'center' }}>
          <Thumb uri={mediaUrl(photo)} size={150} radius={t.radii.xl} />
          <View style={{ position: 'absolute', right: 8, bottom: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.primary }}><Camera size={17} color="#fff" /></View>
        </Pressable>
        {photo ? <Button title="Remove photo" variant="ghost" size="sm" onPress={() => setImage({ id: null, url: null })} /> : null}
        <Card style={{ gap: 12 }}>
          <Input label="Name" value={f.name} onChangeText={(name) => setF({ ...f, name })} placeholder="e.g. Chicken Kottu" />
          <Input label="Description" value={f.description} onChangeText={(description) => setF({ ...f, description })} placeholder="Short, appetising description" />
          <Input label="Price (LKR)" value={f.price} onChangeText={(p) => setF({ ...f, price: p.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="1250" />
          <Input label="Preparation time (min, optional)" value={f.prep} onChangeText={(p) => setF({ ...f, prep: p.replace(/\D/g, '') })} keyboardType="number-pad" />
          <Text variant="captionStrong" color="textSecondary">Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cats.data?.map((c) => <Chip key={c.id} label={c.name} selected={f.categoryId === c.id} onPress={() => setF({ ...f, categoryId: c.id })} />)}
          </View>
          <ToggleRow label="Available now" hint="Turn off when sold out" value={f.isAvailable} onChange={(isAvailable) => setF({ ...f, isAvailable })} />
          <ToggleRow label="Today’s special" hint="Featured on the guest home screen" value={f.special} onChange={(special) => setF({ ...f, special })} />
        </Card>
        {id ? <Button title="Delete dish" variant="ghost" loading={del.isPending} onPress={() => Alert.alert('Delete this dish?', 'Past orders keep their record.', [{ text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => del.mutate() }])} /> : null}
      </ScrollView>
    </Screen>
  );
}
