import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChefHat } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { formatMoney, type OrderStatus } from '@servebell/shared';
import { Backdrop, Button, Card, ErrorState, LoadingState, OrderStepper, ScreenHeader, Text, Thumb, useTheme } from '@servebell/design-system';
import { api } from '@servebell/mobile-core';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mediaUrl } from '@/lib/media';

const STEP: Record<OrderStatus, number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 1, READY: 2, DELIVERED: 4, CANCELLED: -1 };
const NOTE: Record<OrderStatus, string> = {
  PENDING: 'Sent to the restaurant — waiting for them to accept.',
  ACCEPTED: 'Accepted — the kitchen will start shortly.',
  PREPARING: 'The kitchen is preparing your order.',
  READY: 'Ready — on its way to your table.',
  DELIVERED: 'Served. Enjoy your meal!',
  CANCELLED: 'This order was cancelled.',
};

/** Reference "Your Order" screen with live progress. */
export default function OrderScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: queryKeys.order(id), queryFn: () => api.orders.detail(id) });
  const cancel = useMutation({ mutationFn: () => api.orders.cancel(id), onSuccess: () => void q.refetch(), onError: (e) => Alert.alert('Couldn’t cancel', e.message) });
  const o = q.data;
  const hero = mediaUrl(o?.items.find((i) => i.imageUrl)?.imageUrl);

  return (
    <View style={{ flex: 1 }}>
      <Backdrop photo={hero ? { uri: hero } : 'restaurant'} photoHeight={240} dim={0.6} />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, paddingHorizontal: 20 }}>
        <ScreenHeader large title="Your Order" subtitle={o ? `Table ${o.table.label}${o.guestCount ? ` • ${o.guestCount} Guests` : ''}` : undefined} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))} />
        {q.isPending ? <LoadingState /> : q.isError ? <ErrorState network={q.error instanceof ApiError && q.error.isNetwork} message={q.error.message} onRetry={() => void q.refetch()} /> : (
          <>
            <ScrollView contentContainerStyle={{ gap: 18, paddingTop: 22, paddingBottom: 16 }}>
              {o!.status === 'CANCELLED' ? (
                <Card><Text variant="callout" color="danger">{NOTE.CANCELLED}{o!.cancelReason ? ` ${o!.cancelReason}` : ''}</Text></Card>
              ) : (
                <OrderStepper steps={['Ordered', 'Preparing', 'Ready', 'Delivered']} current={STEP[o!.status]} currentIcon={<ChefHat size={15} color="#fff" />} />
              )}
              <Text variant="caption" color="textSecondary" align="center">Order #{o!.number} · {NOTE[o!.status]}</Text>
              <Card padding={6}>
                {o!.items.map((i, idx) => (
                  <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderTopWidth: idx ? 1 : 0, borderTopColor: t.colors.border }}>
                    <Thumb uri={mediaUrl(i.imageUrl)} size={52} radius={26} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text variant="callout" color="textAccent" numberOfLines={1}>{i.name}</Text>
                      {i.options.length ? <Text variant="micro" color="textSecondary">{i.options.join(', ')}</Text> : null}
                      <Text variant="captionStrong">{formatMoney(i.lineTotalCents, o!.currency)}</Text>
                    </View>
                    <Text variant="callout" color="textSecondary">x{i.quantity}</Text>
                  </View>
                ))}
              </Card>
              {o!.note ? <Text variant="caption" color="textSecondary">Note: “{o!.note}”</Text> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                <Text variant="title3">Total</Text>
                <Text variant="title3">{formatMoney(o!.totalCents, o!.currency)}</Text>
              </View>
            </ScrollView>
            <View style={{ gap: 10, paddingBottom: 8 }}>
              {o!.status === 'PENDING' ? <Button title="Cancel Order" variant="outline" loading={cancel.isPending} onPress={() => Alert.alert('Cancel this order?', undefined, [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel order', style: 'destructive', onPress: () => cancel.mutate() }])} /> : null}
              <Button title="Back to Home" variant="outline" onPress={() => router.dismissTo('/(tabs)/home')} />
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}
