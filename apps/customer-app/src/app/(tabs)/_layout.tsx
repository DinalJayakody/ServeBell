import { Tabs } from 'expo-router';
import { ClipboardList, House, LayoutGrid, UserRound } from 'lucide-react-native';
import { tabBarScreenOptions, useTheme } from '@servebell/design-system';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs screenOptions={tabBarScreenOptions(t)}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <House color={color} size={22} /> }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: ({ color }) => <LayoutGrid color={color} size={22} /> }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarIcon: ({ color }) => <ClipboardList color={color} size={22} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <UserRound color={color} size={22} /> }} />
    </Tabs>
  );
}
