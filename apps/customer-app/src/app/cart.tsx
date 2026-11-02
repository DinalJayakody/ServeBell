import { Alert, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { formatMoney } from '@servebell/shared';
import { Button, Card, EmptyState, QuantityStepper, Screen, ScreenHeader, Text, Thumb, useTheme } from '@servebell/design-system';
import { api, newId } from '@servebell/mobile-core';
import { cartTotal, useCart } from '@/lib/cart';
import { mediaUrl } from '@/lib/media';
import { useActiveVisit } from '@/hooks/useActiveVisit';
import { tableLine } from '@/lib/services';

export default function Cart() {
  const t = useTheme();
  const qc = useQueryClient();
  const cart = useCart();
  const visit = useActiveVisit();
  const place = useMutation({
    mutationFn: () => api.orders.create({ items: cart.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, optionIds: l.optionIds })), note: cart.note || undefined, idempotencyKey: newId() }),
    onSuccess: (order) => {
      cart.clear();
      void qc.invalidateQueries({ queryKey: queryKeys.orders });
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    },
    onError: (e) => Alert.alert('Couldn’t place order', e.message),
  });
  const currency = 'LKR';

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={cart.lines.length ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="title3">Total</Text>
            <Text variant="title3">{formatMoney(cartTotal(cart.lines), currency)}</Text>
          </View>
          <Button title="Place Order" loading={place.isPending} onPress={() => place.mutate()} />
          <Text variant="micro" color="textMuted" align="center">Final prices are confirmed by the restaurant.</Text>
        </View>
      ) : undefined}
    >
      <ScreenHeader title="Your Order" subtitle={visit.data ? `${visit.data.restaurant.name} · ${tableLine(visit.data)}` : undefined} onBack={() => router.back()} info="Check your items and add a note for the kitchen. Your order goes straight to the restaurant for your table; you can follow its progress live." />
      {cart.lines.length === 0 ? (
        <EmptyState icon={<ShoppingBag size={28} color={t.colors.primary} />} title="Your order is empty" message="Add dishes from the menu." action={{ label: 'Browse menu', onPress: () => router.back() }} />
      ) : (
        <ScrollView contentContainerStyle={{ gap: 10, paddingTop: 8, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {cart.lines.map((l) => (
            <Card key={l.key} padding={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Thumb uri={mediaUrl(l.imageUrl)} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="callout" color="textAccent" numberOfLines={1}>{l.name}</Text>
                {l.optionNames.length ? <Text variant="micro" color="textSecondary">{l.optionNames.join(', ')}</Text> : null}
                <Text variant="captionStrong">{formatMoney(l.unitPriceCents * l.quantity, currency)}</Text>
              </View>
              <QuantityStepper value={l.quantity} onChange={(q) => cart.setQuantity(l.key, q)} />
            </Card>
          ))}
          <TextInput
            value={cart.note}
            onChangeText={cart.setNote}
            placeholder="Add a note for the kitchen (optional)"
            placeholderTextColor={t.colors.textMuted}
            maxLength={300}
            multiline
            style={[t.typography.callout, { minHeight: 70, padding: 14, borderRadius: t.radii.lg, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border, color: t.colors.text, textAlignVertical: 'top' }]}
          />
        </ScrollView>
      )}
    </Screen>
  );
}
