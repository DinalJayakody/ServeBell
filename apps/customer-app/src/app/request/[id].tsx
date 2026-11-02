import { Alert, Linking, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, ClipboardList, MessageCircle, Phone, Timer } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { OPEN_SERVICE_STATUSES } from '@servebell/shared';
import { Avatar, Backdrop, Badge, Button, Card, ErrorState, IconBadge, ListRow, LoadingState, ScreenHeader, SectionHeader, ServiceIcon, SuccessMark, Text, useTheme } from '@servebell/design-system';
import { api, formatDuration, ServiceStatusBadge, ServiceTimeline, timeAgo, useNow } from '@servebell/mobile-core';
import { useActiveVisit } from '@/hooks/useActiveVisit';
import { tableLine } from '@/lib/services';

/** Pending: "on the way" state. Accepted: the reference "Your Table Assistant" profile. */
export default function RequestDetail() {
  const t = useTheme();
  const now = useNow(1000);
  const { id } = useLocalSearchParams<{ id: string }>();
  const visit = useActiveVisit();
  const q = useQuery({ queryKey: queryKeys.service(id), queryFn: () => api.services.detail(id) });
  const restaurant = useQuery({ queryKey: queryKeys.restaurant(q.data?.restaurant.id ?? ''), queryFn: () => api.restaurants.detail(q.data!.restaurant.id), enabled: !!q.data });
  const cancel = useMutation({ mutationFn: () => api.services.cancel(id), onError: (e) => Alert.alert('Couldn’t cancel', e.message) });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'));

  if (q.isPending) return <View style={{ flex: 1 }}><Backdrop /><LoadingState /></View>;
  if (q.isError) return <View style={{ flex: 1 }}><Backdrop /><SafeAreaView style={{ flex: 1 }}><ErrorState network={q.error instanceof ApiError && q.error.isNetwork} message={q.error.message} onRetry={() => void q.refetch()} /></SafeAreaView></View>;
  const r = q.data;
  const open = OPEN_SERVICE_STATUSES.includes(r.status);
  const end = r.completedAt ?? r.cancelledAt;
  const elapsed = (end ? new Date(end).getTime() : now) - new Date(r.createdAt).getTime();
  const where = visit.data && visit.data.restaurant.id === r.restaurant.id ? tableLine(visit.data) : `Table ${r.table.label}`;
  const phone = restaurant.data?.phone;
  const assistant = r.acceptedBy;

  const currentCard = (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBadge size={52}><ServiceIcon icon={r.serviceType.icon} kind={r.serviceType.kind} size={24} color={t.colors.primary} /></IconBadge>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="callout" color="textAccent">{r.serviceType.name}</Text>
          <Text variant="micro" color="textSecondary">{where}</Text>
          <ServiceStatusBadge status={r.status} />
        </View>
        <Text variant="micro" color="textMuted" style={{ alignSelf: 'flex-end' }}>{timeAgo(r.createdAt, now)}</Text>
      </View>
      {r.note ? <Text variant="caption" color="textSecondary">“{r.note}”</Text> : null}
      <ServiceTimeline request={r} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Timer size={14} color={t.colors.textMuted} />
        <Text variant="micro" color="textSecondary">{open ? 'Waiting' : 'Total'}: {formatDuration(elapsed)}</Text>
      </View>
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop photo="restaurant" photoHeight={assistant ? 360 : 300} dim={0.6} />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <ScreenHeader onBack={back} right={assistant && open ? <Badge label={r.status === 'IN_PROGRESS' ? 'Serving you' : 'On the way'} tone="success" dot /> : undefined} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 18 }} showsVerticalScrollIndicator={false}>
          {assistant ? (
            <View style={{ gap: 16, marginTop: 90 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Avatar name={assistant.fullName} uri={assistant.avatarUrl} size={64} />
                <View style={{ flex: 1 }}>
                  <Text variant="title2" numberOfLines={1}>{assistant.fullName}</Text>
                  <Text variant="caption" color="textSecondary">Your Table Assistant</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Chat" size="md" style={{ flex: 1 }} icon={<MessageCircle size={17} color="#fff" />} onPress={() => router.push({ pathname: '/chat/[id]', params: { id } })} />
                <Button title="Call" size="md" variant="outline" style={{ flex: 1 }} disabled={!phone} icon={<Phone size={16} color={t.colors.text} />} onPress={() => phone && void Linking.openURL(`tel:${phone}`)} />
              </View>
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: 6, marginTop: 4 }}>
              <SuccessMark size={84} tone={r.status === 'CANCELLED' ? 'primary' : 'primary'} />
              <Text variant="title2" align="center">{r.status === 'PENDING' ? 'Your request is on the way!' : r.status === 'CANCELLED' ? 'Request cancelled' : 'Request completed'}</Text>
              <Text variant="callout" color="textSecondary" align="center">{r.status === 'PENDING' ? 'Our team has been notified and will be with you shortly.' : r.cancelReason ?? ''}</Text>
            </View>
          )}

          <View style={{ gap: 10 }}>
            <SectionHeader title="Current Request" info="Live status of your request: Sent → Accepted (a waiter is on the way) → Serving → Done. You get a notification at each step." />
            {currentCard}
          </View>

          <View style={{ gap: 10 }}>
            <SectionHeader title="Quick Actions" info="Message your waiter or send another request without going back." />
            <ListRow icon={<IconBadge size={32}><MessageCircle size={16} color={t.colors.primary} /></IconBadge>} title={open ? 'Send a Message' : 'View Messages'} onPress={() => router.push({ pathname: '/chat/[id]', params: { id } })} />
            <ListRow icon={<IconBadge size={32}><BellRing size={16} color={t.colors.primary} /></IconBadge>} title="Request something else" onPress={() => router.push('/service')} />
            <ListRow icon={<IconBadge size={32}><ClipboardList size={16} color={t.colors.primary} /></IconBadge>} title="All my requests" onPress={() => router.navigate('/(tabs)/requests')} />
          </View>

          {r.status === 'PENDING' || r.status === 'ACCEPTED' ? (
            <Button title="Cancel request" variant="ghost" loading={cancel.isPending} onPress={() => Alert.alert('Cancel this request?', undefined, [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel request', style: 'destructive', onPress: () => cancel.mutate() }])} />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
