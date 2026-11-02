import { useState } from 'react';
import { router } from 'expo-router';
import { Avatar, Badge as StatusBadge, InfoLabel } from '@servebell/design-system';
import { formatDuration } from '@servebell/mobile-core';
import type { EmployeeCard } from '@servebell/shared';
import { FlatList, Share, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, MailPlus, Trash2 } from 'lucide-react-native';
import { createInvitationSchema, Permission, type CreateInvitationInput } from '@servebell/shared';
import { queryKeys } from '@servebell/api-client';
import { Badge, Button, Card, EmptyState, ErrorState, IconBadge, Input, ListRow, LoadingState, Screen, SegmentedControl, Text, useTheme } from '@servebell/design-system';
import { api } from '@servebell/mobile-core';
import { roleLabel, useActiveMembership } from '@/lib/active-restaurant';

export default function Team() {
  const t = useTheme();
  const qc = useQueryClient();
  const { membership, can } = useActiveMembership();
  const restaurantId = membership?.restaurantId ?? '';
  const [created, setCreated] = useState<{ email: string; code: string } | null>(null);
  const [tab, setTab] = useState<'staff' | 'invites'>('staff');
  const staff = useQuery({ queryKey: queryKeys.employees(restaurantId), queryFn: () => api.analytics.employees(restaurantId), enabled: !!restaurantId });
  const invitations = useQuery({ queryKey: queryKeys.invitations(restaurantId), queryFn: () => api.invitations.list(restaurantId), enabled: !!restaurantId });
  const { control, handleSubmit, reset } = useForm<CreateInvitationInput>({ resolver: zodResolver(createInvitationSchema), defaultValues: { email: '', role: 'WAITER' } });
  const create = useMutation({
    mutationFn: (v: CreateInvitationInput) => api.invitations.create(restaurantId, v),
    onSuccess: (inv) => {
      setCreated({ email: inv.email, code: inv.code });
      reset({ email: '', role: 'WAITER' });
      void qc.invalidateQueries({ queryKey: queryKeys.invitations(restaurantId) });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.invitations.revoke(restaurantId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.invitations(restaurantId) }),
  });

  if (!membership || !can(Permission.EMPLOYEES_MANAGE)) return <Redirect href="/(tabs)/home" />;
  const isOwner = membership.role === 'OWNER';
  const segment = <SegmentedControl value={tab} onChange={setTab} options={[{ value: 'staff', label: `Employees${staff.data ? ` · ${staff.data.length}` : ''}` }, { value: 'invites', label: 'Invite' }]} />;

  const form = (
    <View style={{ gap: 16, paddingTop: 8, paddingBottom: 20 }}>
      <InfoLabel label="Team" variant="title1" color="text" info="Invite waiters and admins with a one-time code, see who is active, and open an employee for their history and performance. Only owners can invite admins." />
      {segment}
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBadge><MailPlus size={20} color={t.colors.primary} /></IconBadge>
          <View style={{ flex: 1 }}><InfoLabel label="Invite a team member" variant="title3" color="text" info="Enter their email and role. You get a one-time 8-character code: share it with them (WhatsApp, SMS or in person). They sign up with that same email, verify it, then tap Join a team and enter the code. Codes expire after 7 days." /></View>
        </View>
        <Controller control={control} name="email" render={({ field, fieldState }) => (
          <Input label="Email" info="The code only works for this email address, so use the one they will sign up with." placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} leftIcon={<Mail size={18} color={t.colors.textMuted} />} />
        )} />
        {isOwner ? (
          <Controller control={control} name="role" render={({ field }) => (
            <SegmentedControl value={field.value} onChange={field.onChange} options={[{ value: 'WAITER', label: 'Customer Assistant' }, { value: 'ADMIN', label: 'Administrator' }]} />
          )} />
        ) : null}
        {create.error ? <Text variant="caption" color="danger">{create.error.message}</Text> : null}
        <Button title="Create invitation" loading={create.isPending} onPress={() => void handleSubmit((v) => create.mutate(v))()} />
      </Card>

      {created ? (
        <Card style={{ gap: 10, borderColor: t.colors.success }}>
          <Text variant="callout" color="textSecondary">Invitation code for {created.email}</Text>
          <Text variant="display" style={{ letterSpacing: 4 }} selectable>{created.code}</Text>
          <Text variant="caption" color="textMuted">Shown once. It only works for this email and expires in 7 days.</Text>
          <Button title="Share code" variant="secondary" size="md" onPress={() => void Share.share({ message: `Join ${membership.restaurantName} on ServeBell. Sign up with ${created.email} in the ServeBell Restaurant app and enter code ${created.code}.` })} />
        </Card>
      ) : null}
      <InfoLabel label="Pending invitations" variant="title3" color="text" info="Codes not redeemed yet. Revoke one if it was sent to the wrong person; sending a new invite to the same email also replaces the old code." />
    </View>
  );

  if (tab === 'staff') {
    return (
      <Screen padded={false}>
        <FlatList
          data={staff.data ?? []}
          keyExtractor={(e) => e.memberId}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 10, flexGrow: 1 }}
          ListHeaderComponent={<View style={{ gap: 14, paddingTop: 8, paddingBottom: 6 }}><Text variant="title1">Team</Text>{segment}</View>}
          renderItem={({ item }) => <EmployeeRow e={item} />}
          ListEmptyComponent={staff.isPending ? <LoadingState /> : staff.isError ? <ErrorState message={staff.error.message} onRetry={() => void staff.refetch()} /> : undefined}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={invitations.data ?? []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 10, flexGrow: 1 }}
        ListHeaderComponent={form}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ListRow
            title={item.email}
            subtitle={`${roleLabel(item.role)} · expires ${new Date(item.expiresAt).toLocaleDateString()}`}
            trailing={<Button title="Revoke" variant="ghost" size="sm" fullWidth={false} icon={<Trash2 size={14} color={t.colors.danger} />} loading={revoke.isPending && revoke.variables === item.id} onPress={() => revoke.mutate(item.id)} />}
          />
        )}
        ListEmptyComponent={
          invitations.isPending ? <LoadingState /> : invitations.isError ? <ErrorState message={invitations.error.message} onRetry={() => void invitations.refetch()} /> : (
            <EmptyState icon={<Mail size={26} color={t.colors.primary} />} title="No pending invitations" message="Invite your customer assistants to start handling requests." />
          )
        }
      />
    </Screen>
  );
}

function EmployeeRow({ e }: { e: EmployeeCard }) {
  const t = useTheme();
  return (
    <Card onPress={() => router.push({ pathname: '/employee/[id]', params: { id: e.memberId } })} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={e.fullName} uri={e.avatarUrl} size={50} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title3" numberOfLines={1}>{e.fullName}</Text>
          <Text variant="micro" color="textSecondary" numberOfLines={1}>{e.employeeCode} · {e.phone ?? e.email}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <StatusBadge label={roleLabel(e.role)} tone="primary" />
          {e.status !== 'ACTIVE' ? <StatusBadge label={e.status === 'SUSPENDED' ? 'Suspended' : 'Removed'} tone="danger" /> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: 10 }}>
        {[
          ['Today', String(e.today.handled)],
          ['Completed', String(e.allTime.completed)],
          ['Avg accept', formatDuration(e.allTime.avgAcceptMs)],
          ['Avg complete', formatDuration(e.allTime.avgCompleteMs)],
        ].map(([k, v]) => (
          <View key={k} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text variant="bodyStrong">{v}</Text>
            <Text variant="micro" color="textMuted">{k}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
