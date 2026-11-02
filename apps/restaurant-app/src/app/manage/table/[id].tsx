import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Button, Card, Input, LoadingState, Screen, ScreenHeader, Text, Thumb, useTheme } from '@servebell/design-system';
import { api, mediaUrl, pickAndUploadImage } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';

/** Description, features and photos customers see on the table screen. */
export default function TableDetailsEditor() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const plans = useQuery({ queryKey: queryKeys.manageFloorPlans(rid), queryFn: () => api.floorPlans.manage(rid), enabled: !!rid });
  const table = plans.data?.flatMap((p) => p.tables).find((x) => x.id === id);
  const [description, setDescription] = useState('');
  const [features, setFeatures] = useState('');
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [initialised, setInit] = useState(false);
  useEffect(() => {
    if (table && !initialised) {
      setPhotos(table.imageUrls.map((url, i) => ({ id: table.imageFileIds[i]!, url })));
      setDescription(table.description ?? '');
      setFeatures(table.features.join(', '));
      setInit(true);
    }
  }, [table, initialised]);
  const save = useMutation({
    mutationFn: () =>
      api.floorPlans.tableDetails(rid, id, {
        description: description.trim() || null,
        features: features.split(',').map((s) => s.trim()).filter(Boolean),
        imageFileIds: photos.map((p) => p.id),
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['floor-plans'] }); router.back(); },
    onError: (e) => Alert.alert('Couldn’t save', e.message),
  });
  if (!table) return <Screen><LoadingState /></Screen>;
  return (
    <Screen padded={false} footer={<Button title="Save" loading={save.isPending} onPress={() => save.mutate()} />}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={`Table ${table.label}`} subtitle={`${table.capacity} seats${table.zone ? ` · ${table.zone}` : ''}`} onBack={() => router.back()} />
        <Text variant="captionStrong" color="textSecondary">Photos</Text>
        <ScrollView horizontal contentContainerStyle={{ gap: 10 }} showsHorizontalScrollIndicator={false}>
          {photos.map((p, i) => (
            <View key={p.url}>
              <Thumb uri={mediaUrl(p.url)} size={110} />
              <Pressable onPress={() => setPhotos((x) => x.filter((_, k) => k !== i))} accessibilityLabel="Remove photo" style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.overlay }}><X size={14} color="#fff" /></Pressable>
            </View>
          ))}
          {photos.length < 6 ? (
            <Pressable onPress={async () => { const f = await pickAndUploadImage('TABLE_IMAGE', rid); if (f) setPhotos((x) => [...x, { id: f.id, url: f.url }]); }} style={{ width: 110, height: 110, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: t.colors.borderStrong, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ImagePlus size={22} color={t.colors.primary} />
              <Text variant="micro" color="primary">Add photo</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <Card style={{ gap: 12 }}>
          <Input label="Description" value={description} onChangeText={setDescription} placeholder="Cosy corner by the window, great for couples" multiline />
          <Input label="Features (comma separated)" value={features} onChangeText={setFeatures} placeholder="Ocean view, Power outlet, Quiet" />
        </Card>
      </ScrollView>
    </Screen>
  );
}
