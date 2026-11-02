import { Alert, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SvgXml } from 'react-native-svg';
import { Printer, QrCode, Share2 } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import type { QrCodeView } from '@servebell/shared';
import { Badge, Button, Card, EmptyState, LoadingState, Screen, ScreenHeader, Text, useTheme } from '@servebell/design-system';
import { api } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';

export default function QrCodes() {
  const t = useTheme();
  const qc = useQueryClient();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const q = useQuery({ queryKey: queryKeys.qrCodes(rid), queryFn: () => api.qr.list(rid), enabled: !!rid });
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.qrCodes(rid) });
  const regen = useMutation({ mutationFn: (tableId: string) => api.qr.regenerate(rid, tableId), onSuccess: refresh, onError: (e) => Alert.alert('Failed', e.message) });
  const off = useMutation({ mutationFn: (tableId: string) => api.qr.deactivate(rid, tableId), onSuccess: refresh, onError: (e) => Alert.alert('Failed', e.message) });
  const print = useMutation({ mutationFn: async (tableIds?: string[]) => Print.printAsync({ html: await api.qr.printHtml(rid, tableIds) }), onError: (e) => Alert.alert('Print failed', e.message) });
  const share = useMutation({
    mutationFn: async () => {
      const { uri } = await Print.printToFileAsync({ html: await api.qr.printHtml(rid) });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Table QR codes' });
    },
    onError: (e) => Alert.alert('Couldn’t create PDF', e.message),
  });

  const row = ({ item }: { item: QrCodeView }) => (
    <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      <View style={{ width: 92, height: 92, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        {item.svg ? <SvgXml xml={item.svg} width={84} height={84} /> : <QrCode size={36} color={t.colors.textMuted} />}
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="title3">Table {item.tableLabel}</Text>
          <Badge label={item.status === 'ACTIVE' ? `v${item.version}` : 'Inactive'} tone={item.status === 'ACTIVE' ? 'success' : 'neutral'} />
        </View>
        {item.zone ? <Text variant="micro" color="textSecondary">{item.zone}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {item.status === 'ACTIVE' ? <Button title="Print" size="sm" variant="secondary" fullWidth={false} onPress={() => print.mutate([item.tableId])} /> : null}
          <Button title={item.status === 'ACTIVE' ? 'Regenerate' : 'Activate'} size="sm" variant="outline" fullWidth={false} loading={regen.isPending && regen.variables === item.tableId} onPress={() => (item.status === 'ACTIVE' ? Alert.alert('Regenerate QR?', 'The printed code on this table will stop working.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Regenerate', style: 'destructive', onPress: () => regen.mutate(item.tableId) }]) : regen.mutate(item.tableId))} />
          {item.status === 'ACTIVE' ? <Button title="Deactivate" size="sm" variant="ghost" fullWidth={false} onPress={() => Alert.alert('Deactivate QR?', 'Guests will no longer be able to scan this table.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Deactivate', style: 'destructive', onPress: () => off.mutate(item.tableId) }])} /> : null}
        </View>
      </View>
    </Card>
  );

  return (
    <Screen padded={false} footer={q.data?.length ? (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Share PDF" variant="outline" size="md" style={{ flex: 1 }} icon={<Share2 size={16} color={t.colors.text} />} loading={share.isPending} onPress={() => share.mutate()} />
        <Button title="Print all" size="md" style={{ flex: 1 }} icon={<Printer size={16} color="#fff" />} loading={print.isPending} onPress={() => print.mutate(undefined)} />
      </View>
    ) : undefined}>
      <View style={{ paddingHorizontal: 20 }}><ScreenHeader title="Table QR codes" subtitle="Each code identifies one table" onBack={() => router.back()} info="Print the codes and stick one on each table. Guests scan to call a waiter, order and chat. Regenerate if a sticker is lost or copied — the old code stops working immediately." /></View>
      {q.isPending ? <LoadingState /> : (
        <FlatList data={q.data} keyExtractor={(x) => x.tableId} renderItem={row} contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={<QrCode size={26} color={t.colors.primary} />} title="No tables yet" message="Add tables in the floor plan editor; each gets a QR code automatically." action={{ label: 'Open floor plan', onPress: () => router.replace('/manage/floor-plan') }} />} />
      )}
    </Screen>
  );
}
