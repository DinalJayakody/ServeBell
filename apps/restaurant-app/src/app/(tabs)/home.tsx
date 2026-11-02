import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Building2, CalendarDays, CheckCircle2, ChevronsUpDown, Hourglass, Timer, UserCheck } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Avatar, Badge, Button, Card, IconBadge, ListRow, Screen, Text, useTheme, type Tone, Wave } from '@servebell/design-system';
import { api, formatDuration, useNow, useSession } from '@servebell/mobile-core';
import { roleLabel, useActiveMembership } from '@/lib/active-restaurant';
import { RequestCard } from '@/components/RequestCard';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

function Stat({ icon, label, value, tone = 'primary' }: { icon: React.ReactNode; label: string; value: string; tone?: Tone }) {
  return (
    <Card style={{ flex: 1, minWidth: '45%', gap: 10 }}>
      <IconBadge size={36} tone={tone}>{icon}</IconBadge>
      <Text variant="title2">{value}</Text>
      <Text variant="caption" color="textSecondary">{label}</Text>
    </Card>
  );
}

export default function Home() {
  const t = useTheme();
  const now = useNow(1000);
  const user = useSession((s) => s.user)!;
  const { membership, memberships, select } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const stats = useQuery({ queryKey: queryKeys.staffStats(rid), queryFn: () => api.staffServices.stats(rid), enabled: !!rid });
  const pending = useQuery({ queryKey: queryKeys.staffServices(rid, 'pending-preview'), queryFn: () => api.staffServices.list(rid, { view: 'pending', limit: 3 }), enabled: !!rid });
  if (!membership) return null;
  const s = stats.data;

  return (
    <Screen padded={false} photo="restaurant" photoHeight={260}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 18 }}
        refreshControl={<RefreshControl tintColor={t.colors.primary} refreshing={stats.isRefetching} onRefresh={() => void Promise.all([stats.refetch(), pending.refetch()])} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Text variant="callout" color="textSecondary">{greeting()},</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text variant="title1" numberOfLines={1}>{user.fullName.split(' ')[0]}</Text>
              <Wave />
            </View>
          </View>
          <Avatar name={user.fullName} uri={user.avatarUrl} size={46} />
        </View>

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} elevated>
          <IconBadge><Building2 size={22} color={t.colors.primary} /></IconBadge>
          <View style={{ flex: 1 }}>
            <Text variant="title3" numberOfLines={1}>{membership.restaurantName}</Text>
            <Text variant="caption" color="textSecondary">Employee ID {membership.employeeCode}</Text>
          </View>
          <Badge label={roleLabel(membership.role)} tone="primary" />
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Stat icon={<Hourglass size={18} color={t.colors.warning} />} tone="warning" label="Pending for me" value={s ? String(s.pending) : '–'} />
          <Stat icon={<UserCheck size={18} color={t.colors.primary} />} label="Assigned to me" value={s ? String(s.mineOpen) : '–'} />
          <Stat icon={<CheckCircle2 size={18} color={t.colors.success} />} tone="success" label="Completed today" value={s ? String(s.completedToday) : '–'} />
          <Stat icon={<Timer size={18} color={t.colors.primary} />} label="Avg. acceptance today" value={s ? formatDuration(s.avgAcceptMs) : '–'} />
        </View>
        {s ? <Text variant="caption" color="textMuted">Avg. completion today: {formatDuration(s.avgCompleteMs)} · {s.othersOpen} handled by teammates</Text> : null}

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="title3">Needs attention</Text>
            <Button title="All requests" variant="ghost" size="sm" fullWidth={false} onPress={() => router.navigate('/(tabs)/requests')} />
          </View>
          {pending.data?.items.length ? (
            pending.data.items.map((r) => <RequestCard key={r.id} r={r} restaurantId={rid} now={now} mine={false} />)
          ) : (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <BellRing size={20} color={t.colors.success} />
              <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>No waiting requests. You’ll get an alert the moment a table needs you.</Text>
            </Card>
          )}
        </View>

        <ListRow icon={<IconBadge size={34}><CalendarDays size={17} color={t.colors.primary} /></IconBadge>} title="Reservations" subtitle="Today and upcoming bookings" onPress={() => router.push('/manage/reservations')} />

        {memberships.length > 1 ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ChevronsUpDown size={14} color={t.colors.textSecondary} />
              <Text variant="captionStrong" color="textSecondary">Switch restaurant</Text>
            </View>
            {memberships.map((m) => (
              <ListRow key={m.restaurantId} title={m.restaurantName} subtitle={roleLabel(m.role)} onPress={m.restaurantId === rid ? undefined : () => select(m.restaurantId)} trailing={m.restaurantId === rid ? <Badge label="Active" tone="success" /> : undefined} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
