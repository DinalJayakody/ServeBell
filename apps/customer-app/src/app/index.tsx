import { Redirect } from 'expo-router';
import { LoadingState, Screen } from '@servebell/design-system';
import { useOnboardingSeen } from '@/hooks/useOnboarding';

export default function Index() {
  const seen = useOnboardingSeen();
  if (seen === null) return <Screen><LoadingState /></Screen>;
  return <Redirect href={seen ? '/(tabs)/home' : '/welcome'} />;
}
