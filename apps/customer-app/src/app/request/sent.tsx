import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Button, Card, IconBadge, LoadingState, Screen, ServiceIcon, SuccessMark, Text, useTheme } from '@servebell/design-system';
import { api, timeAgo, useNow } from '@servebell/mobile-core';
import { useActiveVisit } from '@/hooks/useActiveVisit';
import { tableLine } from '@/lib/services';

/** Reference "Request Sent!" confirmation. */
export default function RequestSent() {
  const t = useTheme();
  const now = useNow(30_000);
  const { id } = useLocalSearchParams<{ id: string }>();
  const visit = useActiveVisit();
  const q = useQuery({ queryKey: queryKeys.service(id), queryFn: () => api.services.detail(id) });
  const cancel = useMutation({ mutationFn: () => api.services.cancel(id), onSuccess: () => router.dismissTo('/(tabs)/home') });
  const r = q.data;
  return (
    <Screen edges={["top", "bottom"]} photo="dining" fullPhoto>
      {!r ? <LoadingState /> : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <SuccessMark size={92} />
          <Text variant="title1">Request Sent!</Text>
          <Text variant="callout" color="textSecondary" align="center" style={{ maxWidth: 280 }}>Your waiter has been notified and will be with you shortly.</Text>
          <Card style={{ alignSelf: 'stretch', marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconBadge size={48}><ServiceIcon icon={r.serviceType.icon} kind={r.serviceType.kind} size={24} color={t.colors.primary} /></IconBadge>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="micro" color="textSecondary">Request Type</Text>
              <Text variant="bodyStrong">{r.serviceType.name}</Text>
              <Text variant="micro" color="textSecondary">{visit.data ? tableLine(visit.data) : `Table ${r.table.label}`}</Text>
            </View>
            <Text variant="micro" color="textMuted" style={{ alignSelf: 'flex-end' }}>{timeAgo(r.createdAt, now)}</Text>
          </Card>
          <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 28 }}>
            <Button title="View Request" icon={<BellRing size={17} color="#fff" />} onPress={() => router.replace({ pathname: '/request/[id]', params: { id } })} />
            {r.status === 'PENDING' ? (
              <Button title="Cancel" variant="ghost" loading={cancel.isPending} onPress={() => Alert.alert('Cancel this request?', undefined, [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel request', style: 'destructive', onPress: () => cancel.mutate() }])} />
            ) : (
              <Button title="Back to Home" variant="ghost" onPress={() => router.dismissTo('/(tabs)/home')} />
            )}
          </View>
        </View>
      )}
    </Screen>
  );
}
