import { Redirect, Tabs } from 'expo-router';
import { BellRing, House, LayoutDashboard, Settings, ShoppingBag, Users } from 'lucide-react-native';
import { Permission } from '@servebell/shared';
import { tabBarScreenOptions, useTheme } from '@servebell/design-system';
import { useSession } from '@servebell/mobile-core';
import { useActiveMembership } from '@/lib/active-restaurant';

export default function TabsLayout() {
  const t = useTheme();
  const status = useSession((s) => s.status);
  const { membership, can } = useActiveMembership();
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  if (!membership) return <Redirect href="/" />;

  return (
    <Tabs screenOptions={tabBarScreenOptions(t)}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <House color={color} size={22} /> }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarIcon: ({ color }) => <BellRing color={color} size={22} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', href: can(Permission.ORDERS_HANDLE) ? undefined : null, tabBarIcon: ({ color }) => <ShoppingBag color={color} size={22} /> }} />
      {/* Hidden (not just disabled) for waiters; the API independently refuses them. */}
      <Tabs.Screen name="team" options={{ title: 'Team', href: can(Permission.EMPLOYEES_MANAGE) ? undefined : null, tabBarIcon: ({ color }) => <Users color={color} size={22} /> }} />
      <Tabs.Screen name="manage" options={{ title: 'Manage', href: can(Permission.RESTAURANT_MANAGE) || can(Permission.RESERVATIONS_MANAGE) ? undefined : null, tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={22} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Settings color={color} size={22} /> }} />
    </Tabs>
  );
}
