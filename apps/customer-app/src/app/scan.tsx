import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, Link2, X } from 'lucide-react-native';
import { extractQrToken } from '@servebell/shared';
import { Button, Card, Chip, Input, LoadingState, Screen, Text, useTheme, InfoLabel } from '@servebell/design-system';
import { useSession } from '@servebell/mobile-core';
import { useStartVisit } from '@/hooks/useStartVisit';
import { SignInPrompt } from '@/components/SignInPrompt';

/**
 * Camera scanner with a paste fallback (the iOS simulator has no camera; the
 * fallback also helps when a QR sticker is damaged).
 */
export default function Scan() {
  const t = useTheme();
  const status = useSession((s) => s.status);
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [guests, setGuests] = useState(2);
  const start = useStartVisit();
  const handled = useRef(false);

  const submit = (value: string) => {
    if (handled.current || start.isPending) return;
    if (!extractQrToken(value)) return;
    handled.current = true;
    start.mutate({ qr: value, guestCount: guests }, { onError: () => (handled.current = false) });
  };

  const close = (
    <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close" style={{ position: 'absolute', top: 12, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center' }}>
      <X size={22} color="#fff" />
    </Pressable>
  );

  if (status !== 'signedIn') return <Screen edges={['top', 'bottom']}>{close}<SignInPrompt title="Sign in to connect to your table" message="We use your account so the team knows who to serve." /></Screen>;

  const manualEntry = (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Link2 size={16} color={t.colors.textSecondary} />
        <Text variant="captionStrong" color="textSecondary">Or paste the table link</Text>
      </View>
      <Input value={manual} onChangeText={setManual} placeholder="https://…/t/XXXXXXXX" autoCapitalize="none" autoCorrect={false} error={manual && !extractQrToken(manual) ? 'That doesn’t look like a ServeBell table link' : start.error?.message} />
      <Button title="Connect to table" size="md" loading={start.isPending} disabled={!extractQrToken(manual)} onPress={() => submit(manual)} />
    </Card>
  );

  return (
    <Screen edges={['top', 'bottom']} scroll>
      {close}
      <View style={{ marginTop: 12, marginBottom: 6 }}><InfoLabel label="Scan your table" variant="title1" color="text" info="Point the camera at the QR sticker on your table. You are then checked in to that table and can call a waiter, order and chat. The session ends automatically when you leave." /></View>
      <Text variant="callout" color="textSecondary" style={{ marginBottom: 14 }}>Point your camera at the ServeBell QR code on the table.</Text>
      <View style={{ gap: 8, marginBottom: 16 }}>
        <Text variant="captionStrong" color="textSecondary">How many guests?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[1, 2, 3, 4, 5, 6, 8].map((n) => <Chip key={n} label={n === 8 ? '7+' : String(n)} selected={guests === n} onPress={() => setGuests(n)} />)}
        </View>
      </View>
      {!permission ? (
        <LoadingState />
      ) : permission.granted ? (
        <View style={{ height: 320, borderRadius: t.radii.xl, overflow: 'hidden', marginBottom: 18, backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={start.isPending ? undefined : ({ data }) => submit(data)} />
          <View pointerEvents="none" style={{ position: 'absolute', top: 60, left: 60, right: 60, bottom: 60, borderWidth: 3, borderColor: '#fff', borderRadius: 24, opacity: 0.9 }} />
          {start.isPending ? <View style={{ position: 'absolute', inset: 0, backgroundColor: t.colors.overlay }}><LoadingState label="Connecting to your table…" /></View> : null}
        </View>
      ) : (
        <Card style={{ gap: 12, marginBottom: 18, alignItems: 'flex-start' }}>
          <Camera size={24} color={t.colors.primary} />
          <Text variant="callout">Camera access lets you scan the table QR code.</Text>
          {permission.canAskAgain ? <Button title="Allow camera" size="md" fullWidth={false} onPress={() => void requestPermission()} /> : <Text variant="caption" color="textSecondary">Enable camera access for ServeBell in Settings, or paste the link below.</Text>}
        </Card>
      )}
      {start.error && permission?.granted ? <Text variant="callout" color="danger" style={{ marginBottom: 12 }}>{start.error.message}</Text> : null}
      {manualEntry}
    </Screen>
  );
}
