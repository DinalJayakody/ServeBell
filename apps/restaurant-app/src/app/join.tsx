import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, KeyRound, LogOut, ShieldCheck } from 'lucide-react-native';
import { ownerOnboardingSchema, type OwnerOnboardingInput } from '@servebell/shared';
import { ApiError, queryKeys } from '@servebell/api-client';
import { Badge, Button, Card, IconBadge, Input, ListRow, Screen, SegmentedControl, Text, useTheme, InfoLabel } from '@servebell/design-system';
import { api, session, useSession, VerifyEmailCard } from '@servebell/mobile-core';

function RedeemCard() {
  const t = useTheme();
  const [code, setCode] = useState('');
  const redeem = useMutation({
    mutationFn: () => api.invitations.redeem({ invitationCode: code.trim() }),
    onSuccess: (res) => {
      useSession.getState().setUser(res.user);
      router.replace('/(tabs)/home');
    },
  });
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconBadge><KeyRound size={20} color={t.colors.primary} /></IconBadge>
        <View style={{ flex: 1 }}>
          <InfoLabel label="I have an invitation code" variant="title3" color="text" info="Ask your manager for the 8-character code from Team → Invite. It only works for the email you signed up with, after you have verified it." />
          <Text variant="caption" color="textSecondary">Your manager shares an 8-character code.</Text>
        </View>
      </View>
      <Input
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        placeholder="e.g. K7MX2QPA"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={16}
        error={redeem.error instanceof ApiError ? redeem.error.message : redeem.error ? 'Could not redeem the code' : undefined}
      />
      <Button title="Join restaurant" onPress={() => redeem.mutate()} loading={redeem.isPending} disabled={code.trim().length < 6} />
    </Card>
  );
}

function ApplyCard() {
  const t = useTheme();
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: queryKeys.ownerApplications, queryFn: api.onboarding.mine, refetchInterval: (q) => (q.state.data?.some((a) => a.status === 'PENDING') ? 30_000 : false) });
  const approved = mine.data?.some((a) => a.status === 'APPROVED');
  useEffect(() => {
    if (approved) void session.refreshUser().catch(() => undefined);
  }, [approved]);
  const { control, handleSubmit } = useForm<OwnerOnboardingInput>({
    resolver: zodResolver(ownerOnboardingSchema),
    defaultValues: { restaurantName: '', addressLine: '', city: '', phone: '' },
  });
  const apply = useMutation({ mutationFn: api.onboarding.apply, onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ownerApplications }) });
  const pending = mine.data?.find((a) => a.status === 'PENDING');
  const field = (name: keyof OwnerOnboardingInput, label: string, extra: object = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f, fieldState }) => <Input label={label} value={f.value ?? ''} onChangeText={f.onChange} onBlur={f.onBlur} error={fieldState.error?.message} {...extra} />}
    />
  );

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconBadge tone="success"><Building2 size={20} color={t.colors.success} /></IconBadge>
        <View style={{ flex: 1 }}>
          <InfoLabel label="Register my restaurant" variant="title3" color="text" info="Owners apply here. The ServeBell team reviews your application and you get a notification when it is approved; then the Manage tab opens with your restaurant." />
          <Text variant="caption" color="textSecondary">We verify every owner before activating a restaurant.</Text>
        </View>
      </View>
      {mine.data?.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text variant="callout" style={{ flex: 1 }} numberOfLines={1}>{a.restaurantName}</Text>
          <Badge label={a.status === 'PENDING' ? 'Under review' : a.status === 'APPROVED' ? 'Approved' : 'Not approved'} tone={a.status === 'PENDING' ? 'warning' : a.status === 'APPROVED' ? 'success' : 'danger'} dot />
        </View>
      ))}
      {pending ? (
        <Text variant="caption" color="textSecondary">We’ll review your application shortly. You’ll get a notification as soon as it’s approved.</Text>
      ) : (
        <>
          {field('restaurantName', 'Restaurant name')}
          {field('addressLine', 'Address')}
          {field('city', 'City')}
          {field('phone', 'Business phone', { keyboardType: 'phone-pad', placeholder: '011 234 5678' })}
          {field('businessRegistrationNo', 'Business registration no. (optional)')}
          {apply.error ? <Text variant="caption" color="danger">{apply.error.message}</Text> : null}
          <Button title="Submit for verification" variant="secondary" loading={apply.isPending} onPress={() => void handleSubmit((v) => apply.mutate(v))()} />
        </>
      )}
    </Card>
  );
}

export default function Join() {
  const t = useTheme();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const [tab, setTab] = useState<'code' | 'owner'>('code');
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  if (user && user.memberships.length > 0) return <Redirect href="/(tabs)/home" />;

  return (
    <Screen scroll>
      <View style={{ gap: 6, marginTop: 12, marginBottom: 20 }}>
        <Text variant="title1">Welcome{user ? `, ${user.fullName.split(' ')[0]}` : ''}</Text>
        <Text variant="body" color="textSecondary">Connect your account to a restaurant to get started.</Text>
      </View>
      <View style={{ gap: 16 }}>
        <VerifyEmailCard reason="To join a team or register a restaurant, confirm the link we sent to" />
        <SegmentedControl value={tab} onChange={setTab} options={[{ value: 'code', label: 'Join a team' }, { value: 'owner', label: 'I’m an owner' }]} />
        {tab === 'code' ? <RedeemCard /> : <ApplyCard />}
        {user?.platformRole === 'PLATFORM_ADMIN' ? (
          <ListRow icon={<IconBadge size={34}><ShieldCheck size={17} color={t.colors.primary} /></IconBadge>} title="Review owner applications" subtitle="Platform administrator" onPress={() => router.push('/admin/applications')} />
        ) : null}
        <ListRow icon={<IconBadge size={34} tone="danger"><LogOut size={17} color={t.colors.danger} /></IconBadge>} title="Sign out" destructive onPress={() => void session.signOut()} />
      </View>
    </Screen>
  );
}
