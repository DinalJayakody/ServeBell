import { View } from 'react-native';
import { router } from 'expo-router';
import { BellRing } from 'lucide-react-native';
import { Button, Screen, Text, useTheme } from '@servebell/design-system';
import { markOnboardingSeen } from '@/hooks/useOnboarding';

/** First-launch welcome (reference screen 1). Shown once; browsing never requires an account. */
export default function Welcome() {
  const t = useTheme();
  const go = async (to: 'home' | 'login') => {
    await markOnboardingSeen();
    router.replace('/(tabs)/home');
    if (to === 'login') router.push('/(auth)/sign-in');
  };
  return (
    <Screen edges={['top', 'bottom']} photo="dining" fullPhoto>
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 48 }}>
        <BellRing size={56} color="#fff" strokeWidth={1.6} style={{ shadowColor: t.colors.primary, shadowOpacity: 0.8, shadowRadius: 18 }} />
        <Text variant="display" style={{ color: '#fff', marginTop: 12, fontSize: 34, lineHeight: 40 }}>ServeBell</Text>
        <Text variant="body" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>Your Table. Our Priority.</Text>
        <Text variant="callout" align="center" style={{ color: '#fff', marginTop: 22, paddingHorizontal: 12, lineHeight: 21 }}>
          Discover restaurants, browse menus and layouts, request service, connect with your waiter, and enjoy a seamless dining experience.
        </Text>
      </View>
      <View style={{ gap: 14, paddingBottom: 8 }}>
        <Button title="Get Started" onPress={() => void go('home')} />
        <Button title="Login" variant="ghost" onPress={() => void go('login')} style={{ height: 40 }} />
      </View>
    </Screen>
  );
}
