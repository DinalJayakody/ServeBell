import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Card, EmptyState, LoadingState, Screen, ScreenHeader, Text, Thumb, useTheme } from '@servebell/design-system';
import { api, mediaUrl } from '@servebell/mobile-core';
import { Pressable } from 'react-native';

export default function Favourites() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: queryKeys.favourites, queryFn: api.favourites.list });
  const remove = useMutation({ mutationFn: api.favourites.remove, onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.favourites }) });
  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 20 }}><ScreenHeader title="Favourites" onBack={() => router.back()} info="Restaurants you saved with the heart. Tap one to see its menu, layout and to reserve." /></View>
      {q.isPending ? <LoadingState /> : (
        <FlatList
          data={q.data}
          keyExtractor={(f) => f.restaurantId}
          contentContainerStyle={{ padding: 20, gap: 10, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={<Heart size={26} color={t.colors.primary} />} title="No favourites yet" message="Tap the heart on a restaurant to save it here." />}
          renderItem={({ item: f }) => (
            <Card padding={10} onPress={() => router.push({ pathname: '/restaurant/[slug]', params: { slug: f.slug } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Thumb uri={mediaUrl(f.coverUrl)} size={60} />
              <View style={{ flex: 1 }}>
                <Text variant="callout">{f.name}</Text>
                <Text variant="caption" color="textSecondary">{f.city}</Text>
              </View>
              <Pressable onPress={() => remove.mutate(f.restaurantId)} hitSlop={10} accessibilityLabel={`Remove ${f.name} from favourites`}>
                <Heart size={22} color={t.colors.danger} fill={t.colors.danger} />
              </Pressable>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
