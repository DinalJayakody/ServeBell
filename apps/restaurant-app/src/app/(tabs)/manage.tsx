import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Armchair, BarChart3, Building2, CalendarDays, LayoutGrid, Map, QrCode, Sparkles, UtensilsCrossed } from 'lucide-react-native';
import { queryKeys } from '@servebell/api-client';
import { Permission } from '@servebell/shared';
import { Badge, Card, IconBadge, InfoTip, ListRow, Screen, Text, useTheme } from '@servebell/design-system';
import { api } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';

/** Owner/Admin control centre. Each entry is enforced again by the API. */
export default function Manage() {
  const t = useTheme();
  const { membership, can } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const r = useQuery({ queryKey: queryKeys.managed(rid), queryFn: () => api.manage.get(rid), enabled: !!rid });
  const items: { icon: typeof Map; title: string; subtitle: string; info: string; href: Href; show: boolean }[] = [
    { icon: BarChart3, title: 'Dashboard', subtitle: 'Requests, orders, reservations, performance', info: 'Live numbers for any date range: how many requests came in, how fast your team responded, orders and revenue. Filter by employee or service.', href: '/manage/dashboard', show: can(Permission.ANALYTICS_READ) },
    { icon: Building2, title: 'Restaurant profile', subtitle: 'Details, photo, opening hours, go live', info: 'Your public details. Add opening hours and at least one menu item, then tap Go live so guests can find you.', href: '/manage/profile', show: can(Permission.RESTAURANT_MANAGE) },
    { icon: UtensilsCrossed, title: 'Menu', subtitle: 'Categories, dishes, prices, photos, availability', info: 'Guests browse and order from this menu. Mark a dish unavailable to hide it instantly when it runs out.', href: '/manage/menu', show: can(Permission.MENU_MANAGE) },
    { icon: Armchair, title: 'Tables', subtitle: 'Add tables by name and seats — no plan needed', info: 'The quickest way to start: list your tables to get QR codes and take reservations. A floor plan is optional.', href: '/manage/tables', show: can(Permission.FLOORPLAN_MANAGE) },
    { icon: Map, title: 'Floor plan', subtitle: 'Drag tables, entrance, bar & kitchen · photo detection', info: 'Optional map of your dining room. Guests see it in 2D and 3D and can pick a table to reserve. Add tables from presets or detect them from a photo.', href: '/manage/floor-plan', show: can(Permission.FLOORPLAN_MANAGE) },
    { icon: QrCode, title: 'Table QR codes', subtitle: 'Preview, print, regenerate, deactivate', info: 'Each table has a QR sticker. Guests scan it to call a waiter, order and chat. Regenerate if a sticker is lost; the old one stops working.', href: '/manage/qr', show: can(Permission.QR_MANAGE) },
    { icon: Sparkles, title: 'Services & utensils', subtitle: 'What guests can request, amenities', info: 'Choose the buttons guests see at the table (waiter, water, bill…), utensils they can ask for, and amenities shown on your profile.', href: '/manage/catalog', show: can(Permission.CATALOG_MANAGE) },
    { icon: CalendarDays, title: 'Reservations', subtitle: 'Confirm, reject and track bookings', info: 'Guests can book a specific table or any table. Confirm or decline, assign tables, and mark guests seated or no-show.', href: '/manage/reservations', show: can(Permission.RESERVATIONS_READ) },
  ];
  return (
    <Screen scroll photo="restaurant" photoHeight={230}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Text variant="title1">Manage</Text>
        <InfoTip title="Manage" text="Everything to run your restaurant. Tap the ⓘ on any option to learn what it does. Only owners and admins see this tab." />
      </View>
      {r.data ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, marginBottom: 18 }}>
          <IconBadge><LayoutGrid size={20} color={t.colors.primary} /></IconBadge>
          <View style={{ flex: 1 }}>
            <Text variant="title3" numberOfLines={1}>{r.data.name}</Text>
            <Text variant="caption" color="textSecondary">{r.data.city}</Text>
          </View>
          <Badge label={r.data.status === 'ACTIVE' ? 'Live' : r.data.status === 'DRAFT' ? 'Not live' : 'Suspended'} tone={r.data.status === 'ACTIVE' ? 'success' : 'warning'} dot />
        </Card>
      ) : <View style={{ height: 18 }} />}
      <View style={{ gap: 10 }}>
        {items.filter((i) => i.show).map((i) => (
          <ListRow key={i.title} icon={<IconBadge size={36}><i.icon size={18} color={t.colors.primary} /></IconBadge>} title={i.title} subtitle={i.subtitle} info={i.info} onPress={() => router.push(i.href)} />
        ))}
      </View>
    </Screen>
  );
}
