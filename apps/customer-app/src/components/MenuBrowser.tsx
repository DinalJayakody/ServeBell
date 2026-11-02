import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, ShoppingBag, UtensilsCrossed } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { formatMoney, type MenuItemView } from '@servebell/shared';
import { Appear, Button, Chip, EmptyState, ErrorState, PlusButton, Skeleton, Text, Thumb, useTheme } from '@servebell/design-system';
import { api } from '@servebell/mobile-core';
import { cartCount, cartTotal, useCart } from '@/lib/cart';
import { mediaUrl } from '@/lib/media';

/** Reference "Our Menu" screen. `canOrder` only when seated at this restaurant. */
export function MenuBrowser({ restaurantId, title = 'Our Menu', canOrder, header }: { restaurantId: string; title?: string; canOrder: boolean; header?: React.ReactNode }) {
  const t = useTheme();
  const menu = useQuery({ queryKey: queryKeys.menu(restaurantId), queryFn: () => api.menu.get(restaurantId) });
  const [category, setCategory] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<MenuItemView | null>(null);
  const cart = useCart();
  const lines = cart.restaurantId === restaurantId ? cart.lines : [];
  const currency = menu.data?.currency ?? 'LKR';

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (menu.data?.categories ?? [])
      .filter((c) => category === 'all' || c.id === category)
      .flatMap((c) => c.items)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
  }, [menu.data, category, search]);

  const add = (item: MenuItemView, optionIds: string[] = []) => {
    const opts = item.optionGroups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id));
    cart.add(restaurantId, { menuItemId: item.id, name: item.name, imageUrl: item.imageUrl, unitPriceCents: item.priceCents + opts.reduce((s, o) => s + o.priceDeltaCents, 0), optionIds, optionNames: opts.map((o) => o.name) });
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: lines.length ? 110 : 28, gap: 10, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 14, paddingTop: 10, paddingBottom: 6 }}>
            {header}
            <Text variant="title1">{title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 16, borderRadius: t.radii.pill, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border }}>
              <Search size={16} color={t.colors.textMuted} />
              <TextInput value={search} onChangeText={setSearch} placeholder="Search for food or drinks..." placeholderTextColor={t.colors.textMuted} style={[t.typography.callout, { flex: 1, color: t.colors.text, paddingVertical: 0 }]} accessibilityLabel="Search menu" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
              {menu.data?.categories.map((c) => <Chip key={c.id} label={c.name} selected={category === c.id} onPress={() => setCategory(c.id)} />)}
            </ScrollView>
            {!canOrder ? <Text variant="caption" color="textMuted">Scan your table’s QR code to order from this menu.</Text> : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Appear index={index}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: t.radii.lg, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border, opacity: item.isAvailable ? 1 : 0.55 }}>
            <Thumb uri={mediaUrl(item.imageUrl)} size={62} radius={12} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="callout" numberOfLines={1}>{item.name}</Text>
              {item.description ? <Text variant="micro" color="textSecondary" numberOfLines={1}>{item.description}</Text> : null}
              <Text variant="captionStrong" style={{ marginTop: 3 }}>{item.isAvailable ? formatMoney(item.priceCents, currency) : 'Unavailable'}</Text>
            </View>
            {canOrder && item.isAvailable ? <PlusButton label={`Add ${item.name}`} onPress={() => (item.optionGroups.length ? setPicking(item) : add(item))} /> : null}
          </View></Appear>
        )}
        ListEmptyComponent={
          menu.isPending ? <View style={{ gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} radius={t.radii.lg} />)}</View>
          : menu.isError ? <ErrorState network={menu.error instanceof ApiError && menu.error.isNetwork} message={menu.error.message} onRetry={() => void menu.refetch()} />
          : <EmptyState icon={<UtensilsCrossed size={26} color={t.colors.primary} />} title="Nothing found" message="Try another category or search." />
        }
      />

      {canOrder && lines.length ? (
        <Pressable onPress={() => router.push('/cart')} style={[{ position: 'absolute', left: 20, right: 20, bottom: 14, borderRadius: t.radii.pill, overflow: 'hidden' }, t.shadows.glow]} accessibilityLabel="View order">
          <LinearGradient colors={t.colors.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 10 }}>
            <ShoppingBag size={20} color="#fff" />
            <Text variant="bodyStrong" style={{ color: '#fff', flex: 1 }}>View Order · {cartCount(lines)} item{cartCount(lines) > 1 ? 's' : ''}</Text>
            <Text variant="bodyStrong" style={{ color: '#fff' }}>{formatMoney(cartTotal(lines), currency)}</Text>
          </LinearGradient>
        </Pressable>
      ) : null}

      <OptionSheet item={picking} currency={currency} onClose={() => setPicking(null)} onAdd={(ids) => { if (picking) add(picking, ids); setPicking(null); }} />
    </View>
  );
}

function OptionSheet({ item, currency, onClose, onAdd }: { item: MenuItemView | null; currency: string; onClose: () => void; onAdd: (optionIds: string[]) => void }) {
  const t = useTheme();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  if (!item) return null;
  const valid = item.optionGroups.every((g) => (selected[g.id]?.length ?? 0) >= g.minSelect);
  const toggle = (groupId: string, optionId: string, max: number) =>
    setSelected((s) => {
      const cur = s[groupId] ?? [];
      const next = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : max === 1 ? [optionId] : cur.length < max ? [...cur, optionId] : cur;
      return { ...s, [groupId]: next };
    });
  const extra = item.optionGroups.flatMap((g) => g.options).filter((o) => Object.values(selected).flat().includes(o.id)).reduce((s, o) => s + o.priceDeltaCents, 0);
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: t.colors.overlay }} onPress={onClose} />
      <View style={{ backgroundColor: t.colors.backgroundElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, gap: 16, borderWidth: 1, borderColor: t.colors.border }}>
        <Text variant="title2">{item.name}</Text>
        {item.optionGroups.map((g) => (
          <View key={g.id} style={{ gap: 10 }}>
            <Text variant="captionStrong" color="textSecondary">{g.name}{g.minSelect > 0 ? ' · required' : ''}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {g.options.filter((o) => o.isAvailable).map((o) => (
                <Chip key={o.id} label={`${o.name}${o.priceDeltaCents ? ` +${formatMoney(o.priceDeltaCents, currency)}` : ''}`} selected={selected[g.id]?.includes(o.id)} onPress={() => toggle(g.id, o.id, g.maxSelect)} />
              ))}
            </View>
          </View>
        ))}
        <Button title={`Add · ${formatMoney(item.priceCents + extra, currency)}`} disabled={!valid} onPress={() => { onAdd(Object.values(selected).flat()); setSelected({}); }} />
      </View>
    </Modal>
  );
}
