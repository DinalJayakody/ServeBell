import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { BellRing, ChevronRight, CircleEllipsis, GlassWater, ReceiptText, UtensilsCrossed } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { formatMoney, type VisitView } from '@servebell/shared';
import { ActionTile, Appear, Avatar, Backdrop, Button, Card, HeroCard, IconBadge, IconCircle, Pulse, Ringing, SectionHeader, ServiceIcon, Text, useTheme, Wave } from '@servebell/design-system';
import { api, ServiceStatusBadge, timeAgo, useNow, useSession } from '@servebell/mobile-core';
import { useRequestService } from '@/hooks/useRequestService';
import { findService, primaryService, tableLine } from '@/lib/services';
import { greeting, mediaUrl } from '@/lib/media';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Reference screen 2: greeting, "Need something?", Quick Requests, Today's Special. */
export function SeatedHome({ visit }: { visit: VisitView }) {
  const t = useTheme();
  const user = useSession((s) => s.user)!;
  const now = useNow(30_000);
  const request = useRequestService();
  const open = useQuery({ queryKey: queryKeys.myServices(true), queryFn: () => api.services.mine({ active: true, limit: 10 }) });
  const orders = useQuery({ queryKey: queryKeys.myOrders(true), queryFn: () => api.orders.mine({ active: true, limit: 5 }) });
  const menu = useQuery({ queryKey: queryKeys.menu(visit.restaurant.id), queryFn: () => api.menu.get(visit.restaurant.id), staleTime: 300_000 });
  const special = menu.data?.categories.flatMap((c) => c.items).find((i) => i.tags.includes('special') && i.isAvailable);
  const waiter = primaryService(visit.services);
  const water = findService(visit.services, 'WATER');
  const bill = findService(visit.services, 'BILL');
  const openHere = (open.data?.items ?? []).filter((r) => r.restaurant.id === visit.restaurant.id);
  const cover = mediaUrl(visit.restaurant.coverUrl);
  const busy = (id?: string) => request.isPending && request.variables?.service.id === id;

  return (
    <View style={{ flex: 1 }}>
      <Backdrop photo={cover ? { uri: cover } : 'restaurant'} photoHeight={300} dim={0.55} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 22 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl tintColor={t.colors.primary} refreshing={open.isRefetching} onRefresh={() => void Promise.all([open.refetch(), orders.refetch(), menu.refetch()])} />}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text variant="callout" color="textSecondary">{greeting()},</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="title1" numberOfLines={1}>{user.fullName.split(' ')[0]}</Text>
                <Wave />
              </View>
              <Text variant="caption" color="textSecondary" style={{ marginTop: 2 }}>{tableLine(visit)}</Text>
            </View>
            <Pressable onPress={() => router.navigate('/(tabs)/profile')} accessibilityLabel="Profile">
              <Avatar name={user.fullName} uri={user.avatarUrl} size={54} />
            </Pressable>
          </View>

          {waiter ? (
            <Appear index={0}><HeroCard
              title="Need something?"
              subtitle="Tap below to request your waiter"
              icon={<View style={{ alignItems: 'center', justifyContent: 'center' }}><Pulse color="#8DBBFF" size={58} /><IconCircle size={58}><Ringing><BellRing size={28} color="#fff" /></Ringing></IconCircle></View>}
              action={<Button title={busy(waiter.id) ? 'Sending…' : 'Request Waiter'} size="md" fullWidth={false} loading={busy(waiter.id)} onPress={() => request.mutate({ service: waiter })} style={{ minWidth: 160 }} />}
            /></Appear>
          ) : null}

          <Appear index={1} style={{ gap: 12 }}>
            <SectionHeader title="Quick Requests" info="One tap sends the request to the staff for your table. You can follow it live and cancel it if you change your mind." />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {water ? <ActionTile style={{ flex: 1 }} icon={<GlassWater size={24} color={t.colors.primary} />} label="Water" disabled={request.isPending} onPress={() => request.mutate({ service: water })} /> : null}
              <ActionTile style={{ flex: 1 }} icon={<UtensilsCrossed size={24} color={t.colors.primary} />} label={'Food &\nDrinks'} onPress={() => router.navigate('/(tabs)/menu')} />
              {bill ? <ActionTile style={{ flex: 1 }} icon={<ReceiptText size={24} color={t.colors.primary} />} label="Bill" disabled={request.isPending} onPress={() => request.mutate({ service: bill })} /> : null}
              <ActionTile style={{ flex: 1 }} icon={<CircleEllipsis size={24} color={t.colors.primary} />} label="Other" onPress={() => router.push('/service')} />
            </View>
          </Appear>

          {openHere.length || orders.data?.items.length ? (
            <View style={{ gap: 10 }}>
              <SectionHeader title="In progress" action={{ label: 'See all', onPress: () => router.navigate('/(tabs)/requests') }} />
              {orders.data?.items.map((o) => (
                <Card key={o.id} onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })} padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <IconBadge size={40}><UtensilsCrossed size={19} color={t.colors.primary} /></IconBadge>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">Order #{o.number}</Text>
                    <Text variant="caption" color="textSecondary">{o.items.reduce((s, i) => s + i.quantity, 0)} items · {formatMoney(o.totalCents, o.currency)}</Text>
                  </View>
                  <Text variant="captionStrong" color="primary">{o.status === 'PENDING' ? 'Ordered' : o.status.charAt(0) + o.status.slice(1).toLowerCase()}</Text>
                  <ChevronRight size={18} color={t.colors.textMuted} />
                </Card>
              ))}
              {openHere.map((r) => (
                <Card key={r.id} onPress={() => router.push({ pathname: '/request/[id]', params: { id: r.id } })} padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <IconBadge size={40}><ServiceIcon icon={r.serviceType.icon} kind={r.serviceType.kind} size={19} color={t.colors.primary} /></IconBadge>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>{r.serviceType.name}</Text>
                    <Text variant="caption" color="textSecondary">{r.acceptedBy ? `${r.acceptedBy.fullName} · ` : ''}{timeAgo(r.createdAt, now)}</Text>
                  </View>
                  <ServiceStatusBadge status={r.status} />
                </Card>
              ))}
            </View>
          ) : null}

          {special ? (
            <Appear index={3}><Pressable onPress={() => router.navigate('/(tabs)/menu')} style={[{ borderRadius: t.radii.xl, overflow: 'hidden', borderWidth: 1, borderColor: t.colors.border, minHeight: 150 }, t.shadows.card]}>
              {special.imageUrl ? <Image source={mediaUrl(special.imageUrl)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '62%' }} contentFit="cover" /> : null}
              <LinearGradient colors={[t.colors.backgroundElevated, t.colors.backgroundElevated, 'rgba(13,24,50,0)']} locations={[0, 0.42, 0.78]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ padding: 16, gap: 4, flex: 1 }}>
                <Text variant="title3">Today’s Special</Text>
                <Text variant="callout" style={{ marginTop: 10 }}>{special.name}</Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ maxWidth: '50%' }}>{special.description}</Text>
                <Text variant="bodyStrong" style={{ marginTop: 2 }}>{formatMoney(special.priceCents, menu.data?.currency)}</Text>
                <View style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.borderStrong }}>
                  <Text variant="captionStrong">View Menu</Text>
                </View>
              </LinearGradient>
            </Pressable></Appear>
          ) : null}

          <Text variant="caption" color="textMuted" align="center">{visit.restaurant.name} · session active until {new Date(visit.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
