import { useMemo, useState } from 'react';
import { Alert, FlatList, Linking, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageCircle, Phone } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Avatar, Badge, Button, Card, Chip, ErrorState, IconBadge, LoadingState, Screen, ScreenHeader, SectionHeader, ServiceIcon, Text, useTheme } from '@servebell/design-system';
import { api, formatDuration, STATUS_LABEL as SERVICE_STATUS } from '@servebell/mobile-core';
import { roleLabel, useActiveMembership } from '@/lib/active-restaurant';
import { RANGES, rangeQuery, type RangeKey } from '@/lib/ranges';

/** Employee profile: performance for a chosen period and full service history (with conversations). */
export default function EmployeeProfile() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const [range, setRange] = useState<RangeKey>('7d');
  const query = useMemo(() => rangeQuery(range), [range]);
  const q = useQuery({ queryKey: queryKeys.employee(rid, id, query), queryFn: () => api.analytics.employee(rid, id, query), enabled: !!rid });
  const update = useMutation({
    mutationFn: (body: { status?: 'ACTIVE' | 'SUSPENDED' | 'REMOVED'; role?: 'ADMIN' | 'WAITER' }) => api.analytics.updateEmployee(rid, id, body),
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: ['employees', rid] }); if (v.status === 'REMOVED') router.back(); },
    onError: (e) => Alert.alert('Not allowed', e.message),
  });
  if (q.isPending) return <Screen><LoadingState /></Screen>;
  if (q.isError) return <Screen><ErrorState message={q.error.message} onRetry={() => void q.refetch()} /></Screen>;
  const { employee: e, range: r, requests } = q.data;
  const isOwnerViewing = membership?.role === 'OWNER';
  const editable = e.role !== 'OWNER' && e.userId !== undefined && e.memberId !== membership?.memberId;
  const time = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <Screen padded={false} photo="restaurant" photoHeight={240}>
      <FlatList
        data={requests}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 6 }}>
            <ScreenHeader onBack={() => router.back()} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar name={e.fullName} uri={e.avatarUrl} size={72} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="title2">{e.fullName}</Text>
                <Text variant="caption" color="textSecondary">{e.employeeCode} · joined {new Date(e.joinedAt).toLocaleDateString()}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Badge label={roleLabel(e.role)} tone="primary" />
                  <Badge label={e.status === 'ACTIVE' ? 'Active' : e.status === 'SUSPENDED' ? 'Suspended' : 'Removed'} tone={e.status === 'ACTIVE' ? 'success' : 'danger'} dot />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {e.phone ? <Button title="Call" size="md" variant="outline" style={{ flex: 1 }} icon={<Phone size={16} color={t.colors.text} />} onPress={() => void Linking.openURL(`tel:${e.phone}`)} /> : null}
              <Button title="Email" size="md" variant="outline" style={{ flex: 1 }} icon={<Mail size={16} color={t.colors.text} />} onPress={() => void Linking.openURL(`mailto:${e.email}`)} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {RANGES.map((x) => <Chip key={x.key} label={x.label} selected={range === x.key} onPress={() => setRange(x.key)} />)}
            </ScrollView>
            <Card style={{ flexDirection: 'row' }}>
              {[['Handled', String(r.metrics.handled)], ['Completed', String(r.metrics.completed)], ['Avg accept', formatDuration(r.metrics.avgAcceptMs)], ['Avg complete', formatDuration(r.metrics.avgCompleteMs)]].map(([k, v]) => (
                <View key={k} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <Text variant="title3">{v}</Text>
                  <Text variant="micro" color="textMuted">{k}</Text>
                </View>
              ))}
            </Card>
            {editable ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {e.status === 'ACTIVE' ? <Button title="Suspend" variant="outline" size="sm" fullWidth={false} onPress={() => update.mutate({ status: 'SUSPENDED' })} /> : <Button title="Reactivate" size="sm" fullWidth={false} onPress={() => update.mutate({ status: 'ACTIVE' })} />}
                {isOwnerViewing ? <Button title={e.role === 'ADMIN' ? 'Make waiter' : 'Make administrator'} variant="secondary" size="sm" fullWidth={false} onPress={() => update.mutate({ role: e.role === 'ADMIN' ? 'WAITER' : 'ADMIN' })} /> : null}
                <Button title="Remove" variant="ghost" size="sm" fullWidth={false} onPress={() => Alert.alert(`Remove ${e.fullName}?`, 'They lose access immediately. History is kept.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => update.mutate({ status: 'REMOVED' }) }])} />
              </View>
            ) : null}
            <SectionHeader title={`Service history · ${requests.length}`} info="Requests this employee accepted, with how long they took. Owners and admins can change roles, suspend or remove employees above." />
          </View>
        }
        renderItem={({ item: x }) => (
          <Card padding={12} onPress={() => router.push({ pathname: '/request/[id]', params: { id: x.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge size={40}><ServiceIcon icon={x.icon} kind={x.kind} size={19} color={t.colors.primary} /></IconBadge>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="callout" numberOfLines={1}>{x.service} · Table {x.table}</Text>
              <Text variant="micro" color="textSecondary">{x.customer} · {time(x.createdAt)}{x.acceptedAt ? ` · accepted in ${formatDuration(new Date(x.acceptedAt).getTime() - new Date(x.createdAt).getTime())}` : ''}</Text>
            </View>
            {x.messages ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><MessageCircle size={13} color={t.colors.textMuted} /><Text variant="micro" color="textMuted">{x.messages}</Text></View> : null}
            <Badge label={SERVICE_STATUS[x.status as keyof typeof SERVICE_STATUS] ?? x.status} tone={x.status === 'COMPLETED' ? 'success' : x.status === 'CANCELLED' ? 'neutral' : 'primary'} />
          </Card>
        )}
        ListEmptyComponent={<Text variant="caption" color="textMuted">No requests in this period.</Text>}
      />
    </Screen>
  );
}
