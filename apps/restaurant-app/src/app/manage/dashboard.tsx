import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, CheckCircle2, Hourglass, ShoppingBag, Timer, Users, Wallet } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { formatMoney } from '@servebell/shared';
import { Avatar, Card, Chip, ErrorState, IconBadge, LoadingState, Screen, ScreenHeader, SectionHeader, Text, useTheme, type Tone } from '@servebell/design-system';
import { api, formatDuration } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';
import { RANGES, rangeQuery, type RangeKey } from '@/lib/ranges';

function Metric({ icon, label, value, tone = 'primary' }: { icon: React.ReactNode; label: string; value: string; tone?: Tone }) {
  return (
    <Card padding={14} style={{ width: '48%', gap: 8 }}>
      <IconBadge size={34} tone={tone}>{icon}</IconBadge>
      <Text variant="title2">{value}</Text>
      <Text variant="micro" color="textSecondary">{label}</Text>
    </Card>
  );
}

/** Owner dashboard. Every number is aggregated by the API from stored timestamps. */
export default function Dashboard() {
  const t = useTheme();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const [range, setRange] = useState<RangeKey>('today');
  const [memberId, setMemberId] = useState<string | undefined>();
  const [serviceTypeId, setServiceTypeId] = useState<string | undefined>();
  const query = useMemo(() => ({ ...rangeQuery(range), memberId, serviceTypeId }), [range, memberId, serviceTypeId]);
  const q = useQuery({ queryKey: queryKeys.analytics(rid, query), queryFn: () => api.analytics.summary(rid, query), enabled: !!rid });
  const types = useQuery({ queryKey: queryKeys.manageList(rid, 'service-types'), queryFn: () => api.manage.serviceTypes(rid), enabled: !!rid });
  const staff = useQuery({ queryKey: queryKeys.employees(rid), queryFn: () => api.analytics.employees(rid), enabled: !!rid });
  const s = q.data;
  const maxType = Math.max(1, ...(s?.byType.map((b) => b.count) ?? [1]));

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 16 }} refreshControl={<RefreshControl tintColor={t.colors.primary} refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        <ScreenHeader title="Dashboard" subtitle={membership?.restaurantName} onBack={() => router.back()} info="Numbers for the chosen period. Filter by employee or service type to see who handles what and how fast." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {RANGES.map((r) => <Chip key={r.key} label={r.label} selected={range === r.key} onPress={() => setRange(r.key)} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All staff" selected={!memberId} onPress={() => setMemberId(undefined)} />
          {staff.data?.map((e) => <Chip key={e.memberId} label={e.fullName.split(' ')[0]!} selected={memberId === e.memberId} onPress={() => setMemberId(e.memberId)} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All services" selected={!serviceTypeId} onPress={() => setServiceTypeId(undefined)} />
          {types.data?.map((st) => <Chip key={st.id} label={st.name} selected={serviceTypeId === st.id} onPress={() => setServiceTypeId(st.id)} />)}
        </ScrollView>

        {q.isPending ? <LoadingState /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => void q.refetch()} /> : s ? (
          <>
            <SectionHeader title="Service requests" info="Accept time = how long guests waited until someone took the request. Complete time = until it was done. Escalated = not accepted within 15 minutes." />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
              <Metric icon={<CheckCircle2 size={17} color={t.colors.success} />} tone="success" label={`Completed of ${s.services.total}`} value={String(s.services.completed)} />
              <Metric icon={<Hourglass size={17} color={t.colors.warning} />} tone="warning" label={`Waiting · ${s.services.accepted + s.services.inProgress} in progress`} value={String(s.services.pending)} />
              <Metric icon={<Timer size={17} color={t.colors.primary} />} label="Avg. acceptance" value={formatDuration(s.services.avgAcceptMs)} />
              <Metric icon={<Timer size={17} color={t.colors.primary} />} label="Avg. completion" value={formatDuration(s.services.avgCompleteMs)} />
              <Metric icon={<AlertTriangle size={17} color={t.colors.danger} />} tone="danger" label="Escalated (overdue)" value={String(s.services.escalated)} />
              <Metric icon={<Users size={17} color={t.colors.primary} />} label={`Staff · ${s.employees.active} active`} value={String(s.employees.total)} />
            </View>

            {s.byType.length ? (
              <Card style={{ gap: 10 }}>
                <Text variant="captionStrong" color="textSecondary">Requests by service</Text>
                {s.byType.map((b) => (
                  <View key={b.serviceTypeId} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="caption">{b.name}</Text>
                      <Text variant="captionStrong">{b.count}</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceMuted }}>
                      <View style={{ width: `${(b.count / maxType) * 100}%`, height: 6, borderRadius: 3, backgroundColor: t.colors.primary }} />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            <SectionHeader title="Orders & reservations" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
              <Metric icon={<ShoppingBag size={17} color={t.colors.primary} />} label={`Orders · ${s.orders.pending} open`} value={String(s.orders.total)} />
              <Metric icon={<Wallet size={17} color={t.colors.success} />} tone="success" label="Revenue (served orders)" value={formatMoney(s.orders.revenueCents, s.orders.currency)} />
              <Metric icon={<CalendarDays size={17} color={t.colors.primary} />} label={`Reservations · ${s.reservations.pending} to confirm`} value={String(s.reservations.total)} />
              <Metric icon={<CheckCircle2 size={17} color={t.colors.success} />} tone="success" label="Confirmed reservations" value={String(s.reservations.confirmed)} />
            </View>

            <SectionHeader title="Employee performance" info="Requests handled and average response times per team member for this period." />
            {s.leaderboard.map((e) => (
              <Card key={e.memberId} onPress={() => router.push({ pathname: '/employee/[id]', params: { id: e.memberId } })} padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={e.fullName} size={42} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{e.fullName}</Text>
                  <Text variant="micro" color="textSecondary">{e.employeeCode} · accept {formatDuration(e.avgAcceptMs)} · complete {formatDuration(e.avgCompleteMs)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="title3">{e.completed}</Text>
                  <Text variant="micro" color="textMuted">of {e.handled}</Text>
                </View>
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
