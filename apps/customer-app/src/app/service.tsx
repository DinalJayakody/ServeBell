import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { BellRing, CircleEllipsis, UtensilsCrossed } from 'lucide-react-native';
import { ActionTile, Button, IconCircle, LoadingState, Screen, ScreenHeader, ServiceIcon, Text, useTheme } from '@servebell/design-system';
import { useActiveVisit } from '@/hooks/useActiveVisit';
import { useRequestService } from '@/hooks/useRequestService';
import { findService, SERVICE_SUBTITLE } from '@/lib/services';

/** Reference "Request Service" screen: one tap sends the request. */
export default function RequestServiceScreen() {
  const t = useTheme();
  const visit = useActiveVisit();
  const request = useRequestService();
  const [other, setOther] = useState<string | null>(null);
  if (!visit.data) return <Screen><LoadingState /></Screen>;
  const services = visit.data.services;
  const assistance = findService(services, 'ASSISTANCE') ?? findService(services, 'WAITER');
  const tiles = services.filter((s) => s.kind !== 'ASSISTANCE');

  return (
    <Screen edges={['top', 'bottom']} footer={<Button title="Cancel" variant="outline" onPress={() => router.back()} />}>
      <ScreenHeader onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <IconCircle size={64}><BellRing size={30} color="#fff" /></IconCircle>
          <Text variant="title2" style={{ marginTop: 10 }}>Request Service</Text>
          <Text variant="caption" color="textSecondary">Let your waiter know what you need</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {tiles.map((s) => (
            <ActionTile
              key={s.id}
              size="lg"
              style={{ width: '47.8%' }}
              selected={request.isPending && request.variables?.service.id === s.id}
              disabled={request.isPending}
              icon={<ServiceIcon icon={s.icon} kind={s.kind} size={30} color={t.colors.primary} />}
              label={s.name}
              subtitle={SERVICE_SUBTITLE[s.kind]}
              onPress={() => request.mutate({ service: s })}
            />
          ))}
          <ActionTile size="lg" style={{ width: '47.8%' }} icon={<UtensilsCrossed size={30} color={t.colors.primary} />} label="Food & Drinks" subtitle="Order from menu" onPress={() => router.navigate('/(tabs)/menu')} />
          {assistance ? (
            <ActionTile size="lg" style={{ width: '47.8%' }} selected={other !== null} icon={<CircleEllipsis size={30} color={t.colors.primary} />} label="Other" subtitle="Custom request" onPress={() => setOther(other === null ? '' : null)} />
          ) : null}
        </View>
        {other !== null && assistance ? (
          <View style={{ gap: 10, marginTop: 16 }}>
            <TextInput
              autoFocus
              value={other}
              onChangeText={setOther}
              placeholder="What do you need?"
              placeholderTextColor={t.colors.textMuted}
              maxLength={280}
              style={[t.typography.callout, { height: 48, paddingHorizontal: 16, borderRadius: t.radii.pill, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.borderActive, color: t.colors.text }]}
            />
            <Button title="Send request" disabled={!other.trim()} loading={request.isPending} onPress={() => request.mutate({ service: assistance, note: other.trim() })} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
