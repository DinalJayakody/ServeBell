import { router } from 'expo-router';
import { LogIn } from 'lucide-react-native';
import { EmptyState, useTheme } from '@servebell/design-system';

export function SignInPrompt({ title, message }: { title: string; message: string }) {
  const t = useTheme();
  return <EmptyState icon={<LogIn size={28} color={t.colors.primary} />} title={title} message={message} action={{ label: 'Sign in', onPress: () => router.push('/(auth)/sign-in') }} />;
}
