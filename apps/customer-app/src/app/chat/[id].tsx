import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { queryKeys } from '@servebell/api-client';
import { OPEN_SERVICE_STATUSES } from '@servebell/shared';
import { Avatar, Backdrop, ScreenHeader } from '@servebell/design-system';
import { api, ServiceChat } from '@servebell/mobile-core';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: queryKeys.service(id), queryFn: () => api.services.detail(id) });
  const r = q.data;
  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <ScreenHeader
            onBack={() => router.back()}
            title={r?.acceptedBy?.fullName ?? r?.restaurant.name ?? 'Messages'}
            subtitle={r ? `${r.serviceType.name} · Table ${r.table.label}` : undefined}
            right={r?.acceptedBy ? <Avatar name={r.acceptedBy.fullName} uri={r.acceptedBy.avatarUrl} size={36} /> : undefined}
          />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ServiceChat requestId={id} canSend={Boolean(r && OPEN_SERVICE_STATUSES.includes(r.status))} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
