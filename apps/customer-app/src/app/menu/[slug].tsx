import { router, useLocalSearchParams } from 'expo-router';
import { Screen, ScreenHeader } from '@servebell/design-system';
import { MenuBrowser } from '@/components/MenuBrowser';
import { useActiveVisit } from '@/hooks/useActiveVisit';

/** A restaurant's menu opened from its details page. Ordering only when seated there. */
export default function RestaurantMenu() {
  const { slug, id, name } = useLocalSearchParams<{ slug: string; id?: string; name?: string }>();
  const visit = useActiveVisit();
  const seatedHere = Boolean(visit.data && (visit.data.restaurant.slug === slug || visit.data.restaurant.id === id));
  return (
    <Screen padded={false}>
      <MenuBrowser restaurantId={seatedHere ? visit.data!.restaurant.id : slug} canOrder={seatedHere} title={name ?? 'Our Menu'} header={<ScreenHeader onBack={() => router.back()} />} />
    </Screen>
  );
}
