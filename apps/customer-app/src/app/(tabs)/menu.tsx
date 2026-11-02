import { router } from 'expo-router';
import { LayoutGrid } from 'lucide-react-native';
import { EmptyState, LoadingState, Screen, useTheme } from '@servebell/design-system';
import { useSession } from '@servebell/mobile-core';
import { MenuBrowser } from '@/components/MenuBrowser';
import { useActiveVisit } from '@/hooks/useActiveVisit';
import { useLastRestaurant } from '@/hooks/useLastRestaurant';

export default function MenuTab() {
  const t = useTheme();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const visit = useActiveVisit();
  const last = useLastRestaurant();
  if (signedIn && visit.isPending) return <Screen><LoadingState /></Screen>;
  const restaurantId = visit.data?.restaurant.id ?? last.slug;
  return (
    <Screen padded={false}>
      {restaurantId ? (
        <MenuBrowser restaurantId={restaurantId} canOrder={Boolean(visit.data)} title={visit.data ? 'Our Menu' : `${last.name ?? 'Menu'}`} />
      ) : (
        <EmptyState icon={<LayoutGrid size={28} color={t.colors.primary} />} title="No menu yet" message="Scan your table’s QR code, or open a restaurant to browse its menu." action={{ label: 'Find a restaurant', onPress: () => router.navigate('/(tabs)/home') }} />
      )}
    </Screen>
  );
}
