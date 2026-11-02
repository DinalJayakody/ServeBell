import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Timer } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import { hasPermission, OPEN_SERVICE_STATUSES, Permission, type ServiceRequestDetail } from '@servebell/shared';
import { Backdrop, Button, Card, ErrorState, IconBadge, LoadingState, ServiceIcon, Text, useTheme } from '@servebell/design-system';
import { api, formatDuration, ServiceChat, ServiceStatusBadge, ServiceTimeline, useNow } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';

type Action = 'accept' | 'wait' | 'start' | 'complete';

function Summary({ r, restaurantId, memberId, canMonitor }: { r: ServiceRequestDetail; restaurantId: string; memberId: string; canMonitor: boolean }) {
  const t = useTheme();
  const qc = useQueryClient();
  const now = useNow(1000);
  const mine = r.acceptedBy?.memberId === memberId;
  const canAct = mine || canMonitor;
  const after = () => qc.invalidateQueries({ queryKey: queryKeys.services });
  const act = useMutation({
    mutationFn: (a: Action) => api.staffServices[a](restaurantId, r.id),
    onSuccess: (_d, a) => {
      void after();
      if (a === 'wait') router.back();
    },
    onError: (e) => {
      void after();
      Alert.alert(e instanceof ApiError && e.code === 'ALREADY_ACCEPTED' ? 'Already taken' : 'Action failed', e.message);
    },
  });
  const cancel = useMutation({ mutationFn: (reason: string) => api.staffServices.cancel(restaurantId, r.id, reason), onSettled: after });
  const end = r.completedAt ?? r.cancelledAt;
  const elapsed = (end ? new Date(end).getTime() : now) - new Date(r.createdAt).getTime();
  const busy = (a: Action) => act.isPending && act.variables === a;

  return (
    <View style={{ gap: 16, marginBottom: 12 }}>
      <Card style={{ gap: 14, borderColor: r.escalationLevel > 0 && r.status === 'PENDING' ? t.colors.danger : t.colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBadge size={50}><ServiceIcon icon={r.serviceType.icon} kind={r.serviceType.kind} size={24} color={t.colors.primary} /></IconBadge>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title2">Table {r.table.label}</Text>
            <Text variant="callout" color="textSecondary">{r.serviceType.name}{r.quantity > 1 ? ` × ${r.quantity}` : ''} · {r.customer.fullName}</Text>
          </View>
          <ServiceStatusBadge status={r.status} overdue={r.escalationLevel > 0} />
        </View>
        {r.note ? <Text variant="body">“{r.note}”</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Timer size={15} color={t.colors.textMuted} />
          <Text variant="caption" color="textSecondary">{end ? 'Total' : 'Waiting'}: {formatDuration(elapsed)}{r.acceptedAt ? ` · accepted after ${formatDuration(new Date(r.acceptedAt).getTime() - new Date(r.createdAt).getTime())}` : ''}</Text>
        </View>
        <ServiceTimeline request={r} />
        {r.acceptedBy && !mine ? <Text variant="caption" color="textSecondary">Handled by {r.acceptedBy.fullName} ({r.acceptedBy.employeeCode})</Text> : null}
      </Card>

      {r.status === 'PENDING' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!r.dismissedByMe ? <Button title="Wait" variant="outline" style={{ flex: 1 }} disabled={act.isPending} loading={busy('wait')} onPress={() => act.mutate('wait')} /> : null}
          <Button title="Accept request" style={{ flex: 2 }} disabled={act.isPending} loading={busy('accept')} onPress={() => act.mutate('accept')} />
        </View>
      ) : canAct && r.status === 'ACCEPTED' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Start" variant="secondary" style={{ flex: 1 }} disabled={act.isPending} loading={busy('start')} onPress={() => act.mutate('start')} />
          <Button title="Complete" style={{ flex: 1 }} disabled={act.isPending} loading={busy('complete')} onPress={() => act.mutate('complete')} />
        </View>
      ) : canAct && r.status === 'IN_PROGRESS' ? (
        <Button title="Complete" disabled={act.isPending} loading={busy('complete')} onPress={() => act.mutate('complete')} />
      ) : null}
      {r.dismissedByMe && r.status === 'PENDING' ? <Text variant="caption" color="textMuted" align="center">You chose to wait. Teammates can still accept it.</Text> : null}
      {canAct && OPEN_SERVICE_STATUSES.includes(r.status) && r.status !== 'PENDING' ? (
        <Button
          title="Cancel request"
          variant="ghost"
          size="md"
          loading={cancel.isPending}
          onPress={() =>
            Alert.alert('Cancel request', 'Tell the guest why.', [
              { text: 'Back', style: 'cancel' },
              { text: 'Item unavailable', onPress: () => cancel.mutate('Item unavailable') },
              { text: 'Guest left the table', onPress: () => cancel.mutate('Guest left the table') },
            ])
          }
        />
      ) : null}
      <Text variant="captionStrong" color="textSecondary">Conversation</Text>
    </View>
  );
}

export default function StaffRequestDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useActiveMembership();
  const q = useQuery({ queryKey: queryKeys.service(id), queryFn: () => api.services.detail(id) });
  const canMonitor = hasPermission(membership?.role, Permission.SERVICES_MONITOR);
  const canChat = q.data
    ? OPEN_SERVICE_STATUSES.includes(q.data.status) && (q.data.status === 'PENDING' || q.data.acceptedBy?.memberId === membership?.memberId || hasPermission(membership?.role, Permission.MESSAGES_AUDIT))
    : false;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
      <Backdrop />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingHorizontal: 20 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/requests'))} hitSlop={10} accessibilityLabel="Back">
          <ArrowLeft size={22} color={t.colors.text} />
        </Pressable>
        <Text variant="title3">{q.data ? `Request #${q.data.number}` : 'Request'}</Text>
      </View>
      {q.isPending || !membership ? <LoadingState /> : q.isError ? (
        <ErrorState network={q.error instanceof ApiError && q.error.isNetwork} message={q.error.message} onRetry={() => void q.refetch()} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ServiceChat requestId={id} canSend={canChat} header={<Summary r={q.data} restaurantId={membership.restaurantId} memberId={membership.memberId} canMonitor={canMonitor} />} />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
