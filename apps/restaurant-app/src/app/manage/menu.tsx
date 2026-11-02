import { useState } from 'react';
import { Alert, FlatList, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UtensilsCrossed } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { formatMoney } from '@servebell/shared';
import { Button, Card, Chip, EmptyState, Input, LoadingState, Screen, ScreenHeader, SegmentedControl, Text, Thumb, useTheme } from '@servebell/design-system';
import { api, mediaUrl } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';

export default function MenuAdmin() {
  const t = useTheme();
  const qc = useQueryClient();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const cats = useQuery({ queryKey: queryKeys.manageList(rid, 'categories'), queryFn: () => api.manage.categories(rid), enabled: !!rid });
  const items = useQuery({ queryKey: queryKeys.manageList(rid, 'items'), queryFn: () => api.manage.items(rid), enabled: !!rid });
  const [cat, setCat] = useState<string | 'all'>('all');
  const [newCat, setNewCat] = useState<{ name: string; kind: 'FOOD' | 'DRINK' } | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['manage', rid] }), qc.invalidateQueries({ queryKey: ['menu'] })]);
  const toggle = useMutation({ mutationFn: (v: { id: string; isAvailable: boolean }) => api.manage.updateItem(rid, v.id, { isAvailable: v.isAvailable }), onSettled: refresh });
  const addCat = useMutation({ mutationFn: () => api.manage.createCategory(rid, newCat!), onSuccess: () => { setNewCat(null); void refresh(); }, onError: (e) => Alert.alert('Couldn’t add', e.message) });
  const delCat = useMutation({ mutationFn: (id: string) => api.manage.deleteCategory(rid, id), onSuccess: () => { setCat('all'); void refresh(); }, onError: (e) => Alert.alert('Can’t delete', e.message) });
  const list = (items.data ?? []).filter((i) => cat === 'all' || i.categoryId === cat);

  return (
    <Screen padded={false} footer={<Button title="Add dish" icon={<Plus size={18} color="#fff" />} disabled={!cats.data?.length} onPress={() => router.push({ pathname: '/manage/menu-item', params: { categoryId: cat === 'all' ? cats.data?.[0]?.id : cat } })} />}>
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <ScreenHeader title="Menu" subtitle="Changes appear in the customer app instantly" onBack={() => router.back()} info="Group dishes into categories (Starters, Mains, Drinks…). Tap a dish to edit its price, photo and availability." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" selected={cat === 'all'} onPress={() => setCat('all')} />
          {cats.data?.map((c) => <Chip key={c.id} label={`${c.name} · ${c.itemCount}`} selected={cat === c.id} onPress={() => setCat(c.id)} />)}
          <Chip label="+ Category" onPress={() => setNewCat({ name: '', kind: 'FOOD' })} />
        </ScrollView>
        {newCat ? (
          <Card style={{ gap: 10 }}>
            <Input label="Category name" value={newCat.name} onChangeText={(name) => setNewCat({ ...newCat, name })} placeholder="e.g. Rice & Curry" autoFocus />
            <SegmentedControl value={newCat.kind} onChange={(kind) => setNewCat({ ...newCat, kind })} options={[{ value: 'FOOD', label: 'Food' }, { value: 'DRINK', label: 'Drinks' }]} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Cancel" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setNewCat(null)} />
              <Button title="Add" size="md" style={{ flex: 1 }} disabled={!newCat.name.trim()} loading={addCat.isPending} onPress={() => addCat.mutate()} />
            </View>
          </Card>
        ) : null}
        {cat !== 'all' && cats.data?.find((c) => c.id === cat)?.itemCount === 0 ? <Button title="Delete empty category" variant="ghost" size="sm" onPress={() => delCat.mutate(cat)} /> : null}
      </View>
      {items.isPending ? <LoadingState /> : (
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, gap: 10, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={<UtensilsCrossed size={26} color={t.colors.primary} />} title="No dishes yet" message={cats.data?.length ? 'Add your first dish.' : 'Create a category first.'} />}
          renderItem={({ item }) => (
            <Card padding={10} onPress={() => router.push({ pathname: '/manage/menu-item', params: { id: item.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Thumb uri={mediaUrl(item.imageUrl)} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="callout" numberOfLines={1}>{item.name}{item.tags?.includes('special') ? '  ★' : ''}</Text>
                <Text variant="captionStrong">{formatMoney(item.priceCents)}</Text>
                <Text variant="micro" color={item.isAvailable ? 'success' : 'textMuted'}>{item.isAvailable ? 'Available' : 'Unavailable'}</Text>
              </View>
              <Switch value={item.isAvailable} onValueChange={(v) => toggle.mutate({ id: item.id, isAvailable: v })} trackColor={{ true: t.colors.primary, false: t.colors.surfacePressed }} thumbColor="#fff" accessibilityLabel={`${item.name} available`} />
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
