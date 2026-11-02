import { Alert, Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Camera, ClipboardList, DoorOpen, Heart, LifeBuoy, LogOut, Moon, ShoppingBag } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Avatar, Button, Card, ListRow, Screen, SegmentedControl, Text, useTheme, useThemeContext, type ThemePreference } from '@servebell/design-system';
import { api, mediaUrl, pickAndUploadImage, session, useSession, VerifyEmailCard } from '@servebell/mobile-core';
import { useActiveVisit } from '@/hooks/useActiveVisit';

/** Reference profile screen: identity card + row list. Only real, working actions are shown. */
export default function Profile() {
  const t = useTheme();
  const qc = useQueryClient();
  const { preference, setPreference } = useThemeContext();
  const { user, status } = useSession();
  const visit = useActiveVisit();
  const leave = useMutation({ mutationFn: () => api.visits.leave(visit.data!.id), onSuccess: () => qc.setQueryData(queryKeys.activeVisit, null) });
  const icon = (I: typeof Moon, color = t.colors.text) => <I size={19} color={color} />;
  const avatar = useMutation({
    mutationFn: async () => {
      const f = await pickAndUploadImage('AVATAR');
      return f ? api.auth.updateProfile({ avatarFileId: f.id }) : null;
    },
    onSuccess: (u) => u && useSession.getState().setUser(u),
    onError: (e) => Alert.alert('Couldn’t update photo', e.message),
  });

  return (
    <Screen scroll photo="restaurant" photoHeight={220}>
      {user ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18, marginBottom: 22 }}>
          <Pressable onPress={() => avatar.mutate()} accessibilityLabel="Change profile photo">
            <Avatar name={user.fullName} uri={mediaUrl(user.avatarUrl)} size={64} />
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: t.colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.colors.backgroundGradient[0] }}>
              <Camera size={12} color="#fff" />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="title2" numberOfLines={1}>{user.fullName}</Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>{user.email}</Text>
          </View>
        </View>
      ) : (
        <Card style={{ gap: 12, marginTop: 18, marginBottom: 22 }}>
          <Text variant="title3">Sign in to ServeBell</Text>
          <Text variant="callout" color="textSecondary">Explore freely. Sign in to request service, order and save your history.</Text>
          <Button title={status === 'syncing' || status === 'initialising' ? 'Checking session…' : 'Sign in or create account'} disabled={status === 'syncing' || status === 'initialising'} onPress={() => router.push('/(auth)/sign-in')} />
        </Card>
      )}

      <View style={{ gap: 10 }}>
        <VerifyEmailCard />
        {user ? (
          <>
            <ListRow icon={icon(ClipboardList)} title="My Requests" onPress={() => router.navigate('/(tabs)/requests')} />
            <ListRow icon={icon(ShoppingBag)} title="My Orders" onPress={() => router.navigate('/(tabs)/requests')} />
            <ListRow icon={icon(CalendarDays)} title="My Reservations" onPress={() => router.push('/reservations')} />
            <ListRow icon={icon(Heart)} title="Favourites" onPress={() => router.push('/favourites')} />
          </>
        ) : null}
        <ListRow icon={icon(LifeBuoy)} title="Help & Support" onPress={() => void Linking.openURL('mailto:support@servebell.app?subject=ServeBell%20support')} />
        <Card padding={14} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {icon(Moon)}
            <Text variant="callout">Appearance</Text>
          </View>
          <SegmentedControl<ThemePreference> value={preference} onChange={setPreference} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Card>
        {visit.data ? (
          <ListRow
            icon={icon(DoorOpen)}
            title={`Leave ${visit.data.restaurant.name}`}
            subtitle={`Table ${visit.data.table.label}`}
            onPress={() => Alert.alert('Leave restaurant?', 'You’ll need to scan the table QR again to request service.', [{ text: 'Stay', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => leave.mutate() }])}
          />
        ) : null}
        {user ? <ListRow icon={icon(LogOut, t.colors.danger)} title="Sign out" destructive onPress={() => void session.signOut()} /> : null}
      </View>
    </Screen>
  );
}
